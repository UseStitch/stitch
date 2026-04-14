use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::Path;

use ogg::writing::PacketWriter;
use opus_rs::{Application, OpusEncoder};

use audio_core::error::NativeError;

// Opus supports 8, 12, 16, 24, 48 kHz.
// At 16 kHz, 20 ms = 320 samples — standard speech frame size.
pub(crate) const SAMPLE_RATE: i32 = 16_000;
const FRAME_SAMPLES: usize = 320;
const BITRATE_BPS: i32 = 32_000;
// OGG serial number — arbitrary fixed value for single-stream files.
const SERIAL: u32 = 0x7469_7463; // "titc"

// Flush an OGG page every this many frames (~1 second at 20ms/frame).
// Keeps data flowing to disk during long recordings and gives decoders
// correct seek granule positions at regular intervals.
const FRAMES_PER_PAGE: u64 = 50;

pub(crate) struct OggOpusWriter {
  encoder: OpusEncoder,
  packet_writer: PacketWriter<'static, BufWriter<File>>,
  pcm_buffer: Vec<f32>,
  granule_pos: u64,
  frames_since_page: u64,
}

impl OggOpusWriter {
  pub(crate) fn create(path: &str) -> Result<Self, NativeError> {
    let file = File::create(Path::new(path))
      .map_err(|e| NativeError::Internal(format!("failed to create ogg file: {e}")))?;

    let mut encoder = OpusEncoder::new(SAMPLE_RATE, 1, Application::Voip)
      .map_err(|e| NativeError::Internal(format!("failed to create opus encoder: {e}")))?;

    encoder.bitrate_bps = BITRATE_BPS;

    let mut packet_writer = PacketWriter::new(BufWriter::new(file));

    // Write the OpusHead identification header (required by OGG Opus spec RFC 7845)
    let opus_head = build_opus_head(SAMPLE_RATE as u32);
    packet_writer
      .write_packet(
        opus_head,
        SERIAL,
        ogg::writing::PacketWriteEndInfo::EndPage,
        0,
      )
      .map_err(|e| NativeError::Internal(format!("failed to write opus head: {e}")))?;

    // Write the OpusTags comment header (required by OGG Opus spec)
    let opus_tags = build_opus_tags();
    packet_writer
      .write_packet(
        opus_tags,
        SERIAL,
        ogg::writing::PacketWriteEndInfo::EndPage,
        0,
      )
      .map_err(|e| NativeError::Internal(format!("failed to write opus tags: {e}")))?;

    Ok(Self {
      encoder,
      packet_writer,
      pcm_buffer: Vec::new(),
      granule_pos: 0,
      frames_since_page: 0,
    })
  }

  // Push f32 PCM samples at 16 kHz mono. Internally buffers and encodes full frames.
  pub(crate) fn write_samples(&mut self, samples: &[f32]) -> Result<(), NativeError> {
    self.pcm_buffer.extend_from_slice(samples);

    while self.pcm_buffer.len() >= FRAME_SAMPLES {
      let frame: Vec<f32> = self.pcm_buffer.drain(..FRAME_SAMPLES).collect();
      self.encode_frame(&frame)?;
    }

    Ok(())
  }

  fn encode_frame(&mut self, frame: &[f32]) -> Result<(), NativeError> {
    let mut encoded = vec![0u8; 4096];
    let bytes_written = self
      .encoder
      .encode(frame, FRAME_SAMPLES, &mut encoded)
      .map_err(|e| NativeError::Internal(format!("opus encode failed: {e}")))?;

    encoded.truncate(bytes_written);

    self.granule_pos += FRAME_SAMPLES as u64;
    self.frames_since_page += 1;

    // Flush a page every FRAMES_PER_PAGE frames so data reaches disk
    // incrementally and decoders get regular seek granule positions.
    let end_info = if self.frames_since_page >= FRAMES_PER_PAGE {
      self.frames_since_page = 0;
      ogg::writing::PacketWriteEndInfo::EndPage
    } else {
      ogg::writing::PacketWriteEndInfo::NormalPacket
    };

    self
      .packet_writer
      .write_packet(encoded, SERIAL, end_info, self.granule_pos)
      .map_err(|e| NativeError::Internal(format!("failed to write ogg packet: {e}")))?;

    Ok(())
  }

