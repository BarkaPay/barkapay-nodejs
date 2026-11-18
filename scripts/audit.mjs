// Dependency audit, run by CI and by the release workflow: `node scripts/audit.mjs`.
//
// Two rules:
//   1. What users install must be clean. The runtime dependencies (none today)
//      are audited on their own and no advisory is ever accepted there.
//   2. The build and test tooling (devDependencies) must be clean too, except
//      for the advisories listed in ACCEPTED: reviewed, limited to tooling that
//      only reads this repository's own files, and with no fixed version to
//      move to. Any other advisory fails the run.
//
// An accepted advisory that no longer shows up is reported as a warning: delete
// its entry, the exception has done its time.
import { spawnSync } from 'node:child_process';

const ACCEPTED = [
  {
    id: 'GHSA-fc5q-39xc-vjpf',
    package: 'picomatch',
    reviewed: '2026-11-18',
    reason:
      'ReDoS on crafted glob patterns. Reaches us through tinyglobby (tsup, vitest, ' +
      'typescript-eslint), which only matches the patterns of our own config files. ' +
      'Every release is affected (<= 4.0.7, the latest): there is nothing to upgrade to.',
  },
];

function audit(extraArgs) {
  const args = ['audit', '--json', ...extraArgs];
  const run = spawnSync('npm', args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === 'win32',
  });
  let report;
  try {
    report = JSON.parse(run.stdout);
  } catch {
    throw new Error(
      `npm ${args.join(' ')} did not return JSON:\n${run.stderr || run.stdout}`,
    );
  }
  if (report.error || !report.vulnerabilities) {
    throw new Error(
      `npm ${args.join(' ')} failed: ${JSON.stringify(report.error ?? report)}`,
    );
  }
  return report;
}

// The advisories themselves, not the packages that merely depend on a vulnerable one.
function advisories(report) {
  const found = new Map();
  for (const entry of Object.values(report.vulnerabilities)) {
    for (const via of entry.via) {
      if (typeof via === 'string') continue;
      const id = /GHSA(-[0-9a-z]{4}){3}/i.exec(via.url ?? '')?.[0] ?? String(via.source);
      found.set(id, { id, package: via.name, severity: via.severity, title: via.title });
    }
  }
  return [...found.values()];
}

function describe(advisory) {
  return `${advisory.id} ${advisory.package} (${advisory.severity}): ${advisory.title}`;
}

let failed = false;

try {
  const shipped = advisories(audit(['--omit=dev']));
  if (shipped.length > 0) {
    failed = true;
    console.error('Runtime dependencies: advisories found, none is ever accepted here.');
    for (const advisory of shipped) console.error(`  ${describe(advisory)}`);
  } else {
    console.log('Runtime dependencies: clean.');
  }

  const all = advisories(audit([]));
  const accepted = new Map(ACCEPTED.map((entry) => [entry.id, entry]));
  const unexpected = all.filter((advisory) => !accepted.has(advisory.id));
  const known = all.filter((advisory) => accepted.has(advisory.id));

  for (const advisory of known) {
    const entry = accepted.get(advisory.id);
    console.log(`Dev tooling: accepted ${describe(advisory)}`);
    console.log(`  reviewed ${entry.reviewed} — ${entry.reason}`);
  }
  for (const entry of ACCEPTED) {
    if (!all.some((advisory) => advisory.id === entry.id)) {
      console.log(
        `::warning file=scripts/audit.mjs::${entry.id} (${entry.package}) is no longer ` +
          'reported by npm audit: remove it from ACCEPTED.',
      );
    }
  }
  if (unexpected.length > 0) {
    failed = true;
    console.error(
      'Dev tooling: advisories that are not in ACCEPTED (scripts/audit.mjs).',
    );
    for (const advisory of unexpected) console.error(`  ${describe(advisory)}`);
  } else if (known.length === 0) {
    console.log('Dev tooling: clean.');
  }
} catch (error) {
  failed = true;
  console.error(error instanceof Error ? error.message : error);
}

process.exitCode = failed ? 1 : 0;
