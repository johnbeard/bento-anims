#!/usr/bin/env node
// Generate anims/heartbeat/heartbeat.bento.html.
//
// The deck is the ARTIFACT; this script is its SOURCE. Adjust the constants in
// the tuning block below and re-run, rather than editing the generated
// document by hand: a run replaces the whole #bento-doc block and the shell's
// stylesheet.
//
//   node anims/heartbeat/scripts/gen-heartbeat.mjs          # write the deck
//   node anims/heartbeat/scripts/gen-heartbeat.mjs --check  # is it stale?
//   node anims/heartbeat/scripts/gen-heartbeat.mjs --force  # discard app edits
//
// The derived parts are why this exists as a script at all:
//
//  - The pen moves at constant HORIZONTAL speed, but a dash animation is linear
//    in path LENGTH. The keyframe stops are therefore computed from the path's
//    own arc length, then thinned (see "the pen's time warp" below). Change the
//    waveform and the stops follow; a hand-written two-stop sweep cannot.
//  - The live layers' paint lives in the shell stylesheet while the static
//    trace's paint lives in SVG attributes. Both come from one palette here, so
//    a colour cannot be changed in one place and forgotten in the other.
//  - The dash length appears twice per layer (stroke-dasharray and --hb-dash),
//    and the two must agree or the trail detaches from the dot. They are
//    generated from one number.
//
// Editing the deck in the app and then re-running would lose that work, so a
// deck saved from the editor is REFUSED: the file records a hash of the
// document it was generated from, which makes "untouched since generation"
// decidable. --force overrides.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { generate, readDeck, flags } from '../../../scripts/generate-lib.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../../..')
const SHELL = path.join(REPO, 'Bento_Slides.bento.html')
const OUT = path.join(REPO, 'anims/heartbeat/heartbeat.bento.html')

// ---------------------------------------------------------------- tuning ---
// ALL geometry is in slide units (the deck is 1280x720). The waveform is
// authored in its own coordinate space and stretched into its box, so these
// numbers are independent of where the element sits.
const W = 1140 // box width and height
const H = 300
const BASE = 176 // baseline, from the top of the box
const X0 = 34 // the trace starts here, leaving a margin on the left
const BEAT = 268 // one beat's period along x
const BEATS = 4 // how many beats fit in the strip
const WANDER = 2 // slow vertical drift across the strip (a straight line reads as dead)
const R_UP = 100 // the R spike goes this far up
const S_DOWN = 30 // ...and the S dip this far down
const SECONDS = 4.8 // one full pass of the pen
const TOLERANCE = 0.3 // how closely the stops must track constant horizontal speed,
// in path units of the 1000 the path is normalised to. Larger = fewer keyframes.
const AT = { x: 70, y: 205 } // where the element sits on the slide

// Colours and the look of each layer. `dash` is the length of that layer's
// stroke: a long dash is a comet tail, a dash of almost no length with a round
// cap is the dot. Widths and blurs are in slide units.
const INK = {
  halo: '#12C48B',
  trace: '#46E9B7',
  tailFar: '#0FB47E',
  tailMid: '#37E7AE',
  tailHot: '#CEFFE9',
  headFar: '#0FB47E',
  headMid: '#3CE8B1',
  headNear: '#BDFFEA',
  core: '#FFFFFF',
}

/** The static trace, drawn on its own whether or not the shell is present. */
const HALO = { stroke: INK.halo, width: 12, opacity: 0.12, blur: 9 }
const TRACE = { stroke: INK.trace, width: 2.2, opacity: 0.62 }

/** Painted by the shell stylesheet. Order is z-order: tails behind the head. */
const TAILS = [
  { cls: 'hb-tail-far', stroke: INK.tailFar, width: 16, opacity: 0.16, blur: 10, dash: 124 },
  { cls: 'hb-tail-mid', stroke: INK.tailMid, width: 7, opacity: 0.42, blur: 4, dash: 70 },
  { cls: 'hb-tail-hot', stroke: INK.tailHot, width: 2.8, opacity: 1, blur: 0.7, dash: 34 },
]
const HEADS = [
  { cls: 'hb-head-3', stroke: INK.headFar, width: 64, opacity: 0.16, blur: 15 },
  { cls: 'hb-head-2', stroke: INK.headMid, width: 30, opacity: 0.36, blur: 8 },
  { cls: 'hb-head-1', stroke: INK.headNear, width: 12, opacity: 0.9, blur: 3 },
  { cls: 'hb-head-0', stroke: INK.core, width: 4.2, opacity: 1, blur: 0.5 },
]
const HEAD_DASH = 0.6 // long enough that a round cap still draws a dot
const LAYERS = [...TAILS, ...HEADS]

