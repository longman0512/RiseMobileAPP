#!/usr/bin/env node
/**
 * Build a signed .ipa for on-device testing.
 *
 * Prerequisites:
 * - Xcode + CocoaPods
 * - Apple Developer account logged into Xcode
 * - Team ID: Xcode → Settings → Accounts → [Team] → Team ID
 *
 * Usage:
 *   IOS_DEVELOPMENT_TEAM=XXXXXXXXXX npm run ios:ipa
 *
 * Optional:
 *   IOS_EXPORT_METHOD=development   (default; install via Xcode/Apple Configurator)
 *   IOS_EXPORT_METHOD=ad-hoc        (register device UDIDs in Apple Developer portal)
 *   IOS_EXPORT_METHOD=app-store     (TestFlight / App Store upload)
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const iosDir = path.join(root, 'ios');
const workspace = path.join(iosDir, 'RiseMobile.xcworkspace');
const scheme = 'RiseMobile';
const buildDir = path.join(iosDir, 'build');
const archivePath = path.join(buildDir, 'RiseMobile.xcarchive');
const exportDir = path.join(buildDir, 'ipa');
const distDir = path.join(root, 'dist');

const teamId = process.env.IOS_DEVELOPMENT_TEAM?.trim();
const exportMethod = process.env.IOS_EXPORT_METHOD?.trim() || 'development';

const validMethods = new Set(['development', 'ad-hoc', 'app-store', 'enterprise']);
if (!validMethods.has(exportMethod)) {
  console.error(`Invalid IOS_EXPORT_METHOD="${exportMethod}". Use: ${[...validMethods].join(', ')}`);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  console.log(`\n> ${cmd} ${args.join(' ')}\n`);
  const result = spawnSync(cmd, args, {
    cwd: opts.cwd ?? root,
    stdio: 'inherit',
    env: { ...process.env, ...opts.env },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function ensureTeamId() {
  if (teamId) return teamId;

  const probe = spawnSync(
    'security',
    ['find-identity', '-v', '-p', 'codesigning'],
    { encoding: 'utf8' },
  );
  const hasIdentity = probe.stdout?.includes('Apple Development') || probe.stdout?.includes('iPhone Developer');
  if (!hasIdentity) {
    console.error(`
No code signing certificate found on this Mac.

1. Open Xcode → Settings → Accounts → sign in with your Apple ID
2. Select your team → Manage Certificates → "+" → Apple Development
3. Open ios/RiseMobile.xcworkspace, select RiseMobile target → Signing & Capabilities
   → enable "Automatically manage signing" and pick your Team
4. Re-run with your 10-character Team ID:

   IOS_DEVELOPMENT_TEAM=XXXXXXXXXX npm run ios:ipa

Find Team ID: https://developer.apple.com/account → Membership details
`);
    process.exit(1);
  }

  console.error(`
Set IOS_DEVELOPMENT_TEAM to your Apple Team ID (10 characters), for example:

  IOS_DEVELOPMENT_TEAM=AB12CD34EF npm run ios:ipa
`);
  process.exit(1);
}

function writeExportOptions(team) {
  const plistPath = path.join(buildDir, 'ExportOptions.plist');
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>${exportMethod}</string>
  <key>teamID</key>
  <string>${team}</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>compileBitcode</key>
  <false/>
  <key>destination</key>
  <string>export</string>
</dict>
</plist>
`;
  fs.mkdirSync(buildDir, { recursive: true });
  fs.writeFileSync(plistPath, plist);
  return plistPath;
}

function findIpa(dir) {
  if (!fs.existsSync(dir)) return null;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (name.endsWith('.ipa')) return full;
    const nested = findIpa(full);
    if (nested) return nested;
  }
  return null;
}

ensureTeamId();

if (!fs.existsSync(workspace)) {
  console.error('Missing ios/RiseMobile.xcworkspace. Run: cd ios && pod install');
  process.exit(1);
}

if (!fs.existsSync(path.join(root, '.env'))) {
  console.warn('Warning: .env not found. Release build may miss Supabase/API config.');
}

run('pod', ['install'], { cwd: iosDir, env: { LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' } });

fs.rmSync(buildDir, { recursive: true, force: true });
fs.mkdirSync(buildDir, { recursive: true });

const xcodeFlags = [
  `-workspace`,
  workspace,
  `-scheme`,
  scheme,
  `-configuration`,
  'Release',
  `-archivePath`,
  archivePath,
  `-destination`,
  'generic/platform=iOS',
  `DEVELOPMENT_TEAM=${teamId}`,
  `CODE_SIGN_STYLE=Automatic`,
  `-allowProvisioningUpdates`,
];

run('xcodebuild', ['archive', ...xcodeFlags]);

const exportOptionsPlist = writeExportOptions(teamId);
fs.mkdirSync(exportDir, { recursive: true });

run('xcodebuild', [
  '-exportArchive',
  '-archivePath',
  archivePath,
  '-exportPath',
  exportDir,
  '-exportOptionsPlist',
  exportOptionsPlist,
  '-allowProvisioningUpdates',
]);

const ipaSource = findIpa(exportDir);
if (!ipaSource) {
  console.error('Export finished but no .ipa was found in', exportDir);
  process.exit(1);
}

fs.mkdirSync(distDir, { recursive: true });
const ipaDest = path.join(distDir, 'RiseMobile.ipa');
fs.copyFileSync(ipaSource, ipaDest);

console.log(`
Done.

IPA: ${ipaDest}

Install on a test iPhone:
  • development: connect device, install via Xcode → Window → Devices and Simulators
  • ad-hoc: use Apple Configurator, Diawi, or ios-deploy (device UDID must be registered)
  • app-store: upload with Transporter or \`xcrun altool --upload-app\` for TestFlight
`);
