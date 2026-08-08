# central-midtown-pod

The Central Midtown podcast platform: one Cloudflare Worker that serves the
public site, the RSS feed, and the paste-ready export routes used at publish time.

One JSON file per episode is the single source of truth. The feed entry, the
website page, the YouTube description, and the social copy are all derived from
it. Nothing is typed twice.

See `CLAUDE.md` for the operating manual and the per-episode checklist, and
`PROJECT_BRIEF.md` for the specification this was built to.

---

## Routes

| Route | Content-Type | Output |
|---|---|---|
| `/` | `text/html` | Show intro, published episodes, subscribe links |
| `/episode/{n}` | `text/html` | Player, guest, chapters, show notes, transcript |
| `/feed.xml` | `application/rss+xml; charset=utf-8` | Full RSS, published episodes only |
| `/subscribe` | `text/html` | Every platform link from `data/show.json` |
| `/episode/{n}/youtube.txt` | `text/plain` | Paste-ready YouTube description block |
| `/episode/{n}/social.txt` | `text/plain` | Pull quote and short promo copy |
| `/episode/{n}/transcript.vtt` | `text/vtt` | Served for the `podcast:transcript` feed tag |
| `/episode/{n}/chapters.json` | `application/json+chapters` | Served for the `podcast:chapters` feed tag |
| `/health` | `text/plain` | Config and data validation report |
| anything else | `text/html` | 404 with links back to the index |

`{n}` accepts `1` and `001` alike. Static files in `/public` — the stylesheet,
the player script, the cover art — are served directly by Cloudflare and never
reach the Worker.

---

## Publishing an episode

Everything below happens in the GitHub web editor. No terminal, no `wrangler`,
no build step.

1. Upload the MP3 to the R2 bucket. Copy the **exact byte size** off the object
   listing — a wrong `enclosure` length is the most common cause of Apple
   rejecting a feed.
2. Create `episodes/{nnn}.json`. Copy `episodes/001.json` and replace the values.
3. Create `episodes/{nnn}.vtt` with the transcript.
4. Register both in `episodes/registry.js` — two import lines and one array
   entry, copying the episode above it.
5. Commit to `main`. Workers Builds deploys automatically.
6. Open **`/health`**. It lists every episode with its status and names any field
   still holding it back. Fix and re-commit until it reports no blocking problems.
7. Open `/episode/{n}/youtube.txt`, select all, paste into YouTube Studio.
8. Open `/episode/{n}/social.txt` for promo copy.

### Why the registry file exists

The Workers runtime has no filesystem, so episode data has to be bundled at
build time, and there is no way to glob-import a directory without adding a
build step — which is exactly what the phone-only workflow rules out.

The upside: a typo or a missing file fails the Workers build with a named error
and the previously deployed version stays live. A runtime lookup would deploy
successfully and 404 in public.

---

## The publishing gate

An episode is kept out of `/feed.xml` and the home index if any of these is true:

- `audio.bytes` is 0, missing, or not a number
- `audio.durationSeconds` is 0 or missing
- `guid` is empty
- `title` is empty, or `number` is missing
- `audio.url` is empty
- `pubDate` is missing or unparseable
- any entry in `guests` has `releaseSigned: false`

A `pubDate` in the future is treated as a schedule rather than a failure: the
episode is held back and appears on its own, on the date given.

Held-back episodes **still render** at `/episode/{n}` with a banner naming the
exact fields, so drafts can be previewed and shared before they go live.

---

## Configuration

`data/show.json` holds everything show-level. Nothing is hardcoded in the Worker.

The `provisional` array lists fields written as working placeholders during the
build. `/health` reports each one as blocking until it is confirmed and removed
from the list. **Do not submit the feed to any directory while that array is
non-empty.**

`owner.email` is intentionally blank. It must be a shared org inbox — Apple and
Spotify send verification codes there, and a personal address orphans the show
when someone leaves.

