use std::io::{self, BufRead};

use cpal::traits::{DeviceTrait, HostTrait};

mod capture;
mod error;
mod output;
mod protocol;
mod session;
mod speaker;

use output::emit;
use protocol::{Command, Event, parse_start_command};
use session::{ActiveSession, start_session, stop_session};

fn list_microphone_devices() -> Vec<String> {
  let host = cpal::default_host();
  let Ok(devices) = host.input_devices() else {
    return Vec::new();
  };

  devices
    .filter_map(|device| {
      device
        .description()
        .map(|description| description.name().to_string())
        .ok()
    })
    .collect()
}

fn list_speaker_devices() -> Vec<String> {
  #[cfg(target_os = "windows")]
  {
    return vec!["default".to_string()];
  }

  #[cfg(target_os = "macos")]
  {
    return list_microphone_devices();
  }

  #[cfg(not(any(target_os = "windows", target_os = "macos")))]
  {
    Vec::new()
  }
}

fn main() -> io::Result<()> {
  let stdin = io::stdin();
  let mut active: Option<ActiveSession> = None;

  for line in stdin.lock().lines() {
    let line = line?;
    if line.trim().is_empty() {
      continue;
    }

    let command = match serde_json::from_str::<Command>(&line) {
      Ok(command) => command,
      Err(error) => {
        emit(Event::Error {
          code: "invalid_command",
          message: format!("Invalid command payload: {error}"),
        })?;
        continue;
      }
    };

    match command {
      Command::Start { .. } => {
        if active.is_some() {
          emit(Event::Error {
            code: "already_recording",
            message: "A recording session is already active".to_string(),
          })?;
          continue;
        }

        let start = match parse_start_command(command) {
          Ok(start) => start,
          Err(error) => {
            emit(Event::Error {
              code: error.code(),
              message: error.to_string(),
            })?;
            continue;
          }
        };

        match start_session(start) {
          Ok(session) => {
            let event = Event::Started {
              started_at: session.started_at,
              output_path: session.output_path.clone(),
            };
            active = Some(session);
            emit(event)?;
          }
          Err(error) => {
            emit(Event::Error {
              code: error.code(),
              message: error.to_string(),
            })?;
          }
        }
      }
      Command::Stop => {
        let Some(session) = active.take() else {
          emit(Event::Error {
            code: "not_recording",
            message: "No active recording session".to_string(),
          })?;
          continue;
        };

        match stop_session(session) {
          Ok(event) => emit(event)?,
          Err(error) => {
            emit(Event::Error {
              code: error.code(),
              message: error.to_string(),
            })?;
          }
        }
      }
      Command::Status => {
        let state = if active.is_some() {
          "active"
        } else {
          "inactive"
        };
        emit(Event::Status { state })?;
      }
      Command::ListDevices => {
        emit(Event::DeviceList {
          microphone_devices: list_microphone_devices(),
          speaker_devices: list_speaker_devices(),
        })?;
      }
      Command::Capabilities => {
        emit(Event::Capabilities {
          supported_modes: vec!["mic", "speaker", "dual"],
          supports_aec: true,
          supports_realtime_dual: true,
        })?;
      }
    }
  }

  if let Some(session) = active.take() {
    let _ = stop_session(session);
  }

  Ok(())
}
