#!/usr/bin/env node
// Build the static site GitHub Pages serves.
//
// ONE DIRECTORY PER ANIMATION, with the URL mirroring the source tree, so a
// category folder is part of the address and can gain siblings later:
//
//   anims/wave-text/wave-text.bento.html  ->  /anims/wave-text/
//   anims/elevate/Elevate.bento.html      ->  /anims/elevate/
//   themes/ocean/background.bento.html    ->  /themes/ocean/background/
//
// A Bento file IS its own page: nothing is compiled, so the deck is copied
// byte for byte and renamed index.html — that is what turns the location into
// a directory rather than a filename.
//
// A deck is published when its #bento-doc block holds a real document. An
// empty block is the shell template (Bento_Slides.bento.html), which is the
// starting point for a new animation, not an animation. A block that does not
// parse FAILS the build rather than being skipped: a broken deck must not
// disappear from the site without anyone noticing.
//
// Zero dependencies on purpose. The workflow installs nothing, so the pipeline
// cannot break because a package moved.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outArg = process.argv.indexOf('--out')
const OUT = path.resolve(ROOT, outArg >= 0 ? process.argv[outArg + 1] : '_site')
const SKIP_DIRS = new Set(['node_modules', 'dist'])

// The document block is plain JSON between the tags. A literal "</script>" can
// never appear inside it (builders escape every "<" as \u003c), so a lazy match
// is exact rather than merely convenient.
const DOC_BLOCK = /<script[^>]*\bid=["']bento-doc["'][^>]*>([\s\S]*?)<\/script>/i

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

function walk(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      // dot directories (.git, .github, .vscode) are never content
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
      if (path.resolve(dir, entry.name) === OUT) continue
      walk(path.join(dir, entry.name), found)
    } else if (entry.isFile() && entry.name.endsWith('.bento.html')) {
      found.push(path.join(dir, entry.name))
    }
  }
  return found
}

/** The address an animation is published at, from its path in the repo.
 *
 * The URL MIRRORS THE SOURCE TREE, so a category folder stays in the address
 * and can grow siblings later:
 *
 *   anims/wave-text/wave-text.bento.html  ->  /anims/wave-text/
 *   anims/elevate/Elevate.bento.html      ->  /anims/elevate/
 *   themes/ocean/background.bento.html    ->  /themes/ocean/background/
 *
 * Two reductions keep it from reading twice. A file called index.bento.html
 * names nothing, so its folder is the name. A file that repeats its own folder
 * says it once: anims/wave-text/wave-text is /anims/wave-text/, not
 * /anims/wave-text/wave-text/.
 *
 * Comparison happens AFTER normalising, so Elevate.bento.html and
 * elevate/elevate.bento.html still collide rather than producing two URLs that
 * differ only in case on a case-insensitive host.
 */
function slugFor(rel) {
  const base = path.basename(rel, '.bento.html')
  const dir = path.dirname(rel)
  const norm = (s) =>
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w.-]+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')

  const parts = []
  if (dir !== '.' && dir !== '') parts.push(...dir.split(path.sep))
  parts.push(base)

  const segs = parts.map(norm).filter(Boolean)
  if (segs.length > 1 && segs[segs.length - 1] === 'index') segs.pop()
  if (segs.length > 1 && segs[segs.length - 1] === segs[segs.length - 2]) segs.pop()
  return segs.join('/')
}

function inspect(file) {
  const rel = path.relative(ROOT, file)
  const html = fs.readFileSync(file, 'utf8')
  const match = html.match(DOC_BLOCK)
  if (!match) return { rel, skip: 'no #bento-doc block' }

  const body = match[1].trim()
  if (!body) return { rel, skip: 'empty #bento-doc (shell or template)' }

  let doc
  try {
    doc = JSON.parse(body)
  } catch (err) {
    return { rel, error: `#bento-doc is not valid JSON (${err.message})` }
  }
  // A bento/enc deck is valid JSON whose content is ciphertext: it has no
  // readable title to list, and publishing it serves a password gate.
  if (doc.format !== 'bento/slides') {
    return { rel, skip: `format "${doc.format}" is not bento/slides` }
  }
  if (!Array.isArray(doc.slides) || doc.slides.length === 0) {
    return { rel, skip: 'document has no slides' }
  }
  return { rel, file, html, doc }
}

