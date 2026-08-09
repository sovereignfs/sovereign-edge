import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { validateManifest } from '@sovereignfs/connector-sdk';

const manifestPath = fileURLToPath(new URL('./manifest.json', import.meta.url));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

const result = validateManifest(manifest);

if (result.valid) {
  console.log(
    `${manifestPath} is a valid Tier ${result.manifest.tier} manifest.`,
  );
  process.exit(0);
}

console.error(`${manifestPath} is not valid:`);
for (const issue of result.issues) {
  console.error(`  ${issue.path}: ${issue.message}`);
}
process.exit(1);
