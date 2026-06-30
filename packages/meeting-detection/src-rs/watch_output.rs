use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};

/// One mic-using process in a snapshot delivered to JS.
#[napi(object)]
#[derive(Clone)]
pub struct WatchRow {
  pub pid: u32,
  pub process_name: String,
  pub window_title: Option<String>,
}

/// Event delivered to JS; `kind` is "snapshot" | "error".
#[napi(object)]
#[derive(Clone)]
pub struct WatchEvent {
  pub kind: String,
  pub rows: Option<Vec<WatchRow>>,
  pub message: Option<String>,
}

pub type Emitter = ThreadsafeFunction<WatchEvent, ()>;

pub fn emit_snapshot(tsfn: &Emitter, rows: Vec<WatchRow>) {
  let event = WatchEvent {
    kind: "snapshot".into(),
    rows: Some(rows),
    message: None,
  };
  tsfn.call(Ok(event), ThreadsafeFunctionCallMode::NonBlocking);
}

pub fn emit_watch_error(tsfn: &Emitter, message: impl Into<String>) {
  let event = WatchEvent {
    kind: "error".into(),
    rows: None,
    message: Some(message.into()),
  };
  tsfn.call(Ok(event), ThreadsafeFunctionCallMode::NonBlocking);
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn snapshot_uses_expected_kind() {
    let event = WatchEvent {
      kind: "snapshot".into(),
      rows: Some(vec![WatchRow {
        pid: 1,
        process_name: "zoom.us".to_string(),
        window_title: None,
      }]),
      message: None,
    };
    assert_eq!(event.kind, "snapshot");
    assert!(event.rows.is_some());
  }

  #[test]
  fn error_uses_expected_kind() {
    let event = WatchEvent {
      kind: "error".into(),
      rows: None,
      message: Some("oops".to_string()),
    };
    assert_eq!(event.kind, "error");
    assert_eq!(event.message.as_deref(), Some("oops"));
  }
}
