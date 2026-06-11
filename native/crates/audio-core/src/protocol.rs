use serde::{Deserialize, Serialize};

use crate::error::NativeError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AudioChunkSource {
  Mic,
  Speaker,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
pub enum AudioChunkEncoding {
  #[serde(rename = "f32le")]
  F32Le,
  #[serde(rename = "pcm_s16le")]
  PcmS16Le,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioChunkConfig {
  pub encoding: AudioChunkEncoding,
  pub sample_rate_hz: u32,
}

#[derive(Debug, Deserialize)]
#[serde(
  tag = "type",
  rename_all = "camelCase",
  rename_all_fields = "camelCase"
)]
pub enum Command {
  Start {
    output_path: String,
    format: String,
    mode: String,
    sample_rate_hz: u32,
    channels: u16,
    mic_device_id: Option<String>,
    speaker_device_id: Option<String>,
    speaker_gain: Option<f32>,
    audio_chunk_config: Option<AudioChunkConfig>,
  },
  Stop,
  Status,
  ListDevices,
  Capabilities,
  CheckPermissions,
  PrimeSystemAudio,
}

#[derive(Debug, Serialize)]
#[serde(
  tag = "type",
  rename_all = "camelCase",
  rename_all_fields = "camelCase"
)]
pub enum Event {
  Started {
    started_at: u64,
    output_path: String,
  },
  Progress {
    duration_ms: u64,
  },
  Warning {
    code: String,
    message: String,
  },
  Stopped {
    ended_at: u64,
    duration_ms: u64,
    output_path: String,
    file_size_bytes: Option<u64>,
    sample_rate_hz: u32,
    channels: u16,
    warnings: Vec<String>,
  },
  Status {
    state: &'static str,
  },
  Error {
    code: &'static str,
    message: String,
  },
  DeviceList {
    microphone_devices: Vec<String>,
    speaker_devices: Vec<String>,
  },
  Capabilities {
    supported_modes: Vec<&'static str>,
    supports_realtime_dual: bool,
  },
  PermissionsStatus {
    microphone: &'static str,
    screen_capture: &'static str,
  },
  DeviceChanged {
    kind: &'static str,
    device_name: Option<String>,
  },
  AudioChunk {
    source: AudioChunkSource,
    samples_b64: String,
    sample_rate_hz: u32,
    num_samples: u32,
  },
}

#[derive(Debug, Clone, Copy)]
pub enum CaptureMode {
  Mic,
  Speaker,
  Dual,
}

#[derive(Debug, Clone)]
pub struct CaptureStart {
  pub output_path: String,
  pub mode: CaptureMode,
  pub sample_rate_hz: u32,
  pub channels: u16,
  pub mic_device_id: Option<String>,
  pub speaker_device_id: Option<String>,
  pub speaker_gain: f32,
  pub audio_chunk_config: Option<AudioChunkConfig>,
}

fn parse_mode(raw: &str) -> Result<CaptureMode, NativeError> {
  match raw {
    "mic" => Ok(CaptureMode::Mic),
    "speaker" => Ok(CaptureMode::Speaker),
    "dual" => Ok(CaptureMode::Dual),
    other => Err(NativeError::InvalidCommand(format!(
      "unsupported mode: {other}"
    ))),
  }
}

pub fn parse_start_command(command: Command) -> Result<CaptureStart, NativeError> {
  match command {
    Command::Start {
      output_path,
      format,
      mode,
      sample_rate_hz,
      channels,
      mic_device_id,
      speaker_device_id,
      speaker_gain,
      audio_chunk_config,
    } => {
      if format != "opus" {
        return Err(NativeError::InvalidCommand(format!(
          "unsupported format: {format}"
        )));
      }

      if sample_rate_hz == 0 {
        return Err(NativeError::InvalidCommand(
          "sampleRateHz must be > 0".to_string(),
        ));
      }

      if channels == 0 {
        return Err(NativeError::InvalidCommand(
          "channels must be > 0".to_string(),
        ));
      }

      if let Some(ref cfg) = audio_chunk_config {
        if cfg.sample_rate_hz == 0 {
          return Err(NativeError::InvalidCommand(
            "audioChunkConfig.sampleRateHz must be > 0".to_string(),
          ));
        }
      }

      Ok(CaptureStart {
        output_path,
        mode: parse_mode(&mode)?,
        sample_rate_hz,
        channels,
        mic_device_id,
        speaker_device_id,
        speaker_gain: speaker_gain.unwrap_or(10.0).clamp(0.1, 50.0),
        audio_chunk_config,
      })
    }
    _ => Err(NativeError::InvalidCommand(
      "expected start command".to_string(),
    )),
  }
}

