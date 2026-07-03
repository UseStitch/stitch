// Vendored and trimmed for Stitch.

const I16_SCALE: f32 = 32768.0;

#[inline]
pub fn f32_to_i16(sample: f32) -> i16 {
  let clamped = sample.clamp(-1.0, 1.0);
  (clamped * i16::MAX as f32) as i16
}

pub fn f32_to_i16_samples(samples: &[f32]) -> Vec<i16> {
  samples
    .iter()
    .map(|&sample| {
      let scaled = (sample * I16_SCALE).clamp(-I16_SCALE, I16_SCALE);
      scaled as i16
    })
    .collect()
}

#[inline]
pub fn pcm_f32_to_f32(sample: f32) -> f32 {
  sample
}

#[inline]
pub fn pcm_f64_to_f32(sample: f64) -> f32 {
  sample as f32
}

#[inline]
pub fn pcm_i16_to_f32(sample: i16) -> f32 {
  const SCALE: f32 = i16::MAX as f32;
  if sample == i16::MIN {
    -1.0
  } else {
    sample as f32 / SCALE
  }
}

#[inline]
pub fn pcm_i32_to_f32(sample: i32) -> f32 {
  const SCALE: f32 = i32::MAX as f32;
  if sample == i32::MIN {
    -1.0
  } else {
    sample as f32 / SCALE
  }
}
