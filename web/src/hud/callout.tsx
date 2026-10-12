import { useMemo } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { HudCtx, HudPin } from './types'
import { useAutoCells } from './auto'
import { useMarkScale } from './markScale'
import { useStore } from '../store'
import { nationName } from '../view/nations'
import './marks.css'

/*
 * Callouts — data attached to a point, drawn for each of ctx.pins (QLMarks4 › Callouts).
 * v1 dot leader · v2 elbow · v3 numbered · v4 value flag.
 */

const INK = 'var(--qs-ink)'
const INK3 = 'var(--qs-ink3)'
const BG = 'var(--qs-bg)'
const MONO = 'var(--qs-mono)'

const f = (v: number) => Math.round(v * 10) / 10
const stroke = (c: string): CSSProperties => ({ stroke: c, fill: 'none' })
/** Approximate advance of TWK Everett Mono: 0.6 em. */
const adv = (s: string, size: number) => s.length * size * 0.6

function Hud({ ctx, children }: { ctx: HudCtx; children: ReactNode }) {
  return (
    <svg className="qs-hud qs-hud--lift" width={ctx.w} height={ctx.h} viewBox={`0 0 ${ctx.w} ${ctx.h}`} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>
      {children}
    </svg>
  )
}

function T({ x, y, c = INK, size = 11, anchor, base, halo = true, children }: { x: number; y: number; c?: string; size?: number; anchor?: 'start' | 'middle' | 'end'; base?: 'central'; halo?: boolean; children: ReactNode }) {
  return (
    <text x={f(x)} y={f(y)} fontSize={size} textAnchor={anchor} dominantBaseline={base} className={halo ? 'qs-hud-halo' : undefined} style={{ fill: c, fontFamily: MONO }}>
      {children}
    </text>
  )
}

type Placed = HudPin & { x: number; y: number; sg: 1 | -1 }

/** A cell's value in a field, or null outside it. */
const at = (f: { n: number; data: Float32Array } | null, c: HudPin['cell']) => {
  if (!f) return null
  const [i, j, k] = c.map(Math.round)
  return i < 0 || j < 0 || k < 0 || i >= f.n || j >= f.n || k >= f.n ? null : f.data[(i * f.n + j) * f.n + k]
}
const gray = (v: number, b: number) => (v ^ (v >> 1)).toString(2).padStart(b, '0').slice(-b)

/** Evolve on screen: who holds each cell this turn and how big each nation is. */
type Nations = { owner: Uint8Array; n: number; size: number[]; action: (string | null)[] } | null
function useNations(): Nations {
  const ev = useStore((s) => (s.proc?.mode === 'nations' ? s.evolve : null))
  if (!ev?.owner || !ev.history) return null
  const rec = ev.history.turns[Math.min(ev.turn, ev.history.turns.length - 1)]
  return { owner: ev.owner, n: ev.n, size: rec.size, action: rec.action }
}

/** What a pin says, by the step on screen. `lead` (dot leader): what goes on at the cell; `flag`
 *  (value flag): the one figure that step changes there.
 *  Model: where it is, its height · Voxels: how full the cell is · Quantum: the value in and out, and
 *  what the blur moved · Evolve: the nation that holds it and its land · Mesh: inside or outside the skin. */
