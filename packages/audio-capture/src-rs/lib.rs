#[macro_use]
extern crate napi_derive;

mod capture;
mod device;
mod encode;
mod error;
mod permissions;
mod protocol;
mod resample;
mod speaker;

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::thread::JoinHandle;
use std::time::{SystemTime, UNIX_EPOCH};

use napi::threadsafe_function::ThreadsafeFunction;

use crate::error::NativeError;
use crate::protocol::{
  CaptureEvent, DeviceList, Emitter, Permissions, StartInput, StopResult, emit_warning,
  parse_encoding,
};

type WorkerHandle = JoinHandle<Result<Vec<String>, NativeError>>;

struct Session {
  started_at_ms: f64,
  stop_flag: Arc<AtomicBool>,
  mic_worker: Option<WorkerHandle>,
  speaker_worker: Option<WorkerHandle>,
}

fn session_lock() -> &'static Mutex<Option<Session>> {
  static HANDLE: OnceLock<Mutex<Option<Session>>> = OnceLock::new();
  HANDLE.get_or_init(|| Mutex::new(None))
}

fn now_ms() -> f64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .expect("system clock must be after Unix epoch")
    .as_millis() as f64
}

/// Spawns a worker with panic isolation: a panicking capture thread emits a `warning`
/// event instead of aborting the host process.
fn join_worker(
  worker: Option<WorkerHandle>,
  emitter: &Emitter,
  label: &str,
  warnings: &mut Vec<String>,
) {
  let Some(worker) = worker else {
    return;
  };
  match worker.join() {
    Ok(Ok(mut worker_warnings)) => warnings.append(&mut worker_warnings),
    Ok(Err(error)) => {
      warnings.push(format!("{label}_error_{}", error.code()));
      emit_warning(emitter, format!("{label}_error"), error.to_string());
    }
    Err(_) => {
      warnings.push(format!("{label}_panicked"));
      emit_warning(
        emitter,
        format!("{label}_panicked"),
        format!("{label} thread panicked"),
      );
    }
  }
}

#[napi]
pub fn start_capture(
  input: StartInput,
  callback: Arc<ThreadsafeFunction<CaptureEvent, ()>>,
) -> napi::Result<()> {
  let mut guard = session_lock().lock().unwrap_or_else(|e| e.into_inner());
  if guard.is_some() {
    return Err(napi::Error::from_reason(
      "audio capture is already running (already_recording)",
    ));
  }

  if input.sample_rate_hz == 0 {
    return Err(NativeError::StreamFailed("sampleRateHz must be > 0".to_string()).into());
  }
  let encoding = parse_encoding(&input.encoding).ok_or_else(|| {
    NativeError::StreamFailed(format!("unsupported encoding: {}", input.encoding))
  })?;

  let stop_flag = Arc::new(AtomicBool::new(false));
  let emitter: Emitter = callback;

  let mic_worker = capture::spawn_mic_worker(
    input.mic_device_id.clone(),
    input.sample_rate_hz,
    encoding,
    stop_flag.clone(),
    emitter.clone(),
  )?;

  let speaker_worker = match speaker::spawn_speaker_worker(
    input.speaker_device_id.clone(),
    input.sample_rate_hz,
    encoding,
    stop_flag.clone(),
    emitter.clone(),
  ) {
    Ok(worker) => Some(worker),
    Err(error) => {
      // Speaker capture is best-effort; surface a warning but keep mic capture running.
      emit_warning(&emitter, "speaker_start_failed", error.to_string());
      None
    }
  };

  *guard = Some(Session {
    started_at_ms: now_ms(),
    stop_flag,
    mic_worker: Some(mic_worker),
    speaker_worker,
  });

  Ok(())
}

#[napi]
pub fn stop_capture(
  callback: Arc<ThreadsafeFunction<CaptureEvent, ()>>,
) -> napi::Result<Option<StopResult>> {
  let session = {
    let mut guard = session_lock().lock().unwrap_or_else(|e| e.into_inner());
    guard.take()
  };

  let Some(session) = session else {
    return Ok(None);
  };

  session.stop_flag.store(true, Ordering::Relaxed);

  let emitter: Emitter = callback;
  let mut warnings = Vec::new();
  join_worker(session.mic_worker, &emitter, "mic_capture", &mut warnings);
  join_worker(
    session.speaker_worker,
    &emitter,
    "speaker_capture",
    &mut warnings,
  );

  let ended_at = now_ms();
  let duration_ms = (ended_at - session.started_at_ms).max(0.0);

  Ok(Some(StopResult {
    ended_at,
    duration_ms,
    warnings,
  }))
}

#[napi]
pub fn list_devices() -> DeviceList {
  DeviceList {
    microphone_devices: permissions::list_microphone_devices(),
    speaker_devices: permissions::list_speaker_devices(),
  }
}

#[napi]
pub fn check_permissions() -> Permissions {
  permissions::check_permissions()
}

#[napi]
pub fn prime_system_audio() -> Permissions {
  permissions::prime_system_audio()
}
