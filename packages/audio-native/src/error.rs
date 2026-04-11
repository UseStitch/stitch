use thiserror::Error;

#[derive(Debug, Error)]
pub(crate) enum NativeError {
  #[error("invalid command: {0}")]
  InvalidCommand(String),
  #[error("permission denied: {0}")]
  PermissionDenied(String),
  #[error("device not found: {0}")]
  DeviceNotFound(String),
  #[error("stream failed: {0}")]
  StreamFailed(String),
  #[error("internal error: {0}")]
  Internal(String),
}

impl NativeError {
  pub(crate) fn code(&self) -> &'static str {
    match self {
      Self::InvalidCommand(_) => "invalid_command",
      Self::PermissionDenied(_) => "permission_denied",
      Self::DeviceNotFound(_) => "device_not_found",
      Self::StreamFailed(_) => "stream_failed",
      Self::Internal(_) => "internal_error",
    }
  }
}

#[cfg(test)]
mod tests {
  use super::NativeError;

  #[test]
  fn maps_error_codes_consistently() {
    let cases = vec![
      (
        NativeError::InvalidCommand("x".to_string()),
        "invalid_command",
      ),
      (
        NativeError::PermissionDenied("x".to_string()),
        "permission_denied",
      ),
      (
        NativeError::DeviceNotFound("x".to_string()),
        "device_not_found",
      ),
      (NativeError::StreamFailed("x".to_string()), "stream_failed"),
      (NativeError::Internal("x".to_string()), "internal_error"),
    ];

    for (error, expected) in cases {
      assert_eq!(error.code(), expected);
    }
  }
}
