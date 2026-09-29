#!/usr/bin/env npx tsx
import { execSync } from 'node:child_process'
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadCatalog } from '../app/catalog/load.js'
import { isListed } from '../app/catalog/visibility.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const skillsRoot = join(repoRoot, 'skills')
const outFile = join(repoRoot, 'dashboard/index.html')

type Role = 'router' | 'behavior' | 'lifecycle' | 'supporting'

type DashboardSkill = {
  body: string
  description: string
  files: string[]
  listed: boolean
  mentions: string[]
  name: string
  role: Role
  userInvocable: boolean
}

function listFiles(dir: string, root: string, acc: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue
    const full = join(dir, entry)
    const rel = relative(root, full).replaceAll('\\', '/')
    if (statSync(full).isDirectory()) {
      listFiles(full, root, acc)
    } else if (rel !== 'SKILL.md') {
      acc.push(rel)
    }
  }
  return acc
}

function gitCommit(): string | null {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return null
  }
}

const catalog = loadCatalog()
const names = [...catalog.keys()].sort()
const texts = new Map(names.map((name) => {
  const skill = catalog.get(name)!
  return [name, [skill.body, ...Object.values(skill.extras)].join('\n')]
}))

// A skill "mentions" another when it names it in backticks or via get_skill("…").
const mentions = new Map(names.map((name) => {
  const text = texts.get(name)!
  const found = names.filter((other) => other !== name && (
    text.includes(`\`${other}\``) || text.includes(`get_skill("${other}")`)
  ))
  return [name, found]
}))

// The lifecycle is the longest `a` → `b` → … chain written anywhere in the catalog.
let lifecycle: string[] = []
for (const text of texts.values()) {
  for (const match of text.matchAll(/`[a-z0-9-]+`(?:\s*→\s*`[a-z0-9-]+`)+/g)) {
    const chain = [...match[0].matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]!).filter((n) => catalog.has(n))
    if (chain.length > lifecycle.length) lifecycle = chain
  }
}

// Router: names most of the catalog. Behavior: used by at least half of the remaining skills.
const others = names.length - 1
const routers = new Set(names.filter((n) => mentions.get(n)!.length >= others * 0.8))
const nonRouters = names.filter((n) => !routers.has(n))
const behaviors = new Set(nonRouters.filter((n) => {
  const usedBy = nonRouters.filter((o) => o !== n && mentions.get(o)!.includes(n))
  return usedBy.length >= (nonRouters.length - 1) / 2
}))

// A behavior skill lists the workflows that use it, not skills it loads, so drop its outgoing links.
for (const name of behaviors) mentions.set(name, [])

function roleOf(name: string): Role {
  if (routers.has(name)) return 'router'
  if (behaviors.has(name)) return 'behavior'
  if (lifecycle.includes(name)) return 'lifecycle'
  return 'supporting'
}

const skills: DashboardSkill[] = names.map((name) => {
  const skill = catalog.get(name)!
  return {
    body: skill.body.trim(),
    description: skill.description,
    files: listFiles(join(skillsRoot, name), join(skillsRoot, name), []).sort(),
    listed: isListed(skill),
    mentions: mentions.get(name)!,
    name,
    role: roleOf(name),
    userInvocable: skill.userInvocable
  }
})

const data = {
  commit: gitCommit(),
  generatedAt: new Date().toISOString(),
  lifecycle,
  skills
}

// Keep "</script>" and friends from closing the inline data block.
const json = JSON.stringify(data).replaceAll('<', '\\u003c')

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, renderPage(json))
console.log(`wrote ${relative(repoRoot, outFile)} (${skills.length} skills)`)