  // Flush any remaining buffered PCM (zero-pad to fill a frame) and finalize the OGG stream.
  pub(crate) fn finalize(mut self) -> Result<(), NativeError> {
    if !self.pcm_buffer.is_empty() {
      let mut frame = std::mem::take(&mut self.pcm_buffer);
      frame.resize(FRAME_SAMPLES, 0.0);
      self.encode_frame(&frame)?;
    }

    // Write final EOS page to mark end-of-stream
    self
      .packet_writer
      .write_packet(
        Vec::<u8>::new(),
        SERIAL,
        ogg::writing::PacketWriteEndInfo::EndStream,
        self.granule_pos,
      )
      .map_err(|e| NativeError::Internal(format!("failed to write ogg eos: {e}")))?;

    self
      .packet_writer
      .inner_mut()
      .flush()
      .map_err(|e| NativeError::Internal(format!("failed to flush ogg file: {e}")))?;

    Ok(())
  }
}

/// Build the 19-byte OpusHead binary header per RFC 7845 §5.1
fn build_opus_head(input_sample_rate: u32) -> Vec<u8> {
  let mut head = Vec::with_capacity(19);
  head.extend_from_slice(b"OpusHead");
  head.push(1); // version
  head.push(1); // channel count (mono)
  head.extend_from_slice(&0u16.to_le_bytes()); // pre-skip
  head.extend_from_slice(&input_sample_rate.to_le_bytes()); // input sample rate
  head.extend_from_slice(&0u16.to_le_bytes()); // output gain
  head.push(0); // channel mapping family (mono/stereo)
  head
}

/// Build a minimal OpusTags binary header per RFC 7845 §5.2
fn build_opus_tags() -> Vec<u8> {
  let vendor = b"stitch-audio-capture";
  let mut tags = Vec::new();
  tags.extend_from_slice(b"OpusTags");
  tags.extend_from_slice(&(vendor.len() as u32).to_le_bytes());
  tags.extend_from_slice(vendor);
  tags.extend_from_slice(&0u32.to_le_bytes()); // user comment list length = 0
  tags
}

#[cfg(test)]
mod tests {
  use super::{BITRATE_BPS, FRAME_SAMPLES, SAMPLE_RATE, build_opus_head, build_opus_tags};

  #[test]
  fn opus_head_has_correct_magic_and_fields() {
    let head = build_opus_head(SAMPLE_RATE as u32);
    assert_eq!(&head[..8], b"OpusHead");
    assert_eq!(head[8], 1, "version must be 1");
    assert_eq!(head[9], 1, "channel count must be 1 (mono)");
  }

  #[test]
  fn opus_tags_has_correct_magic() {
    let tags = build_opus_tags();
    assert_eq!(&tags[..8], b"OpusTags");
  }

  #[test]
  fn frame_samples_matches_20ms_at_16khz() {
    // 20ms at 16 kHz = 320 samples
    assert_eq!(FRAME_SAMPLES, (SAMPLE_RATE as usize * 20) / 1000);
  }

  #[test]
  fn bitrate_is_within_speech_optimal_range() {
    // 32 kbps is optimal for mono speech; accept 16–64 kbps range
    assert!(BITRATE_BPS >= 16_000 && BITRATE_BPS <= 64_000);
  }