function say(ctx: HudCtx, p: HudPin, nat: Nations): { lead: string; flag: string } {
  const c = p.cell.map(Math.round)
  const v0 = at(ctx.data.grid, p.cell), v1 = at(ctx.data.proc, p.cell)
  const b = Math.ceil(Math.log2(Math.max(2, Math.min(ctx.n, 32))))
  const f2 = (v: number | null) => (v == null ? '—' : v.toFixed(2))
  const sign = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`
  switch (ctx.view) {
    case 'model': return { lead: `${c.map((x) => Math.round(x * ctx.mm)).join(' · ')} mm`, flag: `z ${Math.round(c[2] * ctx.mm)} mm` }
    case 'voxels': return { lead: `cell ${c.join(',')} · ${v0 == null ? '—' : `${Math.round(v0 * 100)}% filled`}`, flag: v0 == null ? '—' : `${Math.round(v0 * 100)}%` }
    case 'result': {
      const d = v1 == null ? null : v1 - ctx.level
      return { lead: `skin at ${ctx.level.toFixed(2)} · ${d == null ? '—' : d >= 0 ? 'inside' : 'outside'}`, flag: d == null ? '—' : `${sign(d)} ${d >= 0 ? 'in' : 'out'}` }
    }
    default: {
      if (nat && nat.n === ctx.n) {
        const who = nat.owner[(c[0] * nat.n + c[1]) * nat.n + c[2]] - 1
        if (who < 0) return { lead: `cell ${c.join(',')} · no one's`, flag: 'no one' }
        const act = nat.action[who]
        return { lead: `${nationName(who)} · ${nat.size[who] ?? 0} cells${act ? ` · ${act}` : ''}`, flag: `${nationName(who)} · ${nat.size[who] ?? 0}` }
      }
      return { lead: `|${gray(c[0], b)}⟩ ${f2(v0)} → ${v1 == null ? '—' : v1.toFixed(3)}`, flag: v0 == null || v1 == null ? f2(v1) : sign(v1 - v0) }
    }
  }
}

/** The pins to call out: the ones placed with the probe, or (none placed) three cells picked on their own. */
function usePins(ctx: HudCtx): HudPin[] {
  const auto = useAutoCells(ctx, 3, !ctx.pins.length, { seed: 9, hop: 2.5, edge: true })
  if (ctx.pins.length || !auto) return ctx.pins
  return auto.map((a, i) => ({ n: i + 1, cell: a.cell, x: a.x, y: a.y, lines: [`cell ${a.cell.join(',')}`, `value ${a.value.toFixed(3)}`] }))
}

/** On-screen pins, each with the side its label runs to (flips left near the right edge). */
function usePlaced(ctx: HudCtx, room: number): Placed[] {
  const pins = usePins(ctx)
  const { w } = ctx
  return useMemo(
    () =>
      pins.flatMap((p) => (p.x == null || p.y == null ? [] : [{ ...p, x: p.x, y: p.y, sg: (p.x > w - room ? -1 : 1) as 1 | -1 }])),
    [w, pins, room],
  )
}

/* ── v1 · dot leader ────────────────────────────────────────────────────────── */

export function DotLeader({ ctx }: { ctx: HudCtx }) {
  const sc = useMarkScale(), nat = useNations()
  const pins = usePlaced(ctx, 200 * sc)
  if (!pins.length) return null
  return (
    <Hud ctx={ctx}>
      {pins.map((p) => {
        const ex = p.x + p.sg * 44 * sc, ey = p.y - 38 * sc
        return (
          <g key={p.n}>
            <line x1={f(p.x)} y1={f(p.y)} x2={f(ex)} y2={f(ey)} strokeWidth={1} strokeDasharray="1 3" style={stroke(INK)} />
            <circle cx={f(p.x)} cy={f(p.y)} r={2 * sc} style={{ fill: INK }} />
            {/* keyed on the step: the line swaps in as the view moves from model to voxels to quantum to mesh */}
            <g key={ctx.view} className="qs-hud-swap">
              <T x={ex + p.sg * 4 * sc} y={ey} size={9 * sc} anchor={p.sg < 0 ? 'end' : 'start'} base="central">{say(ctx, p, nat).lead}</T>
            </g>
          </g>
        )
      })}
    </Hud>
  )
}

/* ── v2 · elbow ─────────────────────────────────────────────────────────────── */

