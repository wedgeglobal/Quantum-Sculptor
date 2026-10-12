import { useMemo } from 'react'
import { hash, useAutoCells } from './auto'
import { usePresent } from '../present'
import { useMarkScale } from './markScale'
import type { CSSProperties, ReactNode } from 'react'
import type { HudCtx, Vec3 } from './types'
import './marks.css'

/*
 * Selection — the probed cell, ctx.hover (QLMarks4 › Selection). Ink, because it is what you act on.
 * v1 square + tab · v2 lock-on · v3 target · v4 cell in slice.
 */

const INK = 'var(--qs-ink)'
const INK2 = 'var(--qs-ink2)'
const INK3 = 'var(--qs-ink3)'
const INK4 = 'var(--qs-ink4)'
const BG = 'var(--qs-bg)'
const FAINT = 'var(--qs-faint)'
const MONO = 'var(--qs-mono)'

const f = (v: number) => Math.round(v * 10) / 10
const stroke = (c: string): CSSProperties => ({ stroke: c, fill: 'none' })
const AX = ['x', 'y', 'z'] as const
const AI = { x: 0, y: 1, z: 2 } as const
/** In-plane axes of a slice, matching qs/grid `section`: z → (x, y); x → (y, z); y → (x, z). */
const PLANE = { z: [0, 1], x: [1, 2], y: [0, 2] } as const

function Hud({ ctx, children }: { ctx: HudCtx; children: ReactNode }) {
  return (
    <svg className="qs-hud qs-hud--lift" width={ctx.w} height={ctx.h} viewBox={`0 0 ${ctx.w} ${ctx.h}`} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>
      {children}
    </svg>
  )
}

function T({ x, y, c = INK, size = 11, anchor, children }: { x: number; y: number; c?: string; size?: number; anchor?: 'start' | 'middle' | 'end'; children: ReactNode }) {
  return (
    <text x={f(x)} y={f(y)} fontSize={size} textAnchor={anchor} className="qs-hud-halo" style={{ fill: c, fontFamily: MONO }}>
      {children}
    </text>
  )
}

/** What a selection mark points at: the hovered cell, or (nothing hovered) a cell it picks on its own. */
interface Aim { cx: number; cy: number; cell: Vec3; value: number | null; x: number; y: number; auto: boolean; key: string; u: number; t: number }
function useAim(ctx: HudCtx, seed: number, hop = 1): Aim | null {
  const auto = useAutoCells(ctx, 1, !ctx.hover, { seed, hop })
  if (ctx.hover) {
    const c = ctx.project(ctx.hover.cell)
    return c ? { cx: c[0], cy: c[1], cell: ctx.hover.cell, value: ctx.hover.value, x: ctx.hover.x, y: ctx.hover.y, auto: false, key: ctx.hover.cell.join(','), u: 1, t: 0 } : null
  }
  const a = auto?.[0]
  return a ? { cx: a.x, cy: a.y, cell: a.cell, value: a.value, x: a.x, y: a.y, auto: true, key: a.key, u: a.u, t: a.t } : null
}

/** A cell on screen: a square side covering its projected cube (clamped). */
function cellSide(ctx: HudCtx, cell: Vec3, min = 14, max = 64): number {
  const [i, j, k] = cell
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (let b = 0; b < 8; b++) {
    const s = ctx.project([i + (b & 1 ? 0.5 : -0.5), j + (b & 2 ? 0.5 : -0.5), k + (b & 4 ? 0.5 : -0.5)])
    if (!s) continue
    x0 = Math.min(x0, s[0]); x1 = Math.max(x1, s[0]); y0 = Math.min(y0, s[1]); y1 = Math.max(y1, s[1])
  }
  const raw = Number.isFinite(x0) ? Math.max(x1 - x0, y1 - y0) : min
  return Math.round(Math.min(max, Math.max(min, raw)))
}

/** While gliding to a new cell the mark opens up a little and settles as it arrives. */
const morph = (a: Aim, s: number) => (a.auto ? s * (1 + 0.6 * Math.sin(Math.PI * Math.min(1, a.u))) : s)

/* ── v1 · square + tab ──────────────────────────────────────────────────────── */