function renderPage(payload: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Skill Catalog Map</title>
<style>
:root {
  --bg: #f7f7f5; --surface: #ffffff; --text: #1d1d1b; --muted: #6b6a66; --border: #e3e2de;
  --accent: #2f6fdf; --router: #7a5af5; --behavior: #c2410c; --lifecycle: #2f6fdf; --supporting: #0b7a5e;
  --dim: 0.22;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #141413; --surface: #1e1e1c; --text: #ecebe7; --muted: #9c9a94; --border: #34332f;
    --accent: #6ea0ff; --router: #a591ff; --behavior: #fb8a4c; --lifecycle: #6ea0ff; --supporting: #3ccf9f;
    --dim: 0.18;
    color-scheme: dark;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text);
  font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
code, .mono { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
main { max-width: 1120px; margin: 0 auto; padding: 32px 16px 64px; }
header h1 { margin: 0 0 4px; font-size: 26px; letter-spacing: -0.01em; }
header p { margin: 0; color: var(--muted); }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 24px 0; }
.stat { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; }
.stat b { display: block; font-size: 24px; font-variant-numeric: tabular-nums; }
.stat span { color: var(--muted); font-size: 13px; }
section.panel { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
.panel-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.panel-head h2 { margin: 0; font-size: 17px; }
.legend { display: flex; flex-wrap: wrap; gap: 14px; font-size: 13px; color: var(--muted); }
.legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
.diagram-wrap { overflow-x: auto; }
svg.diagram { display: block; width: 100%; min-width: 760px; height: auto; }
.node { cursor: pointer; }
.node rect.box { fill: var(--surface); stroke-width: 1.5; }
.node text { fill: var(--text); font: 12px ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
.node text.sub { fill: var(--muted); font: 11px ui-sans-serif, system-ui, sans-serif; }
.node:hover rect.box { stroke-width: 2.5; }
.node:focus-visible rect.box { stroke: var(--text); stroke-width: 3; }
.node:focus { outline: none; }
.band text.label { font: 600 11px ui-sans-serif, system-ui, sans-serif; letter-spacing: 0.06em; text-transform: uppercase; fill: var(--muted); }
.edge { fill: none; stroke: var(--muted); stroke-width: 1.4; }
.edge.chain { stroke: var(--lifecycle); stroke-width: 2.2; }
.dimmed { opacity: var(--dim); }
.hint { color: var(--muted); font-size: 13px; margin: 8px 0 0; }
.toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; margin: 32px 0 12px; }
.toolbar h2 { margin: 0; font-size: 17px; }
input[type=search] { width: min(320px, 100%); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border);
  background: var(--surface); color: var(--text); font: inherit; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
@media (max-width: 400px) { .cards { grid-template-columns: 1fr; } }
.card { background: var(--surface); border: 1px solid var(--border); border-left: 4px solid var(--role); border-radius: 10px;
  padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.card[hidden] { display: none; }
.card.selected { box-shadow: 0 0 0 2px var(--role); }
.card h3 { margin: 0; font-size: 15px; word-break: break-word; }
.card p { margin: 0; color: var(--muted); font-size: 14px; }
.tag { display: inline-block; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--role); margin-bottom: 2px; }
.row { font-size: 13px; }
.row > span { color: var(--muted); margin-right: 6px; }
.chip { display: inline-block; margin: 2px 4px 2px 0; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--border);
  background: transparent; color: var(--text); font: 12px ui-monospace, "SF Mono", Menlo, Consolas, monospace; cursor: pointer; }
.chip:hover { border-color: var(--accent); color: var(--accent); }
.file { font-size: 12px; color: var(--muted); }
details summary { cursor: pointer; font-size: 13px; color: var(--accent); }
details pre { white-space: pre-wrap; word-break: break-word; font-size: 12px; line-height: 1.45; max-height: 360px; overflow: auto;
  background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 10px; margin: 8px 0 0; }
.empty { grid-column: 1 / -1; color: var(--muted); padding: 24px 0; }
footer { margin-top: 32px; color: var(--muted); font-size: 12px; }
</style>
</head>
<body>
<main>
  <header>
    <h1>Skill Catalog Map</h1>
    <p>How the generic-agent-toolkit skills route an agent from idea to reviewed implementation.</p>
  </header>
  <div class="stats" id="stats"></div>
  <section class="panel" aria-labelledby="flow-title">
    <div class="panel-head">
      <h2 id="flow-title">Routing flow</h2>
      <div class="legend" id="legend"></div>
    </div>
    <div class="diagram-wrap"><svg class="diagram" id="diagram" role="group" aria-label="Skill routing diagram"></svg></div>
    <p class="hint">Click a skill to highlight what it loads and what loads it. Click empty space to reset.</p>
  </section>
  <div class="toolbar">
    <h2>Skills</h2>
    <input type="search" id="search" placeholder="Filter by name or description" aria-label="Filter skills">
  </div>
  <div class="cards" id="cards"></div>
  <footer id="footer"></footer>
</main>
<script id="catalog-data" type="application/json">${payload}</script>
<script>
const data = JSON.parse(document.getElementById('catalog-data').textContent)
const byName = new Map(data.skills.map((s) => [s.name, s]))
const ROLE = {
  router: { label: 'Router', color: 'var(--router)' },
  lifecycle: { label: 'Core lifecycle', color: 'var(--lifecycle)' },
  supporting: { label: 'Supporting workflow', color: 'var(--supporting)' },
  behavior: { label: 'Behavior', color: 'var(--behavior)' }
}
const loadedBy = new Map(data.skills.map((s) => [s.name, data.skills.filter((o) => o.mentions.includes(s.name)).map((o) => o.name)]))
const neighbours = (name) => new Set([name, ...byName.get(name).mentions, ...loadedBy.get(name)])
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// Summary strip
const refFiles = data.skills.reduce((n, s) => n + s.files.filter((f) => f.endsWith('.md')).length, 0)
const scriptFiles = data.skills.reduce((n, s) => n + s.files.filter((f) => !f.endsWith('.md')).length, 0)
const stats = [
  [data.skills.length, 'skills'],
  [data.lifecycle.length, 'steps in the core lifecycle'],
  [refFiles, 'reference files'],
  [scriptFiles, 'bundled scripts']
]
document.getElementById('stats').innerHTML = stats.map(([n, l]) => '<div class="stat"><b>' + n + '</b><span>' + l + '</span></div>').join('')
document.getElementById('legend').innerHTML = Object.values(ROLE)
  .map((r) => '<span><i style="background:' + r.color + '"></i>' + r.label + '</span>').join('')

// Diagram layout: router band, lifecycle row, supporting rows, behavior band.
const NS = 'http://www.w3.org/2000/svg'
const W = 1000, NODE_W = 184, NODE_H = 44, PAD = 16
const svg = document.getElementById('diagram')
const el = (tag, attrs, parent) => {
  const n = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v)
  if (parent) parent.appendChild(n)
  return n
}
const pos = new Map()
const spread = (list, y) => list.forEach((name, i) => {
  const step = (W - 2 * PAD) / list.length
  pos.set(name, { x: PAD + step * i + step / 2, y, w: NODE_W, h: NODE_H })
})

