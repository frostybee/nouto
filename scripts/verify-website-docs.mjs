import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, normalize, relative, resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const docsRoot = join(root, 'packages', 'website', 'src', 'content', 'docs');
const publicRoot = join(root, 'packages', 'website', 'public');
const cliPath = join(root, 'packages', 'cli', 'dist', 'bin', 'cli.js');
const cliBuildPath = join(root, 'packages', 'cli', 'esbuild.mjs');

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const docs = walk(docsRoot).filter((file) => file.endsWith('.md'));
const routes = new Set(docs.map((file) => `/${relative(docsRoot, file).replace(/\\/g, '/').replace(/\.md$/, '').replace(/\/index$/, '')}`));
routes.add('/');
const failures = [];

function validateDestination(file, destination) {
  const url = destination.trim().replace(/^<|>$/g, '');
  if (!url || /^(https?:|mailto:|#)/.test(url)) return;
  const path = url.split(/[?#]/, 1)[0];
  if (path.startsWith('/')) {
    const publicFile = join(publicRoot, path.slice(1));
    if (!routes.has(path.replace(/\/$/, '') || '/') && !existsSync(publicFile)) {
      failures.push(`${relative(root, file)}: unresolved ${url}`);
    }
    return;
  }
  const localFile = normalize(join(resolve(file, '..'), path));
  if (!localFile.startsWith(docsRoot) || !existsSync(localFile)) {
    failures.push(`${relative(root, file)}: unresolved ${url}`);
  }
}

for (const file of docs) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+['"][^)]*['"])?\)/g)) {
    validateDestination(file, match[1]);
  }
}

execFileSync(process.execPath, [cliBuildPath], { cwd: join(root, 'packages', 'cli'), stdio: 'inherit' });
const commandHelp = new Map();
for (const command of ['run', 'benchmark', 'codegen', 'import', 'export']) {
  commandHelp.set(command, execFileSync(process.execPath, [cliPath, command, '--help'], { cwd: root, encoding: 'utf8' }));
}

function section(text, heading) {
  const start = text.indexOf(heading);
  if (start === -1) return '';
  const next = text.indexOf('\n## ', start + heading.length);
  return text.slice(start, next === -1 ? undefined : next);
}

const cliDocs = [
  ['cli/run.md', 'run', '## Options'],
  ['cli/benchmark.md', 'benchmark', '## Options'],
  ['cli/codegen.md', 'codegen', '## Options'],
  ['cli/import-export.md', 'import', '## Import'],
  ['cli/import-export.md', 'export', '## Export'],
];
for (const [docPath, command, heading] of cliDocs) {
  const text = section(readFileSync(join(docsRoot, docPath), 'utf8'), heading);
  for (const flag of new Set([...text.matchAll(/--([a-z][a-z-]*)/g)].map((match) => `--${match[1]}`))) {
    if (!commandHelp.get(command).includes(flag)) {
      failures.push(`${docPath}: ${flag} is not accepted by nouto ${command}`);
    }
  }
}

const targetsOutput = execFileSync(process.execPath, [cliPath, 'codegen', '--list-targets'], { cwd: root, encoding: 'utf8' });
const actualTargets = new Set([...targetsOutput.matchAll(/^\s{4}([\w-]+)\s{2,}/gm)].map((match) => match[1]));
const codegenDoc = readFileSync(join(docsRoot, 'cli', 'codegen.md'), 'utf8');
const targetBlock = codegenDoc.match(/```\n\s*Available code generation targets:\s*\n\n([\s\S]*?)```/);
if (!targetBlock) {
  failures.push('cli/codegen.md: target list code block is missing');
} else {
  const documentedTargets = new Set([...targetBlock[1].matchAll(/^\s+([\w-]+)\s{2,}/gm)].map((match) => match[1]));
  for (const target of documentedTargets) if (!actualTargets.has(target)) failures.push(`cli/codegen.md: unknown target ${target}`);
  for (const target of actualTargets) if (!documentedTargets.has(target)) failures.push(`cli/codegen.md: missing target ${target}`);
}

if (failures.length) {
  console.error(`Documentation verification failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
  process.exit(1);
}

console.log(`Verified ${docs.length} documentation pages, local links/assets, CLI flags, and ${actualTargets.size} code-generation targets.`);
