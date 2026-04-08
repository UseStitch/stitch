import path from 'node:path';

import type { MemoryEmbedder } from '@/memory/embedding/embedder.js';
import { PATHS } from '@/lib/paths.js';

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
const DIMENSIONS = 384;

type Pipeline = (
  texts: string[],
  options: { pooling: string; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

let pipelineInstance: Pipeline | null = null;
let pipelineLoadPromise: Promise<Pipeline> | null = null;

async function getPipeline(): Promise<Pipeline> {
  if (pipelineInstance) return pipelineInstance;

  // Ensure concurrent callers share a single load promise rather than racing
  // to download and initialize the model simultaneously.
  if (pipelineLoadPromise) return pipelineLoadPromise;

  pipelineLoadPromise = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');
    // Store model files under the app's cache directory so they persist across
    // runs and are accessible in packaged (asar) builds where ./.cache is read-only.
    env.cacheDir = path.join(PATHS.cacheDir, 'hf-models');

    const instance = (await pipeline('feature-extraction', MODEL_NAME, {
      dtype: 'fp32',
    })) as unknown as Pipeline;

    pipelineInstance = instance;
    return instance;
  })();

  return pipelineLoadPromise;
}

export function resetPipeline(): void {
  pipelineInstance = null;
  pipelineLoadPromise = null;
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
