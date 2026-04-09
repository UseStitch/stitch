use std::io::{self, BufRead};

use cpal::traits::{DeviceTrait, HostTrait};

mod capture;
mod error;
mod macos_meeting_scan;
mod mic_usage;
mod output;
mod protocol;
mod resample;
mod session;
mod speaker;
mod windows_meeting_scan;

use macos_meeting_scan::list_macos_meeting_rows;
use output::emit;
use mic_usage::list_mic_using_processes;
use protocol::{parse_start_command, Command, Event};
use session::{start_session, stop_session, ActiveSession};
use windows_meeting_scan::list_windows_meeting_rows;

fn handle_list_mic_usage_flag() -> io::Result<bool> {
  if !std::env::args().skip(1).any(|arg| arg == "--list-mic-usage") {
    return Ok(false);
  }

  let apps = list_mic_using_processes().unwrap_or_default();
  println!(
    "{}",
    serde_json::to_string(&apps)
      .map_err(|error| io::Error::new(io::ErrorKind::Other, format!("serialize failed: {error}")))?
  );
  Ok(true)
}

fn handle_list_windows_meeting_usage_flag() -> io::Result<bool> {
  if !std::env::args()
    .skip(1)
    .any(|arg| arg == "--list-windows-meeting-usage")
  {
    return Ok(false);
  }

  let rows = list_windows_meeting_rows().unwrap_or_default();
  println!(
    "{}",
    serde_json::to_string(&rows)
      .map_err(|error| io::Error::other(format!("serialize failed: {error}")))?
  );

  Ok(true)
}

fn handle_list_macos_meeting_usage_flag() -> io::Result<bool> {
  if !std::env::args()
    .skip(1)
    .any(|arg| arg == "--list-macos-meeting-usage")
  {
    return Ok(false);
  }

  let rows = list_macos_meeting_rows().unwrap_or_default();
  println!(
    "{}",
    serde_json::to_string(&rows)
      .map_err(|error| io::Error::other(format!("serialize failed: {error}")))?
  );

  Ok(true)
}

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
  if handle_list_mic_usage_flag()? {
    return Ok(());
  }

  if handle_list_windows_meeting_usage_flag()? {
    return Ok(());
  }

  if handle_list_macos_meeting_usage_flag()? {
    return Ok(());
  }

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
