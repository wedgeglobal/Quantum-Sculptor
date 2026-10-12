// Scan and slice: the layer being read or printed (QLMarks4, "Scan and slice").
// v1 sweep, v2 plane + index (QSlice-style cabinet cube), v3 layer stack, v4 marching.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as RPointerEvent } from 'react'
import { solidPerLayer, type Axis } from '../qs/grid'
import { Count } from './Num'
import type { HudCtx } from './types'
import './lab.css'

type V2 = [number, number]
type V3 = [number, number, number]

const SWEEP_MS = 3200
const n1 = (v: number) => Math.round(v * 10) / 10
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

// ---------------------------------------------------------------- v1 sweep

/** A 3.2 s pass across the view each time ctx.busy turns on. */
export function Sweep({ ctx }: { ctx: HudCtx }) {
  const [pass, setPass] = useState(0)
  const [on, setOn] = useState(false)
  const was = useRef(false)
  const t = useRef(0)
  useEffect(() => {
    if (ctx.busy && !was.current) {
      setPass((p) => p + 1)
      setOn(true)
      clearTimeout(t.current)
      t.current = window.setTimeout(() => setOn(false), SWEEP_MS)
    }
    was.current = ctx.busy
  }, [ctx.busy])
  useEffect(() => () => clearTimeout(t.current), [])
  if (!on) return null
  const pad = 48
  const L = 14
  return (
    <div className="qs-lab-layer" style={{ width: ctx.w, height: ctx.h }} aria-hidden>
      <div style={{ position: 'absolute', left: pad, top: pad, width: L, height: L, borderLeft: '1px solid var(--qs-ink)', borderTop: '1px solid var(--qs-ink)' }} />
      <div style={{ position: 'absolute', right: pad, bottom: pad, width: L, height: L, borderRight: '1px solid var(--qs-ink)', borderBottom: '1px solid var(--qs-ink)' }} />
      <div style={{ position: 'absolute', left: pad, right: pad, top: pad, bottom: pad }}>
        <div key={pass} className="qs-lab-sweep">
          <span className="qs-lab-small" style={{ position: 'absolute', right: 0, top: -14, color: 'var(--qs-ink)' }}>
            scan
          </span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- v2 plane + index

const W = 232
const H = 150
const KX = 0.433
const KY = 0.25
const SX = 196 // the scale's x
const S0 = H - 14, S1 = 14 // the scale's bottom and top

/** The grid as a hairline cube with the cutting plane in it, and a straight scale beside it with the
 *  layer's number. Drag up or down anywhere on it to move the plane; hover previews a layer. */
export function PlaneIndex({ ctx }: { ctx: HudCtx }) {
  const N = Math.max(1, ctx.n)
  const ax: Axis = ctx.slice.axis
  const k = clamp(Math.round(ctx.slice.index), 0, N - 1)
  const [hover, setHover] = useState<number | null>(null)
  const [drag, setDrag] = useState<number | null>(null)

  const u = Math.min(150 / (N * (1 + KX)), (H - 24) / (N * (1 + KY)))
  const OX = 12, OY = H - 12
  const P = (i: number, j: number, z: number): V2 => [OX + u * (i + j * KX), OY - u * (z + j * KY)]
  const p3 = (a: number, b: number, L: number): V2 => (ax === 'z' ? P(a, b, L) : ax === 'x' ? P(L, a, b) : P(a, L, b))
  const corners = (L: number) => ([[0, 0], [N, 0], [N, N], [0, N]] as V2[]).map(([a, b]) => p3(a, b, L))
  const quad = (L: number) => 'M' + corners(L).map((q) => q.map(n1).join(' ')).join('L') + 'Z'

  let hid = ''
  let vis = ''
  const C8: V3[] = []
  for (const z of [0, N]) for (const j of [0, N]) for (const i of [0, N]) C8.push([i, j, z])
  for (let a = 0; a < 8; a++)
    for (let b = a + 1; b < 8; b++) {
      const A = C8[a]
      const B = C8[b]
      if (A.filter((x, t) => x !== B[t]).length !== 1) continue
      const pa = P(...A)
      const pb = P(...B)
      const seg = `M${n1(pa[0])} ${n1(pa[1])}L${n1(pb[0])} ${n1(pb[1])}`
      if ([A, B].some((q) => q[0] === 0 && q[1] === N && q[2] === 0)) hid += seg
      else vis += seg
    }

  const yOf = (i: number) => S0 - ((i + 0.5) / N) * (S0 - S1)
  let ticks = ''
  let major = ''
  for (let i = 0; i <= 16; i++) {
    const y = n1(S0 - (i / 16) * (S0 - S1))
    if (i % 4 === 0) major += `M${SX - 4} ${y}H${SX + 4}`
    else ticks += `M${SX - 2} ${y}H${SX + 2}`
  }
  // the leader: from the plane's right-most corner to its layer on the scale
  const edge = corners(k + 0.5).reduce((m, q) => (q[0] > m[0] ? q : m))
  const ghost = hover != null && hover !== k ? hover : null

  const toIdx = (e: RPointerEvent<HTMLDivElement>) => {
    const rc = e.currentTarget.getBoundingClientRect()
    const my = (e.clientY - rc.top) * (H / (rc.height || H))
    return clamp(Math.round(((S0 - my) / (S0 - S1)) * N - 0.5), 0, N - 1)
  }
  const down = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag(e.pointerId)
    const i = toIdx(e)
    setHover(i)
    if (i !== k) ctx.setSlice({ index: i })
  }
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const i = toIdx(e)
    if (drag != null && e.pointerId === drag && i !== k) ctx.setSlice({ index: i })
    if (i !== hover) setHover(i)
  }
  const up = (e: RPointerEvent<HTMLDivElement>) => {
    if (drag == null || e.pointerId !== drag) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setDrag(null)
  }

  const held = drag != null
  const hair = { fill: 'none', strokeWidth: 0.75 } as const
  return (
    <div
      className="qs-lab-hit"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onPointerLeave={() => !held && setHover(null)}
      data-tip="Cutting plane"
      data-tip-desc="Drag up or down to move the plane; hover previews a layer"
      style={{ position: 'relative', width: W, height: H, cursor: held ? 'grabbing' : 'ns-resize', userSelect: 'none', touchAction: 'none' }}
    >
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} aria-hidden>
        <path d={hid} style={{ ...hair, stroke: 'var(--qs-ink4)', strokeDasharray: '2 3' }} />
        {ghost != null && <path d={quad(ghost + 0.5)} style={{ ...hair, stroke: 'var(--qs-ink3)', strokeDasharray: '2 2' }} />}
        <path d={quad(k + 0.5)} style={{ fill: held ? 'var(--qs-line)' : 'var(--qs-faint)', stroke: 'var(--qs-ink)', strokeWidth: 1, transition: 'd 200ms var(--qs-ease)' }} />
        <path d={vis} style={{ ...hair, stroke: 'var(--qs-ink3)' }} />
        <path d={`M${n1(edge[0])} ${n1(edge[1])}L${SX - 8} ${n1(yOf(k))}`} style={{ ...hair, stroke: 'var(--qs-ink3)', strokeDasharray: '1 2.5' }} />
        <path d={`M${SX} ${S1}V${S0}`} style={{ ...hair, stroke: 'var(--qs-ink4)' }} />
        <path d={ticks} style={{ ...hair, stroke: 'var(--qs-ink4)' }} />
        <path d={major} style={{ ...hair, stroke: 'var(--qs-ink3)' }} />
        {ghost != null && <path d={`M${SX - 6} ${n1(yOf(ghost))}H${SX + 6}`} style={{ ...hair, stroke: 'var(--qs-ink3)' }} />}
        <path d={`M${SX - 8} ${n1(yOf(k))}H${SX + 8}`} style={{ fill: 'none', stroke: 'var(--qs-ink)', strokeWidth: 1.5, transition: 'd 200ms var(--qs-ease)' }} />
      </svg>
      <span className="qs-lab-small" style={{ position: 'absolute', left: SX + 12, top: n1(yOf(k)), transform: 'translateY(-50%)', color: 'var(--qs-ink)', pointerEvents: 'none', transition: 'top 200ms var(--qs-ease)' }}>
        <Count>{String(k)}</Count>
      </span>
      {ghost != null && (
        <span className="qs-lab-small" style={{ position: 'absolute', left: SX + 12, top: n1(yOf(ghost)), transform: 'translateY(-50%)', color: 'var(--qs-ink3)', pointerEvents: 'none' }}>{ghost}</span>
      )}
      <span className="qs-lab-small" style={{ position: 'absolute', left: SX - 3, top: 0, color: 'var(--qs-ink3)', pointerEvents: 'none' }}>{ax}</span>
    </div>
  )
}

