// The episode registry.
//
// ---------------------------------------------------------------------------
// TO ADD AN EPISODE, DO THREE THINGS:
//   1. Create episodes/{nnn}.json
//   2. Create episodes/{nnn}.vtt
//   3. Add two import lines and one array entry below, copying episode 001
// ---------------------------------------------------------------------------
//
// Why this file exists: the Workers runtime has no filesystem, so episode data
// has to be part of the bundle. There is no glob import without adding a build
// step, and a build step is exactly what the phone-only workflow cannot have.
//
// The upside of listing files by hand is that a typo or a missing file fails
// the Workers build with a named error, and the previously deployed version
// stays live. A runtime lookup would deploy successfully and 404 in public.

import episode001 from './001.json';
import transcript001 from './001.vtt';

export default [
  { number: 1, file: 'episodes/001.json', data: episode001, vtt: transcript001 },
];
