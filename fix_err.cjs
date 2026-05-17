const fs = require('fs');
const path = require('path');
const execSync = require('child_process').execSync;

let out = '';
try {
  out = execSync('npx tsc --noEmit', { stdio: 'pipe' }).toString();
} catch (e) {
  out = e.stdout.toString();
}

const lines = out.split('\n');
const filesToFix = new Map();

for (const line of lines) {
  const match = line.match(/^src\/([^:]+)\((\d+),(\d+)\): error TS2304: Cannot find name 'err'\./);
  if (match) {
    const file = "src/" + match[1];
    const lineNum = parseInt(match[2], 10);
    if (!filesToFix.has(file)) filesToFix.set(file, []);
    filesToFix.get(file).push(lineNum);
  }
}

for (const [file, lineNums] of filesToFix) {
  let content = fs.readFileSync(file, 'utf8');
  let fileLines = content.split('\n');
  for (const lineNum of lineNums) {
    const idx = lineNum - 1;
    fileLines[idx] = fileLines[idx].replace(/\berr\b/g, 'error');
  }
  fs.writeFileSync(file, fileLines.join('\n'));
  console.log(`Fixed ${lineNums.length} err references in ${file}`);
}
