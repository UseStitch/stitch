use serde::Serialize;

#[cfg(target_os = "macos")]
use sysinfo::{Pid, ProcessesToUpdate, System};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MicUsingProcess {
  pub pid: i32,
  pub process_name: String,
}

#[cfg(target_os = "macos")]
fn process_name_for_pid(pid: i32) -> Option<String> {
  let mut system = System::new();
  let pid_ref = Pid::from_u32(pid as u32);
  system.refresh_processes(ProcessesToUpdate::Some(&[pid_ref]), true);

  let process = system.process(pid_ref)?;
  let process_name = process.name().to_string_lossy().trim().to_string();
  if process_name.is_empty() {
    return None;
  }

  Some(process_name)
}

#[cfg(target_os = "macos")]
pub fn list_mic_using_processes() -> Result<Vec<MicUsingProcess>, String> {
  use cidre::core_audio as ca;

  let processes = ca::System::processes()
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

#[cfg(not(target_os = "macos"))]
pub fn list_mic_using_processes() -> Result<Vec<MicUsingProcess>, String> {
  Ok(Vec::new())
}