const routers = data.skills.filter((s) => s.role === 'router').map((s) => s.name)
const behaviors = data.skills.filter((s) => s.role === 'behavior').map((s) => s.name)
const lifecycle = data.lifecycle.filter((n) => byName.get(n).role === 'lifecycle')

// Every y below is a row centre; bands reserve 22px above the node for their label.
const BAND_TOP = NODE_H / 2 + 22, BAND_BOTTOM = NODE_H / 2 + 8
let y = 6 + BAND_TOP
const bands = []
if (routers.length) { bands.push({ names: routers, y, label: 'Router · links to every skill' }); y += NODE_H + 60 }
const lifecycleY = y
spread(lifecycle, lifecycleY)
y += NODE_H + 72

// Order supporting skills by the average x of the lifecycle steps they touch. Skills that only
// touch other supporting skills sit beside them; unconnected skills go last.
const avg = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Infinity
const supportingNames = data.skills.filter((s) => s.role === 'supporting').map((s) => s.name)
const rank = new Map(supportingNames.map((n) => [n, avg([...neighbours(n)].filter((o) => pos.has(o)).map((o) => pos.get(o).x))]))
for (const n of supportingNames) {
  if (rank.get(n) !== Infinity) continue
  const linked = [...neighbours(n)].map((o) => rank.get(o)).filter((x) => x !== undefined && x !== Infinity)
  if (linked.length) rank.set(n, avg(linked) + 0.5)
}
const supporting = [...supportingNames].sort((a, b) => rank.get(a) - rank.get(b) || a.localeCompare(b))
let bottom = lifecycleY + BAND_BOTTOM
for (let i = 0; i < supporting.length; i += 5) {
  spread(supporting.slice(i, i + 5), y)
  bottom = y + BAND_BOTTOM
  y += NODE_H + 56
}
if (behaviors.length) {
  y = bottom + 40 + BAND_TOP
  bands.push({ names: behaviors, y, label: 'Behavior · how every question is asked' })
  bottom = y + BAND_BOTTOM
}
for (const band of bands) spread(band.names, band.y)
svg.setAttribute('viewBox', '0 0 ' + W + ' ' + (bottom + 6))

