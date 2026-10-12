// Infographics: the Quantum properties (circuit, register, rotation per qubit, the result's values,
// the run's figures) as HUD pieces that move on their own. They loop on the wall clock while the piece
// moves, and hold their last frame when it is set to hold still. Widths sit on the 24 px module.
import { useMemo } from 'react'
import { useNow } from '../useNow'
import { useFrozen, useHolding, useMoves } from './motion'
import { hash } from './auto'
import type { HudCtx } from './types'

const INK = 'var(--qs-ink)', INK3 = 'var(--qs-ink3)', INK4 = 'var(--qs-ink4)', BG = 'var(--qs-bg)'
const MONO = 'var(--qs-mono)'
const f1 = (v: number) => Math.round(v * 10) / 10

/** Seconds on a clock that runs while the piece moves. */
function useT(): number {
  const moves = useMoves()
  const hold = useHolding()
  const frozen = useFrozen()
  return useNow(moves && !hold && !frozen, 33) / 1000
}
/** Qubits per axis for a grid of n cells a side (as the emulator encodes it). */
const bitsOf = (n: number) => Math.ceil(Math.log2(Math.max(2, Math.min(n, 32))))
/** θ_k / π = strength · ((1 − reach) · 2^−k + reach), as in app/emulator.py. */
const thetaPi = (k: number, s: number, r: number) => s * ((1 - r) * 2 ** -k + r)
const gatesOf = (style: string) => (style === 'x' ? ['Rx'] : style === 'y' ? ['Ry'] : style === 'xy' ? ['Rx', 'Ry'] : ['Ry', 'Rx'])
const ease = (u: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, u)), 3)

/** Cells of a result by their share of its total, for sampling: measuring the register gives a cell
 *  with a probability in proportion to its value. */
const cdfCache = new WeakMap<Float32Array, Float64Array>()
function cdfOf(d: Float32Array): Float64Array {
  const hit = cdfCache.get(d)
  if (hit) return hit
  const c = new Float64Array(d.length)
  let sum = 0
  for (let i = 0; i < d.length; i++) { sum += Math.max(0, d[i]); c[i] = sum }
  cdfCache.set(d, c)
  return c
}
/** The cell a measurement gives at draw `u` in [0, 1): (i, j, k), or null. */
function measure(f: { n: number; data: Float32Array } | null, u: number): [number, number, number] | null {
  if (!f) return null
  const c = cdfOf(f.data), total = c[c.length - 1]
  if (!(total > 0)) return null
  let lo = 0, hi = c.length - 1
  const x = u * total
  while (lo < hi) { const mid = (lo + hi) >> 1; if (c[mid] < x) lo = mid + 1; else hi = mid }
  const n = f.n
  return [Math.floor(lo / (n * n)), Math.floor(lo / n) % n, lo % n]
}

/* ── v1 · circuit: a playhead runs across the wires, gates light as it passes, the reads flash ───── */

