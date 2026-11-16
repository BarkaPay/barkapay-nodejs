// ES module consumer: `import … from 'barkapay'` must resolve to the ESM build.
import { createRequire } from 'node:module';

import * as sdk from 'barkapay';
import { BarkaPay } from 'barkapay';

const require = createRequire(import.meta.url);
const { version } = require('barkapay/package.json');
const { run } = require('./suite.cjs');

if (sdk.BarkaPay !== BarkaPay) {
  throw new Error('named and namespace imports disagree');
}

try {
  await run(sdk, 'esm', version);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
