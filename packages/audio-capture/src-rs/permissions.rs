use hypr_audio_actual::MicInput;
use hypr_audio_actual::cpal;
use hypr_audio_actual::cpal::traits::{DeviceTrait, HostTrait};

use crate::protocol::Permissions;

pub fn list_microphone_devices() -> Vec<String> {
  MicInput::list_devices()
}

pub fn list_speaker_devices() -> Vec<String> {
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
pub fn tcc_preflight(service: &str) -> i32 {
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

/// System audio capture uses a Core Audio process tap, gated by kTCCServiceAudioCapture.
fn check_system_audio_permission() -> &'static str {
  #[cfg(target_os = "macos")]
  {
    if tcc_preflight("kTCCServiceAudioCapture") == 0 {
      return "granted";
    }
    return "denied";
  }

  #[cfg(not(target_os = "macos"))]
  {
    "granted"
  }
}

pub fn check_permissions() -> Permissions {
  Permissions {
    microphone: check_microphone_permission().to_string(),
    screen_capture: check_system_audio_permission().to_string(),
  }
}

#[cfg(target_os = "macos")]
const PRIME_POLL_INTERVAL: std::time::Duration = std::time::Duration::from_millis(500);
#[cfg(target_os = "macos")]
const PRIME_POLL_ATTEMPTS: u32 = 20;

/// Triggers the kTCCServiceAudioCapture prompt, waits up to 10s for user response.
#[cfg(target_os = "macos")]
pub fn prime_system_audio() -> Permissions {
  use std::panic::{AssertUnwindSafe, catch_unwind};

  use hypr_audio_actual::SpeakerInput;

  if check_system_audio_permission() != "granted" {
    // A running tap pipeline must stay alive while the TCC prompt is shown.
    let prime = catch_unwind(AssertUnwindSafe(|| {
      SpeakerInput::new()
        .ok()
        .and_then(|input| input.stream().ok())
    }))
    .ok()
    .flatten();
    if prime.is_some() {
      for _ in 0..PRIME_POLL_ATTEMPTS {
        std::thread::sleep(PRIME_POLL_INTERVAL);
        if tcc_preflight("kTCCServiceAudioCapture") == 0 {
          break;
        }
      }
    }
    drop(prime);
  }

  check_permissions()
}

#[cfg(not(target_os = "macos"))]
pub fn prime_system_audio() -> Permissions {
  check_permissions()
}
