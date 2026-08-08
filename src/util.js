// Small helpers shared across the Worker. No dependencies on purpose: every
// function here is something the maintainer can read and reason about.

// ---------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------

export function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// A CDATA section cannot contain the literal sequence "]]>", so split it across
// two sections if the payload happens to include one.
export function cdata(value) {
  return `<![CDATA[${String(value ?? '').replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const ISO_WITH_OFFSET =
  /^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|z|[+-]\d{2}:?\d{2})?$/;

/**
 * Parse the ISO 8601 strings used in episode JSON.
 *
 * Returns `{ ms, offsetMinutes }` or `null` when the string is unusable. The
 * offset is kept so RSS can be emitted in the timezone the publisher actually
 * wrote, rather than silently shifting everything to UTC.
 */
export function parseIsoDate(value) {
  if (typeof value !== 'string') return null;
  const match = ISO_WITH_OFFSET.exec(value.trim());
  if (!match) return null;

  const [, y, mo, d, h, mi, s, zone] = match;
  let offsetMinutes = 0;
  if (zone && zone !== 'Z' && zone !== 'z') {
    const sign = zone[0] === '-' ? -1 : 1;
    const digits = zone.slice(1).replace(':', '');
    offsetMinutes = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4)));
  }

  const ms =
    Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s || 0)) -
    offsetMinutes * 60000;

  if (!Number.isFinite(ms)) return null;
  return { ms, offsetMinutes };
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * RFC-2822 date, e.g. `Wed, 12 Aug 2026 09:00:00 -0500`.
 *
 * A numeric offset is emitted rather than a zone name; some validators are
 * picky about obsolete zone abbreviations.
 */
export function formatRfc2822(ms, offsetMinutes = 0) {
  const shifted = new Date(ms + offsetMinutes * 60000);
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);

  return (
    `${DAYS[shifted.getUTCDay()]}, ${pad2(shifted.getUTCDate())} ` +
    `${MONTHS[shifted.getUTCMonth()]} ${shifted.getUTCFullYear()} ` +
    `${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}:${pad2(shifted.getUTCSeconds())} ` +
    `${sign}${pad2(Math.floor(abs / 60))}${pad2(abs % 60)}`
  );
}

/** Human date for page display, e.g. `August 12, 2026`. */
export function formatDisplayDate(ms, offsetMinutes = 0) {
  const shifted = new Date(ms + offsetMinutes * 60000);
  const long = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${long[shifted.getUTCMonth()]} ${shifted.getUTCDate()}, ${shifted.getUTCFullYear()}`;
}

/** `m:ss` under an hour, `h:mm:ss` at or over it. YouTube accepts both. */
export function formatTimecode(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
}

// ---------------------------------------------------------------------------
// Episode numbers
// ---------------------------------------------------------------------------

/** `001` — the on-disk filename form. */
export function padEpisodeNumber(n) {
  return String(Math.trunc(Number(n) || 0)).padStart(3, '0');
}

/** Accepts `1`, `001`, `01`. Returns a number, or null if it is not a number. */
export function parseEpisodeNumber(raw) {
  if (typeof raw !== 'string' || !/^\d{1,6}$/.test(raw)) return null;
  const n = Number(raw);
  return n > 0 ? n : null;
}

// ---------------------------------------------------------------------------
// Minimal markdown
// ---------------------------------------------------------------------------
//
// Show notes are authored as markdown but need three shapes: HTML for the site
// and for `content:encoded`, and flat text for YouTube and RSS `<description>`.
// A full markdown library is a dependency the maintainer cannot debug from a
// phone, and show notes only ever use a handful of constructs, so this covers
// exactly those: headings, bullet and numbered lists, links, bold, italic,
// inline code. Anything else passes through as literal text.

const INLINE_LINK = /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

function safeUrl(url) {
  const trimmed = String(url || '').trim();
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/') || trimmed.startsWith('#')) return trimmed;
  return null;
}

function inlineToHtml(text) {
  return escapeHtml(text)
    .replace(INLINE_LINK, (whole, label, url) => {
      const href = safeUrl(url);
      // `label` and `url` come out of already-escaped text, so they are safe to
      // re-embed. An unsafe scheme degrades to the label plus the raw URL.
      if (!href) return `${label} (${url})`;
      const external = /^https?:/i.test(href);
      const rel = external ? ' rel="noopener"' : '';
      return `<a href="${href}"${rel}>${label}</a>`;
    })
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
}

function inlineToPlain(text) {
  return String(text ?? '')
    .replace(INLINE_LINK, (whole, label, url) => `${label}: ${url}`)
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2');
}

function splitBlocks(markdown) {
  return String(markdown ?? '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

const BULLET = /^[-*+]\s+/;
const NUMBERED = /^\d+[.)]\s+/;

/** Markdown to HTML. Output is escaped; only the tags this function emits survive. */
export function markdownToHtml(markdown) {
  return splitBlocks(markdown)
    .map((block) => {
      const lines = block.split('\n');

      const heading = /^(#{1,6})\s+(.*)$/.exec(lines[0]);
      if (heading && lines.length === 1) {
        const level = Math.min(6, heading[1].length + 1); // never emit an <h1>
        return `<h${level}>${inlineToHtml(heading[2])}</h${level}>`;
      }

      if (lines.every((line) => BULLET.test(line))) {
        const items = lines
          .map((line) => `<li>${inlineToHtml(line.replace(BULLET, ''))}</li>`)
          .join('');
        return `<ul>${items}</ul>`;
      }

      if (lines.every((line) => NUMBERED.test(line))) {
        const items = lines
          .map((line) => `<li>${inlineToHtml(line.replace(NUMBERED, ''))}</li>`)
          .join('');
        return `<ol>${items}</ol>`;
      }

      return `<p>${lines.map(inlineToHtml).join('<br>')}</p>`;
    })
    .join('\n');
}

/**
 * Markdown to plain text, with links flattened to `label: url`.
 * This is what goes into the YouTube description block.
 */
export function markdownToPlain(markdown) {
  return splitBlocks(markdown)
    .map((block) =>
      block
        .split('\n')
        .map((line) => inlineToPlain(line.replace(BULLET, '- ').replace(/^(#{1,6})\s+/, '')))
        .join('\n'),
    )
    .join('\n\n');
}

/** Single-line summary text, used where markup is not allowed at all. */
export function markdownToSingleLine(markdown, limit = 0) {
  const flat = markdownToPlain(markdown).replace(/\s+/g, ' ').trim();
  if (limit > 0 && flat.length > limit) return `${flat.slice(0, limit - 1).trimEnd()}…`;
  return flat;
}
