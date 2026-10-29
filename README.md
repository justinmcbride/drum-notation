# Drum Notation

A mobile-friendly web app for learning to read drum notation. Everything runs in the browser, with no server.

**Live:** https://justinmcbride.github.io/drum-notation/

## What's inside

- **Staff:** an interactive drum key. Tap any note to hear it and learn where each drum and cymbal sits on the percussion staff. A Basic/Advanced toggle (shared with the Quiz and remembered between visits) switches between a standard kit and the full key with the hi-hat pedal, ride bell, china and cowbell.
- **Rhythm:** note and rest values, plus counting exercises with highlighted counts ("1 e & a") and a metronome.
- **Hits:** every common marking, each with a playable example:
  - accents, marcato and ghost notes
  - rimshots and cross-stick
  - flams, drags, buzz rolls and single-stroke rolls
  - open, closed and half-open hi-hat; hi-hat foot; ride bell; cymbal chokes
- **Grooves:** classic beats and fills, with tempo control, looping, a metronome, counts, and color-by-drum. The current note is highlighted as it plays.
- **Quiz:** flash cards for naming drums and markings, with streak tracking. Basic asks only about the standard kit and everyday markings (accent, ghost note, rimshot, cross-stick, open and closed hi-hat); Advanced covers everything.

The notation is engraved as SVG by a small purpose-built renderer (`src/notation/`) using the [Bravura](https://github.com/steinbergmedia/bravura) SMuFL music font. Drum sounds are recorded samples played with the Web Audio API (`src/audio/`). Velocity layers cover ghost notes, normal hits and accents, and round robins alternate between takes. Flams, drags and rolls are built from single hits. Closing the hi-hat cuts off an open hat, and choked cymbals are grabbed. Samples load in the background after the first tap or play. Until a sound is ready, or if it can't load, the app falls back to a synthesized version.

The samples (about 1.4 MB as Ogg Opus plus an AAC/.m4a copy for browsers without Opus) are rebuilt by `scripts/build-samples.py`, which needs Python 3, NumPy and ffmpeg.

## Development

```sh
npm install
npm run dev      # start a local dev server
npm run build    # type-check and build to dist/
npm run preview  # serve the production build
```

Pushing to `main` builds and deploys to GitHub Pages via `.github/workflows/deploy.yml`.

## Credits and licenses

- Drum samples: [Big Rusty Drums](https://github.com/sfzinstruments/karoryfer.big-rusty-drums) by Karoryfer Samples, [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). No attribution is required, but it's given here with thanks.
- Cowbell: **AVL Drumkits by Glen MacArthur ([bandshed.net](http://www.bandshed.net/avldrumkits/))**, [CC BY-SA 3.0](http://creativecommons.org/licenses/by-sa/3.0/). Changes: three velocity layers were extracted from the Black Pearl SF2, then trimmed, faded, level-adjusted and re-encoded to Opus/AAC. The derived files `public/samples/cowbell-avl-*` are licensed CC BY-SA 3.0.
- Bravura is © Steinberg Media Technologies GmbH and licensed under the SIL Open Font License (see `public/fonts/Bravura-OFL.txt`).

See [CREDITS.md](CREDITS.md) (and `public/samples/LICENSES.txt`, which ships with the site) for full details and the AVL Drumkits license text.
