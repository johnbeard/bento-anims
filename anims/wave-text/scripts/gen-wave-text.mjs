#!/usr/bin/env node
// Generate anims/wave-text/wave-text.bento.html.
//
// The deck is the ARTIFACT; this script is its SOURCE. Adjust the tuning block
// below and re-run, rather than editing the generated document by hand: a run
// replaces the whole #bento-doc block and the two effect blocks in the head.
//
//   node anims/wave-text/scripts/gen-wave-text.mjs          # write the deck
//   node anims/wave-text/scripts/gen-wave-text.mjs --check  # is it stale?
//   node anims/wave-text/scripts/gen-wave-text.mjs --force  # discard app edits
//
// This generator was reconstructed from the deck itself (the animation was
// authored directly in the file, before the repo kept generators). It is
// verified to reproduce that deck byte for byte, so it is a faithful record of
// the effect rather than a re-invention; `--check` proves it stays that way.
//
// Two kinds of tunable, and they live in different places on purpose:
//
//  - DECK-LEVEL: the line, its size, the palette, the slide. All in the block
//    below, because the same values have to appear in several places at once
//    (the theme, the element's type, the effect's CSS custom properties). A
//    colour written once here cannot drift out of step with itself.
//  - EFFECT-LEVEL: the per-character timing (STEP, LEAD) in the SCRIPT block
//    further down. Those are the effect's own clock, they appear in exactly one
//    place, and they are read next to the code that uses them.
//
// The effect itself is the small script in the head, and it is NOT a Bento
// feature: it splits the line into per-character spans inside the presentation
// overlay only. The document keeps one ordinary text element, so the editor
// still sees a plain line of text.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { generate, readDeck, flags } from '../../../scripts/generate-lib.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../../..')
const SHELL = path.join(REPO, 'Bento_Slides.bento.html')
const OUT = path.join(REPO, 'anims/wave-text/wave-text.bento.html')

// ---------------------------------------------------------------- tuning ---
const LINE = 'This text wants to dance'

// One accent, and two steps between it and the ink, because the crest reads as
// a colour change rather than a wave if it jumps straight to full accent.
const INK = '#EDE4D3'
const MID = '#F7D9B0'
const HOT = '#FFC98A'

const GROUND = '#0A0810' // theme background
const DANCE_ID = 'dance' // the text element the effect animates (see the JS block)

// Two typefaces: Fraunces for the line, the system stack for the imprint. The
// font must also be declared in the document's `fonts`, or the embed never
// travels with the file.
const SERIF = "'Fraunces', Georgia, serif"
const SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

const FONT_SIZE = 78
const LETTER_SPACING = -1

// ---------------------------------------------------------------- document ---
/** Everything a generation decides, except the timestamp `modified`. */
const body = (docId) => ({
  $schema: 'https://bento.page/schema/slides.json',
  format: 'bento/slides',
  version: 1,
  docId,
  title: 'This text wants to dance',
  size: { width: 1280, height: 720 },
  theme: { background: GROUND, color: INK, accent: HOT, fontFamily: SERIF },
  meta: {
    subject: 'A bespoke travelling-wave type effect for bento/slides',
    keywords: 'bento, animation, wave, typography, demo',
    author: 'bento',
  },
  fonts: [{ family: 'Fraunces', asset: 'builtin:fraunces-900', weight: '900' }],
  present: { slideNumber: false, progress: false, controls: false },
  // Placeholder: generate() fills in the timestamp, and keeping the key here
  // holds it in this position, before the slides.
  modified: null,
})

const slides = () => [
  {
    id: 's1',
    background: `radial-gradient(78% 62% at 50% 48%, #2A1E28 0%, #150F18 46%, ${GROUND} 100%)`,
    transition: 'none',
    notes:
      'One line, one idea, one effect. The wave is not a Bento effect: it is the small script at the bottom of this file. It splits the line into per-character spans inside the presentation overlay only, and gives every character the same swell with a delay proportional to its index. Because the cycle length is exactly the character count times the per-character delay, the crest can never catch up with itself and the loop is seamless. The document JSON is untouched, so the editor still sees one ordinary text element.',
    elements: [
      {
        id: DANCE_ID,
        type: 'text',
        x: 40,
        y: 250,
        w: 1200,
        h: 220,
        rotation: 0,
        opacity: 1,
        html: LINE,
        fontSize: FONT_SIZE,
        fontFamily: SERIF,
        fontWeight: 900,
        color: INK,
        align: 'center',
        valign: 'middle',
        lineHeight: 1,
        letterSpacing: LETTER_SPACING,
        fx: { enter: 'fade-up', enterDur: 0.9 },
      },
      {
        id: 'mark',
        type: 'text',
        x: 40,
        y: 666,
        w: 1200,
        h: 22,
        rotation: 0,
        opacity: 0.72,
        html: 'made with \u003cb>bento/.\u003c/b>',
        fontSize: 13,
        fontFamily: SANS,
        fontWeight: 500,
        color: '#8C7E74',
        align: 'right',
        valign: 'middle',
        lineHeight: 1.2,
        letterSpacing: 1.2,
      },
    ],
  },
]

