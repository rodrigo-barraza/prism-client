/**
 * src/types/benchmarks.ts is prism-service's src/types/benchmark.ts with its
 * own header comment. This fails while the two bodies differ: edit the
 * service's copy, then copy it here (keeping this file's header).
 *
 * The service checkout is found beside this one — a worktree of the same
 * name (the task branch, or `batch`) first, then the main checkout; set
 * PRISM_SERVICE_DIR to point elsewhere. With none, the test is skipped.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const CLIENT_ROOT = resolve(__dirname, "../../..");

function siblingServiceCheckout(): string | null {
  const override = process.env.PRISM_SERVICE_DIR;
  if (override) return existsSync(override) ? override : null;
  const worktree = CLIENT_ROOT.match(/^(.*)\/prism-client\/\.claude\/worktrees\/([^/]+)$/);
  const candidates = worktree
    ? [join(worktree[1], "prism-service/.claude/worktrees", worktree[2]), join(worktree[1], "prism-service")]
    : [join(dirname(CLIENT_ROOT), "prism-service")];
  return candidates.find((candidate) => existsSync(join(candidate, "package.json"))) ?? null;
}

const SERVICE = siblingServiceCheckout();
const SERVICE_COPY = SERVICE && join(SERVICE, "src/types/benchmark.ts");
/** Everything after the file's leading doc comment. */
const body = (text: string) => text.slice(text.indexOf("*/") + 2);

describe("the benchmark wire types", () => {
  it.skipIf(!SERVICE_COPY || !existsSync(SERVICE_COPY) || !readFileSync(SERVICE_COPY, "utf-8").includes("export interface BenchmarkSample"))(
    `match prism-service's (${SERVICE_COPY ?? "no prism-service checkout"})`,
    () => {
      const ours = readFileSync(resolve(CLIENT_ROOT, "src/types/benchmarks.ts"), "utf-8");
      const theirs = readFileSync(SERVICE_COPY!, "utf-8");
      expect(body(ours) === body(theirs), "copy prism-service/src/types/benchmark.ts over src/types/benchmarks.ts (keep the header)").toBe(true);
    },
  );
});