// A CSS number with the leading zero dropped, as the rest of the sheet writes
// them (.16, not 0.16).
const n = (v) => String(v).replace(/^0\./, '.')

// ---------------------------------------------------------------- geometry ---
// The trace, built as SEGMENTS as well as a string: the arc-length table below
// needs the geometry, and re-deriving it by parsing the string would be a
// second source of truth for the same shape.
const y = (x, dy) => +(BASE + WANDER * Math.sin(((x - X0) / (BEAT * BEATS)) * Math.PI * 2) + dy).toFixed(2)
const XEND = X0 + BEAT * BEATS

const segs = []
const start = { x: X0, y: y(X0, 0) }
let cur = start
const L = (x, dy) => {
  const to = { x, y: y(x, dy) }
  segs.push({ kind: 'L', from: cur, to })
  cur = to
}
const C = (c1x, c1dy, c2x, c2dy, x, dy) => {
  const to = { x, y: y(x, dy) }
  segs.push({ kind: 'C', from: cur, c1: { x: c1x, y: y(c1x, c1dy) }, c2: { x: c2x, y: y(c2x, c2dy) }, to })
  cur = to
}

for (let b = 0; b < BEATS; b++) {
  const bx = X0 + b * BEAT
  // P wave: a small rounded bump
  L(bx + 20, 0)
  C(bx + 28, -13, bx + 34, -18, bx + 42, -18)
  C(bx + 50, -18, bx + 54, -10, bx + 60, 0)
  // PR segment, then the QRS complex: sharp lines, not curves
  L(bx + 82, 0)
  L(bx + 88, 10)
  L(bx + 92, -R_UP)
  L(bx + 98, S_DOWN)
  L(bx + 104, 0)
  // ST segment, then the T wave: a broader, lower hump
  L(bx + 124, 0)
  C(bx + 134, -8, bx + 142, -30, bx + 154, -30)
  C(bx + 166, -30, bx + 172, -12, bx + 180, 0)
  // diastole: flat to the next beat
  L(bx + BEAT, 0)
}

const d =
  `M ${start.x.toFixed(2)} ${start.y.toFixed(2)}` +
  segs
    .map((s) =>
      s.kind === 'L'
        ? ` L ${s.to.x.toFixed(2)} ${s.to.y.toFixed(2)}`
        : ` C ${s.c1.x.toFixed(2)} ${s.c1.y.toFixed(2)} ${s.c2.x.toFixed(2)} ${s.c2.y.toFixed(2)} ${s.to.x.toFixed(2)} ${s.to.y.toFixed(2)}`,
    )
    .join('')

// ------------------------------------------------------- the pen's time warp ---
// A dash animation is linear in PATH LENGTH, so a steep segment eats the same
// time per unit of x as flat ground takes per unit of length: the pen crawls
// through the QRS at a fraction of its speed along the baseline. An ECG is
// written at constant PAPER speed, so the keyframes have to warp time against
// arc length. Sample the path, build the table (horizontal fraction -> path
// position), then keep only the stops a straight line cannot span.
const arc = [{ x: start.x, s: 0 }]
let arcLen = 0
let prevPt = start
const push = (pt) => {
  arcLen += Math.hypot(pt.x - prevPt.x, pt.y - prevPt.y)
  prevPt = pt
  arc.push({ x: pt.x, s: arcLen })
}
for (const seg of segs) {
  if (seg.kind === 'L') {
    push(seg.to)
    continue
  }
  const N = 64 // a cubic this flat is exact well below a pixel at 64 steps
  for (let i = 1; i <= N; i++) {
    const t = i / N
    const mt = 1 - t
    const a = mt * mt * mt
    const b = 3 * mt * mt * t
    const c = 3 * mt * t * t
    const e = t * t * t
    push({
      x: a * seg.from.x + b * seg.c1.x + c * seg.c2.x + e * seg.to.x,
      y: a * seg.from.y + b * seg.c1.y + c * seg.c2.y + e * seg.to.y,
    })
  }
}

const table = arc.map((q) => ({
  u: (q.x - X0) / (XEND - X0), // 0..1 across the strip: the linear clock
  p: (1000 * q.s) / arcLen, // path position, in the space pathLength="1000" defines
}))

/** Keep the fewest points that keep the INTERPOLATED path within `eps` of the
 *  truth. Vertical distance, not perpendicular: CSS interpolates the value, so
 *  the error that matters is how far along the path the pen is at a given
 *  moment. */
