const fs = require("fs");

function fixRequestDetailHelpers() {
  const file = "src/utils/requestDetailHelpers.tsx";
  if (!fs.existsSync(file)) return;
  let pc = fs.readFileSync(file, "utf8");

  pc = pc.replace(/\(typeof node === "string" && node\.startsWith\)\("minio:\/\/"\)/g, "(typeof node === \"string\" && node.startsWith(\"minio://\"))");
  pc = pc.replace(/\(typeof node === "string" && node\.startsWith\)\("data:image\/"\)/g, "(typeof node === \"string\" && node.startsWith(\"data:image/\"))");
  pc = pc.replace(/\(typeof node === "string" && node\.startsWith\)\("data:audio\/"\)/g, "(typeof node === \"string\" && node.startsWith(\"data:audio/\"))");
  pc = pc.replace(/\(typeof node === "string" && node\.startsWith\)\("data:video\/"\)/g, "(typeof node === \"string\" && node.startsWith(\"data:video/\"))");
  pc = pc.replace(/\(typeof node === "string" && node\.startsWith\)\("data:application\/pdf"\)/g, "(typeof node === \"string\" && node.startsWith(\"data:application/pdf\"))");
  pc = pc.replace(/\(typeof node === "string" && node\.startsWith\)\("http:\/\/"\)/g, "(typeof node === \"string\" && node.startsWith(\"http://\"))");
  pc = pc.replace(/\(typeof node === "string" && node\.startsWith\)\("https:\/\/"\)/g, "(typeof node === \"string\" && node.startsWith(\"https://\"))");

  fs.writeFileSync(file, pc);
  console.log("Updated requestDetailHelpers");
}

fixRequestDetailHelpers();
