use std::sync::Arc;

use napi::bindgen_prelude::Buffer;
use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};

use crate::encode::encode_audio_chunk;

/// Audio sample encoding requested by the caller.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AudioChunkEncoding {
  F32Le,
  PcmS16Le,
}

impl AudioChunkEncoding {
  pub fn as_str(self) -> &'static str {
    match self {
      AudioChunkEncoding::F32Le => "f32le",
      AudioChunkEncoding::PcmS16Le => "pcm_s16le",
    }
  }
}

pub fn parse_encoding(raw: &str) -> Option<AudioChunkEncoding> {
  match raw {
    "f32le" => Some(AudioChunkEncoding::F32Le),
    "pcm_s16le" => Some(AudioChunkEncoding::PcmS16Le),
    _ => None,
  }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AudioChunkSource {
  Mic,
  Speaker,
}

impl AudioChunkSource {
  pub fn as_str(self) -> &'static str {
    match self {
      AudioChunkSource::Mic => "mic",
      AudioChunkSource::Speaker => "speaker",
    }
  }
}

/// Capture configuration provided by JS at `start_capture`.
#[napi(object)]
pub struct StartInput {
  pub sample_rate_hz: u32,
  /// "f32le" | "pcm_s16le"
  pub encoding: String,
  pub mic_device_id: Option<String>,
  pub speaker_device_id: Option<String>,
  pub echo_cancellation: Option<bool>,
}

/// Event delivered to JS; `kind` is "audioChunk" | "deviceChanged" | "warning".
#[napi(object)]
pub struct CaptureEvent {
  pub kind: String,
  // audioChunk
  pub source: Option<String>,
  pub pcm: Option<Buffer>,
  pub sample_rate_hz: Option<u32>,
  pub num_samples: Option<u32>,
  pub encoding: Option<String>,
  // deviceChanged
  pub device_kind: Option<String>,
  pub device_name: Option<String>,
  // warning
  pub code: Option<String>,
  pub message: Option<String>,
}

#[napi(object)]
pub struct StopResult {
  /// ms since the Unix epoch. napi has no u64; f64 represents ms exactly below 2^53.
  pub ended_at: f64,
  pub duration_ms: f64,
  pub warnings: Vec<String>,
}

#[napi(object)]
pub struct DeviceList {
  pub microphone_devices: Vec<String>,
  pub speaker_devices: Vec<String>,
}

#[napi(object)]
pub struct Permissions {
  /// "granted" | "denied" | "unknown"
  pub microphone: String,
  pub screen_capture: String,
}

pub type Emitter = Arc<ThreadsafeFunction<CaptureEvent, ()>>;

pub fn emit_audio_chunk(
  tsfn: &Emitter,
  source: AudioChunkSource,
  samples: &[f32],
  sample_rate_hz: u32,
  encoding: AudioChunkEncoding,
) {
  if samples.is_empty() {
    return;
  }

  let bytes = encode_audio_chunk(samples, encoding);
  let event = CaptureEvent {
    kind: "audioChunk".into(),
    source: Some(source.as_str().into()),
    pcm: Some(bytes.into()),
    sample_rate_hz: Some(sample_rate_hz),
    num_samples: Some(samples.len() as u32),
    encoding: Some(encoding.as_str().into()),
    device_kind: None,
    device_name: None,
    code: None,
    message: None,
  };
  tsfn.call(Ok(event), ThreadsafeFunctionCallMode::NonBlocking);
}

pub fn emit_warning(tsfn: &Emitter, code: impl Into<String>, message: impl Into<String>) {
  let event = CaptureEvent {
    kind: "warning".into(),
    source: None,
    pcm: None,
    sample_rate_hz: None,
    num_samples: None,
    encoding: None,
    device_kind: None,
    device_name: None,
    code: Some(code.into()),
    message: Some(message.into()),
  };
  tsfn.call(Ok(event), ThreadsafeFunctionCallMode::NonBlocking);
}

#[cfg(test)]
mod tests {
  use super::{AudioChunkEncoding, AudioChunkSource, parse_encoding};

  #[test]
  fn parse_encoding_accepts_known_encodings() {
    assert_eq!(parse_encoding("f32le"), Some(AudioChunkEncoding::F32Le));
    assert_eq!(
      parse_encoding("pcm_s16le"),
      Some(AudioChunkEncoding::PcmS16Le)
    );
  }

  #[test]
  fn parse_encoding_rejects_unknown() {
    assert_eq!(parse_encoding("opus"), None);
  }

  #[test]
  fn source_serializes_as_lowercase_strings() {
    assert_eq!(AudioChunkSource::Mic.as_str(), "mic");
    assert_eq!(AudioChunkSource::Speaker.as_str(), "speaker");
  }
}