There are no secrets. The Worker only reads. If an authenticated route is ever
added, its credentials go in the Cloudflare dashboard under
**Settings → Variables and Secrets**, never in `wrangler.toml` and never in git.

---

## Deploying

GitHub is the source of truth. Cloudflare pulls from it — nothing is ever
uploaded by hand.

```
branch  ──▶  pull request  ──▶  CI green  ──▶  merge to main  ──▶  production
                    │
                    └──▶  Workers Builds preview URL
```

### Workers Builds settings

Set these once, in the Cloudflare dashboard under
**Workers & Pages → central-midtown-podcast → Settings → Builds**.

| Setting | Value |
|---|---|
| Git repository | `cobiadigital/central-midtown-pod` |
| Production branch | `main` |
| Build command | *(leave empty)* |
| Deploy command | `npx wrangler deploy` |
| **Non-production branch deploy command** | **`npx wrangler versions upload`** |
| Root directory | `/` |
| Build for non-production branches | **On** |

The build command is deliberately empty. There is nothing to compile, and
`package.json` has no dependencies and no `build` script, so anything here would
only be a way for the deploy to fail.

**Check the non-production deploy command.** `wrangler versions upload` is the
default, and it is the one you want: it publishes a *version* with its own
preview URL and leaves production untouched. If it is ever set to
`wrangler deploy` instead, every push to every branch goes live on the
production domain — a half-finished episode on a work-in-progress branch would
be the public site, and the pull request stops being a review step.

Merging to `main` triggers the production deploy. It takes a minute or two, and
directories pick the feed up within 15 minutes to a few hours after that.

### Preview URLs

The Worker notices when it is being served from anywhere other than
`link` in `data/show.json` — a preview version, or the `workers.dev` URL — and
adapts: navigation links point at the host you are actually browsing so the
preview is usable, while the canonical tag still points at the production
domain and every response carries `noindex`. A preview can never compete with
the real site in search results, and neither can an episode the gate is holding
back.

Open `/health` on the preview URL before merging. It names the host it is
serving, and it is the fastest way to confirm a new episode is complete.

Once `podcast.centralmidtown.org` is attached to the Worker, set
`workers_dev = false` in `wrangler.toml` so there is exactly one public copy of
the site and one hostname advertising the feed.

### What runs before a merge

`.github/workflows/ci.yml` runs on every pull request and needs no secrets:

1. `node --test` — the unit tests
2. `node scripts/check.mjs` — validates the **real** `data/show.json` and
   `episodes/*.json`, confirms the registry and the episodes directory agree,
   renders every route, and prints the `/health` report into the build log
3. `npx wrangler deploy --dry-run` — catches a broken import or a bad
   `wrangler.toml` before Workers Builds meets it on `main`

A trailing comma in an episode JSON — the most likely thing to go wrong when
editing from a phone — fails step 2 with the file name and line number, on the
pull request, before anything deploys.

### The rest of the Cloudflare setup

- **Custom domain**: `podcast.centralmidtown.org` on the Worker
  (Worker → Settings → Domains & Routes). DNS is automatic, the zone is already
  on Cloudflare.
- **R2**: bucket `cm-podcast-audio` with the custom domain
  `media.podcast.centralmidtown.org`, which makes objects publicly readable over
  HTTPS with no egress cost.
- **Static assets**: `/public` uploads with each deploy and is served from
  Cloudflare's edge, configured under `[assets]` in `wrangler.toml`.

---

## Local development

Optional — the phone workflow never needs this.

```
npm test                 # 40 unit tests, no dependencies, Node's built-in runner
npm run check            # validate the real repo data, print the health report
npx wrangler dev         # local Worker at http://127.0.0.1:8787
npx wrangler deploy --dry-run
```

Tests cover the gate, the feed, the export formats, and page rendering. They
import only the pure modules under `/src`, so they run without Wrangler.
