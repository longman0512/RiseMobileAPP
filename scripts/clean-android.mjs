import { rmSync, existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const dirs = [
  path.join(root, "android", "build"),
  path.join(root, "android", "app", "build"),
  path.join(root, "android", ".gradle"),
];

for (const dir of dirs) {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
    console.log(`[android:clean] Removed ${dir}`);
  }
}

console.log(
  "[android:clean] Done. Re-run npm run android (or npm run ld:android).",
);
