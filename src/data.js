// Data loading, normalization, and the publishing gate.
//
// Everything in this file is pure: it takes already-parsed JSON and returns
// plain objects. Nothing here touches the network or the Workers runtime, so it
// can be exercised directly from the tests in /test.

import { parseIsoDate, padEpisodeNumber } from './util.js';

export const SITE_ORIGIN_FALLBACK = 'https://podcast.centralmidtown.org';

// ---------------------------------------------------------------------------
// Show
// ---------------------------------------------------------------------------

/**
 * Fields that must be filled in before the feed can be submitted anywhere.
 * `/health` reports each one by name so it is obvious what is still a stub.
 */
export const REQUIRED_SHOW_FIELDS = [
  ['title', 'Show title, exactly as it should appear in every directory'],
  ['description', 'Full show description, 200-400 words'],
  ['language', 'Language code, e.g. en-us'],
  ['copyright', 'Copyright line'],
  ['author', 'Author / publisher name'],
  ['guid', 'podcast:guid — one UUID, generated once, never changed'],
  ['image', 'Absolute URL of the 3000x3000 cover art'],
  ['owner.name', 'Owner name for itunes:owner'],
  ['owner.email', 'Owner email — must be a shared org inbox you can read'],
];

function get(object, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), object);
}

function str(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeShow(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};

  return {
    title: str(source.title),
    subtitle: str(source.subtitle),
    description: str(source.description),
    link: str(source.link) || SITE_ORIGIN_FALLBACK,
    language: str(source.language) || 'en-us',
    copyright: str(source.copyright),
    author: str(source.author),
    explicit: source.explicit === true,
    type: str(source.type) === 'serial' ? 'serial' : 'episodic',
    guid: str(source.guid),
    image: str(source.image),
    owner: {
      name: str(get(source, 'owner.name')),
      email: str(get(source, 'owner.email')),
    },
    categories: Array.isArray(source.categories)
      ? source.categories
          .map((category) => ({
            name: str(category && category.name),
            subcategory: str(category && category.subcategory),
          }))
          .filter((category) => category.name)
      : [],
    platforms: Array.isArray(source.platforms)
      ? source.platforms
          .map((platform) => ({
            name: str(platform && platform.name),
            url: str(platform && platform.url),
          }))
          .filter((platform) => platform.name)
      : [],
    // Fields written as working placeholders, listed in show.json so /health
    // can insist they are confirmed before the feed goes to any directory.
    provisional: Array.isArray(source.provisional) ? source.provisional.map(str).filter(Boolean) : [],
    // Everything unset here is caught by /health rather than crashing a render.
    raw: source,
  };
}

/**
 * Show-level problems, as `{ field, message, severity }`.
 * `blocking` means the feed should not be submitted to a directory yet;
 * `warning` means it will work but is incomplete.
 */
export function auditShow(show) {
  const problems = [];

  for (const [field, description] of REQUIRED_SHOW_FIELDS) {
    if (!get(show, field)) {
      problems.push({
        field,
        severity: 'blocking',
        message: `data/show.json: "${field}" is empty. ${description}.`,
      });
    }
  }

  if (show.owner.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(show.owner.email)) {
    problems.push({
      field: 'owner.email',
      severity: 'blocking',
      message: `data/show.json: "owner.email" is not a valid address (${show.owner.email}).`,
    });
  }

  if (show.guid && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(show.guid)) {
    problems.push({
      field: 'guid',
      severity: 'warning',
      message: `data/show.json: "guid" is not a UUID (${show.guid}). Podcast Index expects one.`,
    });
  }

  if (show.categories.length === 0) {
    problems.push({
      field: 'categories',
      severity: 'blocking',
      message: 'data/show.json: "categories" is empty. Apple requires at least one itunes:category.',
    });
  }

  if (show.image && !/^https:\/\//i.test(show.image)) {
    problems.push({
      field: 'image',
      severity: 'blocking',
      message: 'data/show.json: "image" must be an absolute https:// URL to the 3000x3000 artwork.',
    });
  }

  if (show.subtitle.length > 150) {
    problems.push({
      field: 'subtitle',
      severity: 'warning',
      message: `data/show.json: "subtitle" is ${show.subtitle.length} characters. Keep it under 150.`,
    });
  }

  if (!show.platforms.some((platform) => platform.url)) {
    problems.push({
      field: 'platforms',
      severity: 'warning',
      message:
        'data/show.json: no entry in "platforms" has a URL yet, so /subscribe lists only the RSS feed. Fill each one in as its directory submission is approved.',
    });
  }

  for (const field of show.provisional) {
    problems.push({
      field,
      severity: 'blocking',
      message:
        `data/show.json: "${field}" is still a provisional placeholder written during the build. ` +
        'Confirm the real value, then remove it from the "provisional" list.',
    });
  }

  return problems;
}

// ---------------------------------------------------------------------------
// Episodes
// ---------------------------------------------------------------------------

