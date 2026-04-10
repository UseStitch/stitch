use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WindowsMeetingRow {
  pub(crate) pid: u32,
  pub(crate) process_name: String,
  pub(crate) window_title: Option<String>,
}

#[cfg(target_os = "windows")]
pub(crate) fn list_windows_meeting_rows() -> Result<Vec<WindowsMeetingRow>, String> {
  use std::collections::{HashMap, HashSet};

  use sysinfo::{Pid, ProcessesToUpdate, System};
  use wasapi::{DeviceEnumerator, Direction, SessionState, deinitialize, initialize_mta};
  use windows::Win32::Foundation::{HWND, LPARAM};
  use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
  };
  use windows::core::BOOL;

  const TARGET_PROCESS_NAMES: &[&str] = &[
    "zoom", "ms-teams", "teams", "slack", "discord", "chrome", "msedge",
  ];

  fn normalize_process_name(input: &str) -> String {
    input.trim().to_lowercase().replace(".exe", "")
  }

  fn process_name_for_pid(system: &System, pid: u32) -> Option<String> {
    let process = system.process(Pid::from_u32(pid))?;
    let name = process.name().to_string_lossy().trim().to_string();
    if name.is_empty() {
      return None;
    }

    Some(name)
  }

  unsafe extern "system" fn enum_windows_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
    if !unsafe { IsWindowVisible(hwnd).as_bool() } {
      return BOOL(1);
    }

    let length = unsafe { GetWindowTextLengthW(hwnd) };
    if length <= 0 {
      return BOOL(1);
    }

    let mut pid = 0u32;
    unsafe {
      GetWindowThreadProcessId(hwnd, Some(&mut pid));
    }
    if pid == 0 {
      return BOOL(1);
    }

    let mut buffer = vec![0u16; length as usize + 1];
    let copied = unsafe { GetWindowTextW(hwnd, &mut buffer) };
    if copied <= 0 {
      return BOOL(1);
    }

    let title = String::from_utf16_lossy(&buffer[..copied as usize])
      .trim()
      .to_string();
    if title.is_empty() {
      return BOOL(1);
    }

    let map = unsafe { &mut *(lparam.0 as *mut HashMap<u32, Vec<String>>) };
    map.entry(pid).or_default().push(title);

    BOOL(1)
  }

  fn list_all_window_titles() -> HashMap<u32, Vec<String>> {
    let mut titles: HashMap<u32, Vec<String>> = HashMap::new();

    unsafe {
      let _ = EnumWindows(
        Some(enum_windows_callback),
        LPARAM((&mut titles as *mut HashMap<u32, Vec<String>>) as isize),
      );
    }

    titles
  }

  let _ = initialize_mta().ok();

  let result = (|| -> Result<Vec<WindowsMeetingRow>, String> {
    let enumerator = DeviceEnumerator::new()
      .map_err(|error| format!("failed to create WASAPI enumerator: {error}"))?;

    // Iterate over all capture devices instead of just the default one
    let mut devices = Vec::new();
    if let Ok(collection) = enumerator.get_device_collection(&Direction::Capture) {
      if let Ok(count) = collection.get_nbr_devices() {
        for i in 0..count {
          if let Ok(device) = collection.get_device_at_index(i) {
            devices.push(device);
          }
        }
      }
    }

    if devices.is_empty() {
      if let Ok(default_device) = enumerator.get_default_device(&Direction::Capture) {
        devices.push(default_device);
      }
    }

    let mut pids = HashSet::new();

    for device in devices {
      let session_manager = match device.get_iaudiosessionmanager() {
        Ok(manager) => manager,
        Err(_) => continue,
      };
      let session_enumerator = match session_manager.get_audiosessionenumerator() {
        Ok(enumerator) => enumerator,
        Err(_) => continue,
      };
      let session_count = match session_enumerator.get_count() {
        Ok(count) => count,
        Err(_) => continue,
      };

      for index in 0..session_count {
        let session = match session_enumerator.get_session(index) {
          Ok(session) => session,
          Err(_) => continue,
        };

        let state = match session.get_state() {
          Ok(state) => state,
          Err(_) => continue,
        };

        if state != SessionState::Active {
          continue;
        }

        let pid = match session.get_process_id() {
          Ok(pid) if pid > 0 => pid,
          _ => continue,
        };

        pids.insert(pid);
      }
    }

    let window_titles = list_all_window_titles();

    // Refresh process info for both audio-capturing PIDs and window-owning PIDs
    // so we can resolve process names for sibling window lookups.
    let all_pids_to_resolve: Vec<Pid> = pids
      .iter()
      .copied()
      .chain(window_titles.keys().copied())
      .collect::<HashSet<u32>>()
      .into_iter()
      .map(Pid::from_u32)
      .collect();

    let mut system = System::new();
    system.refresh_processes(ProcessesToUpdate::Some(&all_pids_to_resolve), true);

    // Collect ALL window titles from every sibling process that shares the
    // same executable name.  Electron-based apps (Slack, Teams, Discord)
    // spawn many child processes; the one that captures audio often has no
    // visible window, while a sibling owns the UI window with the relevant
    // title.  We pass all titles through so the TypeScript layer can pick
    // the most meaningful one.
    let mut all_titles_by_name: HashMap<String, Vec<String>> = HashMap::new();
    for (title_pid, titles) in &window_titles {
      if let Some(name) = process_name_for_pid(&system, *title_pid) {
        let normalized = normalize_process_name(&name);
        if !TARGET_PROCESS_NAMES.contains(&normalized.as_str()) {
          continue;
        }
        all_titles_by_name
          .entry(normalized)
          .or_default()
          .extend(titles.iter().cloned());
      }
    }

    // Keywords that indicate an active meeting/call window.
    const CALL_HINTS: &[&str] = &[
      "meeting",
      "call",
      "huddle",
      "voice",
      "stage",
      "google meet",
      "meet.google.com",
      "meet -",
    ];

    fn pick_best_title(titles: &[String]) -> Option<String> {
      // Prefer a title that contains a call-related keyword.
      let hint_match = titles.iter().find(|t| {
        let lower = t.to_lowercase();
        CALL_HINTS.iter().any(|hint| lower.contains(hint))
      });
      if let Some(title) = hint_match {
        return Some(title.clone());
      }
      // Fall back to the longest title.
      titles.iter().max_by_key(|t| t.len()).cloned()
    }

    let mut rows = Vec::new();

    for pid in pids {
      let Some(process_name) = process_name_for_pid(&system, pid) else {
        continue;
      };

      let normalized_name = normalize_process_name(&process_name);
      if !TARGET_PROCESS_NAMES.contains(&normalized_name.as_str()) {
        continue;
      }

      // Prefer the window title from the exact PID; fall back to the best
      // title from any sibling process with the same executable name.
      let own_titles = window_titles.get(&pid);
      let window_title = own_titles
        .and_then(|titles| pick_best_title(titles))
        .or_else(|| {
          all_titles_by_name
            .get(&normalized_name)
            .and_then(|titles| pick_best_title(titles))
        });

      rows.push(WindowsMeetingRow {
        pid,
        process_name,
        window_title,
      });
    }

    rows.sort_by(|a, b| {
      let left = a.process_name.to_lowercase();
      let right = b.process_name.to_lowercase();
      let name_order = left.cmp(&right);
      if name_order != std::cmp::Ordering::Equal {
        return name_order;
      }

      a.pid.cmp(&b.pid)
    });

    Ok(rows)
  })();

  deinitialize();

  result
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn list_windows_meeting_rows() -> Result<Vec<WindowsMeetingRow>, String> {
  Ok(Vec::new())
}

#[cfg(test)]
mod tests {
  use super::WindowsMeetingRow;

  #[test]
  fn row_serialization_uses_camel_case() {
    let row = WindowsMeetingRow {
      pid: 42,
      process_name: "chrome".to_string(),
      window_title: Some("Google Meet - Standup".to_string()),
    };

    let value = serde_json::to_value(row).expect("row should serialize");
    assert!(value.get("processName").is_some());
    assert!(value.get("windowTitle").is_some());
    assert!(value.get("pid").is_some());
  }
}