// ------------------------------------------------------------------ effect ---
// A bespoke effect for this deck, not part of the bento format. The line is ONE
// ordinary text element in the document; this stylesheet only dresses the
// per-character spans the script below builds inside the presentation overlay.
// The document JSON is never touched.
//
// Everything here is scoped to `.bento-present-overlay`, because the editor
// canvas renders the same element from the same model: an unscoped rule breaks
// editing and thumbnails while presenting still looks right.
//
// The three custom properties are filled from the palette above so the crest
// cannot drift out of step with the theme.
//
// CAREFUL: this is a template literal, so it reads ESCAPE SEQUENCES. A
// backslash must be written as two or the literal silently drops one, and the
// result still runs. That bit the JS block below, where /\s/ became /s/ and
// only the space handling broke.
const EFFECT_CSS = `.bento-present-overlay .bento-text-inner[data-wv] {
  --wv-ink: ${INK};
  --wv-mid: ${MID};
  --wv-hot: ${HOT};
}
/* inline-block is load-bearing: a transform does nothing to a non-replaced
   inline element, so a bare <span> would measure as animating and move zero
   pixels (see kernel/src/anim.ts for the same trap). */
.bento-present-overlay .wv-ch {
  display: inline-block;
  /* grow up from the baseline, so the swell reads as the letters standing up */
  transform-origin: 50% 100%;
  animation-name: wv-swell;
  animation-duration: var(--wv-dur, 1.8s);
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  animation-fill-mode: both;
  will-change: transform;
}
/* Adjacent glyphs lean opposite ways at the crest, so the swell reads as a
   shimmy rather than as a magnifying glass passing over the line. */
.bento-present-overlay .wv-ch:nth-child(odd)  { --wv-tilt: 1.8deg; }
.bento-present-overlay .wv-ch:nth-child(even) { --wv-tilt: -1.8deg; }
/* The crest is deliberately NARROW: it is fully back at rest by 30% of the
   cycle, so roughly three glyphs are enlarged at once and the wave reads as a
   band travelling along the line. A wider hump lights half the sentence and
   looks like a colour change rather than a wave. No glow: a text-shadow bleeds
   across the neighbours and turns the crest into a smudge. */
@keyframes wv-swell {
  0%   { transform: none; color: var(--wv-ink); }
  6%   { transform: translate3d(0,-5px,0) scale(1.14) rotate(var(--wv-tilt, 0deg));
         color: var(--wv-mid); }
  11%  { transform: translate3d(0,-9px,0) scale(1.28) rotate(var(--wv-tilt, 0deg));
         color: var(--wv-hot); }
  20%  { transform: translate3d(0,-4px,0) scale(1.11) rotate(calc(var(--wv-tilt, 0deg) * 0.5));
         color: var(--wv-mid); }
  30%  { transform: none; color: var(--wv-ink); }
  100% { transform: none; color: var(--wv-ink); }
}
/* Motion is decoration: honour both the OS preference and the show's own M key. */
@media (prefers-reduced-motion: reduce) {
  .bento-present-overlay .wv-ch { animation: none; }
}
.bento-present-overlay.reduce-motion .wv-ch { animation: none; }
/* Splitting a line into one span per letter makes a screen reader read it out
   letter by letter. The glyphs are therefore hidden from the accessibility tree
   and this unmodified copy of the line is what gets announced. */
.bento-present-overlay .wv-sr {
  position: absolute;
  width: 1px; height: 1px;
  margin: -1px; padding: 0; border: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}`

