const fs = require("fs");
const path = require("path");

const root = process.cwd();
const exts = new Set([".ts", ".tsx", ".js", ".jsx"]);
const ignoreDirs = new Set([
  "node_modules",
  "android",
  "ios",
  ".git",
  "build",
  "dist",
]);

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      if (ignoreDirs.has(ent.name)) continue;
      walk(path.join(dir, ent.name), out);
    } else {
      const ext = path.extname(ent.name);
      if (exts.has(ext)) out.push(path.join(dir, ent.name));
    }
  }
  return out;
}

const files = walk(root);
const pkgs = new Set();

const importRe =
  /(?:import\s+(?:type\s+)?[^'"\n]+?\s+from\s+|import\s*\(|require\s*\()\s*[`'"]([^`'"\n]+)[`'"]\s*\)?/g;

for (const f of files) {
  const s = fs.readFileSync(f, "utf8");
  let m;
  while ((m = importRe.exec(s))) {
    const spec = m[1];
    if (!spec) continue;
    if (spec.startsWith(".") || spec.startsWith("/")) continue;
    if (spec.startsWith("react-native/")) continue;
    const name = spec.startsWith("@")
      ? spec.split("/").slice(0, 2).join("/")
      : spec.split("/")[0];
    pkgs.add(name);
  }
}

const list = Array.from(pkgs).sort();

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const pkgJson = readJson(path.join(root, "package.json"));
const declared = new Set([
  ...Object.keys(pkgJson.dependencies || {}),
  ...Object.keys(pkgJson.devDependencies || {}),
]);

const missing = [];
for (const p of list) {
  // ignore built-ins and react native core
  if (p === "react" || p === "react-native") continue;
  if (!declared.has(p)) missing.push(p);
}

console.log(
  JSON.stringify(
    {
      importedPackages: list,
      missingFromPackageJson: missing,
    },
    null,
    2,
  ),
);