export function normalizeEpisode(raw, { file = 'unknown' } = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const number = Number(source.number);
  const audio = source.audio && typeof source.audio === 'object' ? source.audio : {};
  const video = source.video && typeof source.video === 'object' ? source.video : {};
  const cta = source.cta && typeof source.cta === 'object' ? source.cta : {};
  const credits = source.credits && typeof source.credits === 'object' ? source.credits : {};
  const parsedDate = parseIsoDate(source.pubDate);

  return {
    file,
    number: Number.isFinite(number) ? number : null,
    padded: Number.isFinite(number) ? padEpisodeNumber(number) : null,
    season: Number.isFinite(Number(source.season)) ? Number(source.season) : null,
    slug: str(source.slug),
    title: str(source.title),
    guid: str(source.guid),
    pubDateRaw: str(source.pubDate),
    pubDateMs: parsedDate ? parsedDate.ms : null,
    pubDateOffset: parsedDate ? parsedDate.offsetMinutes : 0,
    explicit: typeof source.explicit === 'boolean' ? source.explicit : null,
    episodeType: str(source.episodeType) || 'full',
    shortDescription: str(source.shortDescription),
    showNotes: typeof source.showNotes === 'string' ? source.showNotes : '',
    pullQuote: str(source.pullQuote),
    keywords: Array.isArray(source.keywords) ? source.keywords.map(str).filter(Boolean) : [],
    image: str(source.image),
    audio: {
      url: str(audio.url),
      bytes: Number.isFinite(Number(audio.bytes)) ? Number(audio.bytes) : null,
      durationSeconds: Number.isFinite(Number(audio.durationSeconds))
        ? Number(audio.durationSeconds)
        : null,
      mimeType: str(audio.mimeType) || 'audio/mpeg',
    },
    video: {
      youtubeId: str(video.youtubeId),
      thumbnailAlt: str(video.thumbnailAlt),
    },
    chapters: Array.isArray(source.chapters)
      ? source.chapters
          .map((chapter) => ({
            start: Number.isFinite(Number(chapter && chapter.start)) ? Number(chapter.start) : null,
            title: str(chapter && chapter.title),
          }))
          .filter((chapter) => chapter.start !== null || chapter.title)
      : [],
    guests: Array.isArray(source.guests)
      ? source.guests.map((guest) => ({
          name: str(guest && guest.name),
          pronouns: str(guest && guest.pronouns),
          bio: str(guest && guest.bio),
          headshot: str(guest && guest.headshot),
          headshotAlt: str(guest && guest.headshotAlt),
          links: Array.isArray(guest && guest.links)
            ? guest.links
                .map((link) => ({ label: str(link && link.label), url: str(link && link.url) }))
                .filter((link) => link.url)
            : [],
          releaseSigned: guest ? guest.releaseSigned === true : false,
        }))
      : [],
    credits: {
      host: str(credits.host),
      editor: str(credits.editor),
      music: str(credits.music),
    },
    cta: { label: str(cta.label), url: str(cta.url) },
    transcriptVtt: typeof source.transcriptVtt === 'string' ? source.transcriptVtt : null,
  };
}

// ---------------------------------------------------------------------------
// The publishing gate
// ---------------------------------------------------------------------------

/**
 * Decide whether an episode belongs in /feed.xml and the site index.
 *
 * Returns `{ published, scheduled, reasons }` where `reasons` is a list of
 * `{ field, message }`. Anything with a reason stays out of the feed but still
 * renders at its episode URL, with the reasons shown as a banner.
 */
export function gateEpisode(episode, now = Date.now()) {
  const reasons = [];

  if (episode.number === null || episode.number <= 0) {
    reasons.push({ field: 'number', message: '"number" is missing or not a positive number.' });
  }

  if (!episode.title) {
    reasons.push({ field: 'title', message: '"title" is empty.' });
  }

  if (!episode.guid) {
    reasons.push({
      field: 'guid',
      message: '"guid" is empty. Generate one UUID and never change it after publishing.',
    });
  }

  if (episode.pubDateMs === null) {
    reasons.push({
      field: 'pubDate',
      message: episode.pubDateRaw
        ? `"pubDate" could not be parsed (${episode.pubDateRaw}). Use ISO 8601, e.g. 2026-08-12T09:00:00-05:00.`
        : '"pubDate" is missing. Use ISO 8601, e.g. 2026-08-12T09:00:00-05:00.',
    });
  }

  if (!episode.audio.url) {
    reasons.push({ field: 'audio.url', message: '"audio.url" is empty.' });
  }

  if (!episode.audio.bytes || episode.audio.bytes <= 0) {
    reasons.push({
      field: 'audio.bytes',
      message:
        '"audio.bytes" is 0 or missing. Read the exact byte size off the R2 object listing — a wrong enclosure length is the most common cause of Apple rejection.',
    });
  }

  if (!episode.audio.durationSeconds || episode.audio.durationSeconds <= 0) {
    reasons.push({
      field: 'audio.durationSeconds',
      message: '"audio.durationSeconds" is 0 or missing.',
    });
  }

  episode.guests.forEach((guest, index) => {
    if (!guest.releaseSigned) {
      reasons.push({
        field: `guests[${index}].releaseSigned`,
        message: `Guest release not signed${guest.name ? ` for ${guest.name}` : ''}. Obtain it before publishing.`,
      });
    }
  });

  // A future pubDate is a schedule, not a mistake. It is reported separately so
  // the banner can say "scheduled" instead of listing it as a failure.
  const scheduled = episode.pubDateMs !== null && episode.pubDateMs > now;

  return {
    published: reasons.length === 0 && !scheduled,
    scheduled,
    reasons,
  };
}

