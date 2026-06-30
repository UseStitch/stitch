#[macro_use]
extern crate napi_derive;

#[cfg(target_os = "macos")]
mod macos;
mod watch_output;
#[cfg(target_os = "windows")]
mod windows;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

use napi::threadsafe_function::ThreadsafeFunction;
use watch_output::{Emitter, WatchEvent};

struct WatcherHandle {
  stop: Arc<AtomicBool>,
  join: JoinHandle<()>,
}

static HANDLE: Mutex<Option<WatcherHandle>> = Mutex::new(None);

#[napi]
pub fn start_watcher(callback: Arc<ThreadsafeFunction<WatchEvent, ()>>) -> napi::Result<()> {
  let mut guard = HANDLE.lock().unwrap_or_else(|e| e.into_inner());
  if guard.is_some() {
    return Ok(()); // already running; idempotent
  }

  let stop = Arc::new(AtomicBool::new(false));
  let stop_for_thread = stop.clone();
  let tsfn = callback;

  let join = std::thread::spawn(move || {
    let panic_tsfn = tsfn.clone();
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
      run_platform(tsfn, stop_for_thread);
    }));
    if result.is_err() {
      watch_output::emit_watch_error(&panic_tsfn, "meeting watcher thread panicked");
    }
  });

  *guard = Some(WatcherHandle { stop, join });
  Ok(())
}

#[napi]
pub fn stop_watcher() -> napi::Result<()> {
  let handle = {
    let mut guard = HANDLE.lock().unwrap_or_else(|e| e.into_inner());
    guard.take()
  };
  if let Some(handle) = handle {
    handle.stop.store(true, Ordering::Relaxed);
    let _ = handle.join.join();
  }
  Ok(())
}

#[cfg(target_os = "macos")]
fn run_platform(tsfn: Arc<Emitter>, stop: Arc<AtomicBool>) {
  macos::run(tsfn, stop);
}

#[cfg(target_os = "windows")]
fn run_platform(tsfn: Arc<Emitter>, stop: Arc<AtomicBool>) {
  windows::run(tsfn, stop);
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn run_platform(_tsfn: Arc<Emitter>, stop: Arc<AtomicBool>) {
  while !stop.load(Ordering::Relaxed) {
    std::thread::sleep(std::time::Duration::from_millis(250));
  }
}
