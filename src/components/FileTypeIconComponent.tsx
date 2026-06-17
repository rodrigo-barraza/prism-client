"use client";

import { memo } from "react";
import {
  File,
  FileCode2,
  FileJson2,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileSpreadsheet,
  FileType,
  FileKey,
  FileCog,
  FileTerminal,
  Braces,
  Database,
  Globe,
  Palette,
  Hash,
  Gem,
  Hexagon,
  Box,
  ScrollText,
  ShieldCheck,
  TestTubeDiagonal,
  BookOpen,
  Waypoints,
  Flame,
  Sparkles,
  Blocks,
  Binary,
  Server,
  Puzzle,
  Cpu,
  FlaskConical,
  FileDigit,
  FileDiff,
  Cuboid,
  Pen,
  Subtitles,
  Presentation,
  FileDown,
  Sigma,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import styles from "./FileTypeIconComponent.module.css";

interface FileIconEntry {
  icon: LucideIcon;
  cls: string;
}

// --- File Extension → Icon + Color Class Mapping ------------
const EXTENSION_ICON_MAP = {
  // JavaScript / TypeScript
  js: { icon: FileCode2, cls: "iconJs" },
  jsx: { icon: FileCode2, cls: "iconJsx" },
  ts: { icon: FileCode2, cls: "iconTs" },
  tsx: { icon: FileCode2, cls: "iconTsx" },
  mjs: { icon: FileCode2, cls: "iconJs" },
  cjs: { icon: FileCode2, cls: "iconJs" },
  // Web
  html: { icon: Globe, cls: "iconHtml" },
  htm: { icon: Globe, cls: "iconHtml" },
  css: { icon: Palette, cls: "iconCss" },
  scss: { icon: Palette, cls: "iconScss" },
  sass: { icon: Palette, cls: "iconScss" },
  less: { icon: Palette, cls: "iconCss" },
  svg: { icon: FileImage, cls: "iconSvg" },
  styl: { icon: Palette, cls: "iconScss" },
  // Frameworks — Vue / Svelte / Astro
  vue: { icon: Blocks, cls: "iconVue" },
  svelte: { icon: Flame, cls: "iconSvelte" },
  astro: { icon: Sparkles, cls: "iconAstro" },
  // Data / Config
  json: { icon: FileJson2, cls: "iconJson" },
  jsonc: { icon: FileJson2, cls: "iconJson" },
  json5: { icon: FileJson2, cls: "iconJson" },
  yaml: { icon: FileCog, cls: "iconYaml" },
  yml: { icon: FileCog, cls: "iconYaml" },
  toml: { icon: FileCog, cls: "iconToml" },
  ini: { icon: FileCog, cls: "iconConfig" },
  xml: { icon: FileCode2, cls: "iconXml" },
  csv: { icon: FileSpreadsheet, cls: "iconCsv" },
  tsv: { icon: FileSpreadsheet, cls: "iconCsv" },
  jsonnet: { icon: FileJson2, cls: "iconJson" },
  libsonnet: { icon: FileJson2, cls: "iconJson" },
  // Python
  py: { icon: FileCode2, cls: "iconPython" },
  pyw: { icon: FileCode2, cls: "iconPython" },
  pyi: { icon: FileCode2, cls: "iconPython" },
  ipynb: { icon: BookOpen, cls: "iconNotebook" },
  pyx: { icon: FileCode2, cls: "iconPython" },
  // Ruby
  rb: { icon: Gem, cls: "iconRuby" },
  erb: { icon: Gem, cls: "iconRuby" },
  // Rust
  rs: { icon: Hexagon, cls: "iconRust" },
  // Go
  go: { icon: FileCode2, cls: "iconGo" },
  mod: { icon: FileCog, cls: "iconGo" },
  sum: { icon: FileCog, cls: "iconGo" },
  // C / C++ / C#
  c: { icon: Hash, cls: "iconC" },
  h: { icon: Hash, cls: "iconC" },
  cpp: { icon: Hash, cls: "iconCpp" },
  hpp: { icon: Hash, cls: "iconCpp" },
  cc: { icon: Hash, cls: "iconCpp" },
  cxx: { icon: Hash, cls: "iconCpp" },
  cs: { icon: Hash, cls: "iconCsharp" },
  // Java / Kotlin
  java: { icon: FileCode2, cls: "iconJava" },
  kt: { icon: FileCode2, cls: "iconKotlin" },
  kts: { icon: FileCode2, cls: "iconKotlin" },
  gradle: { icon: FileCog, cls: "iconJava" },
  // Swift / Objective-C
  swift: { icon: FileCode2, cls: "iconSwift" },
  m: { icon: FileCode2, cls: "iconObjc" },
  mm: { icon: FileCode2, cls: "iconObjc" },
  // PHP
  php: { icon: FileCode2, cls: "iconPhp" },
  // Perl
  pl: { icon: FileCode2, cls: "iconPerl" },
  pm: { icon: FileCode2, cls: "iconPerl" },
  // Lua
  lua: { icon: FileCode2, cls: "iconLua" },
  // R
  r: { icon: FileCode2, cls: "iconR" },
  rmd: { icon: BookOpen, cls: "iconR" },
  // Dart / Flutter
  dart: { icon: FileCode2, cls: "iconDart" },
  // Scala
  scala: { icon: FileCode2, cls: "iconScala" },
  sbt: { icon: FileCog, cls: "iconScala" },
  // Groovy
  groovy: { icon: FileCode2, cls: "iconGroovy" },
  // Julia
  jl: { icon: FileCode2, cls: "iconJulia" },
  // CoffeeScript
  coffee: { icon: FileCode2, cls: "iconCoffee" },
  litcoffee: { icon: FileCode2, cls: "iconCoffee" },
  // Solidity / Blockchain
  sol: { icon: Hexagon, cls: "iconSolidity" },
  // CUDA
  cu: { icon: Cpu, cls: "iconCuda" },
  cuh: { icon: Cpu, cls: "iconCuda" },
  // Assembly
  asm: { icon: Cpu, cls: "iconAssembly" },
  s: { icon: Cpu, cls: "iconAssembly" },
  // Fortran
  f90: { icon: FileCode2, cls: "iconFortran" },
  f95: { icon: FileCode2, cls: "iconFortran" },
  f03: { icon: FileCode2, cls: "iconFortran" },
  for: { icon: FileCode2, cls: "iconFortran" },
  // MATLAB
  mat: { icon: Sigma, cls: "iconMatlab" },
  // Nix
  nix: { icon: FileCog, cls: "iconNix" },
  // Elixir / Erlang
  ex: { icon: FileCode2, cls: "iconElixir" },
  exs: { icon: FileCode2, cls: "iconElixir" },
  erl: { icon: FileCode2, cls: "iconErlang" },
  hrl: { icon: FileCode2, cls: "iconErlang" },
  // Haskell
  hs: { icon: FileCode2, cls: "iconHaskell" },
  lhs: { icon: FileCode2, cls: "iconHaskell" },
  // Clojure
  clj: { icon: FileCode2, cls: "iconClojure" },
  cljs: { icon: FileCode2, cls: "iconClojure" },
  cljc: { icon: FileCode2, cls: "iconClojure" },
  edn: { icon: FileCode2, cls: "iconClojure" },
  // OCaml / F#
  ml: { icon: FileCode2, cls: "iconOcaml" },
  mli: { icon: FileCode2, cls: "iconOcaml" },
  fs: { icon: FileCode2, cls: "iconFsharp" },
  fsx: { icon: FileCode2, cls: "iconFsharp" },
  // Zig
  zig: { icon: Hexagon, cls: "iconZig" },
  // Nim
  nim: { icon: FileCode2, cls: "iconNim" },
  // V
  v: { icon: FileCode2, cls: "iconVlang" },
  // Shell
  sh: { icon: FileTerminal, cls: "iconShell" },
  bash: { icon: FileTerminal, cls: "iconShell" },
  zsh: { icon: FileTerminal, cls: "iconShell" },
  fish: { icon: FileTerminal, cls: "iconShell" },
  bat: { icon: FileTerminal, cls: "iconShell" },
  cmd: { icon: FileTerminal, cls: "iconShell" },
  ps1: { icon: FileTerminal, cls: "iconShell" },
  psm1: { icon: FileTerminal, cls: "iconShell" },
  psd1: { icon: FileTerminal, cls: "iconShell" },
  // Markdown / Docs
  md: { icon: BookOpen, cls: "iconMarkdown" },
  mdx: { icon: BookOpen, cls: "iconMarkdown" },
  txt: { icon: FileText, cls: "iconText" },
  rst: { icon: FileText, cls: "iconText" },
  log: { icon: ScrollText, cls: "iconLog" },
  // Templates
  pug: { icon: FileCode2, cls: "iconPug" },
  jade: { icon: FileCode2, cls: "iconPug" },
  ejs: { icon: FileCode2, cls: "iconEjs" },
  hbs: { icon: FileCode2, cls: "iconHandlebars" },
  mustache: { icon: FileCode2, cls: "iconHandlebars" },
  njk: { icon: FileCode2, cls: "iconEjs" },
  twig: { icon: FileCode2, cls: "iconPhp" },
  // LaTeX
  tex: { icon: BookOpen, cls: "iconLatex" },
  bib: { icon: BookOpen, cls: "iconLatex" },
  sty: { icon: FileCog, cls: "iconLatex" },
  cls: { icon: FileCog, cls: "iconLatex" },
  typ: { icon: BookOpen, cls: "iconLatex" },
  // Cucumber / BDD
  feature: { icon: FlaskConical, cls: "iconCucumber" },
  // Shaders
  glsl: { icon: Cpu, cls: "iconShader" },
  vert: { icon: Cpu, cls: "iconShader" },
  frag: { icon: Cpu, cls: "iconShader" },
  hlsl: { icon: Cpu, cls: "iconShader" },
  wgsl: { icon: Cpu, cls: "iconShader" },
  // Diff / Patch
  diff: { icon: FileDiff, cls: "iconDiff" },
  patch: { icon: FileDiff, cls: "iconDiff" },
  // GraphQL
  graphql: { icon: Waypoints, cls: "iconGraphql" },
  gql: { icon: Waypoints, cls: "iconGraphql" },
  // Protocol Buffers
  proto: { icon: Binary, cls: "iconProto" },
  // Prisma
  prisma: { icon: Sparkles, cls: "iconPrisma" },
  // Terraform / HCL
  tf: { icon: Puzzle, cls: "iconTerraform" },
  hcl: { icon: Puzzle, cls: "iconTerraform" },
  tfvars: { icon: FileCog, cls: "iconTerraform" },
  // Nginx
  conf: { icon: Server, cls: "iconNginx" },
  cfg: { icon: FileCog, cls: "iconConfig" },
  properties: { icon: FileCog, cls: "iconConfig" },
  // Images
  png: { icon: FileImage, cls: "iconImage" },
  jpg: { icon: FileImage, cls: "iconImage" },
  jpeg: { icon: FileImage, cls: "iconImage" },
  gif: { icon: FileImage, cls: "iconImage" },
  webp: { icon: FileImage, cls: "iconImage" },
  ico: { icon: FileImage, cls: "iconImage" },
  bmp: { icon: FileImage, cls: "iconImage" },
  avif: { icon: FileImage, cls: "iconImage" },
  tiff: { icon: FileImage, cls: "iconImage" },
  tif: { icon: FileImage, cls: "iconImage" },
  psd: { icon: Pen, cls: "iconDesign" },
  ai: { icon: Pen, cls: "iconDesign" },
  sketch: { icon: Pen, cls: "iconDesign" },
  fig: { icon: Pen, cls: "iconDesign" },
  xd: { icon: Pen, cls: "iconDesign" },
  // Video
  mp4: { icon: FileVideo, cls: "iconVideo" },
  webm: { icon: FileVideo, cls: "iconVideo" },
  mkv: { icon: FileVideo, cls: "iconVideo" },
  avi: { icon: FileVideo, cls: "iconVideo" },
  mov: { icon: FileVideo, cls: "iconVideo" },
  flv: { icon: FileVideo, cls: "iconVideo" },
  wmv: { icon: FileVideo, cls: "iconVideo" },
  // Audio
  mp3: { icon: FileAudio, cls: "iconAudio" },
  wav: { icon: FileAudio, cls: "iconAudio" },
  flac: { icon: FileAudio, cls: "iconAudio" },
  ogg: { icon: FileAudio, cls: "iconAudio" },
  aac: { icon: FileAudio, cls: "iconAudio" },
  m4a: { icon: FileAudio, cls: "iconAudio" },
  wma: { icon: FileAudio, cls: "iconAudio" },
  opus: { icon: FileAudio, cls: "iconAudio" },
  mid: { icon: FileAudio, cls: "iconAudio" },
  midi: { icon: FileAudio, cls: "iconAudio" },
  // Archives
  zip: { icon: FileArchive, cls: "iconArchive" },
  tar: { icon: FileArchive, cls: "iconArchive" },
  gz: { icon: FileArchive, cls: "iconArchive" },
  bz2: { icon: FileArchive, cls: "iconArchive" },
  "7z": { icon: FileArchive, cls: "iconArchive" },
  rar: { icon: FileArchive, cls: "iconArchive" },
  xz: { icon: FileArchive, cls: "iconArchive" },
  zst: { icon: FileArchive, cls: "iconArchive" },
  tgz: { icon: FileArchive, cls: "iconArchive" },
  deb: { icon: FileArchive, cls: "iconArchive" },
  rpm: { icon: FileArchive, cls: "iconArchive" },
  dmg: { icon: FileArchive, cls: "iconArchive" },
  iso: { icon: FileArchive, cls: "iconArchive" },
  vsix: { icon: FileArchive, cls: "iconArchive" },
  // Fonts
  woff: { icon: FileType, cls: "iconFont" },
  woff2: { icon: FileType, cls: "iconFont" },
  ttf: { icon: FileType, cls: "iconFont" },
  otf: { icon: FileType, cls: "iconFont" },
  eot: { icon: FileType, cls: "iconFont" },
  // Database
  sql: { icon: Database, cls: "iconDatabase" },
  sqlite: { icon: Database, cls: "iconDatabase" },
  db: { icon: Database, cls: "iconDatabase" },
  mdb: { icon: Database, cls: "iconDatabase" },
  // Documents / Office
  pdf: { icon: FileDown, cls: "iconPdf" },
  doc: { icon: FileText, cls: "iconDoc" },
  docx: { icon: FileText, cls: "iconDoc" },
  xls: { icon: FileSpreadsheet, cls: "iconSpreadsheet" },
  xlsx: { icon: FileSpreadsheet, cls: "iconSpreadsheet" },
  ppt: { icon: Presentation, cls: "iconPresentation" },
  pptx: { icon: Presentation, cls: "iconPresentation" },
  odt: { icon: FileText, cls: "iconDoc" },
  ods: { icon: FileSpreadsheet, cls: "iconSpreadsheet" },
  odp: { icon: Presentation, cls: "iconPresentation" },
  // Subtitles
  srt: { icon: Subtitles, cls: "iconSubtitle" },
  vtt: { icon: Subtitles, cls: "iconSubtitle" },
  ass: { icon: Subtitles, cls: "iconSubtitle" },
  sub: { icon: Subtitles, cls: "iconSubtitle" },
  // 3D Models
  gltf: { icon: Cuboid, cls: "icon3d" },
  glb: { icon: Cuboid, cls: "icon3d" },
  fbx: { icon: Cuboid, cls: "icon3d" },
  stl: { icon: Cuboid, cls: "icon3d" },
  obj: { icon: Cuboid, cls: "icon3d" },
  blend: { icon: Cuboid, cls: "icon3d" },
  // Binaries / Executables
  exe: { icon: Binary, cls: "iconBinary" },
  dll: { icon: Binary, cls: "iconBinary" },
  so: { icon: Binary, cls: "iconBinary" },
  dylib: { icon: Binary, cls: "iconBinary" },
  bin: { icon: Binary, cls: "iconBinary" },
  // Security / Env
  env: { icon: FileKey, cls: "iconEnv" },
  pem: { icon: ShieldCheck, cls: "iconCert" },
  crt: { icon: ShieldCheck, cls: "iconCert" },
  cer: { icon: ShieldCheck, cls: "iconCert" },
  key: { icon: FileKey, cls: "iconEnv" },
  // Docker
  dockerfile: { icon: Box, cls: "iconDocker" },
  // Test files (matched by name pattern, not extension)
  test: { icon: TestTubeDiagonal, cls: "iconTest" },
  spec: { icon: TestTubeDiagonal, cls: "iconTest" },
  // Package / Lock
  lock: { icon: FileKey, cls: "iconLock" },
  // TypeScript declaration
  "d.ts": { icon: Braces, cls: "iconDts" },
  // Map files
  map: { icon: Braces, cls: "iconMap" },
  // WebAssembly
  wasm: { icon: Binary, cls: "iconWasm" },
  wat: { icon: Binary, cls: "iconWasm" },
  // Data serialization
  avro: { icon: FileDigit, cls: "iconProto" },
  parquet: { icon: FileDigit, cls: "iconProto" },
  msgpack: { icon: FileDigit, cls: "iconProto" },
};

// Special filename matches (case-insensitive)
const FILENAME_ICON_MAP = {
  dockerfile: { icon: Box, cls: "iconDocker" },
  "docker-compose.yml": { icon: Box, cls: "iconDocker" },
  "docker-compose.yaml": { icon: Box, cls: "iconDocker" },
  "compose.yml": { icon: Box, cls: "iconDocker" },
  "compose.yaml": { icon: Box, cls: "iconDocker" },
  ".gitignore": { icon: FileCog, cls: "iconGit" },
  ".gitattributes": { icon: FileCog, cls: "iconGit" },
  ".gitmodules": { icon: FileCog, cls: "iconGit" },
  ".prettierrc": { icon: FileCog, cls: "iconConfig" },
  ".prettierrc.json": { icon: FileCog, cls: "iconConfig" },
  ".prettierrc.yml": { icon: FileCog, cls: "iconConfig" },
  ".eslintrc": { icon: FileCog, cls: "iconConfig" },
  ".eslintrc.json": { icon: FileCog, cls: "iconConfig" },
  ".editorconfig": { icon: FileCog, cls: "iconConfig" },
  ".npmrc": { icon: FileCog, cls: "iconConfig" },
  ".nvmrc": { icon: FileCog, cls: "iconConfig" },
  ".babelrc": { icon: FileCog, cls: "iconConfig" },
  "tsconfig.json": { icon: FileCog, cls: "iconTs" },
  "jsconfig.json": { icon: FileCog, cls: "iconJs" },
  "tailwind.config.js": { icon: Palette, cls: "iconCss" },
  "tailwind.config.ts": { icon: Palette, cls: "iconCss" },
  "postcss.config.js": { icon: Palette, cls: "iconCss" },
  "vite.config.js": { icon: FileCog, cls: "iconConfig" },
  "vite.config.ts": { icon: FileCog, cls: "iconConfig" },
  "next.config.js": { icon: FileCog, cls: "iconConfig" },
  "next.config.mjs": { icon: FileCog, cls: "iconConfig" },
  "webpack.config.js": { icon: FileCog, cls: "iconConfig" },
  "rollup.config.js": { icon: FileCog, cls: "iconConfig" },
  "vitest.config.js": { icon: TestTubeDiagonal, cls: "iconTest" },
  "vitest.config.ts": { icon: TestTubeDiagonal, cls: "iconTest" },
  "jest.config.js": { icon: TestTubeDiagonal, cls: "iconTest" },
  "jest.config.ts": { icon: TestTubeDiagonal, cls: "iconTest" },
  "eslint.config.js": { icon: FileCog, cls: "iconConfig" },
  "eslint.config.mjs": { icon: FileCog, cls: "iconConfig" },
  makefile: { icon: FileTerminal, cls: "iconShell" },
  "CMakeLists.txt": { icon: FileTerminal, cls: "iconShell" },
  license: { icon: ScrollText, cls: "iconLicense" },
  "license.md": { icon: ScrollText, cls: "iconLicense" },
  "readme.md": { icon: BookOpen, cls: "iconMarkdown" },
  "changelog.md": { icon: ScrollText, cls: "iconMarkdown" },
  "contributing.md": { icon: BookOpen, cls: "iconMarkdown" },
  ".dockerignore": { icon: Box, cls: "iconDocker" },
  "nginx.conf": { icon: Server, cls: "iconNginx" },
  gemfile: { icon: Gem, cls: "iconRuby" },
  rakefile: { icon: Gem, cls: "iconRuby" },
  "cargo.toml": { icon: Hexagon, cls: "iconRust" },
  "cargo.lock": { icon: FileKey, cls: "iconRust" },
  "go.mod": { icon: FileCog, cls: "iconGo" },
  "go.sum": { icon: FileKey, cls: "iconGo" },
  "mix.exs": { icon: FileCode2, cls: "iconElixir" },
  "mix.lock": { icon: FileKey, cls: "iconElixir" },
  "requirements.txt": { icon: FileText, cls: "iconPython" },
  "pyproject.toml": { icon: FileCog, cls: "iconPython" },
  "setup.py": { icon: FileCog, cls: "iconPython" },
  pipfile: { icon: FileCog, cls: "iconPython" },
  "pipfile.lock": { icon: FileKey, cls: "iconPython" },
  "poetry.lock": { icon: FileKey, cls: "iconPython" },
  ".python-version": { icon: FileCog, cls: "iconPython" },
  // Ruby
  ".rubocop.yml": { icon: FileCog, cls: "iconRuby" },
  // Node
  "package.json": { icon: FileJson2, cls: "iconJson" },
  "package-lock.json": { icon: FileKey, cls: "iconLock" },
  "yarn.lock": { icon: FileKey, cls: "iconLock" },
  "pnpm-lock.yaml": { icon: FileKey, cls: "iconLock" },
  ".yarnrc": { icon: FileCog, cls: "iconConfig" },
  ".yarnrc.yml": { icon: FileCog, cls: "iconConfig" },
  "turbo.json": { icon: FileCog, cls: "iconConfig" },
  "lerna.json": { icon: FileCog, cls: "iconConfig" },
  // CI / CD
  ".travis.yml": { icon: FileCog, cls: "iconConfig" },
  Jenkinsfile: { icon: FileCog, cls: "iconConfig" },
  // Nix
  "flake.nix": { icon: FileCog, cls: "iconNix" },
  "flake.lock": { icon: FileKey, cls: "iconNix" },
  "default.nix": { icon: FileCog, cls: "iconNix" },
  "shell.nix": { icon: FileCog, cls: "iconNix" },
  // Julia
  "Project.toml": { icon: FileCog, cls: "iconJulia" },
  "Manifest.toml": { icon: FileKey, cls: "iconJulia" },
  // Kubernetes
  "skaffold.yaml": { icon: Box, cls: "iconDocker" },
  // Terraform
  ".terraform.lock.hcl": { icon: FileKey, cls: "iconTerraform" },
  // Solidity
  "hardhat.config.js": { icon: FileCog, cls: "iconSolidity" },
  "hardhat.config.ts": { icon: FileCog, cls: "iconSolidity" },
  "foundry.toml": { icon: FileCog, cls: "iconSolidity" },
};

const DEFAULT_FILE_ICON = { icon: File, cls: "iconDefault" };

/**
 * Resolve the icon + color class for a given filename.
 * Checks exact filename matches first, then compound extensions (e.g. ".d.ts"),
 * then test/spec pattern detection, and finally simple extension match.
 */
export function getFileIconData(filename: string): FileIconEntry {
  const lower = filename.toLowerCase();

  // 1. Exact filename match
  const filenameMatch = (FILENAME_ICON_MAP as Record<string, FileIconEntry>)[lower];
  if (filenameMatch) return filenameMatch;

  // 2. Check for compound extensions (e.g., ".d.ts", ".test.js")
  const parts = lower.split(".");
  if (parts.length >= 3) {
    const compoundExt = parts.slice(-2).join(".");
    const compoundMatch = (EXTENSION_ICON_MAP as Record<string, FileIconEntry>)[compoundExt];
    if (compoundMatch) return compoundMatch;
    // Test/spec/stories detection
    const secondLast = parts[parts.length - 2];
    if (secondLast === "test" || secondLast === "spec") {
      return EXTENSION_ICON_MAP.test;
    }
    if (secondLast === "stories" || secondLast === "story") {
      return { icon: BookOpen, cls: "iconStorybook" };
    }
  }

  // 3. Simple extension match
  const ext = parts.length > 1 ? parts.pop() : "";
  const extMatch = ext ? (EXTENSION_ICON_MAP as Record<string, FileIconEntry>)[ext] : undefined;
  if (extMatch) return extMatch;

  return DEFAULT_FILE_ICON;
}

/**
 * FileTypeIconComponent — renders a filetype-aware Lucide icon with
 * language-specific coloring.
 */
interface FileTypeIconProps {
  filename?: string;
  size?: number;
  className?: string;
}

const FileTypeIconComponent = memo(function FileTypeIconComponent({
  filename,
  size = 11,
  className = "",
}: FileTypeIconProps) {
  const { icon: Icon, cls } = getFileIconData(filename || "");
  return (
    <Icon
      size={size}
      className={`file-type-icon-component ${styles['file-icon']} ${styles[cls] || ""} ${className}`}
    />
  );
});

export default FileTypeIconComponent;
