use std::io::{self, Write};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::protocol::Event;

pub(crate) fn now_ms() -> u64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_millis() as u64
}

pub(crate) fn emit(event: Event) -> io::Result<()> {
  let stdout = io::stdout();
  let mut handle = stdout.lock();
  let payload = serde_json::to_string(&event)
    .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error.to_string()))?;
  handle.write_all(payload.as_bytes())?;
  handle.write_all(b"\n")?;
  handle.flush()
}

#[cfg(test)]
mod tests {
  use super::now_ms;

  #[test]
  fn now_ms_is_non_decreasing() {
    let first = now_ms();
    let second = now_ms();
    assert!(second >= first);
  }
}