#[cfg(test)]
mod tests {
  use super::{
    AudioChunkEncoding, AudioChunkSource, CaptureMode, Command, Event, parse_start_command,
  };

  #[test]
  fn parse_start_command_accepts_valid_payload() {
    let command = Command::Start {
      output_path: "tmp/audio.ogg".to_string(),
      format: "opus".to_string(),
      mode: "dual".to_string(),
      sample_rate_hz: 16_000,
      channels: 1,
      mic_device_id: Some("mic-1".to_string()),
      speaker_device_id: Some("speaker-1".to_string()),
      speaker_gain: None,
      audio_chunk_config: None,
    };

    let parsed = parse_start_command(command).expect("start command should parse");
    assert_eq!(parsed.output_path, "tmp/audio.ogg");
    assert!(matches!(parsed.mode, CaptureMode::Dual));
    assert_eq!(parsed.sample_rate_hz, 16_000);
    assert_eq!(parsed.channels, 1);
    assert_eq!(parsed.mic_device_id.as_deref(), Some("mic-1"));
    assert_eq!(parsed.speaker_device_id.as_deref(), Some("speaker-1"));
    assert!((parsed.speaker_gain - 10.0).abs() < 0.01);
    assert!(parsed.audio_chunk_config.is_none());
  }

  #[test]
  fn parse_start_command_accepts_audio_chunk_config() {
    let command = Command::Start {
      output_path: "tmp/audio.ogg".to_string(),
      format: "opus".to_string(),
      mode: "dual".to_string(),
      sample_rate_hz: 16_000,
      channels: 1,
      mic_device_id: None,
      speaker_device_id: None,
      speaker_gain: None,
      audio_chunk_config: Some(super::AudioChunkConfig {
        encoding: AudioChunkEncoding::PcmS16Le,
        sample_rate_hz: 16_000,
      }),
    };

    let parsed = parse_start_command(command).expect("start command should parse");
    let cfg = parsed.audio_chunk_config.expect("config should be present");
    assert_eq!(cfg.encoding, AudioChunkEncoding::PcmS16Le);
    assert_eq!(cfg.sample_rate_hz, 16_000);
  }

  #[test]
  fn parse_start_command_rejects_zero_chunk_sample_rate() {
    let command = Command::Start {
      output_path: "tmp/audio.ogg".to_string(),
      format: "opus".to_string(),
      mode: "dual".to_string(),
      sample_rate_hz: 16_000,
      channels: 1,
      mic_device_id: None,
      speaker_device_id: None,
      speaker_gain: None,
      audio_chunk_config: Some(super::AudioChunkConfig {
        encoding: AudioChunkEncoding::PcmS16Le,
        sample_rate_hz: 0,
      }),
    };

    let error = parse_start_command(command).expect_err("zero chunk rate must fail");
    assert_eq!(error.code(), "invalid_command");
  }

  #[test]
  fn parse_start_command_rejects_invalid_format() {
    let command = Command::Start {
      output_path: "tmp/audio.wav".to_string(),
      format: "wav".to_string(),
      mode: "mic".to_string(),
      sample_rate_hz: 16_000,
      channels: 1,
      mic_device_id: None,
      speaker_device_id: None,
      speaker_gain: None,
      audio_chunk_config: None,
    };

    let error = parse_start_command(command).expect_err("invalid format must fail");
    assert_eq!(error.code(), "invalid_command");
  }

  #[test]
  fn parse_start_command_rejects_zero_values() {
    let zero_rate = Command::Start {
      output_path: "tmp/audio.ogg".to_string(),
      format: "opus".to_string(),
      mode: "mic".to_string(),
      sample_rate_hz: 0,
      channels: 1,
      mic_device_id: None,
      speaker_device_id: None,
      speaker_gain: None,
      audio_chunk_config: None,
    };
    let zero_channels = Command::Start {
      output_path: "tmp/audio.ogg".to_string(),
      format: "opus".to_string(),
      mode: "mic".to_string(),
      sample_rate_hz: 16_000,
      channels: 0,
      mic_device_id: None,
      speaker_device_id: None,
      speaker_gain: None,
      audio_chunk_config: None,
    };

    assert_eq!(
      parse_start_command(zero_rate)
        .expect_err("zero rate must fail")
        .code(),
      "invalid_command"
    );
    assert_eq!(
      parse_start_command(zero_channels)
        .expect_err("zero channels must fail")
        .code(),
      "invalid_command"
    );
  }

