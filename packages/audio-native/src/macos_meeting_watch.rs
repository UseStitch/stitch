#[cfg(target_os = "macos")]
pub(crate) fn run_macos_meeting_watcher() {
  use crate::watch_output::{emit_snapshot, emit_watch_error, WatchRow};
  use std::process::Command;
  use std::sync::{Arc, Mutex};

  use cidre::core_audio as ca;
  use cidre::os;

  const BROWSER_WINDOW_SCAN_SCRIPT: &str = r#"(() => {
  const output = { chrome: [], edge: [] };
  try {
    const systemEvents = Application('System Events');
    const processes = systemEvents.processes();
    const readTitles = (target) => {
      try {
        const process = processes.find((value) => value.name() === target);
        if (!process) return [];
        return process.windows().map((window) => {
          try { return String(window.name() || '').trim(); } catch { return ''; }
        }).filter((title) => title.length > 0);
      } catch { return []; }
    };
    output.chrome = readTitles('Google Chrome');
    output.edge = readTitles('Microsoft Edge');
  } catch {}
  return JSON.stringify(output);
})();"#;

  fn build_watch_rows() -> Vec<WatchRow> {
    let browser_titles = {
      let output = Command::new("osascript")
        .args(["-l", "JavaScript", "-e", BROWSER_WINDOW_SCAN_SCRIPT])
        .output();
      match output {
        Ok(out) if out.status.success() => {
          parse_browser_titles(&String::from_utf8_lossy(&out.stdout))
        }
        _ => std::collections::HashMap::new(),
      }
    };

    let processes = match crate::mic_usage::list_mic_using_processes() {
      Ok(procs) => procs,
      Err(error) => {
        emit_watch_error(format!("mic process scan failed: {error}"));
        return Vec::new();
      }
    };

    processes
      .into_iter()
      .map(|p| {
        let normalized = p.process_name.trim().to_lowercase();
        let window_title = browser_family(&normalized)
          .and_then(|family| browser_titles.get(family))
          .cloned();
        WatchRow {
          pid: p.pid as u32,
          process_name: p.process_name,
          window_title,
        }
      })
      .collect()
  }

  fn browser_family(normalized: &str) -> Option<&'static str> {
    if normalized.contains("chrome") {
      return Some("chrome");
    }
    if normalized.contains("edge") || normalized.contains("msedge") {
      return Some("edge");
    }
    None
  }

  fn parse_browser_titles(raw: &str) -> std::collections::HashMap<&'static str, String> {
    let mut result = std::collections::HashMap::new();
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed == "null" {
      return result;
    }
    let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) else {
      return result;
    };
    let Some(object) = value.as_object() else {
      return result;
    };
    for key in ["chrome", "edge"] {
      let Some(items) = object.get(key).and_then(serde_json::Value::as_array) else {
        continue;
      };
      let matching_title = items
        .iter()
        .filter_map(serde_json::Value::as_str)
        .map(str::trim)
        .find(|title| {
          !title.is_empty() && (title.contains("Google Meet") || title.contains("meet.google.com"))
        });
      if let Some(title) = matching_title {
        result.insert(key, title.to_string());
      }
    }
    result
  }

  // Shared flag between the CoreAudio listener thread and a debounce flush task.
  let needs_scan: Arc<Mutex<bool>> = Arc::new(Mutex::new(true));
  let needs_scan_for_listener = needs_scan.clone();

  // Callback invoked from the CoreAudio thread when the default input device's
  // running state changes. We set a flag rather than scanning inline to avoid
  // blocking the audio thread.
  extern "C-unwind" fn device_listener(
    _obj_id: ca::Obj,
    _number_addresses: u32,
    _addresses: *const ca::PropAddr,
    client_data: *mut (),
  ) -> os::Status {
    let flag = unsafe { &*(client_data as *const Mutex<bool>) };
    if let Ok(mut guard) = flag.lock() {
      *guard = true;
    }
    os::Status::NO_ERR
  }

  extern "C-unwind" fn system_listener(
    _obj_id: ca::Obj,
    _number_addresses: u32,
    _addresses: *const ca::PropAddr,
    client_data: *mut (),
  ) -> os::Status {
    // Default input device changed; re-register device listener and mark dirty.
    let flag = unsafe { &*(client_data as *const Mutex<bool>) };
    if let Ok(mut guard) = flag.lock() {
      *guard = true;
    }
    os::Status::NO_ERR
  }

  const DEVICE_IS_RUNNING_SOMEWHERE: ca::PropAddr = ca::PropAddr {
    selector: ca::PropSelector::DEVICE_IS_RUNNING_SOMEWHERE,
    scope: ca::PropScope::GLOBAL,
    element: ca::PropElement::MAIN,
  };

  let needs_scan_raw = Arc::into_raw(needs_scan_for_listener) as *mut ();

  // Register system-level listener for default input device changes.
  if let Err(e) = ca::System::OBJ.add_prop_listener(
    &ca::PropSelector::HW_DEFAULT_INPUT_DEVICE.global_addr(),
    system_listener,
    needs_scan_raw,
  ) {
    emit_watch_error(format!(
      "failed to register CoreAudio system listener: {e:?}"
    ));
  }

  // Register per-device listener on the current default input device.
  if let Ok(device) = ca::System::default_input_device() {
    if let Err(e) = device.add_prop_listener(
      &DEVICE_IS_RUNNING_SOMEWHERE,
      device_listener,
      needs_scan_raw,
    ) {
      emit_watch_error(format!(
        "failed to register CoreAudio device listener: {e:?}"
      ));
    }
  } else {
    emit_watch_error("no default input device found; watcher may miss initial state".to_string());
  }

  // Restore the Arc so it won't leak.
  let needs_scan = unsafe { Arc::from_raw(needs_scan_raw as *const Mutex<bool>) };

  // Emit initial snapshot.
  emit_snapshot(build_watch_rows());

  // Event loop: sleep in short increments and flush when the flag is set.
  // The flag is set by CoreAudio callbacks on state changes.
  const DEBOUNCE_MS: u64 = 250;
  loop {
    std::thread::sleep(std::time::Duration::from_millis(DEBOUNCE_MS));

    let dirty = {
      let mut guard = needs_scan.lock().unwrap_or_else(|e| e.into_inner());
      let was_dirty = *guard;
      *guard = false;
      was_dirty
    };

    if dirty {
      emit_snapshot(build_watch_rows());
    }
  }
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn run_macos_meeting_watcher() {
  // No-op on non-macOS platforms; flag handler returns false on these targets.
}
