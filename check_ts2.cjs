const execSync = require('child_process').execSync;

let out = '';
try {
  out = execSync('npx tsc --noEmit', { stdio: 'pipe' }).toString();
} catch (e) {
  out = e.stdout.toString() + e.stderr.toString();
}

const lines = out.split('\n');

for (const line of lines) {
  if (line.includes('TS7034') || line.includes('TS7005')) console.log(line);
}