export function SquareTab({ ctx }: { ctx: HudCtx }) {
  const a = useAim(ctx, 1)
  const sc = useMarkScale()
  if (!a) return null
  const s = Math.round(morph(a, cellSide(ctx, a.cell, 16 * sc, 64 * sc)))
  const x0 = Math.round(a.cx - s / 2), y0 = Math.round(a.cy - s / 2)
  const ax = ctx.slice.axis
  const label = `${ax} ${a.cell[AI[ax]]}`
  const fs = 10 * sc, tw = label.length * fs * 0.6 + 8 * sc, th = 14 * sc
  return (
    <Hud ctx={ctx}>
      <rect x={x0 + 0.5} y={y0 + 0.5} width={s - 1} height={s - 1} strokeWidth={1} style={stroke(INK)} />
      <rect x={x0} y={y0 - th} width={tw} height={th} style={{ fill: INK }} />
      <text x={x0 + 4 * sc} y={y0 - th / 2} fontSize={fs} dominantBaseline="central" style={{ fill: BG, fontFamily: MONO }}>
        {label}
      </text>
    </Hud>
  )
}

/* ── v2 · lock-on ───────────────────────────────────────────────────────────── */

export function LockOn({ ctx }: { ctx: HudCtx }) {
  const a = useAim(ctx, 2, 1.25)
  const sc = useMarkScale()
  if (!a) return null
  const { cx, cy } = a
  const s = cellSide(ctx, a.cell, 20 * sc, 64 * sc)
  const l = cx - s / 2, r = cx + s / 2, t = cy - s / 2, b = cy + s / 2
  const L = Math.max(5 * sc, Math.min(12 * sc, s / 3))
  const d = `M${f(l)} ${f(t + L)}V${f(t)}H${f(l + L)}M${f(r - L)} ${f(t)}H${f(r)}V${f(t + L)}M${f(r)} ${f(b - L)}V${f(b)}H${f(r - L)}M${f(l + L)} ${f(b)}H${f(l)}V${f(b - L)}`
  return (
    <Hud ctx={ctx}>
      {/* keyed on the cell, so each new cell replays the close-in (turning a quarter on its own) */}
      <g key={a.key} className={'qs-hud-anim ' + (a.auto ? 'qs-hud-lock qs-hud-lock--turn' : 'qs-hud-lock')} style={{ transformOrigin: `${f(cx)}px ${f(cy)}px` }}>
        <path d={d} strokeWidth={1} style={stroke(INK)} />
      </g>
      {a.auto && a.value != null && <T x={r + 8 * sc} y={t + 4 * sc} c={INK3} size={9 * sc}>{a.value.toFixed(3)}</T>}
    </Hud>
  )
}

/* ── v3 · target ────────────────────────────────────────────────────────────── */

export function Target({ ctx }: { ctx: HudCtx }) {
  const a = useAim(ctx, 3, 1.5)
  const sc = useMarkScale()
  if (!a) return null
  const { cx, cy } = a
  const s = morph(a, cellSide(ctx, a.cell, 22 * sc, 48 * sc))
  const h = s / 2, G = 6 * sc, L = 12 * sc
  const d = `M0 ${f(-h - G - L)}v${L}M0 ${f(h + G)}v${L}M${f(-h - G - L)} 0h${L}M${f(h + G)} 0h${L}`
  const ax = ctx.slice.axis
  const [ua, va] = PLANE[ax]
  const cell = a.cell
  const flip = cx + h + 24 + 110 > ctx.w
  const tx = flip ? cx - h - 24 : cx + h + 24
  const anchor = flip ? 'end' : 'start'
  // on its own, the cross-hair turns slowly as it tracks
  const turn = a.auto ? (a.t * 24) % 360 : 0
  return (
    <Hud ctx={ctx}>
      <g transform={`translate(${f(cx)} ${f(cy)}) rotate(${f(turn)})`}>
        <rect x={f(-h)} y={f(-h)} width={f(s)} height={f(s)} strokeWidth={1} style={stroke(INK)} />
        <path d={d} strokeWidth={1} style={stroke(INK)} />
      </g>
      <T x={tx} y={cy - h - 4} size={10 * sc} anchor={anchor}>{`${AX[ua]} ${cell[ua]} · ${AX[va]} ${cell[va]}`}</T>
      <T x={tx} y={cy - h + 11 * sc} c={INK3} size={9 * sc} anchor={anchor}>{`${ax} ${cell[AI[ax]]}`}</T>
    </Hud>
  )
}