function kb(bytes) {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

// ---------------------------------------------------------------- gallery ---

function gallery(animations) {
  const cards = animations
    .map((a, i) => {
      const n = String(i + 1).padStart(2, '0')
      const slides = a.doc.slides.length
      const meta = `${slides} slide${slides === 1 ? '' : 's'} &middot; ${kb(a.bytes)}`
      return `        <li class="card">
          <a class="card-hit" href="./${a.slug}/">
            <span class="card-num">${n}</span>
            <span class="card-title">${esc(a.title)}</span>
            <span class="card-meta">${meta}</span>
            <span class="card-go">Open the deck</span>
          </a>
          <p class="card-actions"><a href="./${a.slug}/#present">Present</a><a href="./${a.slug}/" download="${esc(a.download)}">Download</a></p>
        </li>`
    })
    .join('\n')

  const count = animations.length
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0A0810">
<title>Bento animation samples</title>
<meta name="description" content="Small, self-contained animations made with bento/slides. Each one is a single HTML file.">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230A0810'/%3E%3Crect x='7' y='9' width='6' height='14' rx='2' fill='%23EDE4D3'/%3E%3Crect x='16' y='9' width='9' height='6' rx='2' fill='%23FFC98A'/%3E%3Crect x='16' y='18' width='9' height='5' rx='2' fill='%23EDE4D3'/%3E%3C/svg%3E">
<style>
:root{
  --bg:#0A0810; --ink:#EDE4D3; --muted:#9A8D82; --accent:#FFC98A;
  --line:rgba(237,228,211,.14); --card:rgba(237,228,211,.04);
}
*{box-sizing:border-box}
html,body{margin:0}
body{
  min-height:100vh; background:#0A0810;
  background-image:radial-gradient(78% 62% at 50% 0%,#241A22 0%,#150F18 45%,#0A0810 100%);
  color:var(--ink);
  font:16px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
  -webkit-font-smoothing:antialiased;
}
.wrap{max-width:1040px;margin:0 auto;padding:72px 28px 96px}
.kicker{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);margin:0 0 18px}
h1{font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:clamp(34px,6vw,60px);line-height:1.04;letter-spacing:-.02em;margin:0 0 18px}
.lede{color:var(--muted);max-width:46ch;margin:0 0 56px;font-size:17px}
.grid{list-style:none;margin:0;padding:0;display:grid;gap:18px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}
.card{border:1px solid var(--line);border-radius:14px;background:var(--card);overflow:hidden;transition:border-color .2s ease,background .2s ease,transform .2s ease}
.card:hover,.card:focus-within{border-color:rgba(255,201,138,.5);background:rgba(255,201,138,.06);transform:translateY(-2px)}
.card-hit{display:block;padding:26px 24px 18px;color:inherit;text-decoration:none}
.card-num{display:block;font-size:12px;letter-spacing:.18em;color:var(--accent);margin-bottom:26px}
.card-title{display:block;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.2;letter-spacing:-.01em;margin-bottom:10px}
.card-meta{display:block;font-size:13px;color:var(--muted);margin-bottom:22px}
.card-go{display:inline-block;font-size:13px;letter-spacing:.06em;text-transform:uppercase}
.card-actions{display:flex;gap:18px;margin:0;padding:14px 24px;border-top:1px solid var(--line);font-size:13px}
.card-actions a{color:var(--muted);text-decoration:none}
.card-actions a:hover{color:var(--accent)}
footer{margin-top:56px;padding-top:22px;border-top:1px solid var(--line);color:var(--muted);font-size:13px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px}
a{color:var(--accent)}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:4px}
@media (prefers-reduced-motion:reduce){.card{transition:none}.card:hover,.card:focus-within{transform:none}}
</style>
</head>
<body>
  <main class="wrap">
    <p class="kicker">Made with bento/.</p>
    <h1>Bento animation samples</h1>
    <p class="lede">Each animation is one self-contained HTML file: the deck, its viewer and its editor. Open one, or start it straight in slideshow mode.</p>
    <ul class="grid">
${cards}
    </ul>
    <footer>
      <span>${count} animation${count === 1 ? '' : 's'}</span>
      <span><a href="https://bento.page">bento.page</a></span>
    </footer>
  </main>
</body>
</html>
`
}

function notFound() {
  // A project site lives at /<repo>/, and 404.html is served at whatever path
  // was requested, so a fixed "/" would send the visitor to the owner's root
  // instead of this site. On github.io the repository is the first path
  // segment; on a custom domain the site is the root. "../" is the no-JS
  // fallback, correct whenever the 404 is one level deep.
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>Not here - Bento animation samples</title>
<style>
html,body{margin:0;height:100%}
body{background:#0A0810;color:#EDE4D3;display:grid;place-content:center;text-align:center;padding:32px;
  font:16px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
h1{font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:clamp(28px,6vw,44px);margin:0 0 12px}
p{color:#9A8D82;margin:0 0 28px}
a{color:#FFC98A}
</style>
</head>
<body>
  <main>
    <h1>Nothing at this address</h1>
    <p>The animation you asked for is not published here.</p>
    <a id="back" href="../">Back to the samples</a>
  </main>
  <script>
  (function () {
    var seg = location.pathname.split('/')[1] || ''
    var onGithub = /\\.github\\.io$/.test(location.hostname)
    document.getElementById('back').href = onGithub && seg ? '/' + seg + '/' : '/'
  })()
  </script>
</body>
</html>
`
}

