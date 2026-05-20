const fs = require("fs");
const file = "src/app/global-error.tsx";
if (fs.existsSync(file)) {
  let content = fs.readFileSync(file, "utf8");
  content = content.replace(/\{ error, reset \}:\s*any/, "{ error, reset }: { error: Error & { digest?: string }; reset: () => void }");
  fs.writeFileSync(file, content);
  console.log("Updated", file);
}
