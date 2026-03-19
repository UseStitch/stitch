export type ModelVisibilityInput = {
  id: string;
  family?: string;
  release_date?: string;
};

export type ProviderModelGroup = {
  providerId: string;
  models: ModelVisibilityInput[];
};

/**
 * Builds a set of "providerId:modelId" keys for models that should be visible by default.
 *
 * A model is visible by default when it is the most recently released model in its
 * (provider, family) group AND was released within the last 6 months. Models with a
 * missing or unparseable release_date are always visible by default.
 */
export function buildDefaultVisibleSet(providers: ProviderModelGroup[]): Set<string> {
  const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const visible = new Set<string>();

  for (const { providerId, models } of providers) {
    // Group by family (models without a family each get their own bucket keyed by id)
    const byFamily = new Map<string, ModelVisibilityInput[]>();
    for (const model of models) {
      const bucket = model.family ?? `__no_family__${model.id}`;
      const group = byFamily.get(bucket) ?? [];
      group.push(model);
      byFamily.set(bucket, group);
    }

    for (const group of byFamily.values()) {
      for (const model of group) {
        if (!model.release_date) {
          // No release date — always visible
          visible.add(`${providerId}:${model.id}`);
          continue;
        }

        const releaseMs = Date.parse(model.release_date);
        if (isNaN(releaseMs)) {
          // Unparseable date — always visible
          visible.add(`${providerId}:${model.id}`);
          continue;
        }

        if (now - releaseMs > SIX_MONTHS_MS) {
          // Too old — not in the default visible set
          continue;
        }

        // Released within 6 months — pick only the newest in this family
        const newest = group.reduce((best, m) => {
          if (!m.release_date) return best;
          const t = Date.parse(m.release_date);
          if (isNaN(t)) return best;
          const bestT = best.release_date ? (Date.parse(best.release_date) ?? 0) : 0;
          return t > bestT ? m : best;
        });

        visible.add(`${providerId}:${newest.id}`);
      }
    }
  }

  return visible;
}

export type ModelVisibilityOverride = {
  providerId: string;
  modelId: string;
  visibility: 'show' | 'hide';
};

/**
 * Returns true if a model should appear in the model selector.
 *
 * Priority:
 * 1. Explicit user override ('show' / 'hide') wins.
 * 2. Falls back to the default visible set computed by buildDefaultVisibleSet.
 */
export function isModelVisible(
  providerId: string,
  modelId: string,
  overrides: Map<string, 'show' | 'hide'>,
  defaultVisibleSet: Set<string>,
): boolean {
  const key = `${providerId}:${modelId}`;
  const override = overrides.get(key);
  if (override === 'hide') return false;
  if (override === 'show') return true;
  return defaultVisibleSet.has(key);
}
