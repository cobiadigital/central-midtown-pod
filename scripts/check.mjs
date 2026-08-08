// Pre-merge check for the real repo contents.
//
// The unit tests exercise the code against fixtures. This exercises the code
// against the actual data/show.json and episodes/*.json, which is where a
// phone-authored typo will land. Run in CI on every pull request so a bad
// commit fails the check rather than the deploy.
//
//   node scripts/check.mjs
//
// Exits non-zero for things that break the build or the feed. Episodes held
// back by the publishing gate are normal and reported, not failed.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { buildLibrary } from '../src/data.js';
import { renderFeed } from '../src/feed.js';
import { renderYouTube, renderSocial } from '../src/exports.js';
import { renderEpisodePage, renderHomePage, renderSubscribePage } from '../src/pages.js';
import { renderHealth } from '../src/health.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const notes = [];

function readJson(relative) {
  const path = join(root, relative);
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    errors.push(`${relative}: cannot be read — ${error.message}`);
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    // The single most likely failure from a phone edit: a trailing comma or a
    // smart quote. Point at the line.
    const offset = Number(/position (\d+)/.exec(error.message)?.[1] ?? -1);
    const line = offset >= 0 ? text.slice(0, offset).split('\n').length : null;
    errors.push(`${relative}: not valid JSON${line ? ` (around line ${line})` : ''} — ${error.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 1. Registry and the episodes directory agree
// ---------------------------------------------------------------------------

const registrySource = readFileSync(join(root, 'episodes/registry.js'), 'utf8');
const importedJson = [...registrySource.matchAll(/from\s+'\.\/([^']+\.json)'/g)].map((m) => m[1]);
const importedVtt = [...registrySource.matchAll(/from\s+'\.\/([^']+\.vtt)'/g)].map((m) => m[1]);

const onDisk = readdirSync(join(root, 'episodes'));
const jsonOnDisk = onDisk.filter((name) => name.endsWith('.json'));
const vttOnDisk = onDisk.filter((name) => name.endsWith('.vtt'));

for (const name of jsonOnDisk) {
  if (!importedJson.includes(name)) {
    errors.push(
      `episodes/${name} exists but is not imported in episodes/registry.js, so it will not appear anywhere.`,
    );
  }
}
for (const name of importedJson) {
  if (!jsonOnDisk.includes(name)) {
    errors.push(`episodes/registry.js imports ./${name}, which does not exist. The build will fail.`);
  }
}
for (const name of importedVtt) {
  if (!vttOnDisk.includes(name)) {
    errors.push(`episodes/registry.js imports ./${name}, which does not exist. The build will fail.`);
  }
}
for (const name of vttOnDisk) {
  if (!importedVtt.includes(name)) {
    notes.push(`episodes/${name} is not imported in episodes/registry.js, so no transcript is served for it.`);
  }
}

// ---------------------------------------------------------------------------
// 2. Everything parses
// ---------------------------------------------------------------------------

const showData = readJson('data/show.json');
const registry = [];

for (const name of importedJson.filter((n) => jsonOnDisk.includes(n))) {
  const data = readJson(`episodes/${name}`);
  if (!data) continue;
  const vttName = name.replace(/\.json$/, '.vtt');
  registry.push({
    number: data.number,
    file: `episodes/${name}`,
    data,
    vtt: vttOnDisk.includes(vttName) ? readFileSync(join(root, 'episodes', vttName), 'utf8') : '',
  });
}

if (errors.length > 0) {
  console.error('CHECK FAILED\n');
  for (const error of errors) console.error(`  ${error}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 3. Every route renders without throwing, and the feed is well-formed
// ---------------------------------------------------------------------------

const origin = (showData && showData.link) || 'https://podcast.centralmidtown.org';
const library = buildLibrary({ show: showData, registry });

function attempt(label, fn) {
  try {
    return fn();
  } catch (error) {
    errors.push(`${label} threw: ${error.message}`);
    return null;
  }
}

const feed = attempt('/feed.xml', () =>
  renderFeed({
    show: library.show,
    episodes: library.published,
    origin,
    feedUrl: `${origin}/feed.xml`,
  }),
);

attempt('/', () => renderHomePage({ show: library.show, episodes: library.published, origin }));
attempt('/subscribe', () => renderSubscribePage({ show: library.show, origin }));

for (const episode of library.all) {
  const label = `/episode/${episode.number}`;
  attempt(label, () => renderEpisodePage({ show: library.show, episode, origin }));
  attempt(`${label}/youtube.txt`, () => renderYouTube({ show: library.show, episode, origin }));
  attempt(`${label}/social.txt`, () => renderSocial({ show: library.show, episode, origin }));
}

if (feed) {
  // Cheap well-formedness checks. Anything that survives these and still fails a
  // real validator is a spec problem, not a corrupt-string problem.
  const withoutCdata = feed.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
  const stray = withoutCdata.match(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g);
  if (stray) {
    errors.push(`/feed.xml contains ${stray.length} unescaped & outside CDATA.`);
  }

  const opens = (feed.match(/<!\[CDATA\[/g) || []).length;
  const closes = (feed.match(/\]\]>/g) || []).length;
  if (opens !== closes) {
    errors.push(`/feed.xml has unbalanced CDATA sections (${opens} open, ${closes} close).`);
  }

  // Element nesting. The XML declaration is not matched by this pattern.
  const tagStack = [];
  for (const match of withoutCdata.matchAll(/<(\/?)([a-zA-Z][\w:.-]*)((?:"[^"]*"|[^>"])*?)(\/?)>/g)) {
    const [, closing, name, , selfClosing] = match;
    if (selfClosing) continue;
    if (closing) {
      const open = tagStack.pop();
      if (open !== name) {
        errors.push(`/feed.xml has a mismatched </${name}> (expected </${open ?? 'nothing'}>).`);
        break;
      }
    } else {
      tagStack.push(name);
    }
  }
  if (tagStack.length > 0) {
    errors.push(`/feed.xml leaves <${tagStack[tagStack.length - 1]}> unclosed.`);
  }

  for (const episode of library.published) {
    if (!feed.includes(`length="${episode.audio.bytes}"`)) {
      errors.push(`/feed.xml is missing the enclosure length for episode ${episode.number}.`);
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Report
// ---------------------------------------------------------------------------

console.log(renderHealth({ library, origin }));

if (notes.length > 0) {
  console.log('NOTES');
  console.log('-'.repeat(60));
  for (const note of notes) console.log(`  ${note}`);
  console.log('');
}

if (errors.length > 0) {
  console.error('CHECK FAILED\n');
  for (const error of errors) console.error(`  ${error}`);
  process.exit(1);
}

console.log(
  `CHECK PASSED — ${library.all.length} episode(s) registered, ${library.published.length} publishable.`,
);
