import { open, readFile } from 'node:fs/promises';

type WavChunk = {
  audioData: Uint8Array;
  chunkIndex: number;
  totalChunks: number;
};

const WAV_HEADER_SIZE = 44;

function buildWavHeader(
  dataSize: number,
  sampleRate: number,
  channels: number,
  bitsPerSample: number,
) {
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const fileSize = 36 + dataSize;

  const header = Buffer.alloc(WAV_HEADER_SIZE);
  header.write('RIFF', 0);
  header.writeUInt32LE(fileSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return header;
}

export function splitWavIntoChunks(audioData: Uint8Array, maxChunkSeconds: number): WavChunk[] {
  const buffer = Buffer.from(audioData);

  if (
    buffer.length <= WAV_HEADER_SIZE ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    return [{ audioData, chunkIndex: 1, totalChunks: 1 }];
  }

  const channels = buffer.readUInt16LE(22);
  const sampleRate = buffer.readUInt32LE(24);
  const bitsPerSample = buffer.readUInt16LE(34);
  const blockAlign = buffer.readUInt16LE(32);
  const dataSize = buffer.readUInt32LE(40);

  if (
    channels <= 0 ||
    sampleRate <= 0 ||
    bitsPerSample <= 0 ||
    blockAlign <= 0 ||
    dataSize <= 0 ||
    WAV_HEADER_SIZE + dataSize > buffer.length
  ) {
    return [{ audioData, chunkIndex: 1, totalChunks: 1 }];
  }

  const dataStart = WAV_HEADER_SIZE;
  const bytesPerSecond = sampleRate * blockAlign;
  const targetChunkBytes = Math.floor(maxChunkSeconds * bytesPerSecond);
  const maxChunkBytes =
    targetChunkBytes > blockAlign
      ? Math.floor(targetChunkBytes / blockAlign) * blockAlign
      : blockAlign;

  if (dataSize <= maxChunkBytes) {
    return [{ audioData, chunkIndex: 1, totalChunks: 1 }];
  }

  const chunks: WavChunk[] = [];
  const totalChunks = Math.ceil(dataSize / maxChunkBytes);

  for (
    let offset = 0, chunkIndex = 1;
    offset < dataSize;
    offset += maxChunkBytes, chunkIndex += 1
  ) {
    const chunkDataSize = Math.min(maxChunkBytes, dataSize - offset);
    const chunkPayload = buffer.subarray(dataStart + offset, dataStart + offset + chunkDataSize);
    const chunkHeader = buildWavHeader(chunkDataSize, sampleRate, channels, bitsPerSample);
    const chunkBuffer = Buffer.concat([chunkHeader, chunkPayload]);
    chunks.push({
      audioData: new Uint8Array(chunkBuffer),
      chunkIndex,
      totalChunks,
    });
  }

  return chunks;
}

export async function* iterateWavFileChunks(
  filePath: string,
  maxChunkSeconds: number,
): AsyncGenerator<WavChunk> {
  const fileHandle = await open(filePath, 'r');

  try {
    const stat = await fileHandle.stat();
    if (stat.size <= WAV_HEADER_SIZE) {
      const fallback = new Uint8Array(await readFile(filePath));
      yield { audioData: fallback, chunkIndex: 1, totalChunks: 1 };
      return;
    }

    const header = Buffer.alloc(WAV_HEADER_SIZE);
    const headerRead = await fileHandle.read(header, 0, WAV_HEADER_SIZE, 0);
    if (headerRead.bytesRead < WAV_HEADER_SIZE) {
      const fallback = new Uint8Array(await readFile(filePath));
      yield { audioData: fallback, chunkIndex: 1, totalChunks: 1 };
      return;
    }

    if (header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE') {
      const fallback = new Uint8Array(await readFile(filePath));
      yield { audioData: fallback, chunkIndex: 1, totalChunks: 1 };
      return;
    }

    const channels = header.readUInt16LE(22);
    const sampleRate = header.readUInt32LE(24);
    const bitsPerSample = header.readUInt16LE(34);
    const blockAlign = header.readUInt16LE(32);
    const dataSize = header.readUInt32LE(40);

    if (
      channels <= 0 ||
      sampleRate <= 0 ||
      bitsPerSample <= 0 ||
      blockAlign <= 0 ||
      dataSize <= 0 ||
      WAV_HEADER_SIZE + dataSize > stat.size
    ) {
      const fallback = new Uint8Array(await readFile(filePath));
      yield { audioData: fallback, chunkIndex: 1, totalChunks: 1 };
      return;
    }

    const bytesPerSecond = sampleRate * blockAlign;
    const targetChunkBytes = Math.floor(maxChunkSeconds * bytesPerSecond);
    const maxChunkBytes =
      targetChunkBytes > blockAlign
        ? Math.floor(targetChunkBytes / blockAlign) * blockAlign
        : blockAlign;

    if (dataSize <= maxChunkBytes) {
      const fullFile = new Uint8Array(await readFile(filePath));
      yield { audioData: fullFile, chunkIndex: 1, totalChunks: 1 };
      return;
    }

    const totalChunks = Math.ceil(dataSize / maxChunkBytes);
    const dataStart = WAV_HEADER_SIZE;

    for (
      let offset = 0, chunkIndex = 1;
      offset < dataSize;
      offset += maxChunkBytes, chunkIndex += 1
    ) {
      const chunkDataSize = Math.min(maxChunkBytes, dataSize - offset);
      const chunkPayload = Buffer.alloc(chunkDataSize);

      await fileHandle.read(chunkPayload, 0, chunkDataSize, dataStart + offset);

      const chunkHeader = buildWavHeader(chunkDataSize, sampleRate, channels, bitsPerSample);
      const chunkBuffer = Buffer.concat([chunkHeader, chunkPayload]);

      yield {
        audioData: new Uint8Array(chunkBuffer),
        chunkIndex,
        totalChunks,
      };
    }
  } finally {
    await fileHandle.close();
  }
}
