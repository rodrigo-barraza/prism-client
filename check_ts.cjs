const execSync = require("child_process").execSync;

let out = "";
try {
  out = execSync("npx tsc --noEmit", { stdio: "pipe" }).toString();
} catch (e) {
  out = e.stdout.toString() + e.stderr.toString();
}

const lines = out.split("\n");

for (const line of lines) {
  if (line.includes("TS2554")) console.log(line);
}
