use cpal::traits::DeviceTrait;

/// Returns a display name for a device.
///
/// On Windows, prefers `DEVPKEY_Device_FriendlyName` (e.g. "Microphone (Realtek Audio)") over
/// `DEVPKEY_Device_DeviceDesc` (e.g. "Microphone"), which is often duplicated across devices.
/// On macOS, `DeviceDescription::name()` is already unique.
pub fn device_display_name(device: &cpal::Device) -> Option<String> {
  let description = device.description().ok()?;

  #[cfg(target_os = "windows")]
  if let Some(friendly) = description.extended().first() {
    return Some(friendly.clone());
  }

  Some(description.name().to_string())
}
