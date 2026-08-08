import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildLibrary } from '../src/data.js';
import { renderFeed, renderChapters } from '../src/feed.js';
import { formatRfc2822, parseIsoDate } from '../src/util.js';
import * as fx from './fixtures.js';

const ORIGIN = 'https://podcast.centralmidtown.org';

function feedFor(...episodes) {
  const lib = buildLibrary({ show: fx.show, registry: fx.registryOf(...episodes), now: fx.NOW });
  return renderFeed({
    show: lib.show,
    episodes: lib.published,
    origin: ORIGIN,
    feedUrl: `${ORIGIN}/feed.xml`,
    now: fx.NOW,
  });
}

test('channel carries every field Apple requires', () => {
  const xml = feedFor(fx.valid);

  for (const needle of [
    '<title>Central Midtown</title>',
    `<link>${ORIGIN}</link>`,
    '<language>en-us</language>',
    '<copyright>© 2026 Central Midtown</copyright>',
    '<itunes:author>Central Midtown</itunes:author>',
    '<itunes:type>episodic</itunes:type>',
    '<itunes:explicit>false</itunes:explicit>',
    '<itunes:image href="https://podcast.centralmidtown.org/cover-3000.jpg"/>',
    '<itunes:name>Central Midtown</itunes:name>',
    '<itunes:email>podcast@centralmidtown.org</itunes:email>',
    '<podcast:guid>57fd3b76-557e-4fd6-9edf-95575edc46b3</podcast:guid>',
    `<atom:link href="${ORIGIN}/feed.xml" rel="self" type="application/rss+xml"/>`,
    '<lastBuildDate>',
    '<itunes:category text="Society &amp; Culture">',
    '<itunes:category text="Places &amp; Travel"/>',
  ]) {
    assert.ok(xml.includes(needle), `missing: ${needle}`);
  }
});

test('all four namespaces are declared', () => {
  const xml = feedFor(fx.valid);
  for (const ns of [
    'xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"',
    'xmlns:atom="http://www.w3.org/2005/Atom"',
    'xmlns:content="http://purl.org/rss/1.0/modules/content/"',
    'xmlns:podcast="https://podcastindex.org/namespace/1.0"',
  ]) {
    assert.ok(xml.includes(ns), `missing namespace: ${ns}`);
  }
});

test('item carries the enclosure, guid, duration, and Podcasting 2.0 tags', () => {
  const xml = feedFor(fx.valid);

  assert.ok(xml.includes('<guid isPermaLink="false">11111111-2222-4333-8444-555555555555</guid>'));
  assert.ok(
    xml.includes(
      '<enclosure url="https://media.podcast.centralmidtown.org/002.mp3" type="audio/mpeg" length="48210944"/>',
    ),
  );
  assert.ok(xml.includes('<itunes:duration>3012</itunes:duration>'));
  assert.ok(xml.includes('<itunes:episode>2</itunes:episode>'));
  assert.ok(xml.includes('<itunes:season>1</itunes:season>'));
  assert.ok(xml.includes('<itunes:episodeType>full</itunes:episodeType>'));
  assert.ok(xml.includes(`<podcast:transcript url="${ORIGIN}/episode/2/transcript.vtt" type="text/vtt"`));
  assert.ok(
    xml.includes(
      `<podcast:chapters url="${ORIGIN}/episode/2/chapters.json" type="application/json+chapters"/>`,
    ),
  );
});

test('show notes reach content:encoded as HTML inside CDATA', () => {
  const xml = feedFor(fx.valid);
  const match = /<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/.exec(xml);
  assert.ok(match, 'content:encoded not found');
  assert.ok(match[1].includes('<a href="https://example.org/studio" rel="noopener">link</a>'));
  assert.ok(match[1].includes('<strong>emphasis</strong>'));
  assert.ok(match[1].includes('<ul><li>One bullet</li><li>Two bullet</li></ul>'));
});

test('gated and future-dated episodes never reach the feed', () => {
  const xml = feedFor(fx.valid, fx.noAudioBytes, fx.unsignedRelease, fx.futureDated);
  assert.equal((xml.match(/<item>/g) || []).length, 1);
  assert.ok(!xml.includes('length="0"'));
});

test('pubDate is RFC-2822 in the offset the publisher wrote', () => {
  const xml = feedFor(fx.valid);
  assert.ok(xml.includes('<pubDate>Wed, 12 Aug 2026 09:00:00 -0500</pubDate>'), xml.slice(0, 400));
});

test('RFC-2822 formatting handles UTC and negative offsets', () => {
  const utc = parseIsoDate('2026-01-05T00:00:00Z');
  assert.equal(formatRfc2822(utc.ms, utc.offsetMinutes), 'Mon, 05 Jan 2026 00:00:00 +0000');

  const offset = parseIsoDate('2026-01-05T00:00:00-05:00');
  assert.equal(formatRfc2822(offset.ms, offset.offsetMinutes), 'Mon, 05 Jan 2026 00:00:00 -0500');
});

test('markup in titles is XML-escaped, not injected', () => {
  const xml = feedFor({ ...fx.valid, title: 'Ampersands & <angles>' });
  assert.ok(xml.includes('<title>Ampersands &amp; &lt;angles&gt;</title>'));
  assert.ok(!xml.includes('<angles>'));
});

test('a CDATA terminator in show notes is split rather than breaking the feed', () => {
  const xml = feedFor({ ...fx.valid, showNotes: 'Careful: ]]> right there.' });
  assert.ok(!/\]\]>\s*right there/.test(xml));
  assert.equal((xml.match(/<\/content:encoded>/g) || []).length, 1);
});

test('chapters render as a Podcasting 2.0 chapters document', () => {
  const lib = buildLibrary({ show: fx.show, registry: fx.registryOf(fx.valid), now: fx.NOW });
  const chapters = JSON.parse(renderChapters(lib.byNumber(2)));
  assert.equal(chapters.version, '1.2.0');
  assert.deepEqual(chapters.chapters[0], { startTime: 0, title: 'Intro' });
  assert.equal(chapters.chapters.length, 3);
});

test('an empty feed is still well-formed', () => {
  const xml = feedFor(fx.noAudioBytes);
  assert.ok(xml.includes('<channel>') && xml.includes('</channel>'));
  assert.ok(!xml.includes('<item>'));
});