  #[test]
  fn command_deserializes_new_control_messages() {
    let list: Command =
      serde_json::from_str(r#"{"type":"listDevices"}"#).expect("must parse listDevices");
    let caps: Command =
      serde_json::from_str(r#"{"type":"capabilities"}"#).expect("must parse capabilities");
    let perms: Command =
      serde_json::from_str(r#"{"type":"checkPermissions"}"#).expect("must parse checkPermissions");
    let prime: Command =
      serde_json::from_str(r#"{"type":"primeSystemAudio"}"#).expect("must parse primeSystemAudio");

    assert!(matches!(list, Command::ListDevices));
    assert!(matches!(caps, Command::Capabilities));
    assert!(matches!(perms, Command::CheckPermissions));
    assert!(matches!(prime, Command::PrimeSystemAudio));
  }

  #[test]
  fn event_serializes_capabilities_shape() {
    let event = Event::Capabilities {
      supported_modes: vec!["mic", "speaker", "dual"],
      supports_realtime_dual: true,
    };

    let serialized = serde_json::to_string(&event).expect("event should serialize");
    let value: serde_json::Value = serde_json::from_str(&serialized).expect("valid json");
    assert_eq!(value["type"], "capabilities");
    assert!(value.get("supportsRealtimeDual").is_some());
  }

  #[test]
  fn command_deserializes_start_payload_with_camel_case_fields() {
    let command: Command = serde_json::from_str(
      r#"{"type":"start","outputPath":"tmp/audio.ogg","format":"opus","mode":"mic","sampleRateHz":16000,"channels":1,"micDeviceId":null,"speakerDeviceId":null}"#,
    )
    .expect("must parse start command with camelCase fields (no chunk config)");

    match command {
      Command::Start {
        output_path,
        sample_rate_hz,
        audio_chunk_config,
        ..
      } => {
        assert_eq!(output_path, "tmp/audio.ogg");
        assert_eq!(sample_rate_hz, 16_000);
        assert!(audio_chunk_config.is_none());
      }
      _ => panic!("expected start command variant"),
    }
  }

  #[test]
  fn command_deserializes_start_with_audio_chunk_config() {
    let command: Command = serde_json::from_str(
      r#"{"type":"start","outputPath":"tmp/audio.ogg","format":"opus","mode":"dual","sampleRateHz":16000,"channels":1,"micDeviceId":null,"speakerDeviceId":null,"audioChunkConfig":{"encoding":"pcm_s16le","sampleRateHz":16000}}"#,
    )
    .expect("must parse start command with audioChunkConfig");

    match command {
      Command::Start {
        audio_chunk_config, ..
      } => {
        let cfg = audio_chunk_config.expect("config should be present");
        assert_eq!(cfg.encoding, AudioChunkEncoding::PcmS16Le);
        assert_eq!(cfg.sample_rate_hz, 16_000);
      }
      _ => panic!("expected start command variant"),
    }
  }

  #[test]
  fn event_serializes_audio_chunk_shape() {
    let event = Event::AudioChunk {
      source: AudioChunkSource::Mic,
      samples_b64: "AAAAAAAAAIA/".to_string(),
      sample_rate_hz: 16_000,
      num_samples: 3,
    };

    let serialized = serde_json::to_string(&event).expect("event should serialize");
    let value: serde_json::Value = serde_json::from_str(&serialized).expect("valid json");
    assert_eq!(value["type"], "audioChunk");
    assert_eq!(value["source"], "mic");
    assert_eq!(value["sampleRateHz"], 16_000);
    assert_eq!(value["numSamples"], 3);
    assert!(value.get("samplesB64").is_some());
  }

  #[test]
  fn audio_chunk_source_serializes_as_camel_case() {
    let mic = serde_json::to_string(&AudioChunkSource::Mic).expect("serialize mic");
    let speaker = serde_json::to_string(&AudioChunkSource::Speaker).expect("serialize speaker");
    assert_eq!(mic, "\"mic\"");
    assert_eq!(speaker, "\"speaker\"");
  }
}
