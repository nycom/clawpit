#!/usr/bin/env node
// Pixel diff for in-app screenshots: artifacts/app-checks/<task>/{current,accepted}/<state>.png, cropped to the
// regions in tests/app-check/regions.json, with masks painted out. Usage: npm run app-diff -- <task> [--accept] [--idle]
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

export function resolveBox(box, w, h) {
  return { x: Math.round(box.x * w), y: Math.round(box.y * h), w: Math.round(box.w * w), h: Math.round(box.h * h) }
}

function crop(png, r) {
  const out = new PNG({ width: r.w, height: r.h })
  PNG.bitblt(png, out, r.x, r.y, r.w, r.h, 0, 0)
  return out
}

function paint(png, boxes) {
  for (const m of boxes)
    for (let y = Math.max(0, m.y); y < Math.min(png.height, m.y + m.h); y++)
      for (let x = Math.max(0, m.x); x < Math.min(png.width, m.x + m.w); x++) {
        const i = (y * png.width + x) * 4
        png.data[i] = 255; png.data[i + 1] = 0; png.data[i + 2] = 255; png.data[i + 3] = 255
      }
}

// regions: window fractions. masks: window fractions (main() converts region-relative masks first).
// Returns one result over all regions; `diffs` holds a diff image per region for the caller to write.
export function compare(a, b, regions, masks, opts) {
  const boxes = regions.map(r => resolveBox(r, a.width, a.height))
  const total = boxes.reduce((n, r) => n + r.w * r.h, 0)
  if (!b) return { status: 'new', changed: 0, total, diffs: [] }
  if (a.width !== b.width || a.height !== b.height) return { status: 'fail', changed: total, total, diffs: [] }
  let changed = 0
  const diffs = boxes.map(r => {
    const ca = crop(a, r), cb = crop(b, r)
    const local = masks.map(m => resolveBox(m, a.width, a.height)).map(m => ({ x: m.x - r.x, y: m.y - r.y, w: m.w, h: m.h }))
    paint(ca, local); paint(cb, local)
    const diff = new PNG({ width: r.w, height: r.h })
    const n = pixelmatch(ca.data, cb.data, diff.data, r.w, r.h, { threshold: opts.threshold })
    changed += n
    return { changed: n, diff }
  })
  return { status: changed <= opts.maxRatio * total ? 'pass' : 'fail', changed, total, diffs }
}

const read = p => (existsSync(p) ? PNG.sync.read(readFileSync(p)) : null)

function masksFor(cfg, key, regions) {
  const out = []
  for (const m of cfg.states?.[key]?.masks ?? []) {
    const r = regions[m.region]
    if (r) out.push({ x: r.x + m.x * r.w, y: r.y + m.y * r.h, w: m.w * r.w, h: m.h * r.h })
  }
  return out
}

function main(argv) {
  const task = argv.find(a => !a.startsWith('--'))
  if (!task) { console.error('usage: app-diff <task> [--accept] [--idle]'); return 2 }
  const dir = join(ROOT, 'artifacts/app-checks', task), cur = join(dir, 'current'), acc = join(dir, 'accepted')
  if (argv.includes('--accept')) {
    mkdirSync(acc, { recursive: true })
    for (const f of readdirSync(cur).filter(f => f.endsWith('.png') && !f.endsWith('.diff.png'))) copyFileSync(join(cur, f), join(acc, f))
    console.log(`app-diff: accepted ${task}`); return 0
  }
  const cfg = JSON.parse(readFileSync(join(ROOT, 'tests/app-check/regions.json'), 'utf8'))
  const regionsOf = state => ({ ...cfg.regions, ...(cfg.states?.[`${task}/${state}`]?.regions ?? {}) })
  const rows = []
  const run = (label, state, a, b, opts) => {
    const regions = regionsOf(state)
    for (const name of Object.keys(regions)) {
      const r = compare(a, b, [regions[name]], masksFor(cfg, `${task}/${state}`, { [name]: regions[name] }), opts)
      if (r.status === 'fail' && r.diffs[0]) writeFileSync(join(cur, `${label}.${name}.diff.png`), PNG.sync.write(r.diffs[0].diff))
      rows.push([label, name, r.status, `${r.changed}/${r.total}`])
    }
  }
  if (argv.includes('--idle')) {
    const shots = ['idle-1', 'idle-2', 'idle-3'].map(s => read(join(cur, `${s}.png`)))
    if (shots.some(s => !s)) { console.error('app-diff: --idle needs idle-1.png, idle-2.png and idle-3.png in current/'); return 2 }
    run('idle-1~2', 'idle', shots[0], shots[1], { threshold: 0, maxRatio: 0 })
    run('idle-2~3', 'idle', shots[1], shots[2], { threshold: 0, maxRatio: 0 })
  } else {
    if (!existsSync(cur)) { console.error(`app-diff: no shots in ${cur}`); return 2 }
    for (const f of readdirSync(cur).filter(f => f.endsWith('.png') && !f.endsWith('.diff.png')).sort()) {
      const state = f.replace(/\.png$/, '')
      if (/^idle-\d$/.test(state)) continue
      run(state, state, read(join(cur, f)), read(join(acc, f)), { threshold: 0.1, maxRatio: 0.001 })
    }
  }
  console.log('| shot | region | status | changed |\n|---|---|---|---|')
  for (const r of rows) console.log(`| ${r.join(' | ')} |`)
  return rows.some(r => r[2] === 'fail') ? 1 : 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main(process.argv.slice(2)))
