import {
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { extname, join } from 'node:path';

const DIST = 'dist';
const OLD_DIR = join(DIST, 'assets', 'node_modules');
const NEW_DIR = join(DIST, 'assets', 'pkgs');
const OLD_REF = 'assets/node_modules/';
const NEW_REF = 'assets/pkgs/';
const TEXT_EXT = new Set(['.js', '.mjs', '.json', '.css', '.html']);

const textFiles = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (TEXT_EXT.has(extname(entry.name))) textFiles.push(path);
  }
};
walk(DIST);

const moved = existsSync(OLD_DIR);
if (moved) {
  if (existsSync(NEW_DIR)) {
    console.error(
      `fix-pages-assets: refusing to move into existing ${NEW_DIR}`,
    );
    process.exit(1);
  }
  renameSync(OLD_DIR, NEW_DIR);
}

let rewritten = 0;
for (const file of textFiles) {
  const source = readFileSync(file, 'utf8');
  if (!source.includes(OLD_REF)) continue;
  writeFileSync(file, source.replaceAll(OLD_REF, NEW_REF));
  rewritten += 1;
}

if (rewritten > 0 && !moved) {
  console.error(
    `fix-pages-assets: ${rewritten} file(s) reference ${OLD_REF} but ${OLD_DIR} does not exist`,
  );
  process.exit(1);
}

console.log(
  `fix-pages-assets: ${moved ? `moved ${OLD_DIR} -> ${NEW_DIR}` : `no ${OLD_DIR}`}, rewrote ${rewritten} file(s)`,
);
