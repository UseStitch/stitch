use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;

use audio_core::error::NativeError;
use audio_core::output::now_ms;
use audio_core::protocol::{CaptureStart, Event};

use crate::capture::{spawn_capture_worker, start_progress_emitter};

#[derive(Debug)]
pub struct ActiveSession {
  pub started_at: u64,
  pub sample_rate_hz: u32,
  pub channels: u16,
  stop_flag: Arc<AtomicBool>,
  worker: thread::JoinHandle<Result<Vec<String>, NativeError>>,
  progress_stop: Arc<AtomicBool>,
  progress_worker: thread::JoinHandle<()>,
}

pub fn start_session(start: CaptureStart) -> Result<ActiveSession, NativeError> {
  let started_at = now_ms();
  let progress_stop = Arc::new(AtomicBool::new(false));
  let progress_worker = start_progress_emitter(started_at, progress_stop.clone());

  let stop_flag = Arc::new(AtomicBool::new(false));
  let worker = spawn_capture_worker(&start, stop_flag.clone())?;

  Ok(ActiveSession {
    started_at,
    sample_rate_hz: start.sample_rate_hz,
    channels: start.channels,
    stop_flag,
    worker,
    progress_stop,
    progress_worker,
  })
}

pub fn stop_session(active: ActiveSession) -> Result<Event, NativeError> {
  active.stop_flag.store(true, Ordering::Relaxed);

  let warnings = active
    .worker
    .join()
    .map_err(|_| NativeError::Internal("capture worker panicked".to_string()))??;

  active.progress_stop.store(true, Ordering::Relaxed);
  let _ = active.progress_worker.join();

  let ended_at = now_ms();
  let duration = ended_at.saturating_sub(active.started_at);

  Ok(Event::Stopped {
    ended_at,
    duration_ms: duration,
    warnings,
  })
}