function thin(points, eps) {
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    const A = points[a]
    const B = points[b]
    let worst = -1
    let worstGap = eps
    for (let i = a + 1; i < b; i++) {
      const t = (points[i].u - A.u) / (B.u - A.u || 1)
      const gap = Math.abs(points[i].p - (A.p + (B.p - A.p) * t))
      if (gap > worstGap) {
        worstGap = gap
        worst = i
      }
    }
    if (worst >= 0) {
      keep[worst] = 1
      stack.push([a, worst], [worst, b])
    }
  }
  return points.filter((_, i) => keep[i])
}

const stops = thin(table, TOLERANCE)
// The pen stays on the horizontal clock; only its path offset warps. Each layer
// subtracts its own dash length, so every dash ENDS at the pen.
const sweepStops = stops
  .map((q, i) => {
    const pct = i === stops.length - 1 ? '100%' : (q.u * 100).toFixed(3) + '%'
    return `  ${pct} { stroke-dashoffset: calc(var(--hb-dash) - ${q.p.toFixed(2)}px); }`
  })
  .join('\n')

// ------------------------------------------------------------------ markup ---
const paint = (p) =>
  `fill="none" stroke="${p.stroke}" stroke-width="${n(p.width)}" stroke-linecap="round" ` +
  `stroke-linejoin="round" opacity="${n(p.opacity)}"` +
  (p.blur ? ` filter="blur(${n(p.blur)}px)"` : '')

// The trace carries its own paint as presentation attributes, so the document
// draws on its own (copied without the shell below, the waveform is still
// there; the live copies have no stroke and stay invisible).
const markup =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" ` +
  `preserveAspectRatio="none" class="hb" role="img" ` +
  `aria-label="An ECG waveform with a glowing point tracing along it">` +
  `<path class="hb-halo" d="${d}" ${paint(HALO)}></path>` +
  `<path class="hb-trace" d="${d}" ${paint(TRACE)}></path>` +
  `<g class="hb-live">` +
  LAYERS.map((l) => `<path class="hb-layer ${l.cls}" d="${d}" pathLength="1000" fill="none"></path>`).join('') +
  `</g></svg>`

// --------------------------------------------------------------------- css ---
// The motion lives in the SHELL, not in the svg element's `css` field. A
// <style> inside the slide is part of the slide's text content, and Reveal's
// aria-status live region reads that text aloud (measured: 2996 characters of
// CSS announced before the slide's own words).
const layerRule = (l, dash) =>
  `[data-el-id="pulse"] .${l.cls} {
  stroke: ${l.stroke};
  stroke-width: ${n(l.width)};
  opacity: ${n(l.opacity)};
  filter: blur(${n(l.blur)}px);
  stroke-dasharray: ${n(dash)}px 2000px;
  --hb-dash: ${n(dash)}px;
}`

const css = `
[data-el-id="pulse"] .hb-layer {
  stroke-linecap: round;
  stroke-linejoin: round;
  /* The dash offset IS the pen position. Every layer runs the same clock; the
     only difference between a tail and the head is the length of its dash.
     The base value parks the pen at the end, which is the state shown when
     animation is unavailable. The custom properties must be lengths: a
     unitless calc() here is invalid CSS. */
  stroke-dashoffset: calc(var(--hb-dash) - 1000px);
  animation: hb-sweep ${SECONDS}s linear infinite;
}
[data-el-id="pulse"] .hb-live {
  /* Fade at the seam: the pen leaves on the right and re-enters on the left,
     and without this the head teleports while the tail snaps off. */
  animation: hb-fade ${SECONDS}s linear infinite;
}
/* Tail: a long dash ending at the head, blurred wide so the bright segment
   behind the pen dissolves into the dim trace instead of stopping dead. */
${TAILS.map((l) => layerRule(l, l.dash)).join('\n')}
/* Head: a dash of almost no length, so the round cap is the dot. Stacking
   widths and blurs makes a white core inside a phosphor glow. */
${HEADS.map((l) => layerRule(l, HEAD_DASH)).join('\n')}
@keyframes hb-sweep {
  /* Generated, not authored: each stop is the path position at which the pen
     is that fraction of the way ACROSS the strip. Thinned to the fewest stops
     that keep the pen within ${TOLERANCE} path units of the horizontal clock,
     which is what makes the dot move at constant horizontal speed instead of
     constant speed along the line (see the tuning block). */
${sweepStops}
}
@keyframes hb-fade {
  0%   { opacity: 0; }
  4%   { opacity: 1; }
  92%  { opacity: 1; }
  100% { opacity: 0; }
}
/* Honour the OS preference in the editor (no overlay class there) and the
   show's own M toggle; the show also stops the animation globally. */
@media (prefers-reduced-motion: reduce) {
  [data-el-id="pulse"] .hb-live { display: none; }
}
.bento-present-overlay.reduce-motion [data-el-id="pulse"] .hb-live { display: none; }
`.trim()

