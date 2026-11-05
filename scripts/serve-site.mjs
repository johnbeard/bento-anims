#!/usr/bin/env node
// Local preview of the built site, so the deployed URLs can be checked before
// they are published. Directory-style paths are the point: /anims/wave-text/
// has to resolve to anims/wave-text/index.html here exactly as it does on
// Pages.
//
//   node scripts/build-site.mjs && node scripts/serve-site.mjs
//   PORT=9000 npm run serve
//
// Not part of the deployed artifact.

import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  process.argv[2] ?? '_site',
)
const PORT = Number(process.env.PORT ?? 8080)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
}

if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.error(`No built site at ${ROOT}`)
  console.error('Run `npm run build` first.')
  process.exit(1)
}

function send(res, status, file, type) {
  res.writeHead(status, { 'content-type': type ?? 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  let rel
  try {
    rel = decodeURIComponent(url.pathname)
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Bad request')
    return
  }

  // Resolve inside ROOT and refuse anything that climbs out of it.
  const target = path.resolve(ROOT, '.' + rel)
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Forbidden')
    return
  }

  let file = target
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    // /anims/wave-text -> /anims/wave-text/, so relative links in the page
    // resolve the way they will on Pages.
    if (!url.pathname.endsWith('/')) {
      res.writeHead(301, { location: url.pathname + '/' })
      res.end()
      return
    }
    file = path.join(file, 'index.html')
  }

  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    send(res, 200, file, MIME[path.extname(file).toLowerCase()])
    return
  }

  const notFound = path.join(ROOT, '404.html')
  if (fs.existsSync(notFound)) send(res, 404, notFound, MIME['.html'])
  else {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Not found')
  }
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is in use. Try: PORT=9000 npm run serve`)
    process.exit(1)
  }
  throw err
})

server.listen(PORT, () => {
  console.log(`\nServing ${path.relative(process.cwd(), ROOT) || ROOT} at http://localhost:${PORT}/\n`)
})
