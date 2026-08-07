// RSS 2.0 + iTunes + Podcasting 2.0 feed generation.
//
// This is string building on purpose. An RSS library is a dependency the
// maintainer cannot debug from a phone, and the output has to match Apple's
// expectations exactly, so it is better to be able to read the template.

import {
  escapeXml,
  cdata,
  formatRfc2822,
  markdownToHtml,
  markdownToPlain,
  markdownToSingleLine,
} from './util.js';
import { episodePath } from './data.js';

export const FEED_CONTENT_TYPE = 'application/rss+xml; charset=utf-8';

const NAMESPACES = [
  'version="2.0"',
  'xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"',
  'xmlns:atom="http://www.w3.org/2005/Atom"',
  'xmlns:content="http://purl.org/rss/1.0/modules/content/"',
  'xmlns:podcast="https://podcastindex.org/namespace/1.0"',
].join('\n     ');

const yesNo = (value) => (value ? 'true' : 'false');

function categoryXml(category) {
  const parent = `<itunes:category text="${escapeXml(category.name)}">`;
  if (!category.subcategory) return `    <itunes:category text="${escapeXml(category.name)}"/>`;
  return [
    `    ${parent}`,
    `      <itunes:category text="${escapeXml(category.subcategory)}"/>`,
    '    </itunes:category>',
  ].join('\n');
}

function itemXml(episode, { show, origin }) {
  const url = `${origin}${episodePath(episode)}`;
  const notesHtml = markdownToHtml(episode.showNotes);
  // Paragraph breaks are kept: apps that show <description> as plain text read
  // far better with them, and markdown markers are already stripped.
  const notesPlain = markdownToPlain(episode.showNotes);
  const summary = episode.shortDescription || notesPlain;
  const explicit = episode.explicit === null ? show.explicit : episode.explicit;

  const lines = [
    '    <item>',
    `      <title>${escapeXml(episode.title)}</title>`,
    `      <link>${escapeXml(url)}</link>`,
    `      <guid isPermaLink="false">${escapeXml(episode.guid)}</guid>`,
    `      <pubDate>${formatRfc2822(episode.pubDateMs, episode.pubDateOffset)}</pubDate>`,
    `      <description>${cdata(notesPlain || summary)}</description>`,
    `      <content:encoded>${cdata(notesHtml)}</content:encoded>`,
    `      <enclosure url="${escapeXml(episode.audio.url)}" type="${escapeXml(episode.audio.mimeType)}" length="${episode.audio.bytes}"/>`,
    `      <itunes:title>${escapeXml(episode.title)}</itunes:title>`,
    `      <itunes:duration>${Math.round(episode.audio.durationSeconds)}</itunes:duration>`,
    `      <itunes:episode>${episode.number}</itunes:episode>`,
  ];

  if (episode.season !== null) {
    lines.push(`      <itunes:season>${episode.season}</itunes:season>`);
  }

  lines.push(
    `      <itunes:episodeType>${escapeXml(episode.episodeType)}</itunes:episodeType>`,
    `      <itunes:explicit>${yesNo(explicit)}</itunes:explicit>`,
    `      <itunes:author>${escapeXml(show.author)}</itunes:author>`,
  );

  if (summary) {
    lines.push(`      <itunes:subtitle>${escapeXml(markdownToSingleLine(summary, 150))}</itunes:subtitle>`);
    lines.push(`      <itunes:summary>${cdata(notesPlain || summary)}</itunes:summary>`);
  }

  const artwork = episode.image || show.image;
  if (artwork) {
    lines.push(`      <itunes:image href="${escapeXml(artwork)}"/>`);
  }

  if (episode.keywords.length > 0) {
    lines.push(`      <itunes:keywords>${escapeXml(episode.keywords.join(', '))}</itunes:keywords>`);
  }

  if (episode.transcriptVtt) {
    lines.push(
      `      <podcast:transcript url="${escapeXml(`${url}/transcript.vtt`)}" type="text/vtt" language="${escapeXml(show.language)}" rel="captions"/>`,
    );
  }

  if (episode.chapters.length > 0) {
    lines.push(
      `      <podcast:chapters url="${escapeXml(`${url}/chapters.json`)}" type="application/json+chapters"/>`,
    );
  }

  lines.push('    </item>');
  return lines.join('\n');
}

/**
 * Render the full feed.
 *
 * `episodes` must already be gated and sorted newest first; this function does
 * not filter. Keeping the gate out of here means /health and /feed.xml can
 * never disagree about which episodes are publishable.
 */
export function renderFeed({ show, episodes, origin, feedUrl, now = Date.now() }) {
  const lastBuild = episodes.length > 0 ? episodes[0].pubDateMs : now;

  const head = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<rss ${NAMESPACES}>`,
    '  <channel>',
    `    <title>${escapeXml(show.title)}</title>`,
    `    <link>${escapeXml(origin)}</link>`,
    `    <description>${cdata(show.description)}</description>`,
    `    <language>${escapeXml(show.language)}</language>`,
    `    <copyright>${escapeXml(show.copyright)}</copyright>`,
    `    <lastBuildDate>${formatRfc2822(lastBuild, 0)}</lastBuildDate>`,
    `    <generator>central-midtown-pod</generator>`,
    `    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml"/>`,
    `    <podcast:guid>${escapeXml(show.guid)}</podcast:guid>`,
    `    <itunes:author>${escapeXml(show.author)}</itunes:author>`,
    `    <itunes:summary>${cdata(show.description)}</itunes:summary>`,
    `    <itunes:type>${escapeXml(show.type)}</itunes:type>`,
    `    <itunes:explicit>${yesNo(show.explicit)}</itunes:explicit>`,
  ];

  if (show.subtitle) {
    head.push(`    <itunes:subtitle>${escapeXml(show.subtitle)}</itunes:subtitle>`);
  }

  if (show.image) {
    head.push(`    <itunes:image href="${escapeXml(show.image)}"/>`);
    head.push('    <image>');
    head.push(`      <url>${escapeXml(show.image)}</url>`);
    head.push(`      <title>${escapeXml(show.title)}</title>`);
    head.push(`      <link>${escapeXml(origin)}</link>`);
    head.push('    </image>');
  }

  head.push('    <itunes:owner>');
  head.push(`      <itunes:name>${escapeXml(show.owner.name)}</itunes:name>`);
  head.push(`      <itunes:email>${escapeXml(show.owner.email)}</itunes:email>`);
  head.push('    </itunes:owner>');

  for (const category of show.categories) {
    head.push(categoryXml(category));
  }

  const items = episodes.map((episode) => itemXml(episode, { show, origin }));

  return [...head, ...items, '  </channel>', '</rss>', ''].join('\n');
}

/**
 * Podcasting 2.0 chapters document.
 * https://github.com/Podcastindex-org/podcast-namespace/blob/main/chapters/jsonChapters.md
 */
export function renderChapters(episode) {
  return JSON.stringify(
    {
      version: '1.2.0',
      chapters: episode.chapters
        .filter((chapter) => chapter.start !== null)
        .map((chapter) => ({ startTime: chapter.start, title: chapter.title })),
    },
    null,
    2,
  );
}
