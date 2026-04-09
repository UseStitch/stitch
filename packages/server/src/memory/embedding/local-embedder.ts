import path from 'node:path';

import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';
import type { MemoryEmbedder } from '@/memory/embedding/embedder.js';

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
const DIMENSIONS = 384;
const HF_CACHE_DIR = path.join(PATHS.cacheDir, 'hf-models');

const log = Log.create({ service: 'local-embedder' });

type Pipeline = (
  texts: string[],
  options: { pooling: string; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

let pipelineInstance: Pipeline | null = null;
let pipelineLoadPromise: Promise<Pipeline> | null = null;

async function getPipeline(): Promise<Pipeline> {
  if (pipelineInstance) return pipelineInstance;

  if (pipelineLoadPromise) return pipelineLoadPromise;

  pipelineLoadPromise = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');
    env.cacheDir = HF_CACHE_DIR;
    env.allowLocalModels = false;

    const instance = (await pipeline('feature-extraction', MODEL_NAME, {
      dtype: 'fp32',
    })) as unknown as Pipeline;

    pipelineInstance = instance;
    return instance;
  })();

  return pipelineLoadPromise;
}

export async function initLocalEmbedder(): Promise<void> {
  log.info({ model: MODEL_NAME, cacheDir: HF_CACHE_DIR }, 'downloading embedding model');
  await getPipeline();
  log.info({ model: MODEL_NAME }, 'embedding model ready');
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
