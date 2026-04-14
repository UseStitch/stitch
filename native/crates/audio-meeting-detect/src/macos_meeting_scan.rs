use serde::Serialize;

#[cfg(target_os = "macos")]
use crate::mic_usage::list_mic_using_processes;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MacosMeetingRow {
  pub pid: i32,
  pub process_name: String,
  pub window_title: Option<String>,
}

#[cfg(target_os = "macos")]
pub fn list_macos_meeting_rows() -> Result<Vec<MacosMeetingRow>, String> {
  use std::collections::HashMap;
  use std::process::Command;

  const BROWSER_WINDOW_SCAN_SCRIPT: &str = r#"(() => {
  const output = { chrome: [], edge: [] };
  try {
    const systemEvents = Application('System Events');
    const processes = systemEvents.processes();

    const readTitles = (target) => {
      try {
        const process = processes.find((value) => value.name() === target);
        if (!process) {
          return [];
        }

        return process
          .windows()
          .map((window) => {
            try {
              return String(window.name() || '').trim();
            } catch {
              return '';
            }
          })
          .filter((title) => title.length > 0);
      } catch {
        return [];
      }
    };

    output.chrome = readTitles('Google Chrome');
    output.edge = readTitles('Microsoft Edge');
  } catch {}

  return JSON.stringify(output);
})();"#;

  fn normalize_process_name(input: &str) -> String {
    input.trim().to_lowercase().replace(".app", "")
  }

  fn browser_family(normalized_name: &str) -> Option<&'static str> {
    if normalized_name.contains("chrome") {
      return Some("chrome");
    }

    if normalized_name.contains("edge") || normalized_name.contains("msedge") {
      return Some("edge");
    }

    None
  }

  fn parse_browser_titles(raw: &str) -> HashMap<&'static str, String> {
    let mut result = HashMap::new();

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

  let browser_titles = {
    let output = Command::new("osascript")
      .args(["-l", "JavaScript", "-e", BROWSER_WINDOW_SCAN_SCRIPT])
      .output();

    match output {
      Ok(output) if output.status.success() => {
        parse_browser_titles(&String::from_utf8_lossy(&output.stdout))
      }
      _ => HashMap::new(),
    }
  };

  let mic_processes = list_mic_using_processes()?;
  let mut rows = Vec::new();

  for process in mic_processes {
    let normalized = normalize_process_name(&process.process_name);
    let window_title = browser_family(&normalized)
      .and_then(|family| browser_titles.get(family))
      .cloned();

    rows.push(MacosMeetingRow {
      pid: process.pid,
      process_name: process.process_name,
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

  Ok(rows)
}

#[cfg(not(target_os = "macos"))]
pub fn list_macos_meeting_rows() -> Result<Vec<MacosMeetingRow>, String> {
  Ok(Vec::new())
}
