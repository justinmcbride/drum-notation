# Credits and licenses

## Drum samples (`public/samples/`)

The drum sounds are short excerpts of two free sample libraries. They were prepared by
[`scripts/build-samples.py`](scripts/build-samples.py), which downloads the original files and
rebuilds everything in `public/samples/` along with `src/audio/sample-manifest.ts`.

### Karoryfer Big Rusty Drums: every sound except the cowbell

- Library: [Big Rusty Drums](https://github.com/sfzinstruments/karoryfer.big-rusty-drums) by Karoryfer Samples
- License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) (public domain dedication). No attribution is required, but it's given here with thanks.
- Files: `kick-*`, `snare-*`, `rimshot-*`, `sidestick-*`, `tom-*`, `hihat-*`, `ride-*`, `crash-*`, `china-*`
- Changes: a few velocity layers and round robins were selected per articulation. The 14", 15" and 18"
  toms are used as the high, mid and floor toms. Close and overhead microphones were mixed to mono at
  the library's default levels. Silence was trimmed, tails were shortened with a fade-out, one gain was
  applied to the whole kit, and the files were re-encoded to Ogg Opus and AAC (.m4a).

### AVL Drumkits by Glen MacArthur (bandshed.net): cowbell

- Library: AVL Drumkits by Glen MacArthur ([bandshed.net](http://www.bandshed.net/avldrumkits/)), Black Pearl kit,
  taken from the SF2 files distributed with [x42/avldrums.lv2](https://github.com/x42/avldrums.lv2/tree/master/sf2)
- License: [CC BY-SA 3.0](http://creativecommons.org/licenses/by-sa/3.0/), with the author's exception quoted below
- Files: **`cowbell-avl-1`, `cowbell-avl-2` and `cowbell-avl-3` (`.ogg` and `.m4a`) are licensed under CC BY-SA 3.0.**
  The license covers only these cowbell files, not the rest of this project.
- Changes: three of the five cowbell velocity layers (`56-Cowbell-01`, `-03` and `-05`) were extracted from
  `Black_Pearl_4_LV2.sf2`. They were trimmed, given a short fade-in and fade-out, level-matched to the rest
  of the kit, and re-encoded to Ogg Opus and AAC (.m4a). These derived files are not the AVL Drumkits
  library, nor a fork of it.

The AVL Drumkits README (included as the author's license requires):

```text
AVL-Drumkits
============

Created by: Glen MacArthur 2015
Formats: SFZ, SF2, h2drumkit
Website: http://www.bandshed.net/avldrumkits/
Contact: info@bandshed.net

License
=======

CC-BY-SA with the following exception:
The by-sa condition is imperative if you modify the samples
themselves or create new sample libraries with this licensed product.
However, produced music and other non-sample-library works can be
licensed freely.

Attribution means keeping all authors information and this readme-file or
its content in the release.
If you want to create a fork, a modified version, of this sample library
you have to release and distribute it under a different name.

http://creativecommons.org/licenses/by-sa/3.0/
```

## Font

[Bravura](https://github.com/steinbergmedia/bravura) is © Steinberg Media Technologies GmbH and licensed
under the SIL Open Font License (see `public/fonts/Bravura-OFL.txt`).