// ------------------------------------------------------------------ build ---

function main() {
  const seen = new Map()
  const animations = []
  const skipped = []
  const errors = []

  for (const file of walk(ROOT).sort()) {
    const found = inspect(file)
    if (found.error) { errors.push(found); continue }
    if (found.skip) { skipped.push(found); continue }

    const slug = slugFor(found.rel)
    if (!slug) { errors.push({ rel: found.rel, error: 'no usable URL segment from the path' }); continue }

    const other = seen.get(slug)
    if (other) {
      errors.push({
        rel: found.rel,
        error: `URL /${slug}/ is already taken by ${other} — rename one of them, or move it into its own folder`,
      })
      continue
    }
    seen.set(slug, found.rel)

    animations.push({
      slug,
      rel: found.rel,
      file: found.file,
      html: found.html,
      bytes: Buffer.byteLength(found.html),
      download: path.basename(found.rel),
      title: typeof found.doc.title === 'string' && found.doc.title.trim()
        ? found.doc.title.trim()
        : slug.split('/').pop().replace(/[-_]+/g, ' '),
      doc: found.doc,
    })
  }

  if (errors.length) {
    console.error('\nBuild failed:\n')
    for (const e of errors) console.error(`  ${e.rel}\n    ${e.error}`)
    console.error('')
    process.exit(1)
  }
  if (animations.length === 0) {
    console.error('\nBuild failed: no publishable animations found.')
    console.error('A publishable file is a *.bento.html whose #bento-doc block holds a document with at least one slide.\n')
    process.exit(1)
  }

  animations.sort((a, b) => a.title.localeCompare(b.title, 'en'))

  fs.rmSync(OUT, { recursive: true, force: true })
  fs.mkdirSync(OUT, { recursive: true })

  for (const a of animations) {
    const dir = path.join(OUT, a.slug)
    fs.mkdirSync(dir, { recursive: true })
    // Byte for byte: the deck is already a complete page, so the build must not
    // rewrite anything in it (a re-encode could change the saved document).
    fs.writeFileSync(path.join(dir, 'index.html'), a.html)
  }

  fs.writeFileSync(path.join(OUT, 'index.html'), gallery(animations))
  fs.writeFileSync(path.join(OUT, '404.html'), notFound())
  // GitHub Pages runs Jekyll on branch deployments; the artifact flow does not
  // build anything, but the marker keeps a future switch to branch mode honest.
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '')

  console.log(`\nBuilt ${animations.length} animation${animations.length === 1 ? '' : 's'} into ${path.relative(ROOT, OUT)}/\n`)
  for (const a of animations) {
    console.log(`  /${a.slug}/  <-  ${a.rel}  (${kb(a.bytes)}, ${a.doc.slides.length} slide${a.doc.slides.length === 1 ? '' : 's'})`)
  }
  for (const s of skipped) console.log(`  skipped  ${s.rel}: ${s.skip}`)
  console.log('')
}

main()