/** Non-blocking issues worth reporting on /health. */
export function auditEpisode(episode) {
  const warnings = [];

  if (episode.shortDescription.length > 150) {
    warnings.push(
      `"shortDescription" is ${episode.shortDescription.length} characters. Keep it under 150 for itunes:subtitle.`,
    );
  }
  if (!episode.shortDescription) {
    warnings.push('"shortDescription" is empty, so itunes:subtitle and the YouTube snippet will be blank.');
  }
  if (!episode.showNotes) {
    warnings.push('"showNotes" is empty, so the episode page and RSS description will be blank.');
  }
  if (episode.chapters.length > 0 && episode.chapters[0].start !== 0) {
    warnings.push(
      'First chapter does not start at 0. YouTube will not render the chapter list unless the first timestamp is 0:00.',
    );
  }
  episode.chapters.forEach((chapter, index) => {
    if (chapter.start === null) warnings.push(`chapters[${index}] has no "start".`);
    if (!chapter.title) warnings.push(`chapters[${index}] has no "title".`);
  });
  if (!episode.slug) {
    warnings.push('"slug" is empty.');
  }
  if (!episode.transcriptVtt) {
    warnings.push(
      'No transcript registered. Add episodes/{n}.vtt and register it in episodes/registry.js, or the podcast:transcript tag is omitted.',
    );
  }
  if (episode.guests.some((guest) => !guest.name)) {
    warnings.push('A guest entry has no "name".');
  }
  if (!episode.credits.host) {
    warnings.push('"credits.host" is empty.');
  }
  if (episode.video.youtubeId && !episode.video.thumbnailAlt) {
    warnings.push('"video.thumbnailAlt" is empty. Write alt text for the thumbnail.');
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Library assembly
// ---------------------------------------------------------------------------

/**
 * Turn the raw registry into the shape every route consumes.
 *
 * `registry` is an array of `{ number, data, vtt, file }` as produced by
 * episodes/registry.js. Duplicate episode numbers are reported rather than
 * silently overwriting each other.
 */
export function buildLibrary({ show: rawShow, registry = [], now = Date.now() } = {}) {
  const show = normalizeShow(rawShow);
  const showProblems = auditShow(show);
  const structural = [];

  const episodes = registry.map((entry) => {
    const episode = normalizeEpisode(entry && entry.data, { file: (entry && entry.file) || 'unknown' });
    if (entry && typeof entry.vtt === 'string' && entry.vtt.trim()) {
      episode.transcriptVtt = entry.vtt;
    }
    const gate = gateEpisode(episode, now);
    return { ...episode, gate, warnings: auditEpisode(episode) };
  });

  const seen = new Map();
  for (const episode of episodes) {
    if (episode.number === null) continue;
    if (seen.has(episode.number)) {
      structural.push(
        `Duplicate episode number ${episode.number}: ${seen.get(episode.number)} and ${episode.file}.`,
      );
    } else {
      seen.set(episode.number, episode.file);
    }
  }

  const guids = new Map();
  for (const episode of episodes) {
    if (!episode.guid) continue;
    if (guids.has(episode.guid)) {
      structural.push(
        `Duplicate guid ${episode.guid}: ${guids.get(episode.guid)} and ${episode.file}. Every episode needs its own UUID.`,
      );
    } else {
      guids.set(episode.guid, episode.file);
    }
  }

  const byNewest = (a, b) => (b.pubDateMs ?? 0) - (a.pubDateMs ?? 0) || (b.number ?? 0) - (a.number ?? 0);
  const sorted = [...episodes].sort(byNewest);

  return {
    show,
    showProblems,
    structural,
    all: sorted,
    published: sorted.filter((episode) => episode.gate.published),
    byNumber: (n) => episodes.find((episode) => episode.number === n) || null,
  };
}

/**
 * Work out which hostname to write into links.
 *
 * On the production domain these are the same thing. On a workers.dev URL or a
 * pull request preview they are not: links have to point at the host actually
 * being browsed, or nothing on the preview is clickable — but the canonical tag
 * must still point at production so a preview never competes with the real site
 * in search results, and previews are marked noindex outright.
 */
export function resolveSite(show, requestUrl) {
  const configured = show && show.link ? show.link.replace(/\/+$/, '') : '';
  const requested = requestUrl ? new URL(requestUrl).origin : '';
  const canonicalOrigin = configured || requested || SITE_ORIGIN_FALLBACK;
  const isPreview = Boolean(configured && requested && configured !== requested);

  return {
    origin: isPreview ? requested : canonicalOrigin,
    canonicalOrigin,
    isPreview,
  };
}

export function episodePath(episode) {
  return `/episode/${episode.number}`;
}