/* ── v4 · cell in slice ─────────────────────────────────────────────────────── */

/** A 5 × 5 map of the slice: the cell's coarse row and column tinted, its block in ink. */
const K = 5, C = 14, GRID = K * C

export function CellInSlice({ ctx }: { ctx: HudCtx }) {
  const { n, w, h } = ctx
  const hover = useAim(ctx, 4, 1.25)
  if (!hover || n <= 0) return null
  const ax = ctx.slice.axis
  const [ua, va] = PLANE[ax]
  const bin = (v: number) => Math.min(K - 1, Math.max(0, Math.floor((v * K) / n)))
  const col = bin(hover.cell[ua])
  const row = K - 1 - bin(hover.cell[va]) // v runs up the page
  // Above-left of the cursor, clear of the probe's own flag (which sits above-right).
  let gx = hover.x - 22 - GRID, gy = hover.y - 22 - GRID
  if (gx < 8) gx = hover.x + 22
  if (gy < 22) gy = hover.y + 22
  gx = Math.round(Math.min(gx, w - GRID - 8))
  gy = Math.round(Math.min(gy, h - GRID - 8))
  let lines = ''
  for (let i = 0; i <= K; i++) lines += `M${gx + i * C + 0.5} ${gy}v${GRID + 1}M${gx} ${gy + i * C + 0.5}h${GRID + 1}`
  return (
    <Hud ctx={ctx}>
      <rect x={gx} y={gy} width={GRID + 1} height={GRID + 1} style={{ fill: BG }} />
      <rect x={gx + col * C} y={gy} width={C + 1} height={GRID + 1} style={{ fill: FAINT }} />
      <rect x={gx} y={gy + row * C} width={GRID + 1} height={C + 1} style={{ fill: FAINT }} />
      <path d={lines} strokeWidth={1} style={stroke(INK4)} />
      <rect x={gx + col * C} y={gy + row * C} width={C + 1} height={C + 1} style={{ fill: INK }} />
      <T x={gx} y={gy - 7} c={INK2} size={10}>{`${ax} ${hover.cell[AI[ax]]}`}</T>
    </Hud>
  )
}

/* ── v5 · tracking ──────────────────────────────────────────────────────────── */

/** Blob tracking: boxes on cells of the object, each with its value, joined in order by hairlines;
 *  they let go and pick new cells one after another. */
export function Tracking({ ctx }: { ctx: HudCtx }) {
  const auto = usePresent((p) => p.auto)
  const sc = useMarkScale()
  const cells = useAutoCells(ctx, auto.boxes, true, { seed: 5, hop: 2.2 })
  const boxes = useMemo(() => (cells ?? []).map((c, i) => {
    // a size of its own per pick, opening as it arrives
    const r = hash(i, c.cell[0] * 4096 + c.cell[1] * 64 + c.cell[2])
    const side = (34 + r * 70) * sc * (0.82 + 0.18 * Math.min(1, c.u * 1.4))
    return { ...c, side, i }
  }), [cells, sc])
  if (!boxes.length) return null
  const links = auto.links ? boxes.map((b) => `${f(b.x)},${f(b.y)}`).join(' ') : ''
  return (
    <Hud ctx={ctx}>
      {links && <polyline points={links} strokeWidth={0.75} style={stroke(INK2)} />}
      {boxes.map((b) => {
        const x = Math.round(b.x - b.side / 2) + 0.5, y = Math.round(b.y - b.side / 2) + 0.5
        return (
          <g key={b.i} opacity={0.35 + 0.65 * Math.min(1, b.u * 2)}>
            <rect x={x} y={y} width={f(b.side)} height={f(b.side)} strokeWidth={1} style={stroke(INK)} />
            <T x={b.x} y={b.y + 3.5 * sc} size={10 * sc} anchor="middle">{b.value.toFixed(4)}</T>
          </g>
        )
      })}
    </Hud>
  )
}