// ---------------------------------------------------------------- document ---
// A document's id is its identity for recovery and sync, so it is carried
// across runs: regenerating is an edit, not a new document.
/** The document without `modified`, which is the part a generation decides. */
const body = (docId) => ({
  $schema: 'https://bento.page/schema/slides.json',
  format: 'bento/slides',
  version: 1,
  docId,
  title: 'A heartbeat on the wire',
  size: { width: 1280, height: 720 },
  theme: {
    background: '#04080A',
    color: '#DCEFE6',
    accent: '#4BF0BD',
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  meta: {
    subject: 'A bespoke ECG trace effect for bento/slides',
    keywords: 'bento, animation, heartbeat, ecg, svg, css',
    author: 'bento',
  },
  present: { slideNumber: false, progress: false, controls: false },
  // Placeholder: generate() fills in the timestamp, and keeping the key here
  // holds it in this position, before the slides.
  modified: null,
})

const slides = () => [
  {
    id: 's1',
    background: 'radial-gradient(74% 64% at 50% 52%, #0A1512 0%, #060C0B 52%, #030605 100%)',
    transition: 'none',
    notes:
      'An ECG is a line and a pen. The document carries the line as one ordinary svg element: a phosphor trace plus a dim halo, both the same path. The sweep is not scripted. Every moving part is a copy of that path whose stroke is a single dash, and a CSS keyframe marches the dash along it. A long dash is the comet tail; a near-zero dash with a round cap is the glowing head. pathLength="1000" normalises the dashes, so one offset places every layer, each shifted by its own dash length so all of them end at the pen. The one thing a dash animation will not do by itself is move at constant horizontal speed: it is linear in path LENGTH, which makes the pen crawl through the steep QRS at a twentieth of its speed along the baseline. An ECG is written at constant paper speed, so the keyframes are generated from the path itself: seventy stops, each the path position at which the pen is that fraction of the way across the strip, thinned to the fewest a straight line cannot span. Measured: 53.3 to 53.9 pixels per quarter second, the whole way across. The group fades at the seam, which hides the head jumping back to the left. Because the motion is CSS in this file\'s stylesheet rather than a <style> inside the slide, a screen reader\'s slide announcement does not read the stylesheet, the pen restarts when the slide is entered, and both the show\'s M toggle and the OS reduced-motion preference hide it. The trace itself is in the document as presentation attributes, so a copy of the JSON still draws the waveform; only the pen needs this file\'s shell.',
    elements: [
      { id: 'pulse', type: 'svg', x: AT.x, y: AT.y, w: W, h: H, rotation: 0, opacity: 1, markup },
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
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        fontWeight: 500,
        color: '#4B6A5E',
        align: 'right',
        valign: 'middle',
        lineHeight: 1.2,
        letterSpacing: 1.2,
      },
    ],
  },
]

// ---------------------------------------------------------------- the run ---
const { doc: prevDoc } = readDeck(OUT)
const doc = { ...body(prevDoc?.docId || crypto.randomUUID()), slides: slides() }

const shell = fs.readFileSync(SHELL, 'utf8')
const empty = '<script type="application/bento+json" id="bento-doc"></script>'
if (!shell.includes(empty)) throw new Error(`${SHELL} has no empty #bento-doc block to fill`)

/** Rewrite the deck: the document block, then this deck's stylesheet in the
 *  head. `stamp` records which document it was generated from. */
const render = (withModified, stamp) => {
  // Escape every "<" so the block can never carry a literal </script>.
  const json = JSON.stringify(withModified, null, 2).replace(/</g, '\\u003c')
  const block = `<script type="application/bento+json" id="bento-doc">\n${json}\n</script>`
  const head = `${stamp}\n    <style id="heartbeat-css">\n${css}\n    </style>\n  </head>`
  return shell.replace(empty, () => block).replace('  </head>', head)
}

const result = generate({
  repo: REPO,
  out: OUT,
  name: 'heartbeat',
  script: 'anims/heartbeat/scripts/gen-heartbeat.mjs',
  command: 'npm run gen:heartbeat',
  doc,
  render,
  ...flags(),
})

const text = fs.readFileSync(result.out, 'utf8')
const size = `${Math.round(text.length / 1024)} KB`
console.log(
  result.wrote
    ? `wrote ${path.relative(REPO, result.out)} (${size})`
    : `${path.relative(REPO, result.out)}: ${result.message}`,
)
console.log(`${stops.length} sweep stops; path ${d.length} chars; ${result.message}`)
