# Drum Notation

A mobile-friendly web app for learning to read drum notation. Everything runs in the browser, with no server.

**Live:** https://justinmcbride.github.io/drum-notation/

## What's inside

- **Staff:** an interactive drum key. Tap any note to hear it and learn where each drum and cymbal sits on the percussion staff.
- **Rhythm:** note and rest values, plus counting exercises with highlighted counts ("1 e & a") and a metronome.
- **Hits:** every common marking, each with a playable example:
  - accents, marcato and ghost notes
  - rimshots and cross-stick
  - flams, drags, buzz rolls and single-stroke rolls
  - open, closed and half-open hi-hat; hi-hat foot; ride bell; cymbal chokes
- **Grooves:** classic beats and fills, with tempo control, looping, a metronome, counts, and color-by-drum. The current note is highlighted as it plays.
- **Quiz:** flash cards for naming drums and markings, with streak tracking.

The notation is engraved as SVG by a small purpose-built renderer (`src/notation/`) using the [Bravura](https://github.com/steinbergmedia/bravura) SMuFL music font. Drum sounds are synthesized with the Web Audio API (`src/audio/`).

## Development

```sh
npm install
npm run dev      # start a local dev server
npm run build    # type-check and build to dist/
npm run preview  # serve the production build
```

Pushing to `main` builds and deploys to GitHub Pages via `.github/workflows/deploy.yml`.

## License

Bravura is © Steinberg Media Technologies GmbH and licensed under the SIL Open Font License (see `public/fonts/Bravura-OFL.txt`).
