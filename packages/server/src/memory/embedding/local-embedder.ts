import type { MemoryEmbedder } from '@/memory/embedding/embedder.js';

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
const DIMENSIONS = 384;

type Pipeline = (
  texts: string[],
  options: { pooling: string; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

let pipelineInstance: Pipeline | null = null;

async function getPipeline(): Promise<Pipeline> {
  if (pipelineInstance) return pipelineInstance;

  const { pipeline } = await import('@huggingface/transformers');
  pipelineInstance = (await pipeline('feature-extraction', MODEL_NAME, {
    dtype: 'fp32',
  })) as unknown as Pipeline;

  return pipelineInstance;
}

/**
 * Local embedding using the all-MiniLM-L6-v2 model via @huggingface/transformers.
 * Runs entirely in-process using ONNX runtime. The model (~23MB) is auto-downloaded
 * on first use and cached locally.
 */
export class LocalEmbedder implements MemoryEmbedder {
  readonly dimensions = DIMENSIONS;

  async embed(text: string): Promise<number[]> {
    const results = await this.embedMany([text]);
    return results[0];
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    const extractor = await getPipeline();
    const output = await extractor(texts, { pooling: 'mean', normalize: true });
    return output.tolist();
  }
}
