// Plain-text export routes.
//
// These exist to kill copy-paste work: the publisher opens the URL on a phone,
// selects all, pastes into YouTube Studio or a social composer. Output is
// deliberately free of markdown — YouTube renders none of it and stray
// asterisks read as typos.

import { formatTimecode, markdownToPlain } from './util.js';
import { episodePath } from './data.js';

/** Find a platform URL from show.json by name, case-insensitively. */
function platformUrl(show, name) {
  const match = show.platforms.find(
    (platform) => platform.name.toLowerCase() === name.toLowerCase(),
  );
  return match ? match.url : '';
}

/** Join sections with exactly one blank line between them, dropping empties. */
function joinSections(sections) {
  return `${sections.filter((section) => section && section.trim()).join('\n\n')}\n`;
}

/**
 * Paste-ready YouTube description block.
 *
 * Layout follows PROJECT_BRIEF.md section 5 exactly. Sections with no data are
 * omitted rather than emitted with blank values.
 */
export function renderYouTube({ show, episode, origin }) {
  const url = `${origin}${episodePath(episode)}`;
  const sections = [];

  sections.push(episode.shortDescription);

  if (episode.chapters.length > 0) {
    const lines = ['CHAPTERS'];
    for (const chapter of episode.chapters) {
      if (chapter.start === null) continue;
      lines.push(`${formatTimecode(chapter.start)} ${chapter.title}`.trimEnd());
    }
    sections.push(lines.join('\n'));
  }

  sections.push(markdownToPlain(episode.showNotes));

  for (const guest of episode.guests) {
    if (!guest.name && !guest.bio) continue;
    const lines = ['GUEST'];
    lines.push(guest.bio ? `${guest.name} — ${guest.bio}` : guest.name);
    for (const link of guest.links) {
      lines.push(link.label ? `${link.label}: ${link.url}` : link.url);
    }
    sections.push(lines.join('\n'));
  }

  const listen = ['LISTEN', `Website: ${url}`];
  const apple = platformUrl(show, 'Apple Podcasts');
  const spotify = platformUrl(show, 'Spotify');
  if (apple) listen.push(`Apple Podcasts: ${apple}`);
  if (spotify) listen.push(`Spotify: ${spotify}`);
  listen.push(`All platforms: ${origin}/subscribe`);
  sections.push(listen.join('\n'));

  if (episode.cta.label && episode.cta.url) {
    sections.push(`${episode.cta.label}: ${episode.cta.url}`);
  }

  const credits = ['CREDITS'];
  if (episode.credits.host) credits.push(`Host: ${episode.credits.host}`);
  if (episode.credits.editor) credits.push(`Editor: ${episode.credits.editor}`);
  if (episode.credits.music) credits.push(`Music: ${episode.credits.music}`);
  if (credits.length > 1) sections.push(credits.join('\n'));

  return joinSections(sections);
}

/** `Episode 3: Title | Central Midtown` — the YouTube title convention. */
export function renderYouTubeTitle({ show, episode }) {
  return `Episode ${episode.number}: ${episode.title} | ${show.title}`;
}

const HASHTAG_LIMIT = 5;

function hashtags(keywords) {
  return keywords
    .slice(0, HASHTAG_LIMIT)
    .map((keyword) => `#${keyword.replace(/[^A-Za-z0-9]+(.)?/g, (m, next) => (next ? next.toUpperCase() : ''))}`)
    .filter((tag) => tag.length > 1)
    .join(' ');
}

/**
 * Short promo copy built around the pull quote.
 *
 * The brief specifies "pull quote plus short promo copy" without fixing a
 * layout, so this is a proposal: quote, attribution, hook, links, tags.
 */
export function renderSocial({ show, episode, origin }) {
  const url = `${origin}${episodePath(episode)}`;
  const sections = [];

  if (episode.pullQuote) {
    sections.push(`"${episode.pullQuote.replace(/^["“]|["”]$/g, '')}"`);
  }

  const named = episode.guests.filter((guest) => guest.name).map((guest) => guest.name);
  const attribution = named.length > 0 ? `— ${named.join(' & ')}` : `— ${show.title}`;
  sections.push(`${attribution}, Episode ${episode.number}: ${episode.title}`);

  if (episode.shortDescription) sections.push(episode.shortDescription);

  const links = [`Listen: ${url}`];
  if (episode.video.youtubeId) links.push(`Watch: https://youtu.be/${episode.video.youtubeId}`);
  if (episode.cta.label && episode.cta.url) links.push(`${episode.cta.label}: ${episode.cta.url}`);
  sections.push(links.join('\n'));

  const tags = hashtags(episode.keywords);
  if (tags) sections.push(tags);

  return joinSections(sections);
}
