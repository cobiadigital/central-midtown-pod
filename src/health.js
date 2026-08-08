// /health — the route the maintainer opens on a phone after every commit.
//
// Plain text, no markup, no colour, no scrolling sideways. Every problem names
// the file and the field so the fix is a single edit in the GitHub web editor.

import { formatDisplayDate, formatTimecode } from './util.js';

const RULE = '-'.repeat(60);

function section(title, lines) {
  return [title, RULE, ...(lines.length > 0 ? lines : ['(nothing to report)']), ''].join('\n');
}

/**
 * Build the report.
 *
 * `assetProblems` comes from the caller because checking static assets needs a
 * subrequest, which does not belong in a pure function.
 */
export function renderHealth({ library, origin, now = Date.now(), assetProblems = [] }) {
  const { show, showProblems, structural, all, published } = library;

  const blocking = showProblems.filter((problem) => problem.severity === 'blocking');
  const warnings = showProblems.filter((problem) => problem.severity !== 'blocking');
  const gated = all.filter((episode) => !episode.gate.published);

  const out = [];

  out.push(section(`CENTRAL MIDTOWN PODCAST — HEALTH`, [
    `Checked:        ${new Date(now).toUTCString()}`,
    `Origin:         ${origin}`,
    `Feed:           ${origin}/feed.xml`,
    `Episodes:       ${all.length} registered, ${published.length} in the feed, ${gated.length} held back`,
    `Show config:    ${blocking.length} blocking, ${warnings.length} warning${warnings.length === 1 ? '' : 's'}`,
  ]));

  out.push(section('SHOW — data/show.json', [
    ...blocking.map((problem) => `BLOCKING  ${problem.message}`),
    ...warnings.map((problem) => `WARNING   ${problem.message}`),
    ...assetProblems.map((problem) => `WARNING   ${problem}`),
  ]));

  if (structural.length > 0) {
    out.push(section('REGISTRY', structural.map((message) => `BLOCKING  ${message}`)));
  }

  const episodeLines = [];
  if (all.length === 0) {
    episodeLines.push('No episodes registered yet.');
    episodeLines.push('Add episodes/{nnn}.json and register it in episodes/registry.js.');
  }

  for (const episode of all) {
    const label = `Episode ${episode.number ?? '?'} — ${episode.title || '(untitled)'}`;
    let status;
    if (episode.gate.published) status = 'IN FEED';
    else if (episode.gate.scheduled && episode.gate.reasons.length === 0) status = 'SCHEDULED';
    else status = 'HELD BACK';

    episodeLines.push(`[${status}] ${label}`);
    episodeLines.push(`  file:     ${episode.file}`);
    episodeLines.push(
      `  pubDate:  ${
        episode.pubDateMs === null
          ? '(unparseable)'
          : `${formatDisplayDate(episode.pubDateMs, episode.pubDateOffset)}  (${episode.pubDateRaw})`
      }`,
    );
    if (episode.audio.durationSeconds) {
      episodeLines.push(
        `  audio:    ${episode.audio.bytes ?? 0} bytes, ${formatTimecode(episode.audio.durationSeconds)}`,
      );
    }
    episodeLines.push(`  page:     ${origin}/episode/${episode.number ?? '?'}`);

    if (episode.gate.scheduled && episode.gate.reasons.length === 0) {
      episodeLines.push('  reason:   pubDate is in the future. It will appear automatically on that date.');
    }
    for (const reason of episode.gate.reasons) {
      episodeLines.push(`  BLOCKING  ${reason.field}: ${reason.message}`);
    }
    for (const warning of episode.warnings) {
      episodeLines.push(`  WARNING   ${warning}`);
    }
    episodeLines.push('');
  }

  out.push(section('EPISODES', episodeLines));

  const totalBlocking =
    blocking.length + structural.length + all.reduce((sum, ep) => sum + ep.gate.reasons.length, 0);

  out.push(
    section('SUMMARY', [
      totalBlocking === 0
        ? 'No blocking problems. The feed is safe to submit.'
        : `${totalBlocking} blocking problem${totalBlocking === 1 ? '' : 's'}. Fix these before submitting the feed anywhere.`,
      '',
      'Validate the feed at:',
      '  https://podba.se/validate',
      '  https://www.castfeedvalidator.com',
    ]),
  );

  return out.join('\n');
}

/**
 * The message shown when show.json is unusable. This is the "legible error, not
 * a stack trace" case: it names the file, the fields, and where to look.
 */
export function renderFatalConfigError(problems) {
  return [
    'CENTRAL MIDTOWN PODCAST — CONFIGURATION ERROR',
    RULE,
    '',
    'The show cannot render because data/show.json is missing required values.',
    'Edit data/show.json in the GitHub web editor and commit. Workers Builds will redeploy.',
    '',
    ...problems.map((problem) => `  - ${problem.message}`),
    '',
    'Everything else is fine. Only these fields are blocking.',
    '',
  ].join('\n');
}
