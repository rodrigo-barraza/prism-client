/**
 * src/types/protocol/events.ts is a byte-identical copy of prism-service's
 * src/protocol/events.ts (the event protocol). This fails while the two
 * differ: edit the service's copy, then copy it here.
 *
 * The service checkout is found beside this one — a worktree of the same
 * name (the task branch, or `batch`) first, then the main checkout; set
 * PRISM_SERVICE_DIR to point elsewhere. With none, the test is skipped
 * and says so.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const CLIENT_ROOT = resolve(__dirname, "../../../..");

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
const SERVICE_COPY = SERVICE && join(SERVICE, "src/protocol/events.ts");

describe("the event protocol's shared file", () => {
  it.skipIf(!SERVICE_COPY || !existsSync(SERVICE_COPY))(
    `is byte-identical to prism-service's (${SERVICE_COPY ?? "no prism-service checkout"})`,
    () => {
      const ours = readFileSync(resolve(CLIENT_ROOT, "src/types/protocol/events.ts"), "utf-8");
      const theirs = readFileSync(SERVICE_COPY!, "utf-8");
      expect(ours === theirs, "copy prism-service/src/protocol/events.ts over src/types/protocol/events.ts").toBe(true);
    },
  );
});