  #[test]
  fn ogg_opus_writer_roundtrip_creates_valid_file() {
    use super::OggOpusWriter;
    use std::fs;

    let path = std::env::temp_dir().join("stitch-audio-native-test-opus-roundtrip.ogg");
    let path_str = path.to_str().unwrap();

    let mut writer = OggOpusWriter::create(path_str).expect("should create writer");

    // Write 1 second of silence at 16 kHz
    let silence = vec![0.0f32; 16_000];
    writer
      .write_samples(&silence)
      .expect("should write samples");
    writer.finalize().expect("should finalize");

    let bytes = fs::read(&path).expect("output file must exist");
    assert!(
      bytes.len() > 200,
      "file must contain audio data, got {} bytes",
      bytes.len()
    );
    // OGG files start with capture pattern "OggS"
    assert_eq!(&bytes[..4], b"OggS", "output must be a valid OGG file");
    // OpusHead magic must appear somewhere in the first page
    let head_pos = bytes
      .windows(8)
      .position(|w| w == b"OpusHead")
      .expect("OpusHead marker must be present");
    assert!(head_pos < 200, "OpusHead should be near the start of file");

    let _ = fs::remove_file(&path);
  }

  // Verifies periodic page flushing — without it, audio accumulates in the OGG
  // buffer until finalize(), causing decoders to see a truncated stream.
  #[test]
  fn write_samples_flushes_page_every_50_frames() {
    use super::{FRAMES_PER_PAGE, OggOpusWriter, SAMPLE_RATE};
    use std::fs;

    let path = std::env::temp_dir().join("stitch-audio-native-test-opus-page-flush.ogg");
    let path_str = path.to_str().unwrap();

    let mut writer = OggOpusWriter::create(path_str).expect("should create writer");

    // Write 3 seconds — 150 frames, enough for 3 full page flushes
    let samples = vec![0.0f32; SAMPLE_RATE as usize * 3];
    writer
      .write_samples(&samples)
      .expect("should write samples");
    writer.finalize().expect("should finalize");

    let bytes = fs::read(&path).expect("output file must exist");

    // Count OGG page boundaries by scanning for the "OggS" capture pattern.
    // 2 header pages + at least 3 audio pages (one per 50 frames) = at least 5.
    let page_count = bytes.windows(4).filter(|w| *w == b"OggS").count();
    let expected_audio_pages = (150 / FRAMES_PER_PAGE) as usize; // 3
    assert!(
      page_count >= 2 + expected_audio_pages,
      "expected at least {} OGG pages (2 header + {} audio), got {}",
      2 + expected_audio_pages,
      expected_audio_pages,
      page_count,
    );

    let _ = fs::remove_file(&path);
  }

  // Verifies that leftover samples at finalize() are zero-padded and encoded
  // rather than silently dropped.
  #[test]
  fn finalize_encodes_partial_frame_remainder() {
    use super::{FRAME_SAMPLES, OggOpusWriter};
    use std::fs;

    let path_full = std::env::temp_dir().join("stitch-audio-native-test-opus-partial-full.ogg");
    let path_partial =
      std::env::temp_dir().join("stitch-audio-native-test-opus-partial-remainder.ogg");

    // Full frame — no remainder
    let mut writer_full =
      OggOpusWriter::create(path_full.to_str().unwrap()).expect("should create writer");
    writer_full
      .write_samples(&vec![0.5f32; FRAME_SAMPLES])
      .expect("should write full frame");
    writer_full.finalize().expect("should finalize");

    // One full frame + partial remainder (80 samples — not a multiple of 320)
    let mut writer_partial =
      OggOpusWriter::create(path_partial.to_str().unwrap()).expect("should create writer");
    writer_partial
      .write_samples(&vec![0.5f32; FRAME_SAMPLES + 80])
      .expect("should write samples with remainder");
    writer_partial.finalize().expect("should finalize");

    let size_full = fs::metadata(&path_full)
      .expect("full file must exist")
      .len();
    let size_partial = fs::metadata(&path_partial)
      .expect("partial file must exist")
      .len();

    // The partial file wrote an extra zero-padded frame, so it must be larger.
    assert!(
      size_partial > size_full,
      "file with partial remainder ({size_partial} bytes) must be larger than \
       file with only full frames ({size_full} bytes) — remainder was not encoded"
    );

    let _ = fs::remove_file(&path_full);
    let _ = fs::remove_file(&path_partial);
  }
}
