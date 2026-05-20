const fs = require("fs");
const path = require("path");

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
      results.push(file);
    }
  });
  return results;
}

const files = walk("src");
const counts = files.map(file => {
  const content = fs.readFileSync(file, "utf8");
  const matches = content.match(/\bany\b/g);
  return { file, count: matches ? matches.length : 0 };
}).filter(x => x.count > 0).sort((a, b) => b.count - a.count);

counts.slice(0, 15).forEach(x => console.log(`${x.count} ${x.file}`));
