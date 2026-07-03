// Vendored from https://github.com/fastrepl/hyprnote (crates/onnx/build.rs), MIT licensed.

fn main() {
  // https://ort.pyke.io/perf/execution-providers#coreml
  #[cfg(target_os = "macos")]
  println!("cargo:rustc-link-arg=-fapple-link-rtlib");
}