export function Circuit({ ctx }: { ctx: HudCtx }) {
  const t = useT()
  const b = bitsOf(ctx.n)
  const axes = (ctx.q.axes.length ? ctx.q.axes : [0]).map((a) => 'xyz'[a])
  const gates = gatesOf(ctx.q.style)
  const W = 288, RH = 12, top = 6
  const rows = axes.flatMap((ax, ai) => Array.from({ length: b }, (_, k) => ({ ax, k, i: ai * b + k })))
  const H = top + rows.length * RH + 6
  const PERIOD = 3.2, x0 = 34, x1 = W - 4
  const cyc = Math.floor(t / PERIOD), u = (t % PERIOD) / PERIOD
  const head = x0 + u * (x1 - x0)
  const gx = (g: number) => 58 + g * 64
  const mx = W - 22
  // each pass measures the result: a cell drawn by its value, read off as its Gray-coded bits per axis
  const cell = measure(ctx.data.proc ?? ctx.data.grid, hash(cyc, 7))
  const bit = (ax: string, k: number) => {
    if (!cell) return hash(k, cyc) < 0.5 ? 0 : 1
    const v = cell['xyz'.indexOf(ax)]
    return ((v ^ (v >> 1)) >> k) & 1
  }
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
      {rows.map((r) => {
        const y = top + r.i * RH + RH / 2
        const th = thetaPi(r.k, ctx.q.strength, ctx.q.reach)
        return (
          <g key={r.i}>
            <text x={0} y={y + 3} fontSize={8} style={{ fill: r.k === 0 ? INK : INK3, fontFamily: MONO }}>{r.k === 0 ? r.ax : ''}</text>
            <text x={10} y={y + 3} fontSize={8} style={{ fill: INK3, fontFamily: MONO }}>{`q${r.i}`}</text>
            <line x1={x0} x2={W} y1={y} y2={y} strokeWidth={0.75} style={{ stroke: INK4 }} />
            {gates.map((g, gi) => {
              const lit = head >= gx(gi)
              return (
                <g key={gi}>
                  <rect x={gx(gi) + 0.5} y={y - 4.5} width={48} height={9} strokeWidth={0.75} style={{ stroke: INK, fill: lit ? INK : BG, transition: 'fill 120ms' }} />
                  <text x={gx(gi) + 24} y={y + 2.5} fontSize={7} textAnchor="middle" style={{ fill: lit ? BG : INK, fontFamily: MONO }}>{`${g} ${th.toFixed(2)}π`}</text>
                </g>
              )
            })}
            <rect x={mx + 0.5} y={y - 4.5} width={14} height={9} strokeWidth={0.75} style={{ stroke: INK, fill: BG }} />
            <text x={mx + 7.5} y={y + 2.5} fontSize={7} textAnchor="middle" style={{ fill: INK, fontFamily: MONO }}>{head >= mx ? String(bit(r.ax, r.k)) : 'M'}</text>
          </g>
        )
      })}
      <line x1={f1(head)} x2={f1(head)} y1={top - 3} y2={H - 3} strokeWidth={1} style={{ stroke: INK }} />
      {cell && head >= mx && <text x={W} y={H + 8} fontSize={8} textAnchor="end" style={{ fill: INK3, fontFamily: MONO }}>{`→ cell ${cell.join(',')}`}</text>}
    </svg>
  )
}

/* ── v2 · register: the qubits per axis, shaded by their turn, with a wave running through ──────── */

