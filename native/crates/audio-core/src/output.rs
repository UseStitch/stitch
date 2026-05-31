use std::io::{self, Write};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;

use crate::protocol::{AudioChunkSource, Event};

pub fn now_ms() -> u64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_millis() as u64
}

pub fn emit(event: Event) -> io::Result<()> {
  let stdout = io::stdout();
  let mut handle = stdout.lock();
  let payload = serde_json::to_string(&event)
    .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error.to_string()))?;
  handle.write_all(payload.as_bytes())?;
  handle.write_all(b"\n")?;
  handle.flush()
}

pub fn encode_samples_b64(samples: &[f32]) -> String {
  let bytes: &[u8] =
    unsafe { std::slice::from_raw_parts(samples.as_ptr() as *const u8, samples.len() * 4) };
  BASE64.encode(bytes)
}

pub fn emit_audio_chunk(source: AudioChunkSource, samples: &[f32], sample_rate_hz: u32) {
  if samples.is_empty() {
    return;
  }

  let _ = emit(Event::AudioChunk {
    source,
    samples_b64: encode_samples_b64(samples),
    sample_rate_hz,
    num_samples: samples.len() as u32,
  });
}

#[cfg(test)]
mod tests {
  use super::{encode_samples_b64, now_ms};
  use base64::Engine;
  use base64::engine::general_purpose::STANDARD as BASE64;

  #[test]
  fn now_ms_is_non_decreasing() {
    let first = now_ms();
    let second = now_ms();
    assert!(second >= first);
  }

  #[test]
  fn encode_samples_b64_roundtrips_correctly() {
    let samples: Vec<f32> = vec![0.5, -0.25, 1.0, -1.0, 0.0];
    let encoded = encode_samples_b64(&samples);
    let decoded_bytes = BASE64.decode(&encoded).expect("valid base64");
    let decoded_samples: Vec<f32> = decoded_bytes
      .chunks_exact(4)
      .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
      .collect();
    assert_eq!(samples, decoded_samples);
  }

  #[test]
  fn encode_samples_b64_empty_returns_empty_string() {
    let encoded = encode_samples_b64(&[]);
    assert_eq!(encoded, "");
  }
}
