use serde::{Deserialize, Serialize};

use crate::error::NativeError;

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
    enable_aec: bool,
    mic_device_id: Option<String>,
    speaker_device_id: Option<String>,
    speaker_gain: Option<f32>,
  },
  Stop,
  Status,
  ListDevices,
  Capabilities,
  CheckPermissions,
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
    supports_aec: bool,
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
  pub enable_aec: bool,
  pub speaker_gain: f32,
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
      enable_aec,
      mic_device_id,
      speaker_device_id,
      speaker_gain,
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

      Ok(CaptureStart {
        output_path,
        mode: parse_mode(&mode)?,
        sample_rate_hz,
        channels,
        mic_device_id,
        speaker_device_id,
        enable_aec,
        speaker_gain: speaker_gain.unwrap_or(10.0).clamp(0.1, 50.0),
      })
    }
    _ => Err(NativeError::InvalidCommand(
      "expected start command".to_string(),
    )),
  }
}

#[cfg(test)]
mod tests {
  use super::{CaptureMode, Command, Event, parse_start_command};

  #[test]
  fn parse_start_command_accepts_valid_payload() {
    let command = Command::Start {
      output_path: "tmp/audio.ogg".to_string(),
      format: "opus".to_string(),
      mode: "dual".to_string(),
      sample_rate_hz: 16_000,
      channels: 1,
      enable_aec: true,
      mic_device_id: Some("mic-1".to_string()),
      speaker_device_id: Some("speaker-1".to_string()),
      speaker_gain: None,
    };

    let parsed = parse_start_command(command).expect("start command should parse");
    assert_eq!(parsed.output_path, "tmp/audio.ogg");
    assert!(matches!(parsed.mode, CaptureMode::Dual));
    assert_eq!(parsed.sample_rate_hz, 16_000);
    assert_eq!(parsed.channels, 1);
    assert!(parsed.enable_aec);
    assert_eq!(parsed.mic_device_id.as_deref(), Some("mic-1"));
    assert_eq!(parsed.speaker_device_id.as_deref(), Some("speaker-1"));
    assert!((parsed.speaker_gain - 10.0).abs() < 0.01);
  }

  #[test]
  fn parse_start_command_rejects_invalid_format() {
    let command = Command::Start {
      output_path: "tmp/audio.wav".to_string(),
      format: "wav".to_string(),
      mode: "mic".to_string(),
      sample_rate_hz: 16_000,
      channels: 1,
      enable_aec: false,
      mic_device_id: None,
      speaker_device_id: None,
      speaker_gain: None,
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
      enable_aec: false,
      mic_device_id: None,
      speaker_device_id: None,
      speaker_gain: None,
    };
    let zero_channels = Command::Start {
      output_path: "tmp/audio.ogg".to_string(),
      format: "opus".to_string(),
      mode: "mic".to_string(),
      sample_rate_hz: 16_000,
      channels: 0,
      enable_aec: false,
      mic_device_id: None,
      speaker_device_id: None,
      speaker_gain: None,
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

    assert!(matches!(list, Command::ListDevices));
    assert!(matches!(caps, Command::Capabilities));
    assert!(matches!(perms, Command::CheckPermissions));
  }

  #[test]
  fn event_serializes_capabilities_shape() {
    let event = Event::Capabilities {
      supported_modes: vec!["mic", "speaker", "dual"],
      supports_aec: true,
      supports_realtime_dual: true,
    };

    let serialized = serde_json::to_string(&event).expect("event should serialize");
    let value: serde_json::Value = serde_json::from_str(&serialized).expect("valid json");
    assert_eq!(value["type"], "capabilities");
    assert!(value.get("supportsAec").is_some());
  }

  #[test]
  fn command_deserializes_start_payload_with_camel_case_fields() {
    let command: Command = serde_json::from_str(
      r#"{"type":"start","outputPath":"tmp/audio.ogg","format":"opus","mode":"mic","sampleRateHz":16000,"channels":1,"enableAec":false,"micDeviceId":null,"speakerDeviceId":null}"#,
    )
    .expect("must parse start command with camelCase fields");

    match command {
      Command::Start {
        output_path,
        sample_rate_hz,
        ..
      } => {
        assert_eq!(output_path, "tmp/audio.ogg");
        assert_eq!(sample_rate_hz, 16_000);
      }
      _ => panic!("expected start command variant"),
    }
  }
}
