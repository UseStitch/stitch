use std::io::{self, Write};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;

use crate::protocol::{AudioChunkEncoding, AudioChunkSource, Event};

pub fn now_ms() -> u64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .expect("system clock must be after Unix epoch")
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

pub fn encode_samples_f32_b64(samples: &[f32]) -> String {
  let mut bytes = Vec::with_capacity(samples.len() * 4);
  for sample in samples {
    bytes.extend_from_slice(&sample.to_le_bytes());
  }
  BASE64.encode(bytes)
}

pub fn encode_samples_pcm_s16le_b64(samples: &[f32]) -> String {
  let mut buf = Vec::with_capacity(samples.len() * 2);
  for &s in samples {
    let clamped = s.clamp(-1.0, 1.0);
    let int16 = if clamped < 0.0 {
      (clamped * 32768.0) as i16
    } else {
      (clamped * 32767.0) as i16
    };
    buf.extend_from_slice(&int16.to_le_bytes());
  }
  BASE64.encode(&buf)
}

pub fn encode_audio_chunk(samples: &[f32], encoding: AudioChunkEncoding) -> String {
  match encoding {
    AudioChunkEncoding::F32Le => encode_samples_f32_b64(samples),
    AudioChunkEncoding::PcmS16Le => encode_samples_pcm_s16le_b64(samples),
  }
}

pub fn emit_audio_chunk(
  source: AudioChunkSource,
  samples: &[f32],
  sample_rate_hz: u32,
  encoding: AudioChunkEncoding,
) {
  if samples.is_empty() {
    return;
  }

  let _ = emit(Event::AudioChunk {
    source,
    samples_b64: encode_audio_chunk(samples, encoding),
    sample_rate_hz,
    num_samples: samples.len() as u32,
  });
}

#[cfg(test)]
mod tests {
  use super::{encode_samples_f32_b64, encode_samples_pcm_s16le_b64, now_ms};
  use base64::Engine;
  use base64::engine::general_purpose::STANDARD as BASE64;

  #[test]
  fn now_ms_is_non_decreasing() {
    let first = now_ms();
    let second = now_ms();
    assert!(second >= first);
  }

  #[test]
  fn encode_samples_f32_b64_roundtrips_correctly() {
    let samples: Vec<f32> = vec![0.5, -0.25, 1.0, -1.0, 0.0];
    let encoded = encode_samples_f32_b64(&samples);
    let decoded_bytes = BASE64.decode(&encoded).expect("valid base64");
    let decoded_samples: Vec<f32> = decoded_bytes
      .chunks_exact(4)
      .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
      .collect();
    assert_eq!(samples, decoded_samples);
  }

  #[test]
  fn encode_samples_f32_b64_empty_returns_empty_string() {
    let encoded = encode_samples_f32_b64(&[]);
    assert_eq!(encoded, "");
  }

  #[test]
  fn encode_samples_pcm_s16le_produces_correct_bytes() {
    let samples: Vec<f32> = vec![1.0, -1.0, 0.0, 0.5];
    let encoded = encode_samples_pcm_s16le_b64(&samples);
    let decoded_bytes = BASE64.decode(&encoded).expect("valid base64");
    assert_eq!(decoded_bytes.len(), 8); // 4 samples * 2 bytes

    let decoded_i16: Vec<i16> = decoded_bytes
      .chunks_exact(2)
      .map(|chunk| i16::from_le_bytes([chunk[0], chunk[1]]))
      .collect();

    assert_eq!(decoded_i16[0], 32767); // 1.0 → i16::MAX
    assert_eq!(decoded_i16[1], -32768); // -1.0 → i16::MIN
    assert_eq!(decoded_i16[2], 0); // 0.0 → 0
    assert!(decoded_i16[3] > 16000 && decoded_i16[3] < 16500); // 0.5 → ~16383
  }

  #[test]
  fn encode_samples_pcm_s16le_clamps_out_of_range() {
    let samples: Vec<f32> = vec![2.0, -2.0];
    let encoded = encode_samples_pcm_s16le_b64(&samples);
    let decoded_bytes = BASE64.decode(&encoded).expect("valid base64");
    let decoded_i16: Vec<i16> = decoded_bytes
      .chunks_exact(2)
      .map(|chunk| i16::from_le_bytes([chunk[0], chunk[1]]))
      .collect();

    assert_eq!(decoded_i16[0], 32767); // clamped to 1.0
    assert_eq!(decoded_i16[1], -32768); // clamped to -1.0
  }
}
