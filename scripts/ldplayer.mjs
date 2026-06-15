import { spawnSync } from "node:child_process";
import path from "node:path";

function run(cmd, args, { allowFail = false, env } = {}) {
  const isWin = process.platform === "win32";
  const res = spawnSync(cmd, args, {
    stdio: "inherit",
    // On Windows, commands like `npx` are `.cmd` shims; spawning them reliably
    // typically requires `shell: true`.
    shell: isWin ? true : false,
    windowsHide: true,
    env: env ? { ...process.env, ...env } : process.env,
  });
  if (res.error) {
    console.error(res.error);
  }
  if (!allowFail && res.status !== 0) {
    process.exit(res.status ?? (res.error ? 1 : 0));
  }
  return res.status ?? 0;
}

function runCapture(cmd, args, { allowFail = false } = {}) {
  const res = spawnSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    windowsHide: true,
  });
  if (!allowFail && res.status !== 0) {
    process.stderr.write(res.stderr || "");
    process.stdout.write(res.stdout || "");
    process.exit(res.status ?? 1);
  }
  return {
    status: res.status ?? 0,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
  };
}

function getConnectTargets() {
  // Common LDPlayer adb endpoints:
  // - 127.0.0.1:5555 (frequent default)
  // - 127.0.0.1:5554 (sometimes used / multi-instance)
  const env = process.env.LDPLAYER_TARGETS;
  if (env && env.trim()) {
    return env
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  // Default to the most common one only. Add others via LDPLAYER_TARGETS.
  return ["127.0.0.1:5555"];
}

function pickDeviceSerial() {
  // If multiple devices are connected, adb requires -s <serial>.
  // Allow override:
  //   LDPLAYER_SERIAL=127.0.0.1:5555  (recommended)
  const forced = process.env.LDPLAYER_SERIAL;
  if (forced && forced.trim()) return forced.trim();

  const { stdout } = runCapture("adb", ["devices"], { allowFail: false });
  const lines = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const devices = lines
    .slice(1) // skip "List of devices attached"
    .map((l) => l.split(/\s+/))
    .map(([serial, status]) => ({ serial, status }))
    .filter((d) => d.serial && d.status);

  // Only choose devices that are actually usable.
  const online = devices.filter((d) => d.status === "device");

  // Prefer LDPlayer TCP serial if present.
  const preferred = online.find((d) => d.serial.startsWith("127.0.0.1:"));
  if (preferred) return preferred.serial;

  // Else fall back to first available device.
  return online[0]?.serial;
}

function connect() {
  const targets = getConnectTargets();
  let ok = false;
  for (const t of targets) {
    const res = runCapture("adb", ["connect", t], { allowFail: true });
    const out = `${res.stdout}\n${res.stderr}`.toLowerCase();
    if (out.includes("failed") || out.includes("cannot connect")) {
      // Some adb versions keep a stuck "offline" entry after a failed connect.
      run("adb", ["disconnect", t], { allowFail: true });
      continue;
    }
    ok = true;
  }
  if (!ok) process.exit(1);
  run("adb", ["devices"]);
}

function reverse() {
  const serial = pickDeviceSerial();
  if (!serial) {
    console.error("No adb devices found. Start LDPlayer first.");
    process.exit(1);
  }
  console.log(`[ldplayer] Using device: ${serial}`);
  const metroPort = process.env.LDPLAYER_METRO_PORT?.trim() || "8081";
  console.log(`[ldplayer] Setting up adb reverse for Metro (${metroPort})...`);
  run("adb", ["-s", serial, "reverse", `tcp:${metroPort}`, `tcp:${metroPort}`], {
    allowFail: true,
  });
  // If you use custom dev ports, set these env vars:
  // - LDPLAYER_REVERSE_FROM (default 8081)
  // - LDPLAYER_REVERSE_TO (default 8081)
  const from = process.env.LDPLAYER_REVERSE_FROM;
  const to = process.env.LDPLAYER_REVERSE_TO;
  if (from && to && (from !== "8081" || to !== "8081")) {
    run("adb", ["-s", serial, "reverse", `tcp:${from}`, `tcp:${to}`], {
      allowFail: true,
    });
  }
}

function android() {
  // Typical flow for LDPlayer:
  // 1) Connect to emulator's adb port
  // 2) Reverse Metro port (fast, avoids "dev server unreachable")
  // 3) Install & run the app
  connect();
  reverse();
  const serial = pickDeviceSerial();
  if (!serial) {
    console.error("No adb devices found. Start LDPlayer first.");
    process.exit(1);
  }
  console.log(`[ldplayer] Installing to device: ${serial}`);
  const metroPort = process.env.LDPLAYER_METRO_PORT?.trim() || "8081";
  console.log(
    "[ldplayer] Building + installing (this can take a few minutes on first run)...",
  );

  // Work around flaky global Gradle caches on some Windows setups:
  // Use a short path on Windows to avoid MAX_PATH (260) issues.
  const gradleUserHome =
    process.env.GRADLE_USER_HOME?.trim() ||
    (process.platform === "win32"
      ? "C:\\g\\rise-mobile"
      : path.join(process.cwd(), "android", ".gradle-user-home"));

  console.log(`[ldplayer] GRADLE_USER_HOME=${gradleUserHome}`);

  // Avoid interactive prompts if Metro is already running on some port.
  // `--no-packager` expects you to run Metro separately (recommended).
  run(
    "npx",
    [
      "react-native",
      "run-android",
      "--device",
      serial,
      "--port",
      metroPort,
      "--no-packager",
    ],
    { env: { GRADLE_USER_HOME: gradleUserHome } },
  );
}

const cmd = process.argv[2];
switch (cmd) {
  case "connect":
    connect();
    break;
  case "reverse":
    reverse();
    break;
  case "android":
    android();
    break;
  default:
    console.error(
      [
        "Usage: node ./scripts/ldplayer.mjs <connect|reverse|android>",
        "",
        "Env:",
        "  LDPLAYER_TARGETS=127.0.0.1:5555,127.0.0.1:5554",
        "  LDPLAYER_SERIAL=127.0.0.1:5555",
        "  LDPLAYER_METRO_PORT=8081",
        "  GRADLE_USER_HOME=<path>  (optional override)",
        "  LDPLAYER_REVERSE_FROM=8081",
        "  LDPLAYER_REVERSE_TO=8081",
      ].join("\n"),
    );
    process.exit(2);
}

