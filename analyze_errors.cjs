const execSync = require("child_process").execSync;

let out = "";
try {
  out = execSync("npx tsc --noEmit", { stdio: "pipe" }).toString();
} catch (e) {
  out = e.stdout.toString() + e.stderr.toString();
}

const lines = out.split("\n");
const errCounts = new Map();

for (const line of lines) {
  const match = line.match(/error (TS\d+):/);
  if (match) {
    const code = match[1];
    errCounts.set(code, (errCounts.get(code) || 0) + 1);
  }
}

console.log("Remaining Errors by TS code:");
for (const [code, count] of [...errCounts.entries()].sort(
  (a, b) => b[1] - a[1],
)) {
  console.log(`${code}: ${count}`);
}
