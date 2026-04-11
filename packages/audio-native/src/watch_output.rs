use serde::Serialize;

/// A snapshot is emitted on stdout (JSON-line) whenever the set of active
/// meeting-related processes changes. The TS watcher transport ingests these
/// to drive the MeetingDetectionEngine.
#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub(crate) enum WatchEvent {
  /// Full replacement snapshot of currently-active rows.
  #[serde(rename_all = "camelCase")]
  Snapshot { rows: Vec<WatchRow> },
  /// Emitted when a non-fatal error occurs; the watcher keeps running.
  #[serde(rename_all = "camelCase")]
  Error { message: String },
}

/// Platform-agnostic row shape shared between macOS and Windows scanners.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WatchRow {
  pub(crate) pid: u32,
  pub(crate) process_name: String,
  pub(crate) window_title: Option<String>,
}

pub(crate) fn emit_snapshot(rows: Vec<WatchRow>) {
  let event = WatchEvent::Snapshot { rows };
  if let Ok(line) = serde_json::to_string(&event) {
    println!("{line}");
  }
}

pub(crate) fn emit_watch_error(message: impl Into<String>) {
  let event = WatchEvent::Error {
    message: message.into(),
  };
  if let Ok(line) = serde_json::to_string(&event) {
    println!("{line}");
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn snapshot_serializes_type_tag() {
    let event = WatchEvent::Snapshot {
      rows: vec![WatchRow {
        pid: 1,
        process_name: "zoom.us".to_string(),
        window_title: None,
      }],
    };
    let json = serde_json::to_string(&event).unwrap();
    let value: serde_json::Value = serde_json::from_str(&json).unwrap();
    assert_eq!(value["type"], "snapshot");
    assert!(value["rows"].is_array());
  }

  #[test]
  fn error_serializes_type_tag() {
    let event = WatchEvent::Error {
      message: "oops".to_string(),
    };
    let json = serde_json::to_string(&event).unwrap();
    let value: serde_json::Value = serde_json::from_str(&json).unwrap();
    assert_eq!(value["type"], "error");
    assert_eq!(value["message"], "oops");
  }

  #[test]
  fn watch_row_uses_camel_case() {
    let row = WatchRow {
      pid: 42,
      process_name: "chrome".to_string(),
      window_title: Some("Google Meet".to_string()),
    };
    let value = serde_json::to_value(row).unwrap();
    assert!(value.get("processName").is_some());
    assert!(value.get("windowTitle").is_some());
    assert!(value.get("pid").is_some());
  }
}