export function Register({ ctx }: { ctx: HudCtx }) {
  const t = useT()
  const b = bitsOf(ctx.n)
  const C = 22, G = 2
  const axes = ['x', 'y', 'z']
  const W = 16 + b * (C + G), H = axes.length * (C + G)
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {axes.map((ax, ai) => {
        const on = ctx.q.axes.includes(ai)
        return (
          <g key={ax}>
            <text x={0} y={ai * (C + G) + C / 2 + 3} fontSize={9} style={{ fill: on ? INK : INK4, fontFamily: MONO }}>{ax}</text>
            {Array.from({ length: b }, (_, k) => {
              const th = thetaPi(k, ctx.q.strength, ctx.q.reach)
              const wave = 0.5 + 0.5 * Math.sin(t * 2.4 - k * 0.7 - ai * 0.5)
              const a = on ? Math.min(1, th) * (0.35 + 0.65 * wave) : 0
              const x = 16 + k * (C + G), y = ai * (C + G)
              return (
                <g key={k}>
                  <rect x={x + 0.5} y={y + 0.5} width={C - 1} height={C - 1} strokeWidth={0.75} style={{ stroke: on ? INK3 : INK4, fill: INK, fillOpacity: a }} />
                  <text x={x + C / 2} y={y + C / 2 + 3} fontSize={7} textAnchor="middle" style={{ fill: a > 0.5 ? BG : on ? INK3 : INK4, fontFamily: MONO }}>{on ? `q${ai * b + k}` : '–'}</text>
                </g>
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}

/* ── v3 · qubit bars: each qubit's rotation swings up to its θ and back, slower for higher qubits ── */

export function QubitBars({ ctx }: { ctx: HudCtx }) {
  const t = useT()
  const b = bitsOf(ctx.n)
  const W = 240, H = 96, base = H - 14, top = 14
  const bw = W / b
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
      <line x1={0} x2={W} y1={base + 0.5} y2={base + 0.5} strokeWidth={0.75} style={{ stroke: INK3 }} />
      <line x1={0} x2={W} y1={top + 0.5} y2={top + 0.5} strokeWidth={0.75} strokeDasharray="2 3" style={{ stroke: INK4 }} />
      <text x={W} y={top - 4} fontSize={8} textAnchor="end" style={{ fill: INK3, fontFamily: MONO }}>π</text>
      {Array.from({ length: b }, (_, k) => {
        const th = thetaPi(k, ctx.q.strength, ctx.q.reach)
        const swing = 0.5 - 0.5 * Math.cos(t * (2.2 / (1 + k * 0.35)) + k * 0.5)
        const v = th * swing
        const h = Math.max(0.75, v * (base - top))
        const x = k * bw + 6
        return (
          <g key={k}>
            <rect x={f1(x)} y={f1(base - h)} width={f1(bw - 12)} height={f1(h)} style={{ fill: INK }} />
            <line x1={f1(x - 2)} x2={f1(x + bw - 10)} y1={f1(base - th * (base - top))} y2={f1(base - th * (base - top))} strokeWidth={0.75} style={{ stroke: INK3 }} />
            <text x={f1(x + (bw - 12) / 2)} y={H - 2} fontSize={8} textAnchor="middle" style={{ fill: INK3, fontFamily: MONO }}>{`q${k}`}</text>
          </g>
        )
      })}
    </svg>
  )
}

/* ── v4 · density bars: the result's values as a histogram that grows in, the level marked ───────── */

const BINS = 24
const histCache = new WeakMap<Float32Array, number[]>()
function histOf(d: Float32Array): number[] {
  const hit = histCache.get(d)
  if (hit) return hit
  const h = new Array(BINS).fill(0)
  for (let i = 0; i < d.length; i++) { const v = d[i]; if (v > 0.02) h[Math.min(BINS - 1, Math.floor(v * BINS))]++ }
  histCache.set(d, h)
  return h
}

export function DensityBars({ ctx }: { ctx: HudCtx }) {
  const t = useT()
  const data = ctx.data.proc ?? ctx.data.grid
  const hist = useMemo(() => (data ? histOf(data.data) : null), [data])
  if (!hist) return null
  const W = 264, H = 96, base = H - 12
  const peak = Math.max(1, ...hist.map((c) => Math.log1p(c)))
  const bw = W / BINS
  const LOOP = 7, u = (t % LOOP) / 1.8   // grow in over 1.8 s, hold, begin again
  const lx = ctx.level * W
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
      <line x1={0} x2={W} y1={base + 0.5} y2={base + 0.5} strokeWidth={0.75} style={{ stroke: INK3 }} />
      {hist.map((c, i) => {
        const g = ease(u * BINS - i * 0.6)
        const h = (Math.log1p(c) / peak) * (base - 6) * g
        const above = (i + 0.5) / BINS >= ctx.level
        return <rect key={i} x={f1(i * bw + 1)} y={f1(base - h)} width={f1(bw - 2)} height={f1(Math.max(0, h))} style={{ fill: above ? INK : INK4 }} />
      })}
      <line x1={f1(lx)} x2={f1(lx)} y1={0} y2={base} strokeWidth={1} style={{ stroke: INK }} />
      <text x={f1(lx + 4)} y={8} fontSize={8} style={{ fill: INK, fontFamily: MONO }}>{ctx.level.toFixed(2)}</text>
      <text x={0} y={H} fontSize={8} style={{ fill: INK3, fontFamily: MONO }}>0</text>
      <text x={W} y={H} fontSize={8} textAnchor="end" style={{ fill: INK3, fontFamily: MONO }}>1</text>
    </svg>
  )
}

/* ── v5 · figures: the run's numbers counting up, one after another ─────────────────────────────── */

export function Figures({ ctx }: { ctx: HudCtx }) {
  const t = useT()
  const b = bitsOf(ctx.n)
  const items: [string, number][] = [
    ['qubits', b * Math.max(1, ctx.q.axes.length)],
    ['cells', ctx.grid?.solid ?? 0],
    ['faces', ctx.report?.faces ?? 0],
  ]
  const LOOP = 8, u = t % LOOP
  return (
    <div style={{ display: 'flex', gap: 24, color: 'var(--qs-ink)', fontVariantNumeric: 'tabular-nums' }}>
      {items.map(([k, v], i) => {
        const shown = Math.round(v * ease((u - i * 0.5) / 1.4))
        return (
          <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 72 }}>
            <span style={{ font: '500 24px/1 var(--qs-mono)', letterSpacing: '-.02em' }}>{shown.toLocaleString()}</span>
            <span style={{ font: '400 10px/1 var(--qs-mono)', color: 'var(--qs-ink3)' }}>{k}</span>
          </div>
        )
      })}
    </div>
  )
}

/* ── v6 · blur, real row: one row of the grid through the plane, input morphing into the result ──── */

export function BlurRow({ ctx }: { ctx: HudCtx }) {
  const t = useT()
  const g = ctx.data.grid, q = ctx.data.proc
  if (!g || !q || g.n !== q.n) return null
  const n = g.n, b = bitsOf(n)
  // the row along x at the middle of the shape, on the plane's layer when the plane runs along z
  const j = Math.floor(n / 2), k = ctx.slice.axis === 'z' ? Math.round(ctx.slice.index) : Math.floor(n / 2)
  const row = (f: { n: number; data: Float32Array }) => Array.from({ length: n }, (_, i) => f.data[(i * n + j) * n + Math.min(n - 1, Math.max(0, k))])
  const a = row(g), c = row(q)
  const peak = Math.max(1e-6, ...a, ...c)
  // in, hold, morph to the result, hold, back again: 6 s a cycle
  const u = (t % 6) / 6, m = u < 0.2 ? 0 : u < 0.45 ? ease((u - 0.2) / 0.25) : u < 0.7 ? 1 : u < 0.95 ? 1 - ease((u - 0.7) / 0.25) : 0
  const W = 264, H = 84, base = H - 18, bw = W / n
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
      <line x1={0} x2={W} y1={base + 0.5} y2={base + 0.5} strokeWidth={0.75} style={{ stroke: INK3 }} />
      {a.map((v, i) => {
        const amp = Math.sqrt(Math.max(0, v + (c[i] - v) * m) / peak)   // amplitude: √ of the share
        const h = amp * (base - 6)
        return <rect key={i} x={f1(i * bw + 0.5)} y={f1(base - h)} width={f1(Math.max(0.5, bw - 1))} height={f1(h)} style={{ fill: INK, opacity: 0.35 + 0.65 * m * (c[i] > v ? 1 : 0.6) }} />
      })}
      {/* what each qubit pairs: spans of 2, 4, 8 … cells under the row */}
      {Array.from({ length: Math.min(b, 4) }, (_, kq) => {
        const span = 2 ** (kq + 1) * bw, y = base + 4 + kq * 3
        return <line key={kq} x1={0} x2={f1(span)} y1={y} y2={y} strokeWidth={0.75} style={{ stroke: kq === 0 ? INK : INK4 }} />
      })}
      <text x={W} y={H - 2} fontSize={8} textAnchor="end" style={{ fill: INK3, fontFamily: MONO }}>{m < 0.5 ? 'in' : 'out'}</text>
    </svg>
  )
}

/* ── v7 · requests: the real calls of this session as packets out to the service and back ────────── */

export function Requests({ ctx }: { ctx: HudCtx }) {
  const t = useT()
  const calls = ctx.log.filter((l) => l.level === 'net').slice(-6)
  const W = 264, rowH = 12, H = Math.max(1, calls.length) * rowH + (ctx.job ? 16 : 4)
  const LOOP = 5
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
      {calls.map((l, i) => {
        const y = i * rowH + 6
        const ms = Number(/(\d+) ms/.exec(l.text)?.[1] ?? 0)
        const path = /\/api\/([\w-]+)/.exec(l.text)?.[1] ?? '·'
        const atlas = /atlas|process/.test(l.text)
        // each call travels out and back in its own time (scaled), one after another
        const d = Math.min(2.4, 0.4 + Math.log10(1 + ms) * 0.5), u = ((t - i * 0.6) % LOOP + LOOP) % LOOP / d
        const x0 = 56, x1 = W - 16, p = u < 0.5 ? u * 2 : u < 1 ? 2 - u * 2 : -1
        return (
          <g key={i}>
            <text x={0} y={y + 3} fontSize={8} style={{ fill: INK3, fontFamily: MONO }}>{path.slice(0, 9)}</text>
            <line x1={x0} x2={x1} y1={y} y2={y} strokeWidth={0.75} strokeDasharray={atlas ? '2 2' : undefined} style={{ stroke: INK4 }} />
            <rect x={x1} y={y - 3} width={6} height={6} strokeWidth={0.75} style={{ stroke: INK3, fill: 'none' }} />
            {p >= 0 && <circle cx={f1(x0 + (x1 - x0) * p)} cy={y} r={2.2} style={{ fill: INK }} />}
          </g>
        )
      })}
      {ctx.job && (() => {
        const n = Math.min(32, ctx.job.tiles_total || 0), y = calls.length * rowH + 8
        return Array.from({ length: n }, (_, i) => <rect key={i} x={56 + i * 6} y={y} width={4} height={4} style={{ fill: i < (ctx.job?.tiles_done ?? 0) ? INK : 'none', stroke: INK3, strokeWidth: 0.75 }} />)
      })()}
    </svg>
  )
}
