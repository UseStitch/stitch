#[cfg(target_os = "macos")]
pub fn run(
  tsfn: std::sync::Arc<crate::watch_output::Emitter>,
  stop: std::sync::Arc<std::sync::atomic::AtomicBool>,
) {
  use std::process::Command;
  use std::sync::atomic::Ordering;
  use std::sync::{Arc, Mutex};

  use crate::watch_output::{WatchRow, emit_snapshot, emit_watch_error};

  use cidre::core_audio as ca_inner;
  use sysinfo::{Pid, ProcessesToUpdate, System};

  struct MicUsingProcess {
    pid: i32,
    process_name: String,
  }

  fn process_name_for_pid(pid: i32) -> Option<String> {
    let mut system = System::new();
    let pid_ref = Pid::from_u32(pid as u32);
    system.refresh_processes(ProcessesToUpdate::Some(&[pid_ref]), true);
    let process = system.process(pid_ref)?;
    let name = process.name().to_string_lossy().trim().to_string();
    if name.is_empty() { None } else { Some(name) }
  }

  fn list_mic_using_processes() -> Result<Vec<MicUsingProcess>, String> {
    let processes = ca_inner::System::processes()
      .map_err(|error| format!("core audio process query failed: {error:?}"))?;

    let mut result = Vec::new();
    for process in processes {
      let Ok(is_running_input) = process.is_running_input() else {
        continue;
      };
      if !is_running_input {
        continue;
      }
      let Ok(pid) = process.pid() else {
        continue;
      };
      let process_name = process_name_for_pid(pid).unwrap_or_else(|| format!("pid:{pid}"));
      result.push(MicUsingProcess { pid, process_name });
    }

    result.sort_by(|a, b| a.pid.cmp(&b.pid));
    result.dedup_by(|a, b| a.pid == b.pid);
    Ok(result)
  }

  use cidre::core_audio as ca;
  use cidre::os as cidre_os;

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

  fn build_watch_rows(tsfn: &crate::watch_output::Emitter) -> Vec<WatchRow> {
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

    let processes = match list_mic_using_processes() {
      Ok(procs) => procs,
      Err(error) => {
        emit_watch_error(tsfn, format!("mic process scan failed: {error}"));
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

  // Set a dirty flag from CoreAudio callbacks instead of scanning inline, so the
  // audio thread is never blocked.
  let needs_scan: Arc<Mutex<bool>> = Arc::new(Mutex::new(true));
  let needs_scan_for_listener = needs_scan.clone();

  extern "C-unwind" fn device_listener(
    _obj_id: ca::Obj,
    _number_addresses: u32,
    _addresses: *const ca::PropAddr,
    client_data: *mut (),
  ) -> cidre_os::Status {
    let flag = unsafe { &*(client_data as *const Mutex<bool>) };
    if let Ok(mut guard) = flag.lock() {
      *guard = true;
    }
    cidre_os::Status::NO_ERR
  }

  extern "C-unwind" fn system_listener(
    _obj_id: ca::Obj,
    _number_addresses: u32,
    _addresses: *const ca::PropAddr,
    client_data: *mut (),
  ) -> cidre_os::Status {
    // Default input device changed; mark dirty so the next scan picks it up.
    let flag = unsafe { &*(client_data as *const Mutex<bool>) };
    if let Ok(mut guard) = flag.lock() {
      *guard = true;
    }
    cidre_os::Status::NO_ERR
  }

  const DEVICE_IS_RUNNING_SOMEWHERE: ca::PropAddr = ca::PropAddr {
    selector: ca::PropSelector::DEVICE_IS_RUNNING_SOMEWHERE,
    scope: ca::PropScope::GLOBAL,
    element: ca::PropElement::MAIN,
  };

  let needs_scan_raw = Arc::into_raw(needs_scan_for_listener) as *mut ();

  if let Err(e) = ca::System::OBJ.add_prop_listener(
    &ca::PropSelector::HW_DEFAULT_INPUT_DEVICE.global_addr(),
    system_listener,
    needs_scan_raw,
  ) {
    emit_watch_error(
      &tsfn,
      format!("failed to register CoreAudio system listener: {e:?}"),
    );
  }

  if let Ok(device) = ca::System::default_input_device() {
    if let Err(e) = device.add_prop_listener(
      &DEVICE_IS_RUNNING_SOMEWHERE,
      device_listener,
      needs_scan_raw,
    ) {
      emit_watch_error(
        &tsfn,
        format!("failed to register CoreAudio device listener: {e:?}"),
      );
    }
  } else {
    emit_watch_error(
      &tsfn,
      "no default input device found; watcher may miss initial state".to_string(),
    );
  }

  // Restore the Arc so it won't leak.
  let needs_scan = unsafe { Arc::from_raw(needs_scan_raw as *const Mutex<bool>) };

  emit_snapshot(&tsfn, build_watch_rows(&tsfn));

  // Flush a snapshot whenever a CoreAudio callback has set the dirty flag.
  const DEBOUNCE_MS: u64 = 250;
  loop {
    if stop.load(Ordering::Relaxed) {
      return;
    }

    std::thread::sleep(std::time::Duration::from_millis(DEBOUNCE_MS));

    let dirty = {
      let mut guard = needs_scan.lock().unwrap_or_else(|e| e.into_inner());
      let was_dirty = *guard;
      *guard = false;
      was_dirty
    };

    if dirty {
      emit_snapshot(&tsfn, build_watch_rows(&tsfn));
    }
  }
}
