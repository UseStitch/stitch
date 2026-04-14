#![cfg(target_os = "macos")]

use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};

#[test]
fn responds_to_capabilities_and_list_devices_commands() {
  let mut child = Command::new(env!("CARGO_BIN_EXE_stitch-audio-capture"))
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .spawn()
    .expect("should spawn sidecar process");

  {
    let stdin = child.stdin.as_mut().expect("stdin must be piped");
    stdin
      .write_all(b"{\"type\":\"capabilities\"}\n")
      .expect("should send capabilities command");
    stdin
      .write_all(b"{\"type\":\"listDevices\"}\n")
      .expect("should send listDevices command");
  }

  let stdout = child.stdout.take().expect("stdout must be piped");
  let mut reader = BufReader::new(stdout);

  let mut line = String::new();
  reader
    .read_line(&mut line)
    .expect("should read first response line");
  let first: serde_json::Value = serde_json::from_str(&line).expect("first response must be json");
  assert_eq!(first["type"], "capabilities");
  assert!(first.get("supportedModes").is_some() || first.get("supported_modes").is_some());

  line.clear();
  reader
    .read_line(&mut line)
    .expect("should read second response line");
  let second: serde_json::Value =
    serde_json::from_str(&line).expect("second response must be json");
  assert_eq!(second["type"], "deviceList");
  assert!(second.get("microphoneDevices").is_some() || second.get("microphone_devices").is_some());
  assert!(second.get("speakerDevices").is_some() || second.get("speaker_devices").is_some());

  drop(reader);
  let _ = child.kill();
  let _ = child.wait();
}
