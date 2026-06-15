import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const cwd = process.cwd();

function readSdkDirFromLocalProperties() {
  const file = path.join(cwd, "android", "local.properties");
  if (!existsSync(file)) return undefined;
  const match = readFileSync(file, "utf8").match(/^sdk\.dir=(.+)$/m);
  if (!match) return undefined;
  return match[1].trim().replace(/\\:/g, ":");
}

function readJavaHomeFromGradleProperties() {
  const file = path.join(cwd, "android", "gradle.properties");
  if (!existsSync(file)) return undefined;
  const match = readFileSync(file, "utf8").match(/^org\.gradle\.java\.home=(.+)$/m);
  if (!match) return undefined;
  return match[1].trim();
}

function firstExistingDir(candidates) {
  for (const candidate of candidates) {
    if (candidate && existsSync(path.join(candidate, "bin", "java"))) {
      return candidate;
    }
  }
  return undefined;
}

export function resolveAndroidHome() {
  const fromEnv = process.env.ANDROID_HOME?.trim() || process.env.ANDROID_SDK_ROOT?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const fromLocal = readSdkDirFromLocalProperties();
  if (fromLocal && existsSync(fromLocal)) return fromLocal;

  if (process.platform === "darwin") {
    const defaultMac = path.join(os.homedir(), "Library", "Android", "sdk");
    if (existsSync(defaultMac)) return defaultMac;
  }

  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    const defaultWin = path.join(process.env.LOCALAPPDATA, "Android", "Sdk");
    if (existsSync(defaultWin)) return defaultWin;
  }

  return undefined;
}

export function resolveJavaHome() {
  const fromEnv = process.env.JAVA_HOME?.trim();
  if (fromEnv && existsSync(path.join(fromEnv, "bin", "java"))) return fromEnv;

  const fromGradle = readJavaHomeFromGradleProperties();
  if (fromGradle && existsSync(path.join(fromGradle, "bin", "java"))) return fromGradle;

  return firstExistingDir([
    "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home",
    "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home",
    "/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home",
    "/usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home",
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home",
  ]);
}

export function buildAndroidEnv(baseEnv = process.env) {
  const env = { ...baseEnv };
  const androidHome = resolveAndroidHome();
  const javaHome = resolveJavaHome();

  if (androidHome) {
    env.ANDROID_HOME = androidHome;
    env.ANDROID_SDK_ROOT = androidHome;
    const pathEntries = [
      path.join(androidHome, "platform-tools"),
      path.join(androidHome, "emulator"),
      path.join(androidHome, "cmdline-tools", "latest", "bin"),
      env.PATH ?? "",
    ];
    env.PATH = pathEntries.filter(Boolean).join(path.delimiter);
  }

  if (javaHome) {
    env.JAVA_HOME = javaHome;
    env.PATH = [path.join(javaHome, "bin"), env.PATH ?? ""].filter(Boolean).join(path.delimiter);
  }

  return { env, androidHome, javaHome };
}

export function printAndroidEnvHints({ androidHome, javaHome }) {
  if (!javaHome) {
    console.error(
      "[android] Java not found. Install JDK 21, e.g. `brew install openjdk@21`, then re-run.",
    );
  }
  if (!androidHome) {
    console.error(
      "[android] Android SDK not found. Install Android Studio or set ANDROID_HOME to your SDK path.",
    );
  }
}
