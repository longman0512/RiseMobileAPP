import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const target = path.join(
  process.cwd(),
  'node_modules',
  '@react-native',
  'gradle-plugin',
  'settings.gradle.kts',
);

if (!existsSync(target)) {
  process.exit(0);
}

const source = readFileSync(target, 'utf8');
const patched = source.replace(
  'foojay-resolver-convention").version("0.5.0")',
  'foojay-resolver-convention").version("1.0.0")',
);

if (patched !== source) {
  writeFileSync(target, patched);
  console.log('[patch-foojay] Updated foojay-resolver-convention to 1.0.0 for Gradle 9');
}
