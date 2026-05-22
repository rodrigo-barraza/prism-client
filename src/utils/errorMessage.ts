/**
 * Type-safe error message extraction for catch blocks.
 *
 * Replaces the `(error as Error).message` anti-pattern throughout the codebase.
 * The only place `unknown` should appear is in `catch (error: unknown)`.
 */
export const getErrorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);
