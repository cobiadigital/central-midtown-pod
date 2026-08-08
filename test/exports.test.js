import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildLibrary } from '../src/data.js';
import { renderYouTube, renderSocial } from '../src/exports.js';
import { formatTimecode, markdownToPlain } from '../src/util.js';
import * as fx from './fixtures.js';

const ORIGIN = 'https://podcast.centralmidtown.org';

function episodeFor(data) {
  const lib = buildLibrary({ show: fx.show, registry: fx.registryOf(data), now: fx.NOW });
  return { show: lib.show, episode: lib.byNumber(data.number) };
}

test('youtube.txt follows the brief layout in order', () => {
  const { show, episode } = episodeFor(fx.valid);
  const text = renderYouTube({ show, episode, origin: ORIGIN });

  const expected = [
    'A painter on twelve years of the same studio.',
    '',
    'CHAPTERS',
    '0:00 Intro',
    '1:35 The building',
    '1:02:00 Where to find the work',
    '',
    'Full notes with a link: https://example.org/studio and emphasis.',
    '',
    '- One bullet',
    '- Two bullet',
    '',
    'GUEST',
    'Rae Adkins — A painter working out of the third floor.',
    'Artist page: https://example.org/rae',
    'Instagram: https://example.org/rae-ig',
    '',
    'LISTEN',
    `Website: ${ORIGIN}/episode/2`,
    'Apple Podcasts: https://podcasts.apple.com/example',
    'Spotify: https://open.spotify.com/show/example',
    `All platforms: ${ORIGIN}/subscribe`,
    '',
    'Support Central Midtown: https://centralmidtown.org/give',
    '',
    'CREDITS',
    'Host: A. Host',
    'Editor: B. Editor',
    'Music: C. Composer',
    '',
  ].join('\n');

  assert.equal(text, expected);
});

test('youtube.txt contains no markdown artifacts', () => {
  const { show, episode } = episodeFor(fx.valid);
  const text = renderYouTube({ show, episode, origin: ORIGIN });

  assert.ok(!text.includes('**'));
  assert.ok(!/\[[^\]]*\]\(/.test(text));
  assert.ok(!text.includes('#'));
  assert.ok(!text.includes('`'));
});

test('the first chapter timestamp is 0:00 so YouTube renders the list', () => {
  const { show, episode } = episodeFor(fx.valid);
  const text = renderYouTube({ show, episode, origin: ORIGIN });
  const chapterLine = text.split('\n')[text.split('\n').indexOf('CHAPTERS') + 1];
  assert.match(chapterLine, /^0:00 /);
});

test('timecodes switch to h:mm:ss past an hour', () => {
  assert.equal(formatTimecode(0), '0:00');
  assert.equal(formatTimecode(95), '1:35');
  assert.equal(formatTimecode(3599), '59:59');
  assert.equal(formatTimecode(3600), '1:00:00');
  assert.equal(formatTimecode(3720), '1:02:00');
});

test('empty sections are dropped rather than emitted blank', () => {
  const { show, episode } = episodeFor({
    ...fx.valid,
    chapters: [],
    guests: [],
    credits: { host: '', editor: '', music: '' },
    cta: { label: '', url: '' },
  });
  const text = renderYouTube({ show, episode, origin: ORIGIN });

  assert.ok(!text.includes('CHAPTERS'));
  assert.ok(!text.includes('GUEST'));
  assert.ok(!text.includes('CREDITS'));
  assert.ok(text.includes('LISTEN'));
  assert.ok(!/\n\n\n/.test(text));
});

test('missing directory links are omitted, not left as empty labels', () => {
  const lib = buildLibrary({
    show: { ...fx.show, platforms: [] },
    registry: fx.registryOf(fx.valid),
    now: fx.NOW,
  });
  const text = renderYouTube({ show: lib.show, episode: lib.byNumber(2), origin: ORIGIN });
  assert.ok(!text.includes('Apple Podcasts:'));
  assert.ok(text.includes('All platforms:'));
});

test('social.txt leads with the pull quote and links to both places', () => {
  const { show, episode } = episodeFor(fx.valid);
  const text = renderSocial({ show, episode, origin: ORIGIN });

  assert.ok(text.startsWith('"You do not get the room, you get the door."'));
  assert.ok(text.includes('— Rae Adkins, Episode 2: A Room With a Door'));
  assert.ok(text.includes(`Listen: ${ORIGIN}/episode/2`));
  assert.ok(text.includes('Watch: https://youtu.be/abc123'));
  assert.ok(text.includes('#MobileAlabama #painting'));
});

test('markdown flattening turns links into "label: url"', () => {
  assert.equal(
    markdownToPlain('See the [studio tour](https://example.org/t) for more.'),
    'See the studio tour: https://example.org/t for more.',
  );
});
