// HTML pages.
//
// NOTE: this is the semantic layer only. Markup, hierarchy, JSON-LD, and
// accessibility are final; the visual design pass (PROJECT_BRIEF.md section 8)
// is pending review of the token plan and layout sketch, and will land as CSS
// plus small markup adjustments in a follow-up commit.

import {
  escapeHtml,
  formatDisplayDate,
  formatTimecode,
  markdownToHtml,
  markdownToSingleLine,
} from './util.js';
import { episodePath } from './data.js';

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

function layout({ title, description, canonical, origin, body, jsonLd = null, bodyClass = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<link rel="alternate" type="application/rss+xml" title="RSS" href="${escapeHtml(origin)}/feed.xml">
<link rel="stylesheet" href="/styles.css">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta name="twitter:card" content="summary_large_image">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ''}>
<a class="skip-link" href="#main">Skip to content</a>
${body}
</body>
</html>
`;
}

function siteHeader(show) {
  return `<header class="site-header">
  <a class="site-title" href="/">${escapeHtml(show.title || 'Central Midtown')}</a>
  <nav aria-label="Primary">
    <a href="/">Episodes</a>
    <a href="/subscribe">Subscribe</a>
    <a href="/feed.xml">RSS</a>
  </nav>
</header>`;
}

function siteFooter(show) {
  return `<footer class="site-footer">
  <p>${escapeHtml(show.copyright || '')}</p>
  <p><a href="/feed.xml">RSS feed</a> · <a href="/subscribe">All platforms</a></p>
</footer>`;
}

function subscribeList(show, { heading = 'Subscribe' } = {}) {
  const withUrls = show.platforms.filter((platform) => platform.url);
  const items = withUrls
    .map(
      (platform) =>
        `<li><a class="platform" href="${escapeHtml(platform.url)}">${escapeHtml(platform.name)}</a></li>`,
    )
    .join('\n    ');

  return `<section class="subscribe" aria-labelledby="subscribe-heading">
  <h2 id="subscribe-heading">${escapeHtml(heading)}</h2>
  <ul class="platform-list">
    ${items || '<li class="empty">Directory links are added to data/show.json once each submission is approved.</li>'}
    <li><a class="platform" href="/feed.xml">RSS feed</a></li>
  </ul>
</section>`;
}

// ---------------------------------------------------------------------------
// Transcript
// ---------------------------------------------------------------------------

const TIMESTAMP_LINE = /-->/;

/** Pull the spoken lines out of a WebVTT file, dropping cue timings and IDs. */
export function vttToParagraphs(vtt) {
  if (typeof vtt !== 'string' || !vtt.trim()) return [];

  return vtt
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length === 0) return '';
      if (/^(WEBVTT|NOTE|STYLE|REGION)\b/.test(lines[0])) return '';

      // Everything before the timing line is a cue identifier or settings.
      const timing = lines.findIndex((line) => TIMESTAMP_LINE.test(line));
      if (timing === -1) return '';

      return lines
        .slice(timing + 1)
        .join(' ')
        .replace(/<[^>]+>/g, '')
        .trim();
    })
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Episode page
// ---------------------------------------------------------------------------

function gateBanner(episode) {
  const { gate } = episode;
  if (gate.published) return '';

  if (gate.scheduled && gate.reasons.length === 0) {
    return `<div class="banner banner-scheduled" role="status">
  <p><strong>Scheduled, not yet published.</strong> This episode appears in the feed automatically on ${escapeHtml(
    formatDisplayDate(episode.pubDateMs, episode.pubDateOffset),
  )}.</p>
</div>`;
  }

  const items = gate.reasons
    .map((reason) => `<li><code>${escapeHtml(reason.field)}</code> — ${escapeHtml(reason.message)}</li>`)
    .join('\n    ');

  return `<div class="banner banner-blocked" role="alert">
  <p><strong>Not in the feed.</strong> This is a preview. Fix the following in <code>${escapeHtml(
    episode.file,
  )}</code>:</p>
  <ul>
    ${items}
  </ul>
  ${gate.scheduled ? '<p>Its publish date is also still in the future.</p>' : ''}
</div>`;
}

function chaptersBlock(episode) {
  if (episode.chapters.length === 0) return '';

  const items = episode.chapters
    .filter((chapter) => chapter.start !== null)
    .map(
      (chapter) =>
        `<li><button type="button" class="chapter-jump" data-start="${chapter.start}">` +
        `<span class="chapter-time">${escapeHtml(formatTimecode(chapter.start))}</span> ` +
        `<span class="chapter-title">${escapeHtml(chapter.title)}</span></button></li>`,
    )
    .join('\n    ');

  return `<section class="chapters" aria-labelledby="chapters-heading">
  <h2 id="chapters-heading">Chapters</h2>
  <ol class="chapter-list">
    ${items}
  </ol>
</section>`;
}

function guestBlock(episode) {
  if (episode.guests.length === 0) return '';

  const cards = episode.guests
    .map((guest) => {
      const links = guest.links
        .map(
          (link) =>
            `<li><a class="guest-link" href="${escapeHtml(link.url)}" rel="noopener">${escapeHtml(
              link.label || link.url,
            )}</a></li>`,
        )
        .join('\n        ');

      return `<article class="guest">
      ${
        guest.headshot
          ? `<img class="guest-photo" src="${escapeHtml(guest.headshot)}" alt="${escapeHtml(
              guest.headshotAlt || `${guest.name}`,
            )}" width="320" height="320" loading="lazy">`
          : ''
      }
      <div class="guest-body">
        <h3 class="guest-name">${escapeHtml(guest.name)}${
          guest.pronouns ? ` <span class="guest-pronouns">(${escapeHtml(guest.pronouns)})</span>` : ''
        }</h3>
        ${guest.bio ? `<p class="guest-bio">${escapeHtml(guest.bio)}</p>` : ''}
        ${links ? `<ul class="guest-links">\n        ${links}\n      </ul>` : ''}
      </div>
    </article>`;
    })
    .join('\n    ');

  const heading = episode.guests.length === 1 ? 'Guest' : 'Guests';

  return `<section class="guests" aria-labelledby="guests-heading">
  <h2 id="guests-heading">${heading}</h2>
  ${cards}
</section>`;
}

function transcriptBlock(episode) {
  const paragraphs = vttToParagraphs(episode.transcriptVtt);
  if (paragraphs.length === 0) return '';

  return `<section class="transcript" aria-labelledby="transcript-heading">
  <h2 id="transcript-heading">Transcript</h2>
  <details class="transcript-details">
    <summary>Read the transcript</summary>
    <div class="transcript-body">
      ${paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('\n      ')}
    </div>
  </details>
  <p><a href="${escapeHtml(episodePath(episode))}/transcript.vtt">Download the .vtt file</a></p>
</section>`;
}

function episodeJsonLd({ show, episode, origin }) {
  const url = `${origin}${episodePath(episode)}`;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'PodcastEpisode',
    url,
    name: episode.title,
    episodeNumber: episode.number,
    description: episode.shortDescription || markdownToSingleLine(episode.showNotes, 300),
    datePublished: episode.pubDateRaw || undefined,
    partOfSeries: {
      '@type': 'PodcastSeries',
      name: show.title,
      url: origin,
      webFeed: `${origin}/feed.xml`,
    },
  };

  if (episode.season !== null) {
    data.partOfSeason = { '@type': 'PodcastSeason', seasonNumber: episode.season };
  }
  if (episode.audio.url) {
    data.associatedMedia = {
      '@type': 'MediaObject',
      contentUrl: episode.audio.url,
      encodingFormat: episode.audio.mimeType,
      ...(episode.audio.bytes ? { contentSize: `${episode.audio.bytes}` } : {}),
    };
  }
  if (episode.audio.durationSeconds) {
    data.duration = `PT${Math.round(episode.audio.durationSeconds)}S`;
  }
  if (episode.image || show.image) {
    data.image = episode.image || show.image;
  }
  const guestNames = episode.guests.filter((guest) => guest.name);
  if (guestNames.length > 0) {
    data.actor = guestNames.map((guest) => ({ '@type': 'Person', name: guest.name }));
  }

  return data;
}

export function renderEpisodePage({ show, episode, origin }) {
  const url = `${origin}${episodePath(episode)}`;
  const description = episode.shortDescription || markdownToSingleLine(episode.showNotes, 200);

  const body = `${siteHeader(show)}
<main id="main" class="episode">
  ${gateBanner(episode)}
  <article>
    <header class="episode-header">
      <p class="episode-eyebrow">Episode ${episode.number}${
        episode.season !== null ? ` · Season ${episode.season}` : ''
      }${
        episode.pubDateMs !== null
          ? ` · <time datetime="${escapeHtml(episode.pubDateRaw)}">${escapeHtml(
              formatDisplayDate(episode.pubDateMs, episode.pubDateOffset),
            )}</time>`
          : ''
      }</p>
      <h1 class="episode-title">${escapeHtml(episode.title)}</h1>
      ${description ? `<p class="episode-standfirst">${escapeHtml(description)}</p>` : ''}
    </header>

    ${
      episode.audio.url
        ? `<section class="player" aria-label="Episode player">
      <audio id="episode-audio" controls preload="metadata" src="${escapeHtml(episode.audio.url)}">
        <p>Your browser cannot play this audio.
          <a href="${escapeHtml(episode.audio.url)}">Download the MP3</a> instead.</p>
      </audio>
      ${
        episode.audio.durationSeconds
          ? `<p class="player-meta">${escapeHtml(formatTimecode(episode.audio.durationSeconds))}</p>`
          : ''
      }
    </section>`
        : '<p class="banner banner-blocked">No audio URL is set for this episode yet.</p>'
    }

    ${guestBlock(episode)}
    ${chaptersBlock(episode)}

    ${
      episode.showNotes
        ? `<section class="show-notes" aria-labelledby="notes-heading">
      <h2 id="notes-heading">Show notes</h2>
      ${markdownToHtml(episode.showNotes)}
    </section>`
        : ''
    }

    ${
      episode.video.youtubeId
        ? `<section class="watch"><h2>Watch</h2><p><a href="https://youtu.be/${escapeHtml(
            episode.video.youtubeId,
          )}">Watch this episode on YouTube</a></p></section>`
        : ''
    }

    ${
      episode.cta.label && episode.cta.url
        ? `<section class="cta"><a class="cta-link" href="${escapeHtml(episode.cta.url)}">${escapeHtml(
            episode.cta.label,
          )}</a></section>`
        : ''
    }

    ${transcriptBlock(episode)}

    ${
      episode.credits.host || episode.credits.editor || episode.credits.music
        ? `<section class="credits" aria-labelledby="credits-heading">
      <h2 id="credits-heading">Credits</h2>
      <dl>
        ${episode.credits.host ? `<dt>Host</dt><dd>${escapeHtml(episode.credits.host)}</dd>` : ''}
        ${episode.credits.editor ? `<dt>Editor</dt><dd>${escapeHtml(episode.credits.editor)}</dd>` : ''}
        ${episode.credits.music ? `<dt>Music</dt><dd>${escapeHtml(episode.credits.music)}</dd>` : ''}
      </dl>
    </section>`
        : ''
    }
  </article>

  ${subscribeList(show, { heading: 'Subscribe to the show' })}
</main>
${siteFooter(show)}
<script src="/player.js" defer></script>`;

  return layout({
    title: `${episode.title} — ${show.title}`,
    description,
    canonical: url,
    origin,
    body,
    bodyClass: 'page-episode',
    jsonLd: episodeJsonLd({ show, episode, origin }),
  });
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

export function renderHomePage({ show, episodes, origin }) {
  const cards = episodes
    .map((episode) => {
      const description =
        episode.shortDescription || markdownToSingleLine(episode.showNotes, 180);
      const guests = episode.guests.filter((guest) => guest.name).map((guest) => guest.name);

      return `<li class="episode-card">
      <p class="episode-eyebrow">Episode ${episode.number}${
        episode.pubDateMs !== null
          ? ` · <time datetime="${escapeHtml(episode.pubDateRaw)}">${escapeHtml(
              formatDisplayDate(episode.pubDateMs, episode.pubDateOffset),
            )}</time>`
          : ''
      }</p>
      <h2 class="episode-card-title"><a href="${escapeHtml(episodePath(episode))}">${escapeHtml(
        episode.title,
      )}</a></h2>
      ${guests.length > 0 ? `<p class="episode-card-guests">With ${escapeHtml(guests.join(' & '))}</p>` : ''}
      ${description ? `<p class="episode-card-description">${escapeHtml(description)}</p>` : ''}
      ${
        episode.audio.durationSeconds
          ? `<p class="episode-card-duration">${escapeHtml(
              formatTimecode(episode.audio.durationSeconds),
            )}</p>`
          : ''
      }
    </li>`;
    })
    .join('\n    ');

  const body = `${siteHeader(show)}
<main id="main" class="home">
  <section class="intro">
    <h1>${escapeHtml(show.title)}</h1>
    ${show.subtitle ? `<p class="show-subtitle">${escapeHtml(show.subtitle)}</p>` : ''}
    ${show.description ? markdownToHtml(show.description) : ''}
  </section>

  ${subscribeList(show)}

  <section class="episode-index" aria-labelledby="episodes-heading">
    <h2 id="episodes-heading">Episodes</h2>
    ${
      episodes.length > 0
        ? `<ul class="episode-list">\n    ${cards}\n  </ul>`
        : '<p class="empty">No episodes published yet. Check <a href="/health">/health</a> for what is still outstanding.</p>'
    }
  </section>
</main>
${siteFooter(show)}`;

  return layout({
    title: show.title,
    description: show.subtitle || markdownToSingleLine(show.description, 200),
    canonical: origin,
    origin,
    body,
    bodyClass: 'page-home',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'PodcastSeries',
      name: show.title,
      url: origin,
      webFeed: `${origin}/feed.xml`,
      description: markdownToSingleLine(show.description, 500),
      ...(show.image ? { image: show.image } : {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Subscribe
// ---------------------------------------------------------------------------

export function renderSubscribePage({ show, origin }) {
  const body = `${siteHeader(show)}
<main id="main" class="subscribe-page">
  <h1>Subscribe</h1>
  <p>Every app below plays the same feed. Pick whichever one you already use.</p>
  ${subscribeList(show, { heading: 'Directories' })}
  <section class="feed-url">
    <h2>Paste this anywhere</h2>
    <p>If your app takes a feed URL directly:</p>
    <p><code>${escapeHtml(origin)}/feed.xml</code></p>
  </section>
</main>
${siteFooter(show)}`;

  return layout({
    title: `Subscribe — ${show.title}`,
    description: `Every place to listen to ${show.title}.`,
    canonical: `${origin}/subscribe`,
    origin,
    body,
    bodyClass: 'page-subscribe',
  });
}

// ---------------------------------------------------------------------------
// 404
// ---------------------------------------------------------------------------

export function renderNotFound({ show, origin, episodes = [] }) {
  const recent = episodes
    .slice(0, 5)
    .map(
      (episode) =>
        `<li><a href="${escapeHtml(episodePath(episode))}">Episode ${episode.number}: ${escapeHtml(
          episode.title,
        )}</a></li>`,
    )
    .join('\n    ');

  const body = `${siteHeader(show)}
<main id="main" class="not-found">
  <h1>That page isn't here</h1>
  <p>The link may be old, or the episode number may not exist yet.</p>
  ${recent ? `<h2>Latest episodes</h2>\n  <ul>\n    ${recent}\n  </ul>` : ''}
  <p><a href="/">Back to all episodes</a> · <a href="/subscribe">Subscribe</a></p>
</main>
${siteFooter(show)}`;

  return layout({
    title: `Not found — ${show.title}`,
    description: 'Page not found.',
    canonical: `${origin}/`,
    origin,
    body,
    bodyClass: 'page-404',
  });
}
