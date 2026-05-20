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
    } else {
      if (file.endsWith("layout.tsx") || file.endsWith("global-error.tsx")) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk("src/app");
files.forEach(file => {
  let content = fs.readFileSync(file, "utf8");
  // Replace { children }: any with { children }: Readonly<{ children: React.ReactNode }>
  if (content.includes("{ children }: any")) {
    content = content.replace(/\{ children \}:\s*any/g, "{ children }: Readonly<{ children: React.ReactNode }>");
    fs.writeFileSync(file, content);
    console.log("Updated", file);
  }
});
