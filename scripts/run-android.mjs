import { spawnSync } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import path from "node:path";
import { buildAndroidEnv, printAndroidEnvHints } from "./android-env.mjs";

const cwd = process.cwd();
const isWin = process.platform === "win32";

function defaultGradleUserHome() {
  if (isWin) return "C:\\g\\rise-mobile";
  return path.join(cwd, "android", ".gradle-user-home");
}

const gradleUserHome =
  process.env.GRADLE_USER_HOME?.trim() || defaultGradleUserHome();

const gradlew = path.join(cwd, "android", "gradlew");
if (existsSync(gradlew)) {
  try {
    chmodSync(gradlew, 0o755);
  } catch {
    // ignore permission errors on some filesystems
  }
}

const { env, androidHome, javaHome } = buildAndroidEnv();
printAndroidEnvHints({ androidHome, javaHome });

if (!javaHome || !androidHome) {
  process.exit(1);
}

const args = process.argv.slice(2);
const npxCmd = "npx";
const res = spawnSync(
  npxCmd,
  ["react-native", "run-android", ...args],
  {
    stdio: "inherit",
    shell: isWin,
    windowsHide: true,
    env: { ...env, GRADLE_USER_HOME: gradleUserHome },
  },
);

if (res.error) {
  console.error(res.error);
}

process.exit(res.status ?? (res.error ? 1 : 0));
