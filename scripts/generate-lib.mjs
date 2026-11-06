// Shared plumbing for the per-animation generators under
// anims/<name>/scripts/gen-<name>.mjs.
//
// A generated deck is an ARTIFACT. Re-running a generator replaces the whole
// #bento-doc block, so any change made in the editor since the last run would
// be destroyed without a word. This module makes "untouched since generation"
// decidable: the file carries a hash of the document as generated (an HTML
// comment in the head), and a run refuses to overwrite unless the hash still
// matches.
//
// Everything here is dependency-free on purpose, like scripts/build-site.mjs:
// the Pages workflow installs nothing, and a build tool that cannot run on a
// fresh clone is not a build tool.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

/** The document block as the format defines it. */
const DOC_BLOCK = /<script[^>]*\bid=["']bento-doc["'][^>]*>([\s\S]*?)<\/script>/i

/** A short, stable hash of a document. Key ORDER is part of the value: the
 *  generator builds its own object, so reordering keys in the script is a
 *  change like any other and should be seen as one. */
export const hashOf = (doc) =>
  crypto.createHash('sha256').update(JSON.stringify(doc)).digest('hex').slice(0, 16)

/** The document minus `modified`, which is the timestamp a generation sets. */
export function withoutModified(doc) {
  const rest = { ...doc }
  delete rest.modified
  return rest
}

/** What is on disk: the document and the generation stamp, if any. */
export function readDeck(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8')
    const block = raw.match(DOC_BLOCK)
    const doc = block && block[1].trim() ? JSON.parse(block[1]) : null
    const stamp = (raw.match(/<!-- [\w-]+:generated ([0-9a-f]+)/) || [])[1] ?? null
    return { doc, stamp }
  } catch {
    return { doc: null, stamp: null } // no deck yet: first run
  }
}

/** The comment that records which document this file was generated from, and
 *  tells a reader of the file where to make changes instead. */
export function stampComment(hash, { name, script, command }) {
  return (
    `    <!-- ${name}:generated ${hash}: built by ${script}.\n` +
    `         Edit that script and run \`${command}\`; a re-run replaces this document. -->`
  )
}

const USAGE = {
  force: '  --force  discard changes made in the editor and regenerate',
  check: '  --check  report whether the deck is stale, without writing anything',
}

/**
 * Generate one deck. Returns a short summary for the caller to print.
 *
 * `render(doc, stamp)` returns the whole file text: the caller owns the shell
 * replacement, its own stylesheet and where the stamp goes. `doc` must be the
 * document WITHOUT `modified`; this function decides that value, so an
 * unchanged run rewrites the same bytes and produces no diff. Declare the key
 * as a placeholder (`modified: null`) in the position it should appear: the
 * value is replaced, the key order is kept.
 */
export function generate({ repo, out, name, script, command, doc, render, check, force }) {
  const rel = path.relative(repo, out)
  const prev = readDeck(out)
  // Hash the document WITHOUT `modified`, in both directions: the caller may
  // declare it as a placeholder (`modified: null`) to hold its key position, and
  // a deleted key and a null one must hash the same or every run looks edited.
  const nextHash = hashOf(withoutModified(doc))
  // Did the app touch this file since it was generated?
  const untouched = !!prev.doc && !!prev.stamp && prev.stamp === hashOf(withoutModified(prev.doc))

  if (check) {
    if (!prev.doc) fail(`stale: ${rel} does not exist`)
    if (!untouched) fail(`stale: ${rel} was saved or edited since it was generated`)
    if (hashOf(withoutModified(prev.doc)) !== nextHash) fail('stale: the script would now produce a different document')
    return { out, same: true, wrote: false, message: 'up to date' }
  }

  if (prev.doc && !untouched && !force) {
    // Two different situations, and the reader needs to know which: no stamp at
    // all means the deck predates this bookkeeping (first adoption), while a
    // stamp that no longer matches means the editor saved a change.
    const why = prev.stamp
      ? `${rel} was saved or edited since it was generated.`
      : `${rel} carries no generation marker (it predates this script's bookkeeping).`
    console.error(why)
    console.error("Re-running would replace the whole document with this script's version.")
    console.error(USAGE.force)
    console.error(USAGE.check)
    process.exit(1)
  }

  // Keep the old timestamp when nothing changed, so a re-run is a no-op on disk
  // rather than a diff on one line.
  const same = !!prev.doc && hashOf(withoutModified(prev.doc)) === nextHash
  const modified = same ? prev.doc.modified : new Date().toISOString()
  // The stamp hashes the document WITHOUT `modified`, so it stays valid whether
  // or not the run changed anything.
  const text = render({ ...doc, modified }, stampComment(nextHash, { name, script, command }))

  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, text)
  return { out, same, wrote: true, modified, message: same ? 'document unchanged' : 'document updated' }
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

/** `--check` / `--force` from a script's argv. */
export function flags(argv = process.argv.slice(2)) {
  const set = new Set(argv)
  return { check: set.has('--check'), force: set.has('--force') }
}
