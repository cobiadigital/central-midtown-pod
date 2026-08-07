// Shared fixtures. These are raw-JSON shaped, exactly as an episode file is.

export const NOW = Date.parse('2026-08-20T12:00:00Z');

export const show = {
  title: 'Central Midtown',
  subtitle: 'Conversations with the artists and organizers of Midtown Mobile.',
  description: 'A show about a building and a neighborhood.',
  link: 'https://podcast.centralmidtown.org',
  language: 'en-us',
  copyright: '© 2026 Central Midtown',
  author: 'Central Midtown',
  explicit: false,
  type: 'episodic',
  guid: '57fd3b76-557e-4fd6-9edf-95575edc46b3',
  image: 'https://podcast.centralmidtown.org/cover-3000.jpg',
  owner: { name: 'Central Midtown', email: 'podcast@centralmidtown.org' },
  categories: [{ name: 'Society & Culture', subcategory: 'Places & Travel' }],
  platforms: [
    { name: 'Apple Podcasts', url: 'https://podcasts.apple.com/example' },
    { name: 'Spotify', url: 'https://open.spotify.com/show/example' },
  ],
};

/** A complete, publishable episode. */
export const valid = {
  number: 2,
  season: 1,
  slug: 'a-room-with-a-door',
  title: 'A Room With a Door',
  guid: '11111111-2222-4333-8444-555555555555',
  pubDate: '2026-08-12T09:00:00-05:00',
  explicit: false,
  shortDescription: 'A painter on twelve years of the same studio.',
  showNotes:
    'Full notes with a [link](https://example.org/studio) and **emphasis**.\n\n- One bullet\n- Two bullet',
  pullQuote: 'You do not get the room, you get the door.',
  keywords: ['Mobile Alabama', 'painting'],
  audio: {
    url: 'https://media.podcast.centralmidtown.org/002.mp3',
    bytes: 48210944,
    durationSeconds: 3012,
    mimeType: 'audio/mpeg',
  },
  video: { youtubeId: 'abc123', thumbnailAlt: 'A painter in a studio doorway' },
  chapters: [
    { start: 0, title: 'Intro' },
    { start: 95, title: 'The building' },
    { start: 3720, title: 'Where to find the work' },
  ],
  guests: [
    {
      name: 'Rae Adkins',
      pronouns: 'they/them',
      bio: 'A painter working out of the third floor.',
      headshot: 'https://media.podcast.centralmidtown.org/rae.jpg',
      links: [
        { label: 'Artist page', url: 'https://example.org/rae' },
        { label: 'Instagram', url: 'https://example.org/rae-ig' },
      ],
      releaseSigned: true,
    },
  ],
  credits: { host: 'A. Host', editor: 'B. Editor', music: 'C. Composer' },
  cta: { label: 'Support Central Midtown', url: 'https://centralmidtown.org/give' },
};

export const noAudioBytes = { ...valid, number: 3, guid: 'aaaa1111-2222-4333-8444-555555555555', audio: { ...valid.audio, bytes: 0 } };

export const unsignedRelease = {
  ...valid,
  number: 4,
  guid: 'bbbb1111-2222-4333-8444-555555555555',
  guests: [{ ...valid.guests[0], releaseSigned: false }],
};

export const futureDated = {
  ...valid,
  number: 5,
  guid: 'cccc1111-2222-4333-8444-555555555555',
  pubDate: '2027-01-01T09:00:00-06:00',
};

export const vtt = `WEBVTT

1
00:00:00.000 --> 00:00:04.000
The door was already there.

2
00:00:04.000 --> 00:00:09.000
We just kept walking through it.
`;

export function registryOf(...episodes) {
  return episodes.map((data) => ({
    number: data.number,
    file: `episodes/${String(data.number).padStart(3, '0')}.json`,
    data,
    vtt,
  }));
}