const defs = el('defs', {}, svg)
const marker = (id, color) => {
  const m = el('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs)
  el('path', { d: 'M0,0 L10,5 L0,10 z', fill: color }, m)
}
marker('arrow', 'var(--muted)')
marker('arrow-chain', 'var(--lifecycle)')

// Band backgrounds
for (const band of bands) {
  const role = byName.get(band.names[0]).role
  const g = el('g', { class: 'band' }, svg)
  el('rect', { x: 4, y: band.y - BAND_TOP, width: W - 8, height: BAND_TOP + BAND_BOTTOM, rx: 12, fill: ROLE[role].color, 'fill-opacity': 0.07 }, g)
  el('text', { class: 'label', x: 16, y: band.y - NODE_H / 2 - 8 }, g).textContent = band.label
}

// Edges: skip router/behavior links, which the bands already express.
const layered = new Set([...routers, ...behaviors])
const edgeLayer = el('g', {}, svg)
const edges = []
const seen = new Set()
for (const s of data.skills) {
  if (layered.has(s.name)) continue
  for (const t of s.mentions) {
    if (layered.has(t) || !pos.has(t)) continue
    const key = [s.name, t].sort().join('|')
    if (seen.has(key)) continue
    seen.add(key)
    const both = byName.get(t).mentions.includes(s.name)
    const ci = lifecycle.indexOf(s.name), ti = lifecycle.indexOf(t)
    const chain = ci >= 0 && ti >= 0 && Math.abs(ti - ci) === 1
    // Chain edges always point forward along the lifecycle.
    const [from, to] = chain && ti < ci ? [t, s.name] : [s.name, t]
    const a = pos.get(from), b = pos.get(to)
    let d
    if (chain && a.y === b.y) {
      d = 'M' + (a.x + a.w / 2) + ',' + a.y + ' L' + (b.x - b.w / 2 - 2) + ',' + b.y
    } else if (a.y === b.y) {
      const dir = a.y === lifecycleY ? -1 : 1
      const off = dir * (NODE_H / 2)
      const lift = dir * (30 + Math.abs(a.x - b.x) * 0.08)
      d = 'M' + a.x + ',' + (a.y + off) + ' C' + a.x + ',' + (a.y + off + lift) + ' ' + b.x + ',' + (b.y + off + lift) + ' ' + b.x + ',' + (b.y + off + dir * 2)
    } else {
      const down = b.y > a.y
      const y1 = a.y + (down ? NODE_H / 2 : -NODE_H / 2)
      const y2 = b.y + (down ? -NODE_H / 2 - 2 : NODE_H / 2 + 2)
      const mid = (y1 + y2) / 2
      d = 'M' + a.x + ',' + y1 + ' C' + a.x + ',' + mid + ' ' + b.x + ',' + mid + ' ' + b.x + ',' + y2
    }
    const attrs = { d, class: 'edge' + (chain ? ' chain' : ''), 'marker-end': chain ? 'url(#arrow-chain)' : 'url(#arrow)' }
    if (both) attrs['marker-start'] = chain ? 'url(#arrow-chain)' : 'url(#arrow)'
    if (!chain) attrs['stroke-dasharray'] = '5 4'
    edges.push({ path: el('path', attrs, edgeLayer), ends: [s.name, t] })
  }
}

// Nodes
const nodeEls = new Map()
for (const [name, p] of pos) {
  const s = byName.get(name)
  const color = ROLE[s.role].color
  const g = el('g', { class: 'node', tabindex: 0, role: 'button', 'aria-label': name + ', ' + ROLE[s.role].label, 'aria-pressed': 'false' }, svg)
  const wide = layered.has(name)
  const w = wide ? Math.min(W - 2 * PAD, 320) : p.w
  el('rect', { class: 'box', x: p.x - w / 2, y: p.y - p.h / 2, width: w, height: p.h, rx: 9, stroke: color }, g)
  el('text', { x: p.x, y: p.y - 2, 'text-anchor': 'middle' }, g).textContent = name
  const uses = behaviors.filter((b) => s.mentions.includes(b))
  const sub = s.role === 'behavior' ? 'used by ' + loadedBy.get(name).filter((n) => !routers.includes(n)).length + ' workflows'
    : s.role === 'router' ? 'routes to ' + s.mentions.length + ' skills'
    : (s.files.length ? s.files.length + (s.files.length === 1 ? ' extra file' : ' extra files') : 'SKILL.md only')
  const subEl = el('text', { class: 'sub', x: p.x, y: p.y + 13, 'text-anchor': 'middle' }, g)
  subEl.textContent = sub
  if (!wide && uses.length) {
    const tspan = el('tspan', { fill: 'var(--behavior)' }, subEl)
    tspan.textContent = ' · uses ' + uses.join(', ')
  }
  g.addEventListener('click', (e) => { e.stopPropagation(); select(name, true, true) })
  g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(name, true, true) } })
  nodeEls.set(name, g)
}
svg.addEventListener('click', () => select(null, false))

