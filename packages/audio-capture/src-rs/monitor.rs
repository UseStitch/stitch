use std::sync::mpsc;
use std::thread::JoinHandle;
use std::time::Duration;

use hypr_audio_actual::cpal;
use hypr_audio_actual::cpal::traits::{DeviceTrait, HostTrait};

use crate::protocol::{Emitter, emit_device_changed};

const POLL_INTERVAL: Duration = Duration::from_secs(1);

#[derive(Debug, Clone, PartialEq, Eq, Default)]
struct DefaultDevices {
  input: Option<String>,
  output: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct DeviceChange {
  kind: &'static str,
  name: Option<String>,
}

/// A default-device change is only reported when a new device is present;
/// a device disappearing entirely surfaces through capture stream errors instead.
fn detect_changes(prev: &DefaultDevices, next: &DefaultDevices) -> Vec<DeviceChange> {
  let mut changes = Vec::new();
  if next.input.is_some() && prev.input != next.input {
    changes.push(DeviceChange {
      kind: "input",
      name: next.input.clone(),
    });
  }
  if next.output.is_some() && prev.output != next.output {
    changes.push(DeviceChange {
      kind: "output",
      name: next.output.clone(),
    });
  }
  changes
}

fn is_tap_device(name: &str) -> bool {
  #[cfg(target_os = "macos")]
  {
    name.contains(hypr_audio_actual::TAP_DEVICE_NAME)
  }
  #[cfg(not(target_os = "macos"))]
  {
    let _ = name;
    false
  }
}

fn device_name(device: &cpal::Device) -> Option<String> {
  device
    .description()
    .ok()
    .map(|d| d.name().to_string())
    .filter(|name| !is_tap_device(name))
}

fn current_defaults() -> DefaultDevices {
  let host = cpal::default_host();
  DefaultDevices {
    input: host.default_input_device().as_ref().and_then(device_name),
    output: host.default_output_device().as_ref().and_then(device_name),
  }
}

pub struct DeviceMonitorHandle {
  stop_tx: mpsc::Sender<()>,
  thread: Option<JoinHandle<()>>,
}

impl DeviceMonitorHandle {
  pub fn stop(mut self) {
    let _ = self.stop_tx.send(());
    if let Some(thread) = self.thread.take() {
      let _ = thread.join();
    }
  }
}

/// Polls the OS default input/output devices while a capture session is active
/// and emits a `deviceChanged` event when either changes (e.g. AirPods connect).
/// The 1s poll interval doubles as a debounce for noisy Bluetooth transitions.
pub fn spawn_device_monitor(emitter: Emitter) -> DeviceMonitorHandle {
  let (stop_tx, stop_rx) = mpsc::channel();

  let thread = std::thread::spawn(move || {
    let mut prev = current_defaults();
    loop {
      match stop_rx.recv_timeout(POLL_INTERVAL) {
        Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected) => return,
        Err(mpsc::RecvTimeoutError::Timeout) => {}
      }

      let next = current_defaults();
      for change in detect_changes(&prev, &next) {
        tracing::info!(kind = change.kind, name = ?change.name, "default_device_changed");
        emit_device_changed(&emitter, change.kind, change.name);
      }
      prev = next;
    }
  });

  DeviceMonitorHandle {
    stop_tx,
    thread: Some(thread),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn devices(input: Option<&str>, output: Option<&str>) -> DefaultDevices {
    DefaultDevices {
      input: input.map(String::from),
      output: output.map(String::from),
    }
  }

  #[test]
  fn no_changes_when_defaults_are_stable() {
    let prev = devices(Some("Built-in Mic"), Some("Built-in Speakers"));
    assert!(detect_changes(&prev, &prev.clone()).is_empty());
  }

  #[test]
  fn reports_input_change() {
    let prev = devices(Some("Built-in Mic"), Some("Built-in Speakers"));
    let next = devices(Some("AirPods"), Some("Built-in Speakers"));
    let changes = detect_changes(&prev, &next);
    assert_eq!(
      changes,
      vec![DeviceChange {
        kind: "input",
        name: Some("AirPods".to_string()),
      }]
    );
  }

  #[test]
  fn reports_both_changes_independently() {
    let prev = devices(Some("Built-in Mic"), Some("Built-in Speakers"));
    let next = devices(Some("AirPods"), Some("AirPods"));
    let changes = detect_changes(&prev, &next);
    assert_eq!(changes.len(), 2);
    assert_eq!(changes[0].kind, "input");
    assert_eq!(changes[1].kind, "output");
  }

  #[test]
  fn ignores_device_disappearing() {
    let prev = devices(Some("AirPods"), Some("AirPods"));
    let next = devices(None, None);
    assert!(detect_changes(&prev, &next).is_empty());
  }

  #[test]
  fn reports_device_reappearing() {
    let prev = devices(None, None);
    let next = devices(Some("Built-in Mic"), None);
    let changes = detect_changes(&prev, &next);
    assert_eq!(changes.len(), 1);
    assert_eq!(changes[0].kind, "input");
  }
}
