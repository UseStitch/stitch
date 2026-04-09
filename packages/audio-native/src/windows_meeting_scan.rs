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
  use wasapi::{deinitialize, initialize_mta, DeviceEnumerator, Direction, SessionState};
  use windows::core::BOOL;
  use windows::Win32::Foundation::{HWND, LPARAM};
  use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
  };

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

    let map = unsafe { &mut *(lparam.0 as *mut HashMap<u32, String>) };
    match map.get(&pid) {
      Some(existing) if existing.len() >= title.len() => {}
      _ => {
        map.insert(pid, title);
      }
    }

    BOOL(1)
  }

  fn list_top_window_titles() -> HashMap<u32, String> {
    let mut titles: HashMap<u32, String> = HashMap::new();

    unsafe {
      let _ = EnumWindows(
        Some(enum_windows_callback),
        LPARAM((&mut titles as *mut HashMap<u32, String>) as isize),
      );
    }

    titles
  }

  let _ = initialize_mta().ok();

  let result = (|| -> Result<Vec<WindowsMeetingRow>, String> {
    let enumerator = DeviceEnumerator::new()
      .map_err(|error| format!("failed to create WASAPI enumerator: {error}"))?;
    let device = enumerator
      .get_default_device(&Direction::Capture)
      .map_err(|error| format!("failed to get default capture device: {error}"))?;
    let session_manager = device
      .get_iaudiosessionmanager()
      .map_err(|error| format!("failed to get audio session manager: {error}"))?;
    let session_enumerator = session_manager
      .get_audiosessionenumerator()
      .map_err(|error| format!("failed to get audio session enumerator: {error}"))?;

    let session_count = session_enumerator
      .get_count()
      .map_err(|error| format!("failed to get session count: {error}"))?;

    let mut pids = HashSet::new();
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

    let mut system = System::new();
    let pid_refs: Vec<Pid> = pids.iter().copied().map(Pid::from_u32).collect();
    system.refresh_processes(ProcessesToUpdate::Some(&pid_refs), true);

    let window_titles = list_top_window_titles();
    let mut rows = Vec::new();

    for pid in pids {
      let Some(process_name) = process_name_for_pid(&system, pid) else {
        continue;
      };

      let normalized_name = normalize_process_name(&process_name);
      if !TARGET_PROCESS_NAMES.contains(&normalized_name.as_str()) {
        continue;
      }

      rows.push(WindowsMeetingRow {
        pid,
        process_name,
        window_title: window_titles.get(&pid).cloned(),
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
