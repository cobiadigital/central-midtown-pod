import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildLibrary, normalizeShow, auditShow } from '../src/data.js';
import * as fx from './fixtures.js';

function library(...episodes) {
  return buildLibrary({ show: fx.show, registry: fx.registryOf(...episodes), now: fx.NOW });
}

test('a complete episode is published', () => {
  const lib = library(fx.valid);
  assert.equal(lib.published.length, 1);
  assert.equal(lib.published[0].gate.reasons.length, 0);
});

test('audio.bytes of 0 holds the episode out of the feed and names the field', () => {
  const lib = library(fx.valid, fx.noAudioBytes);
  assert.deepEqual(lib.published.map((e) => e.number), [fx.valid.number]);

  const held = lib.byNumber(fx.noAudioBytes.number);
  assert.equal(held.gate.published, false);
  assert.ok(held.gate.reasons.some((r) => r.field === 'audio.bytes'));
});

test('an unsigned guest release holds the episode out of the feed', () => {
  const lib = library(fx.unsignedRelease);
  assert.equal(lib.published.length, 0);

  const held = lib.byNumber(fx.unsignedRelease.number);
  const reason = held.gate.reasons.find((r) => r.field === 'guests[0].releaseSigned');
  assert.ok(reason);
  assert.match(reason.message, /Rae Adkins/);
});

test('a future pubDate is excluded from the feed and index but is not an error', () => {
  const lib = library(fx.futureDated);
  assert.equal(lib.published.length, 0);

  const held = lib.byNumber(fx.futureDated.number);
  assert.equal(held.gate.scheduled, true);
  assert.equal(held.gate.reasons.length, 0);
});

test('a missing guid and an unparseable pubDate are both caught', () => {
  const lib = library({ ...fx.valid, guid: '', pubDate: 'last tuesday' });
  const held = lib.byNumber(fx.valid.number);
  const fields = held.gate.reasons.map((r) => r.field);
  assert.ok(fields.includes('guid'));
  assert.ok(fields.includes('pubDate'));
});

test('duplicate episode numbers and guids are reported structurally', () => {
  const lib = buildLibrary({
    show: fx.show,
    registry: [
      { number: 2, file: 'episodes/002.json', data: fx.valid },
      { number: 2, file: 'episodes/002-copy.json', data: fx.valid },
    ],
    now: fx.NOW,
  });
  assert.ok(lib.structural.some((m) => /Duplicate episode number 2/.test(m)));
  assert.ok(lib.structural.some((m) => /Duplicate guid/.test(m)));
});

test('episodes sort newest first', () => {
  const older = { ...fx.valid, number: 1, guid: 'dddd1111-2222-4333-8444-555555555555', pubDate: '2026-07-01T09:00:00-05:00' };
  const lib = library(older, fx.valid);
  assert.deepEqual(lib.published.map((e) => e.number), [2, 1]);
});

test('a missing show.json degrades to named problems, not a crash', () => {
  const show = normalizeShow(undefined);
  const problems = auditShow(show);
  assert.equal(show.title, '');
  assert.ok(problems.some((p) => p.field === 'title' && p.severity === 'blocking'));
  assert.ok(problems.some((p) => p.field === 'owner.email'));
  assert.ok(problems.every((p) => typeof p.message === 'string' && p.message.includes('show.json')));
});

test('provisional fields are reported as blocking until confirmed', () => {
  const problems = auditShow(normalizeShow({ ...fx.show, provisional: ['title'] }));
  const flagged = problems.find((p) => p.field === 'title');
  assert.ok(flagged);
  assert.match(flagged.message, /provisional placeholder/);
});
