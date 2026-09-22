/**
 * Share of a conversation's input tokens that were read from the provider
 * prompt cache. `input` is the cache-INCLUSIVE total (uncached + cache read
 * + cache write), which is how the service's request rollup reports it.
 * Null when nothing was sent yet.
 */
export function cacheReadShare(
  totalTokens?: { input: number; cacheRead?: number } | null,
): number | null {
  if (!totalTokens || !(totalTokens.input > 0)) return null;
  const share = (totalTokens.cacheRead || 0) / totalTokens.input;
  return Math.min(1, Math.max(0, share));
}
