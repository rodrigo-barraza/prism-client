/**
 * Type-safe error message extraction for catch blocks.
 *
 * Replaces the `(error as Error).message` anti-pattern throughout the codebase.
 * The only place `unknown` should appear is in `catch (error: unknown)`.
 */
export const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
