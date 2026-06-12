use std::io::{self, BufRead};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

use audio_core::output::emit;
use audio_core::protocol::{Command, Event, parse_start_command};
use audio_recording::{
  ActiveSession, device_display_name, is_tap_device, start_session, stop_session,
};
use cpal::traits::{DeviceTrait, HostTrait};

fn list_microphone_devices() -> Vec<String> {
  let host = cpal::default_host();
  let Ok(devices) = host.input_devices() else {
    return Vec::new();
  };

  devices
    .filter_map(|device| device_display_name(&device))
    .filter(|name| !is_tap_device(name))
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

fn check_microphone_permission() -> &'static str {
  let host = cpal::default_host();
  let device = match host.default_input_device() {
    Some(d) => d,
    None => return "denied",
  };
  let config = match device.default_input_config() {
    Ok(c) => c,
    Err(_) => return "denied",
  };
  match device.build_input_stream(&config.config(), |_data: &[f32], _| {}, |_err| {}, None) {
    Ok(_stream) => "granted",
    Err(_) => "denied",
  }
}

/// Query the TCC (Transparency, Consent, and Control) database for a permission.
/// Returns 0 for granted, other values for denied/restricted.
#[cfg(target_os = "macos")]
fn tcc_preflight(service: &str) -> i32 {
  use std::ffi::CStr;

  type TCCPreflightFn =
    unsafe extern "C" fn(service: *const std::ffi::c_void, options: *const std::ffi::c_void) -> i32;

  unsafe {
    let path = CStr::from_bytes_with_nul_unchecked(
      b"/System/Library/PrivateFrameworks/TCC.framework/Versions/A/TCC\0",
    );
    let handle = libc::dlopen(path.as_ptr(), libc::RTLD_NOW);
    if handle.is_null() {
      return -1;
    }

    let sym_name = CStr::from_bytes_with_nul_unchecked(b"TCCAccessPreflight\0");
    let sym = libc::dlsym(handle, sym_name.as_ptr());
    if sym.is_null() {
      libc::dlclose(handle);
      return -1;
    }

    let preflight: TCCPreflightFn = std::mem::transmute(sym);
    let service_str = cidre::ns::String::with_str(service);
    let result = preflight(
      service_str.as_ref() as *const cidre::ns::String as *const std::ffi::c_void,
      std::ptr::null(),
    );

    libc::dlclose(handle);
    result
  }
}

fn check_screen_capture_permission() -> &'static str {
  #[cfg(target_os = "macos")]
  {
    // Speaker capture uses two paths in parallel: process taps (need kTCCServiceAudioCapture)
    // and ScreenCaptureKit (needs kTCCServiceScreenCapture). Either one is sufficient.
    let audio_capture = tcc_preflight("kTCCServiceAudioCapture");
    let screen_capture = tcc_preflight("kTCCServiceScreenCapture");
    if audio_capture == 0 || screen_capture == 0 {
      return "granted";
    }
    return "denied";
  }

  #[cfg(not(target_os = "macos"))]
  {
    "granted"
  }
}

#[cfg(target_os = "macos")]
const PRIME_POLL_INTERVAL: Duration = Duration::from_millis(500);
#[cfg(target_os = "macos")]
const PRIME_POLL_ATTEMPTS: u32 = 20;

/// Triggers the kTCCServiceAudioCapture prompt, waits up to 10s for user response.
/// Returns a guard that must stay alive until the permissions status is emitted.
#[cfg(target_os = "macos")]
fn prime_system_audio_permission() -> Option<audio_recording::SystemAudioPrime> {
  if check_screen_capture_permission() == "granted" {
    return None;
  }

  let prime = audio_recording::prime_system_audio_tap();
  if prime.is_some() {
    for _ in 0..PRIME_POLL_ATTEMPTS {
      thread::sleep(PRIME_POLL_INTERVAL);
      if tcc_preflight("kTCCServiceAudioCapture") == 0 {
        break;
      }
    }
  }
  prime
}

fn default_input_device_name() -> Option<String> {
  let host = cpal::default_host();
  let name = host
    .default_input_device()
    .and_then(|d| device_display_name(&d))?;
  if is_tap_device(&name) {
    return None;
  }
  Some(name)
}

fn spawn_device_monitor(stop: Arc<AtomicBool>) -> thread::JoinHandle<()> {
  thread::Builder::new()
    .name("stitch-audio-device-monitor".to_string())
    .spawn(move || {
      let mut last_input = default_input_device_name();

      while !stop.load(Ordering::Relaxed) {
        thread::sleep(Duration::from_secs(2));
        if stop.load(Ordering::Relaxed) {
          break;
        }

        let current_input = default_input_device_name();
        if current_input != last_input {
          let _ = emit(Event::DeviceChanged {
            kind: "input",
            device_name: current_input.clone(),
          });
          last_input = current_input;
        }
      }
    })
    .expect("failed to spawn device monitor thread")
}

fn main() -> io::Result<()> {
  let stdin = io::stdin();
  let mut active: Option<ActiveSession> = None;
  let mut device_monitor: Option<(Arc<AtomicBool>, thread::JoinHandle<()>)> = None;

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

            let monitor_stop = Arc::new(AtomicBool::new(false));
            let monitor_handle = spawn_device_monitor(monitor_stop.clone());
            device_monitor = Some((monitor_stop, monitor_handle));

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
        if let Some((stop_flag, handle)) = device_monitor.take() {
          stop_flag.store(true, Ordering::Relaxed);
          let _ = handle.join();
        }

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
          supports_realtime_dual: true,
        })?;
      }
      Command::CheckPermissions => {
        emit(Event::PermissionsStatus {
          microphone: check_microphone_permission(),
          screen_capture: check_screen_capture_permission(),
        })?;
      }
      Command::PrimeSystemAudio => {
        #[cfg(target_os = "macos")]
        let _prime_guard = prime_system_audio_permission();

        emit(Event::PermissionsStatus {
          microphone: check_microphone_permission(),
          screen_capture: check_screen_capture_permission(),
        })?;
      }
    }
  }

  if let Some((stop_flag, handle)) = device_monitor.take() {
    stop_flag.store(true, Ordering::Relaxed);
    let _ = handle.join();
  }

  if let Some(session) = active.take() {
    let _ = stop_session(session);
  }

  Ok(())
}