// ---------------------------------------------------------------- v3 layer stack

const ROW = 4 // px per stroke row (1px stroke + gap)

/** One stroke per layer group, top = highest layer, as long as the cells the model fills in it; the
 *  cursor at the cutting plane glides with it. Click or drag to set the slice. */
export function LayerStack({ ctx }: { ctx: HudCtx }) {
  const N = Math.max(1, ctx.n)
  const g = Math.max(1, Math.ceil(N / 32)) // layers per stroke
  const G = Math.ceil(N / g)
  const k = clamp(Math.round(ctx.slice.index), 0, N - 1)
  const cur = Math.floor(k / g)
  const [drag, setDrag] = useState<number | null>(null)
  const grid = ctx.data.grid
  const counts = useMemo(() => {
    const per = grid && grid.n === N ? solidPerLayer(grid, ctx.slice.axis) : []
    return Array.from({ length: G }, (_, grp) => per.slice(grp * g, grp * g + g).reduce((a, v) => a + v, 0))
  }, [grid, N, G, g, ctx.slice.axis])
  const peak = Math.max(1, ...counts)

  const at = (e: RPointerEvent<HTMLDivElement>) => {
    const rc = e.currentTarget.getBoundingClientRect()
    const row = clamp(Math.floor((e.clientY - rc.top) / ROW), 0, G - 1)
    const grp = G - 1 - row
    return grp === cur ? k : clamp(grp * g + Math.floor(g / 2), 0, N - 1)
  }
  const down = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag(e.pointerId)
    const i = at(e)
    if (i !== k) ctx.setSlice({ index: i })
  }
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    if (drag == null || e.pointerId !== drag) return
    const i = at(e)
    if (i !== k) ctx.setSlice({ index: i })
  }
  const up = (e: RPointerEvent<HTMLDivElement>) => {
    if (drag == null || e.pointerId !== drag) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setDrag(null)
  }
  const width = (grp: number) => (counts[grp] ? 4 + 60 * (counts[grp] / peak) : 2)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
      <div
        className="qs-lab-stack qs-lab-hit"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        style={{ position: 'relative', width: 120, cursor: drag != null ? 'grabbing' : 'pointer', userSelect: 'none', touchAction: 'none' }}
      >
        {Array.from({ length: G }, (_, r) => {
          const grp = G - 1 - r, lo = grp * g, hi = Math.min(N - 1, lo + g - 1)
          const d = Math.abs(grp - cur)
          return (
            <div key={grp} className="qs-lab-row" data-tip={g > 1 ? `${lo}–${hi}` : String(lo)} data-tip-desc={`${counts[grp] ?? 0} cells`}
              style={{ height: ROW, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="qs-lab-small" style={{ width: 16, flex: 'none', textAlign: 'right', fontSize: 8, lineHeight: 1, color: 'var(--qs-ink4)', visibility: grp % 8 === 0 && d > 2 ? 'visible' : 'hidden' }}>{grp + 1}</span>
              <span className="qs-lab-stroke" style={{ width: width(grp), height: 1, flex: 'none', background: d === 0 ? 'var(--qs-ink)' : d < 3 ? 'var(--qs-ink3)' : 'var(--qs-ink4)' }} />
            </div>
          )
        })}
        {/* the cutting plane: a rule across the stack and its layer, gliding as it moves */}
        <div className="qs-lab-cursor" style={{ left: 24, transform: `translateY(${(G - 1 - cur) * ROW + ROW / 2}px)` }} aria-hidden>
          <span className="qs-lab-cursor__rule" />
          <span className="qs-lab-small" style={{ color: 'var(--qs-ink)' }}>{cur + 1}</span>
        </div>
      </div>
      <span className="qs-lab-small" style={{ color: 'var(--qs-ink3)' }}>
        <Count>{counts[cur] ?? 0}</Count>
      </span>
    </div>
  )
}

// ---------------------------------------------------------------- v4 marching

/** Dashed marching rectangle around the object while the grid is being recomputed. */
export function Marching({ ctx }: { ctx: HudCtx }) {
  if (!ctx.busy || !ctx.rect) return null
  const pad = 10
  const { l, r, t, b } = ctx.rect
  const x = n1(l - pad)
  const y = n1(t - pad)
  const w = n1(r - l + 2 * pad)
  const h = n1(b - t + 2 * pad)
  return (
    <svg className="qs-lab-layer" width={ctx.w} height={ctx.h} viewBox={`0 0 ${ctx.w} ${ctx.h}`} aria-hidden>
      <rect className="qs-lab-march" x={x} y={y} width={w} height={h} style={{ fill: 'none', stroke: 'var(--qs-ink)', strokeWidth: 1, strokeDasharray: '4 4' }} />
      <text x={x + 8} y={y + h + 16} style={{ fill: 'var(--qs-ink3)', font: '400 10px/1 var(--qs-mono)' }}>
        recomputing grid
      </text>
    </svg>
  )
}