export function Elbow({ ctx }: { ctx: HudCtx }) {
  const sc = useMarkScale()
  const pins = usePlaced(ctx, 220 * sc)
  if (!pins.length) return null
  return (
    <Hud ctx={ctx}>
      {pins.map((p) => {
        const ex = p.x + p.sg * 36 * sc, ey = p.y - 40 * sc
        const shelf = Math.max(100 * sc, Math.max(adv(p.lines[0], 10 * sc), adv(p.lines[1], 9 * sc)) + 14 * sc)
        const anchor = p.sg < 0 ? 'end' : 'start'
        return (
          <g key={p.n}>
            <polyline points={`${f(p.x)},${f(p.y)} ${f(ex)},${f(ey)} ${f(ex + p.sg * shelf)},${f(ey)}`} strokeWidth={1} style={stroke(INK)} />
            <circle cx={f(p.x)} cy={f(p.y)} r={2 * sc} style={{ fill: INK }} />
            <T x={ex + p.sg * 6 * sc} y={ey - 6 * sc} size={10 * sc} anchor={anchor}>{p.lines[0]}</T>
            <T x={ex + p.sg * 6 * sc} y={ey + 13 * sc} c={INK3} size={9 * sc} anchor={anchor}>{p.lines[1]}</T>
          </g>
        )
      })}
    </Hud>
  )
}

/* ── v3 · numbered ──────────────────────────────────────────────────────────── */

export function Numbered({ ctx }: { ctx: HudCtx }) {
  const sc = useMarkScale(), nat = useNations()
  const placed = usePlaced(ctx, 0)
  const pins = usePins(ctx)
  const { rect, w } = ctx
  if (!pins.length) return null
  const line = (p: HudPin) => `${p.n} ${say(ctx, p, nat).lead}`
  // Legend beside the object (right, or left when there is no room), else at the right edge.
  const longest = Math.max(...pins.map((p) => adv(line(p), 9 * sc)))
  let lx = w - 24 - longest, ly = 80, anchor: 'start' | 'end' = 'start'
  if (rect) {
    ly = Math.max(24, rect.t + 8)
    if (rect.r + 40 + longest < w - 16) lx = rect.r + 40
    else if (rect.l - 40 - longest > 16) {
      lx = rect.l - 40
      anchor = 'end'
    }
  }
  return (
    <Hud ctx={ctx}>
      {placed.map((p) => (
        <g key={p.n}>
          <circle cx={f(p.x)} cy={f(p.y)} r={6.5 * sc} strokeWidth={1} style={{ stroke: INK, fill: BG }} />
          <T x={p.x} y={p.y + 0.5} size={8 * sc} anchor="middle" base="central" halo={false}>{String(p.n)}</T>
        </g>
      ))}
      <g key={ctx.view} className="qs-hud-swap">
        {pins.map((p, i) => (
          <T key={p.n} x={lx} y={ly + i * 15 * sc} size={9 * sc} anchor={anchor} c={p.x == null ? INK3 : INK}>{line(p)}</T>
        ))}
      </g>
    </Hud>
  )
}

/* ── v4 · value flag ────────────────────────────────────────────────────────── */

/** The one figure the step on screen changes at the cell (see say): a height, how full it is, what the
 *  blur moved, the nation that holds it, inside or outside the skin. */
export function ValueFlag({ ctx }: { ctx: HudCtx }) {
  const sc = useMarkScale(), nat = useNations()
  const pins = usePlaced(ctx, 0)
  if (!pins.length) return null
  const fs = 9 * sc, ph = 16 * sc, stem = 24 * sc
  return (
    <Hud ctx={ctx}>
      {pins.map((p) => {
        const label = say(ctx, p, nat).flag
        const pw = Math.round(adv(label, fs) + 14 * sc)
        const top = p.y - stem - ph
        const x = Math.round(p.x) + 0.5
        return (
          <g key={p.n}>
            <path d={`M${x} ${f(p.y - 3)}V${f(p.y - stem)}`} strokeWidth={1} style={stroke(INK)} />
            <circle cx={f(p.x)} cy={f(p.y)} r={2.5 * sc} style={{ fill: INK }} />
            <rect x={f(p.x - pw / 2) + 0.5} y={f(top) + 0.5} width={pw} height={ph} rx={ph / 2} strokeWidth={1} style={{ stroke: INK, fill: BG }} />
            <g key={ctx.view} className="qs-hud-swap"><T x={p.x} y={top + ph / 2 + 0.5} size={fs} anchor="middle" base="central" halo={false}>{label}</T></g>
          </g>
        )
      })}
    </Hud>
  )
}