// The effect itself: one travelling crest of size, left to right, forever.
// STEP and LEAD are its clock; EL_ID is filled from the tuning block so
// renaming the text element cannot silently detach the effect.
//
// This block is regex-heavy and lives in a template literal: write every
// backslash TWICE (see the note above EFFECT_CSS). The regexes here are the
// whitespace test that decides which characters get a span.
const EFFECT_JS = `(function () {
  'use strict'

  var EL_ID = '${DANCE_ID}'   // the text element that dances
  var STEP = 0.1        // seconds between one character and the next
  var LEAD = 1.15       // let the entrance settle before the wave sets off
  var OVERLAY = '.bento-present-overlay'

  /**
   * Split the line into one span per glyph and hand each the same animation
   * with a delay proportional to its index. The sweep is therefore a pure
   * function of position, and the cycle is exactly (characters x STEP) long,
   * so the crest leaves on the right at the moment it re-enters on the left.
   */
  function split(host) {
    var el = host.querySelector('[data-el-id="' + EL_ID + '"]')
    if (!el) return false
    var inner = el.querySelector('.bento-text-inner')
    // data-wv marks a line already split. Set it BEFORE mutating: the observer
    // below fires on our own insertions and this is what stops re-entry.
    if (!inner || inner.dataset.wv) return !!inner
    var text = inner.textContent
    if (!text || !text.trim()) return false
    inner.dataset.wv = '1'
    // One line, never wrapped: a break would put two crests on different rows.
    inner.style.whiteSpace = 'nowrap'

    var frag = document.createDocumentFragment()
    var n = 0
    for (var i = 0; i < text.length; i++) {
      var ch = text[i]
      if (/\\s/.test(ch)) {
        // a real space, so the browser's own word spacing still applies
        frag.appendChild(document.createTextNode(ch))
      } else {
        var span = document.createElement('span')
        span.className = 'wv-ch'
        span.textContent = ch
        span.setAttribute('aria-hidden', 'true')
        span.style.animationDelay = (LEAD + n * STEP).toFixed(3) + 's'
        frag.appendChild(span)
      }
      n++
    }
    inner.textContent = ''
    inner.appendChild(frag)
    // A space still costs a step, so the gaps between words travel with the
    // letters instead of being overtaken by them.
    inner.style.setProperty('--wv-dur', (n * STEP).toFixed(3) + 's')
    // The glyphs are decorative to a screen reader (see .wv-sr): announce the
    // line once, unmodified.
    var sr = document.createElement('span')
    sr.className = 'wv-sr'
    sr.textContent = text
    inner.appendChild(sr)
    return true
  }

  var armed = false
  function arm() {
    var host = document.querySelector(OVERLAY)
    // The overlay is built fresh on every show start and torn down on exit, so
    // a one-shot hook would only ever work for the first show. Watching for
    // childList changes (never attributes: the show toggles classes constantly)
    // re-arms itself the moment the overlay leaves.
    if (!host) { armed = false; return }
    if (armed) return
    if (split(host)) armed = true
  }

  new MutationObserver(arm).observe(document.documentElement, {
    childList: true,
    subtree: true,
  })
  arm()
})()`

// ---------------------------------------------------------------- the run ---
const { doc: prevDoc } = readDeck(OUT)
const doc = { ...body(prevDoc?.docId || crypto.randomUUID()), slides: slides() }

const shell = fs.readFileSync(SHELL, 'utf8')
const empty = '<script type="application/bento+json" id="bento-doc"></script>'
if (!shell.includes(empty)) throw new Error(`${SHELL} has no empty #bento-doc block to fill`)

/** Rewrite the deck: the document block, then the effect's two blocks in the
 *  head. `stamp` records which document it was generated from. */
const render = (withModified, stamp) => {
  // Escape every "<" so the block can never carry a literal </script>.
  const json = JSON.stringify(withModified, null, 2).replace(/</g, '\\u003c')
  const block = `<script type="application/bento+json" id="bento-doc">\n${json}\n</script>`
  const head =
    // The blank line keeps the effect clear of the shell's own splash styles.
    `\n${stamp}\n` +
    `    <!-- wave-text: a bespoke effect for this deck, not part of the bento format.\n` +
    `         The line is ONE ordinary text element in the document; this stylesheet\n` +
    `         only dresses the per-character spans the script below builds inside the\n` +
    `         presentation overlay. The document JSON is never touched. -->\n` +
    `    <style id="wave-text-css">\n${EFFECT_CSS}\n    </style>\n\n` +
    `    <!-- wave-text: the effect itself. One travelling crest of size, left to\n` +
    `         right, forever. Everything here is scoped to the presentation overlay,\n` +
    `         so the editor canvas and the saved document are untouched. -->\n` +
    `    <script id="wave-text-js">\n${EFFECT_JS}\n    </script>\n` +
    `  </head>`
  return shell.replace(empty, () => block).replace('  </head>', head)
}

const result = generate({
  repo: REPO,
  out: OUT,
  name: 'wave-text',
  script: 'anims/wave-text/scripts/gen-wave-text.mjs',
  command: 'npm run gen:wave-text',
  doc,
  render,
  ...flags(),
})

const text = fs.readFileSync(result.out, 'utf8')
console.log(
  result.wrote
    ? `wrote ${path.relative(REPO, result.out)} (${Math.round(text.length / 1024)} KB)`
    : `${path.relative(REPO, result.out)}: ${result.message}`,
)
// Include the spaces: they get no span but they do advance the clock, so
// the cycle is built from the whole line.
console.log(`${LINE.length} characters (${LINE.replace(/\s/g, '').length} glyphs); ${result.message}`)
