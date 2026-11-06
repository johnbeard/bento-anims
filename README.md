# Bento animation samples

Sample animations made with the [bento/slides](https://bento.page) editor. Each
animation is one self-contained HTML file: the deck, its viewer and its editor.

## List of animations

- [Heartbeat](https://johnbeard.github.io/bento-anims/anims/heartbeat/)
- [Wave Text](https://johnbeard.github.io/bento-anims/anims/wave-text/)

## What gets published

Every animation is served from its own folder, and the address mirrors the
source tree, so the folder a deck lives in is part of its URL:

```
anims/wave-text/wave-text.bento.html    ->   /anims/wave-text/
anims/elevate/Elevate.bento.html        ->   /anims/elevate/
themes/ocean/background.bento.html      ->   /themes/ocean/background/
```

Keeping `anims/` in the path leaves room for other kinds of file beside it
(`themes/`, and anything else later) without every existing address moving.

A deck called `index.bento.html` takes its folder's name, and a file that
repeats its folder (`wave-text/wave-text.bento.html`) says it once, so neither
reads twice in the URL.

The site root is a gallery generated from the decks themselves, so a new
animation appears there without editing anything by hand. Append `#present` to
any animation's address (for example `/anims/wave-text/#present`) to open it
straight in slideshow mode.

Every link is relative, so the site works unchanged at
`https://<owner>.github.io/<repo>/` and on a custom domain.

## Adding an animation

Drop the file into `anims/`, in its own folder. Nothing else to wire up: the
build discovers it, and the gallery picks it up from the deck's own title.

The build publishes a `*.bento.html` whose `#bento-doc` block holds a document
with at least one slide, and fails rather than guessing when something is wrong:

- an empty `#bento-doc` is the shell template, not an animation, so it is
  skipped (`Bento_Slides.bento.html` is the one to copy for a new animation)
- a block that will not parse fails the build, so a broken deck cannot vanish
  from the site unnoticed
- two files that resolve to the same address fail the build, rather than one
  silently winning

## Regenerating a deck from its script

A deck whose geometry or motion is computed keeps its generator beside it, at
`anims/<name>/scripts/`. The script is the source and the `.bento.html` is the
artifact, so the numbers worth changing sit in one tuning block near the top of
the script rather than in the generated document:

```sh
npm run gen:heartbeat                # rewrite the deck
npm run gen:heartbeat -- --check     # is the checked-in deck stale?
npm run gen:heartbeat -- --force     # discard changes made in the app

npm run gen:wave-text                # same, for wave-text
```

Why each deck has one:

- **heartbeat** draws its keyframe stops from the waveform's own arc length,
  which is what keeps the pen on a constant horizontal speed. Nobody can keep
  that up to date by hand when the waveform changes.
- **wave-text** was authored directly in the file before the repo kept
  generators. Its script was reconstructed from the deck and reproduces it byte
  for byte, so the line, its size and the crest palette have one source of
  truth instead of three (theme, element, CSS custom properties).

Both use `scripts/generate-lib.mjs`. A re-run replaces the whole document, so a
deck that has been saved from the editor is refused rather than silently
flattened. The file records a hash of the document it was generated from, and a
mismatch means the app stored something the script does not know about: move
that change into the script, or pass `--force` to accept losing it.

## Preview locally

```sh
npm run dev      # build, then serve at http://localhost:8080/
```

`npm run build` writes `_site/` on its own, and `npm run serve` serves an
existing build (`PORT=9000` to move it). Directory URLs such as
`/anims/wave-text/` resolve here exactly as they do on Pages, which is the point
of serving rather than opening the files from disk.

## Deployment

Pushes to `master` run `.github/workflows/pages.yml`, which publishes the build
with GitHub's artifact flow: `configure-pages` -> `upload-pages-artifact` ->
`deploy-pages`. Nothing is committed to a `gh-pages` branch, and GitHub never
builds the site itself, so what ships is exactly the folder the build produced.

The build has no dependencies, so the job never runs `npm install`.

**One-time setup:** Settings -> Pages -> Build and deployment -> Source:
**GitHub Actions**.
x
Pull requests build the site but do not deploy, so a deck that does not parse
fails review instead of the default branch.