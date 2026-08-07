import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildLibrary, normalizeShow, auditShow } from '../src/data.js';
import { renderEpisodePage, renderHomePage, renderNotFound, vttToParagraphs } from '../src/pages.js';
import { renderHealth, renderFatalConfigError } from '../src/health.js';
import * as fx from './fixtures.js';

const ORIGIN = 'https://podcast.centralmidtown.org';

function libraryOf(...episodes) {
  return buildLibrary({ show: fx.show, registry: fx.registryOf(...episodes), now: fx.NOW });
}

test('a gated episode still renders, with the reason named on the page', () => {
  const lib = libraryOf(fx.noAudioBytes);
  const html = renderEpisodePage({
    show: lib.show,
    episode: lib.byNumber(fx.noAudioBytes.number),
    origin: ORIGIN,
  });

  assert.ok(html.includes('banner-blocked'));
  assert.ok(html.includes('Not in the feed'));
  assert.ok(html.includes('audio.bytes'));
  assert.ok(html.includes('episodes/003.json'));
});

test('a future-dated episode says scheduled, not broken', () => {
  const lib = libraryOf(fx.futureDated);
  const html = renderEpisodePage({
    show: lib.show,
    episode: lib.byNumber(fx.futureDated.number),
    origin: ORIGIN,
  });

  assert.ok(html.includes('banner-scheduled'));
  assert.ok(html.includes('Scheduled, not yet published'));
  assert.ok(!html.includes('banner-blocked'));
});

test('a published episode has no banner and carries PodcastEpisode JSON-LD', () => {
  const lib = libraryOf(fx.valid);
  const html = renderEpisodePage({ show: lib.show, episode: lib.byNumber(2), origin: ORIGIN });

  assert.ok(!html.includes('banner-'));

  const match = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(match, 'no JSON-LD block');
  const data = JSON.parse(match[1]);
  assert.equal(data['@type'], 'PodcastEpisode');
  assert.equal(data.url, `${ORIGIN}/episode/2`);
  assert.equal(data.episodeNumber, 2);
  assert.equal(data.duration, 'PT3012S');
  assert.equal(data.partOfSeries.webFeed, `${ORIGIN}/feed.xml`);
  assert.deepEqual(data.actor, [{ '@type': 'Person', name: 'Rae Adkins' }]);
});

test('guest links and chapters are present and reachable', () => {
  const lib = libraryOf(fx.valid);
  const html = renderEpisodePage({ show: lib.show, episode: lib.byNumber(2), origin: ORIGIN });

  assert.ok(html.includes('href="https://example.org/rae"'));
  assert.ok(html.includes('href="https://example.org/rae-ig"'));
  assert.ok(html.includes('class="chapter-jump" data-start="95"'));
  assert.ok(html.includes('<audio id="episode-audio" controls'));
  assert.ok(html.includes('href="/subscribe"'));
});

test('the transcript is collapsed behind a details element', () => {
  const lib = libraryOf(fx.valid);
  const html = renderEpisodePage({ show: lib.show, episode: lib.byNumber(2), origin: ORIGIN });

  assert.ok(html.includes('<details class="transcript-details">'));
  assert.ok(!html.includes('<details class="transcript-details" open>'));
  // The transcript must come after the guest block, not before it.
  assert.ok(html.indexOf('class="guests"') < html.indexOf('class="transcript"'));
});

test('VTT parsing drops cue numbers and timings', () => {
  assert.deepEqual(vttToParagraphs(fx.vtt), [
    'The door was already there.',
    'We just kept walking through it.',
  ]);
  assert.deepEqual(vttToParagraphs(''), []);
  assert.deepEqual(vttToParagraphs(null), []);
});

test('titles containing markup are escaped on the page', () => {
  const lib = libraryOf({ ...fx.valid, title: '<script>alert(1)</script>' });
  const html = renderEpisodePage({ show: lib.show, episode: lib.byNumber(2), origin: ORIGIN });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('the home index shows only published episodes', () => {
  const lib = libraryOf(fx.valid, fx.futureDated, fx.noAudioBytes);
  const html = renderHomePage({ show: lib.show, episodes: lib.published, origin: ORIGIN });

  assert.ok(html.includes('A Room With a Door'));
  assert.equal((html.match(/class="episode-card"/g) || []).length, 1);
});

test('404 links back to the index and to recent episodes', () => {
  const lib = libraryOf(fx.valid);
  const html = renderNotFound({ show: lib.show, origin: ORIGIN, episodes: lib.published });
  assert.ok(html.includes('href="/"'));
  assert.ok(html.includes('/episode/2'));
});

test('health names every gate failure and its field', () => {
  const lib = libraryOf(fx.valid, fx.noAudioBytes, fx.unsignedRelease, fx.futureDated);
  const text = renderHealth({ library: lib, origin: ORIGIN, now: fx.NOW });

  assert.ok(text.includes('[IN FEED] Episode 2'));
  assert.ok(text.includes('[HELD BACK] Episode 3'));
  assert.ok(text.includes('audio.bytes:'));
  assert.ok(text.includes('[HELD BACK] Episode 4'));
  assert.ok(text.includes('guests[0].releaseSigned:'));
  assert.ok(text.includes('[SCHEDULED] Episode 5'));
  assert.ok(text.includes('4 registered, 1 in the feed, 3 held back'));
  assert.ok(!/<[a-z]/.test(text), 'health output must be plain text');
});

test('health reports a clean bill when nothing is wrong', () => {
  const lib = libraryOf(fx.valid);
  const text = renderHealth({ library: lib, origin: ORIGIN, now: fx.NOW });
  assert.ok(text.includes('No blocking problems'));
});

test('a missing show.json produces a legible error, not a stack trace', () => {
  const text = renderFatalConfigError(auditShow(normalizeShow(null)));
  assert.ok(text.includes('data/show.json'));
  assert.ok(text.includes('GitHub web editor'));
  assert.ok(!text.includes('at Object.'));
  assert.ok(!/<[a-z]/.test(text));
});
