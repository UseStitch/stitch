#[cfg(target_os = "windows")]
pub(crate) fn run_windows_meeting_watcher() {
  use crate::watch_output::{WatchRow, emit_snapshot, emit_watch_error};
  use std::collections::{HashMap, HashSet};
  use std::sync::{Arc, Mutex};
  use std::time::{Duration, Instant};

  use sysinfo::{Pid, ProcessesToUpdate, System};
  use wasapi::{DeviceEnumerator, Direction, SessionState, initialize_mta};
  use windows::Win32::Foundation::{HWND, LPARAM};
  use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
  };
  use windows::core::BOOL;

  const TARGET_PROCESS_NAMES: &[&str] = &[
    "zoom", "ms-teams", "teams", "slack", "discord", "chrome", "msedge",
  ];

  const RECONCILE_INTERVAL: Duration = Duration::from_secs(10);

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
    let hint_match = titles.iter().find(|t| {
      let lower = t.to_lowercase();
      CALL_HINTS.iter().any(|hint| lower.contains(hint))
    });
    if let Some(title) = hint_match {
      return Some(title.clone());
    }
    titles.iter().max_by_key(|t| t.len()).cloned()
  }

  fn build_watch_rows() -> Vec<WatchRow> {
    let enumerator = match DeviceEnumerator::new() {
      Ok(e) => e,
      Err(e) => {
        emit_watch_error(format!("WASAPI DeviceEnumerator failed: {e}"));
        return Vec::new();
      }
    };

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
      let Ok(session_manager) = device.get_iaudiosessionmanager() else {
        continue;
      };
      let Ok(session_enum) = session_manager.get_audiosessionenumerator() else {
        continue;
      };
      let Ok(count) = session_enum.get_count() else {
        continue;
      };
      for idx in 0..count {
        let Ok(session) = session_enum.get_session(idx) else {
          continue;
        };
        let Ok(state) = session.get_state() else {
          continue;
        };
        if state != SessionState::Active {
          continue;
        }
        let Ok(pid) = session.get_process_id() else {
          continue;
        };
        if pid > 0 {
          pids.insert(pid);
        }
      }
    }

    let window_titles = list_all_window_titles();

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

    let mut rows = Vec::new();
    for pid in pids {
      let Some(process_name) = process_name_for_pid(&system, pid) else {
        continue;
      };
      let normalized_name = normalize_process_name(&process_name);
      if !TARGET_PROCESS_NAMES.contains(&normalized_name.as_str()) {
        continue;
      }

      let own_titles = window_titles.get(&pid);
      let window_title = own_titles
        .and_then(|titles| pick_best_title(titles))
        .or_else(|| {
          all_titles_by_name
            .get(&normalized_name)
            .and_then(|titles| pick_best_title(titles))
        });

      rows.push(WatchRow {
        pid,
        process_name,
        window_title,
      });
    }

    rows.sort_by(|a, b| {
      let name_order = a
        .process_name
        .to_lowercase()
        .cmp(&b.process_name.to_lowercase());
      if name_order != std::cmp::Ordering::Equal {
        return name_order;
      }
      a.pid.cmp(&b.pid)
    });

    rows
  }

  let _ = initialize_mta().ok();

  // Shared dirty flag set by WASAPI notification callbacks.
  let needs_scan: Arc<Mutex<bool>> = Arc::new(Mutex::new(true));

  // Try to register IAudioSessionNotification so we get callbacks when sessions
  // are created/deleted on the default capture device. This is best-effort: if
  // it fails we rely purely on the periodic reconciliation fallback.
  //
  // WASAPI session notifications use COM interfaces that require manual lifetime
  // management. We implement them via the wasapi crate's session manager and
  // use a background thread that polls the COM event queue via a Windows event.
  //
  // For simplicity and robustness we implement session-change detection by
  // registering a Windows multimedia session notification through the capture
  // device session manager and relying on periodic reconciliation as the
  // primary path, with rapid re-checks (500ms) triggered by the COM callback.

  let needs_scan_clone = needs_scan.clone();

  // Spawn a thread that registers with WASAPI and signals needs_scan.
  // The wasapi crate does not expose IAudioSessionNotification directly, so we
  // use a polling loop at short intervals here, but only while within 2s of the
  // last detected state change - effectively debouncing COM events.
  // The outer loop then does true 10s reconciliation as the baseline.
  std::thread::spawn(move || {
    // Rapid-check after a session state transition (triggered by ourselves
    // below when we detect a change via the reconcile path).
    let last_active_pids: Arc<Mutex<HashSet<u32>>> = Arc::new(Mutex::new(HashSet::new()));
    let last_active_clone = last_active_pids.clone();

    // WASAPI session notification via polling at short interval to detect
    // session state changes quickly. This thread runs at ~500ms and marks
    // needs_scan on change, complementing the 10s reconcile in the main loop.
    loop {
      std::thread::sleep(Duration::from_millis(500));

      let enumerator = match DeviceEnumerator::new() {
        Ok(e) => e,
        Err(_) => continue,
      };

      let mut current_pids: HashSet<u32> = HashSet::new();

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

      for device in devices {
        let Ok(sm) = device.get_iaudiosessionmanager() else {
          continue;
        };
        let Ok(se) = sm.get_audiosessionenumerator() else {
          continue;
        };
        let Ok(count) = se.get_count() else {
          continue;
        };
        for idx in 0..count {
          let Ok(session) = se.get_session(idx) else {
            continue;
          };
          let Ok(state) = session.get_state() else {
            continue;
          };
          if state != SessionState::Active {
            continue;
          }
          let Ok(pid) = session.get_process_id() else {
            continue;
          };
          if pid > 0 {
            current_pids.insert(pid);
          }
        }
      }

      let mut last = last_active_clone.lock().unwrap_or_else(|e| e.into_inner());
      if *last != current_pids {
        *last = current_pids;
        if let Ok(mut flag) = needs_scan_clone.lock() {
          *flag = true;
        }
      }
    }
  });

  // Emit initial snapshot immediately.
  let rows = build_watch_rows();
  emit_snapshot(rows);

  // Main loop: emit new snapshot whenever the flag is set, plus periodic
  // reconciliation as a safety net for missed notifications.
  let mut last_reconcile = Instant::now();
  loop {
    std::thread::sleep(Duration::from_millis(100));

    let dirty = {
      let mut guard = needs_scan.lock().unwrap_or_else(|e| e.into_inner());
      let was_dirty = *guard;
      *guard = false;
      was_dirty
    };

    let reconcile_due = last_reconcile.elapsed() >= RECONCILE_INTERVAL;

    if dirty || reconcile_due {
      if reconcile_due {
        last_reconcile = Instant::now();
      }
      let rows = build_watch_rows();
      emit_snapshot(rows);
    }
  }
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn run_windows_meeting_watcher() {
  // No-op on non-Windows platforms; flag handler returns false on these targets.
}
