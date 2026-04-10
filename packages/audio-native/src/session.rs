use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;

use crate::capture::{spawn_capture_worker, start_progress_emitter};
use crate::error::NativeError;
use crate::output::now_ms;
use crate::protocol::{CaptureStart, Event};

#[derive(Debug)]
pub(crate) struct ActiveSession {
  pub(crate) started_at: u64,
  pub(crate) output_path: String,
  pub(crate) sample_rate_hz: u32,
  pub(crate) channels: u16,
  stop_flag: Arc<AtomicBool>,
  worker: thread::JoinHandle<Result<Vec<String>, NativeError>>,
  progress_stop: Arc<AtomicBool>,
  progress_worker: thread::JoinHandle<()>,
}

fn ensure_parent_dir(output_path: &str) -> Result<(), NativeError> {
  let path = Path::new(output_path);
  let parent = path.parent().ok_or_else(|| {
    NativeError::InvalidCommand("outputPath must include a parent directory".to_string())
  })?;

  fs::create_dir_all(parent)
    .map_err(|error| NativeError::Internal(format!("failed to create output directory: {error}")))
}

pub(crate) fn start_session(start: CaptureStart) -> Result<ActiveSession, NativeError> {
  ensure_parent_dir(&start.output_path)?;

  let started_at = now_ms();
  let progress_stop = Arc::new(AtomicBool::new(false));
  let progress_worker = start_progress_emitter(started_at, progress_stop.clone());

  let stop_flag = Arc::new(AtomicBool::new(false));
  let worker = spawn_capture_worker(&start, stop_flag.clone())?;

  Ok(ActiveSession {
    started_at,
    output_path: start.output_path,
    sample_rate_hz: start.sample_rate_hz,
    channels: start.channels,
    stop_flag,
    worker,
    progress_stop,
    progress_worker,
  })
}

pub(crate) fn stop_session(active: ActiveSession) -> Result<Event, NativeError> {
  active.stop_flag.store(true, Ordering::Relaxed);

  let mut warnings = active
    .worker
    .join()
    .map_err(|_| NativeError::Internal("capture worker panicked".to_string()))??;

  active.progress_stop.store(true, Ordering::Relaxed);
  let _ = active.progress_worker.join();

  let ended_at = now_ms();
  let duration = ended_at.saturating_sub(active.started_at);

  let metadata = fs::metadata(&active.output_path).ok();
  if metadata.is_none() {
    warnings.push("output_file_missing_after_stop".to_string());
  }

  Ok(Event::Stopped {
    ended_at,
    duration_ms: duration,
    output_path: active.output_path,
    file_size_bytes: metadata.map(|data| data.len()),
    sample_rate_hz: active.sample_rate_hz,
    channels: active.channels,
    warnings,
  })
}

#[cfg(test)]
mod tests {
  use std::fs;
  use std::path::PathBuf;

  use super::ensure_parent_dir;

  fn temp_path(name: &str) -> PathBuf {
    let mut dir = std::env::temp_dir();
    dir.push(format!(
      "stitch-audio-native-test-{name}-{}",
      std::process::id()
    ));
    dir
  }

  #[test]
  fn ensure_parent_dir_creates_nested_directories() {
    let base = temp_path("ensure-parent");
    let output = base.join("nested").join("audio.ogg");
    let output_str = output
      .to_str()
      .expect("temp test path should be valid utf8")
      .to_string();

    ensure_parent_dir(&output_str).expect("should create parent dirs");
    assert!(output.parent().expect("must have parent").exists());

    let _ = fs::remove_dir_all(base);
  }

  #[test]
  fn ensure_parent_dir_handles_relative_filename() {
    let result = ensure_parent_dir("audio.ogg");
    assert!(result.is_ok());
  }
}
