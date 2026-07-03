// Vendored from Stitch src-rs encoding glue; kept here so audio byte formats
// live with the rest of the PCM/audio utilities.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AudioEncoding {
  F32Le,
  PcmS16Le,
}

pub fn encode_samples_f32(samples: &[f32]) -> Vec<u8> {
  let mut bytes = Vec::with_capacity(samples.len() * 4);
  for sample in samples {
    bytes.extend_from_slice(&sample.to_le_bytes());
  }
  bytes
}

pub fn encode_samples_pcm_s16le(samples: &[f32]) -> Vec<u8> {
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
  buf
}

pub fn encode_audio_chunk(samples: &[f32], encoding: AudioEncoding) -> Vec<u8> {
  match encoding {
    AudioEncoding::F32Le => encode_samples_f32(samples),
    AudioEncoding::PcmS16Le => encode_samples_pcm_s16le(samples),
  }
}

#[cfg(test)]
mod tests {
  use super::{encode_samples_f32, encode_samples_pcm_s16le};

  #[test]
  fn encode_samples_f32_roundtrips_correctly() {
    let samples: Vec<f32> = vec![0.5, -0.25, 1.0, -1.0, 0.0];
    let bytes = encode_samples_f32(&samples);
    let decoded: Vec<f32> = bytes
      .chunks_exact(4)
      .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
      .collect();
    assert_eq!(samples, decoded);
  }

  #[test]
  fn encode_samples_f32_empty_returns_empty() {
    assert!(encode_samples_f32(&[]).is_empty());
  }

  #[test]
  fn encode_samples_pcm_s16le_produces_correct_bytes() {
    let samples: Vec<f32> = vec![1.0, -1.0, 0.0, 0.5];
    let bytes = encode_samples_pcm_s16le(&samples);
    assert_eq!(bytes.len(), 8);

    let decoded: Vec<i16> = bytes
      .chunks_exact(2)
      .map(|chunk| i16::from_le_bytes([chunk[0], chunk[1]]))
      .collect();

    assert_eq!(decoded[0], 32767);
    assert_eq!(decoded[1], -32768);
    assert_eq!(decoded[2], 0);
    assert!(decoded[3] > 16000 && decoded[3] < 16500);
  }

  #[test]
  fn encode_samples_pcm_s16le_clamps_out_of_range() {
    let samples: Vec<f32> = vec![2.0, -2.0];
    let bytes = encode_samples_pcm_s16le(&samples);
    let decoded: Vec<i16> = bytes
      .chunks_exact(2)
      .map(|chunk| i16::from_le_bytes([chunk[0], chunk[1]]))
      .collect();

    assert_eq!(decoded[0], 32767);
    assert_eq!(decoded[1], -32768);
  }
}
