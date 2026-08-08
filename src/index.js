// Worker entry point and routing.
//
// Cloudflare serves anything in /public directly (see [assets] in
// wrangler.toml); requests that do not match a static file arrive here.

import showData from '../data/show.json';
import registry from '../episodes/registry.js';

import { buildLibrary, siteOrigin, episodePath } from './data.js';
import { renderFeed, renderChapters, FEED_CONTENT_TYPE } from './feed.js';
import { renderYouTube, renderSocial } from './exports.js';
import { renderHealth, renderFatalConfigError } from './health.js';
import {
  renderHomePage,
  renderEpisodePage,
  renderSubscribePage,
  renderNotFound,
} from './pages.js';
import { parseEpisodeNumber } from './util.js';

const HTML = 'text/html; charset=utf-8';
const TEXT = 'text/plain; charset=utf-8';

function respond(body, { status = 200, type = HTML, cache = 'public, max-age=300' } = {}) {
  return new Response(body, {
    status,
    headers: {
      'content-type': type,
      'cache-control': cache,
      'x-content-type-options': 'nosniff',
    },
  });
}

/**
 * Static assets that are worth naming on /health when they are missing —
 * a 404 on the cover art is invisible until Apple rejects the feed.
 */
async function checkAssets(env, show, origin) {
  const problems = [];
  if (!env || !env.ASSETS) return problems;

  const candidates = [['/styles.css', 'Stylesheet']];
  if (show.image && show.image.startsWith(`${origin}/`)) {
    candidates.push([new URL(show.image).pathname, 'Show cover art']);
  }

  for (const [path, label] of candidates) {
    try {
      const response = await env.ASSETS.fetch(new Request(`${origin}${path}`));
      if (!response.ok) {
        problems.push(`${label} is missing: public${path} did not resolve (HTTP ${response.status}).`);
      }
    } catch (error) {
      problems.push(`${label} could not be checked: ${error.message}`);
    }
  }

  return problems;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return respond('Method not allowed. This site is read-only.', {
        status: 405,
        type: TEXT,
        cache: 'no-store',
      });
    }

    const now = Date.now();
    const library = buildLibrary({ show: showData, registry, now });
    const { show } = library;
    const origin = siteOrigin(show, request.url);

    // ------------------------------------------------------------------
    // /health always works, even when the show config is unusable — it is
    // the route that explains why everything else is broken.
    // ------------------------------------------------------------------
    if (path === '/health') {
      const assetProblems = await checkAssets(env, show, origin);
      return respond(renderHealth({ library, origin, now, assetProblems }), {
        type: TEXT,
        cache: 'no-store',
      });
    }

    // Without a title there is no feed and no page worth rendering. Say so in
    // plain text rather than emitting a half-built document.
    if (!show.title) {
      const blocking = library.showProblems.filter((problem) => problem.severity === 'blocking');
      return respond(renderFatalConfigError(blocking), {
        status: 500,
        type: TEXT,
        cache: 'no-store',
      });
    }

    if (path === '/') {
      return respond(renderHomePage({ show, episodes: library.published, origin }));
    }

    if (path === '/feed.xml') {
      const xml = renderFeed({
        show,
        episodes: library.published,
        origin,
        feedUrl: `${origin}/feed.xml`,
        now,
      });
      return respond(xml, { type: FEED_CONTENT_TYPE });
    }

    if (path === '/subscribe') {
      return respond(renderSubscribePage({ show, origin }));
    }

    // ------------------------------------------------------------------
    // /episode/{n} and its sub-resources. `{n}` accepts 1 and 001 alike.
    // ------------------------------------------------------------------
    const episodeMatch = /^\/episode\/(\d{1,6})(?:\/([a-z.]+))?$/.exec(path);
    if (episodeMatch) {
      const number = parseEpisodeNumber(episodeMatch[1]);
      const episode = number === null ? null : library.byNumber(number);

      if (!episode) {
        return respond(renderNotFound({ show, origin, episodes: library.published }), {
          status: 404,
          cache: 'no-store',
        });
      }

      switch (episodeMatch[2]) {
        case undefined:
          return respond(renderEpisodePage({ show, episode, origin }), {
            cache: episode.gate.published ? 'public, max-age=300' : 'no-store',
          });

        case 'youtube.txt':
          return respond(renderYouTube({ show, episode, origin }), { type: TEXT });

        case 'social.txt':
          return respond(renderSocial({ show, episode, origin }), { type: TEXT });

        case 'transcript.vtt':
          if (!episode.transcriptVtt) {
            return respond(
              `No transcript is registered for episode ${episode.number}.\n\n` +
                `Add episodes/${episode.padded}.vtt and register it in episodes/registry.js.\n`,
              { status: 404, type: TEXT, cache: 'no-store' },
            );
          }
          return respond(episode.transcriptVtt, { type: 'text/vtt; charset=utf-8' });

        case 'chapters.json':
          if (episode.chapters.length === 0) {
            return respond(`No chapters are set for episode ${episode.number}.\n`, {
              status: 404,
              type: TEXT,
              cache: 'no-store',
            });
          }
          return respond(renderChapters(episode), {
            type: 'application/json+chapters; charset=utf-8',
          });

        default:
          break;
      }
    }

    // Old-style padded links elsewhere on the web should still land somewhere.
    const paddedMatch = /^\/episodes?\/0*(\d{1,6})\.json$/.exec(path);
    if (paddedMatch) {
      const number = parseEpisodeNumber(paddedMatch[1]);
      const episode = number === null ? null : library.byNumber(number);
      if (episode) {
        return Response.redirect(`${origin}${episodePath(episode)}`, 308);
      }
    }

    return respond(renderNotFound({ show, origin, episodes: library.published }), {
      status: 404,
      cache: 'no-store',
    });
  },
};
