# Bento animation samples

Sample animations made with the [bento/slides](https://bento.page) editor. Each
animation is one self-contained HTML file: the deck, its viewer and its editor.

## List of animations

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