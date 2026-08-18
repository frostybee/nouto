#!/usr/bin/env node
/**
 * Prepare a Nouto desktop release.
 *
 *   pnpm release:desktop <version> [--dry-run] [--skip-checks] [--allow-empty-changelog]
 *
 * What it does, in order:
 *   1. validates the version (semver, optional leading "v"),
 *   2. refuses to run on a dirty tree or when the tag already exists,
 *   3. runs the quality gates (format:check, lint, desktop tests, rust fmt and
 *      clippy) unless --skip-checks,
 *   4. writes the version into packages/desktop/package.json,
 *      src-tauri/Cargo.toml, src-tauri/tauri.conf.json and refreshes Cargo.lock,
 *   5. promotes the [Unreleased] section of packages/desktop/CHANGELOG.md to a
 *      dated release section,
 *   6. commits and tags desktop-vX.Y.Z, then prints the push command.
 *
 * It never pushes. --dry-run prints every planned edit and touches nothing.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESKTOP = resolve(ROOT, 'packages/desktop');
const TAURI = resolve(DESKTOP, 'src-tauri');

const FILES = {
  pkg: resolve(DESKTOP, 'package.json'),
  cargo: resolve(TAURI, 'Cargo.toml'),
  cargoLock: resolve(TAURI, 'Cargo.lock'),
  tauri: resolve(TAURI, 'tauri.conf.json'),
  changelog: resolve(DESKTOP, 'CHANGELOG.md'),
};

const SEMVER = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/;

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const positional = argv.filter((a) => !a.startsWith('--'));
const DRY_RUN = flags.has('--dry-run');
const SKIP_CHECKS = flags.has('--skip-checks');
const ALLOW_EMPTY_CHANGELOG = flags.has('--allow-empty-changelog');

function die(msg) {
  console.error(`\nrelease: ${msg}`);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  const { capture, ...rest } = opts;
  return execFileSync(cmd, args, {
    cwd: ROOT,
    stdio: capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...rest,
  });
}

function step(label) {
  console.log(`\n==> ${label}`);
}

function rel(file) {
  return relative(ROOT, file).replace(/\\/g, '/');
}

// ---------------------------------------------------------------- 1. version
const rawVersion = positional[0];
if (!rawVersion || !SEMVER.test(rawVersion)) {
  console.error(
    'Usage: pnpm release:desktop <version> [--dry-run] [--skip-checks] [--allow-empty-changelog]',
  );
  console.error('  <version> must be semver, e.g. 0.2.0 or v0.2.0-beta.1');
  process.exit(1);
}
const version = rawVersion.replace(/^v/, '');
const tag = `desktop-v${version}`;
const today = new Date().toISOString().slice(0, 10);

console.log(`Preparing desktop release ${version} (tag ${tag})${DRY_RUN ? ' [dry run]' : ''}`);

// ------------------------------------------------------------ 2. git state
step('Checking git state');
const status = run('git', ['status', '--porcelain'], { capture: true }).trim();
if (status) die(`working tree is not clean. Commit or stash first.\n${status}`);

const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { capture: true }).trim();
if (branch !== 'main') console.warn(`warning: on branch "${branch}", not "main"`);

const existingTag = run('git', ['tag', '--list', tag], { capture: true }).trim();
if (existingTag) die(`tag ${tag} already exists`);

// ---------------------------------------------------------- 3. quality gate
if (SKIP_CHECKS) {
  step('Skipping quality checks (--skip-checks)');
} else {
  const gates = [
    ['pnpm', ['run', 'format:check']],
    ['pnpm', ['run', 'lint']],
    ['pnpm', ['-F', '@nouto/desktop', 'test']],
    ['pnpm', ['run', 'rust:fmt']],
    ['pnpm', ['run', 'rust:clippy']],
  ];
  for (const [cmd, args] of gates) {
    step(`${cmd} ${args.join(' ')}`);
    try {
      run(cmd, args);
    } catch {
      die(`"${cmd} ${args.join(' ')}" failed. Fix it or pass --skip-checks.`);
    }
  }
}

// ------------------------------------------------------ 4. compute edits
step('Computing edits');
const edits = [];

function planEdit(file, next) {
  const prev = readFileSync(file, 'utf8');
  if (prev !== next) edits.push({ file, next });
}

// package.json
{
  const pkg = JSON.parse(readFileSync(FILES.pkg, 'utf8'));
  console.log(`  ${rel(FILES.pkg)}: ${pkg.version} -> ${version}`);
  pkg.version = version;
  planEdit(FILES.pkg, `${JSON.stringify(pkg, null, 2)}\n`);
}

// Cargo.toml: the [package] version is the first `version = "..."` line.
{
  const cargo = readFileSync(FILES.cargo, 'utf8');
  const m = cargo.match(/^version = "([^"]+)"$/m);
  if (!m) die('could not find `version = "..."` in Cargo.toml');
  console.log(`  ${rel(FILES.cargo)}: ${m[1]} -> ${version}`);
  planEdit(FILES.cargo, cargo.replace(m[0], `version = "${version}"`));
}

// tauri.conf.json
const tauriConf = JSON.parse(readFileSync(FILES.tauri, 'utf8'));
{
  console.log(`  ${rel(FILES.tauri)}: ${tauriConf.version} -> ${version}`);
  tauriConf.version = version;
  planEdit(FILES.tauri, `${JSON.stringify(tauriConf, null, 2)}\n`);
}

// CHANGELOG.md: move [Unreleased] content under a dated heading.
{
  const changelog = readFileSync(FILES.changelog, 'utf8');
  const heading = '## [Unreleased]';
  const idx = changelog.indexOf(heading);
  if (idx === -1) die(`${rel(FILES.changelog)} has no "${heading}" section`);
  if (changelog.includes(`## [${version}]`)) {
    die(`${rel(FILES.changelog)} already has a [${version}] section`);
  }
  const afterHeading = idx + heading.length;
  const nextSection = changelog.indexOf('\n## ', afterHeading);
  const body = (
    nextSection === -1 ? changelog.slice(afterHeading) : changelog.slice(afterHeading, nextSection)
  ).trim();
  if (!body && !ALLOW_EMPTY_CHANGELOG) {
    die('the [Unreleased] section is empty (pass --allow-empty-changelog to release anyway)');
  }
  const rest = nextSection === -1 ? '' : changelog.slice(nextSection + 1);
  const release = `## [${version}] - ${today}\n\n${body ? `${body}\n\n` : ''}`;
  const next = `${changelog.slice(0, afterHeading)}\n\n${release}${rest}`;
  console.log(`  ${rel(FILES.changelog)}: [Unreleased] -> [${version}] - ${today}`);
  planEdit(FILES.changelog, next);
}

// Updater sanity check.
const pubkey = tauriConf?.plugins?.updater?.pubkey ?? '';
if (!pubkey || /REPLACE/i.test(pubkey)) {
  console.warn(
    'warning: plugins.updater.pubkey in tauri.conf.json is empty; updater artifacts will not verify.',
  );
}

// ------------------------------------------------------------ 5. dry run
if (DRY_RUN) {
  step('Dry run: nothing written. Files that would change:');
  for (const e of edits) console.log(`  ${rel(e.file)}`);
  console.log('\nWould then run:');
  console.log('  cargo update -p nouto --offline   (in packages/desktop/src-tauri)');
  console.log(`  git add ${Object.values(FILES).map(rel).join(' ')}`);
  console.log(`  git commit -m "release(desktop): v${version}"`);
  console.log(`  git tag ${tag}`);
  process.exit(0);
}

// -------------------------------------------------------- 6. write + git
step('Writing files');
for (const e of edits) {
  writeFileSync(e.file, e.next);
  console.log(`  wrote ${rel(e.file)}`);
}

step('Refreshing Cargo.lock');
try {
  run('cargo', ['update', '-p', 'nouto', '--offline'], { cwd: TAURI });
} catch {
  console.warn('warning: `cargo update -p nouto --offline` failed; falling back to `cargo check`');
  run('cargo', ['check', '--quiet'], { cwd: TAURI });
}

step('Committing and tagging');
run('git', ['add', ...Object.values(FILES)]);
run('git', ['commit', '-m', `release(desktop): v${version}`]);
run('git', ['tag', tag]);

console.log(
  `\nDone. Review the commit, then push to trigger .github/workflows/release.yml:\n\n  git push origin ${branch} --tags\n`,
);