// Cards
const cardsEl = document.getElementById('cards')
const roleOrder = ['router', 'lifecycle', 'supporting', 'behavior']
const ordered = [...data.skills].sort((a, b) => {
  const r = roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role)
  if (r) return r
  if (a.role === 'lifecycle') return data.lifecycle.indexOf(a.name) - data.lifecycle.indexOf(b.name)
  return a.name.localeCompare(b.name)
})
const chips = (list) => list.length ? list.map((n) => '<button class="chip" data-go="' + esc(n) + '">' + esc(n) + '</button>').join('') : '<span class="file">none</span>'
cardsEl.innerHTML = ordered.map((s) => {
  const flags = [!s.listed && 'hidden from list_skills', !s.userInvocable && 'not user-invocable'].filter(Boolean)
  return '<article class="card" id="skill-' + esc(s.name) + '" data-name="' + esc(s.name) + '" style="--role:' + ROLE[s.role].color + '">'
    + '<div><div class="tag">' + ROLE[s.role].label + (s.role === 'lifecycle' ? ' · step ' + (data.lifecycle.indexOf(s.name) + 1) : '') + '</div>'
    + '<h3 class="mono">' + esc(s.name) + '</h3></div>'
    + '<p>' + esc(s.description) + '</p>'
    + (flags.length ? '<div class="row"><span>Flags</span>' + esc(flags.join(', ')) + '</div>' : '')
    + '<div class="row"><span>Loads</span>' + chips(s.mentions) + '</div>'
    + '<div class="row"><span>Loaded by</span>' + chips(loadedBy.get(s.name)) + '</div>'
    + (s.files.length ? '<div class="row"><span>Files</span>' + s.files.map((f) => '<code class="file">' + esc(f) + '</code>').join(', ') + '</div>' : '')
    + '<details><summary>SKILL.md</summary><pre>' + esc(s.body) + '</pre></details>'
    + '</article>'
}).join('') + '<p class="empty" id="empty" hidden>No skills match that filter.</p>'
cardsEl.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]')
  if (go) select(go.dataset.go, true)
})

let selected = null
// Diagram nodes toggle; chips always select so they work as navigation.
function select(name, scroll, toggle = false) {
  selected = toggle && name === selected ? null : name
  const keep = selected ? neighbours(selected) : null
  for (const [n, g] of nodeEls) {
    g.classList.toggle('dimmed', !!keep && !keep.has(n))
    g.setAttribute('aria-pressed', String(n === selected))
  }
  for (const e of edges) e.path.classList.toggle('dimmed', !!keep && !(keep.has(e.ends[0]) && keep.has(e.ends[1])))
  for (const card of cardsEl.querySelectorAll('.card')) card.classList.toggle('selected', card.dataset.name === selected)
  if (selected && scroll) {
    const card = document.getElementById('skill-' + selected)
    if (card && !card.hidden) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }
}

document.getElementById('search').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase()
  let shown = 0
  for (const card of cardsEl.querySelectorAll('.card')) {
    const s = byName.get(card.dataset.name)
    const hit = !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
    card.hidden = !hit
    if (hit) shown++
  }
  document.getElementById('empty').hidden = shown > 0
})

document.getElementById('footer').textContent = 'Generated ' + new Date(data.generatedAt).toLocaleString()
  + (data.commit ? ' from commit ' + data.commit : '') + ' by npm run dashboard.'
</script>
</body>
</html>
`
}
