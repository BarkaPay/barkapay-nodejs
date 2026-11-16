// ES module consumer: `import … from 'barkapay-payhub'` must resolve to the ESM build.
import { createRequire } from 'node:module';

import * as sdk from 'barkapay-payhub';
import { PayHub } from 'barkapay-payhub';

const require = createRequire(import.meta.url);
const { version } = require('barkapay-payhub/package.json');
const { run } = require('./suite.cjs');

if (sdk.PayHub !== PayHub) {
  throw new Error('named and namespace imports disagree');
}

try {
  await run(sdk, 'esm', version);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
