// Orbit rings (QLMarks4 · "Orbit rings"): where the view camera is, and where it can go. Drawn in
// perspective around the model with ctx.project in hairlines, plus the gimbal (QLControls4 · "Orbit
// gimbal states", drawn flat) bound to the live camera.
//
// Note on the camera node: any point on the line from the target toward the camera projects onto
// the target itself, so a node drawn "at the camera" would sit on the model. The node is therefore
// shown in profile: on the elevation arc in the vertical plane square to the view (to the right of
// the model), where the elevation reads at its true angle. The azimuth is marked on the floor ring
// at the point nearest the viewer.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as RPointerEvent, ReactNode } from 'react'
import type { HudCtx, Vec3 } from './types'
import { QCam } from '../qs/QCam'
import { QCAM_STATIONS } from '../qs/qcamPresets'
import { useMarkScale } from './markScale'
import './orbit.css'

const RAD = Math.PI / 180
const wrap360 = (v: number) => ((v % 360) + 360) % 360
/** Signed shortest-arc difference b − a in (−180, 180]. */
const dArc = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const n1 = (v: number) => v.toFixed(1)
const fA = (v: number) => String(Math.round(wrap360(v)) % 360).padStart(3, '0') + '°'
const fE = (v: number) => Math.round(v) + '°'

type Proj = HudCtx['project']
type P2 = [number, number]

interface Frame {
  /** Floor centre of the box, ring radius. */
  c: Vec3
  R: number
}

function frameOf(box: HudCtx['box'], scale = 1): Frame | null {
  if (!box) return null
  const { min, max } = box
  const ext = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 1)
  return { c: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, min[2]], R: 0.75 * ext * scale }
}

/** Point on the horizontal ring at azimuth t (az 0 = −y, toward +x), scaled by k. */
const ringPt = (f: Frame, t: number, k = 1, dz = 0): Vec3 => [
  f.c[0] + f.R * k * Math.sin(t * RAD),
  f.c[1] - f.R * k * Math.cos(t * RAD),
  f.c[2] + dz,
]
/** Point on the sphere around the ring centre at azimuth a, elevation e. */
const sphPt = (c: Vec3, R: number, a: number, e: number): Vec3 => [
  c[0] + R * Math.cos(e * RAD) * Math.sin(a * RAD),
  c[1] - R * Math.cos(e * RAD) * Math.cos(a * RAD),
  c[2] + R * Math.sin(e * RAD),
]

/** Polyline through projected points, broken where a point is behind the camera. */
function pathOf(project: Proj, pts: Vec3[]): string {
  let d = ''
  let pen = false
  for (const p of pts) {
    const q = project(p)
    if (!q) {
      pen = false
      continue
    }
    d += (pen ? 'L' : 'M') + n1(q[0]) + ' ' + n1(q[1])
    pen = true
  }
  return d
}

/** The floor ring split into the half nearer the viewer (solid ink) and the far half (hidden, dashed). */
function ringHalves(project: Proj, f: Frame, az: number, k = 1, dz = 0): { front: string; back: string } {
  const front: Vec3[] = []
  const back: Vec3[] = []
  for (let i = 0; i <= 72; i++) {
    const t = az - 90 + i * 2.5
    front.push(ringPt(f, t, k, dz))
    back.push(ringPt(f, t + 180, k, dz))
  }
  return { front: pathOf(project, front), back: pathOf(project, back) }
}

interface Seg {
  d: string
  front: boolean
}
/** Radial ticks on the ring every `step` degrees; majors (every 90°) reach further out. */
function ringTicks(project: Proj, f: Frame, az: number, step: number): Seg[] {
  const out: Seg[] = []
  for (let t = 0; t < 360; t += step) {
    const mj = t % 90 === 0
    const a = project(ringPt(f, t, 1))
    const b = project(ringPt(f, t, mj ? 1.12 : 1.06))
    if (!a || !b) continue
    out.push({ d: `M${n1(a[0])} ${n1(a[1])}L${n1(b[0])} ${n1(b[1])}`, front: Math.cos((t - az) * RAD) > 0 })
  }
  return out
}

const cross = (p: P2 | null, r = 8) => (p ? `M${n1(p[0] - r)} ${n1(p[1])}H${n1(p[0] + r)}M${n1(p[0])} ${n1(p[1] - r)}V${n1(p[1] + r)}` : '')

/** Full-viewport SVG layer for the 'object' slot; only marked children take pointer events. */
function Layer({ ctx, children, className, opacity }: { ctx: HudCtx; children: ReactNode; className?: string; opacity?: number }) {
  return (
    <svg
      className={'qh-layer qh-svg' + (className ? ' ' + className : '')}
      width={ctx.w}
      height={ctx.h}
      viewBox={`0 0 ${ctx.w} ${ctx.h}`}
      style={{ width: ctx.w, height: ctx.h, opacity }}
    >
      {children}
    </svg>
  )
}

// ---------------------------------------------------------------------------------------------
// v1 · ring: a hairline round the object, four nodes on it, the camera on its arc (draggable)

interface Drag {
  id: number
  x0: number
  y0: number
  a0: number
  e0: number
}

const NODES = [0, 90, 180, 270]

export function GimbalRing({ ctx }: { ctx: HudCtx }) {
  const [drag, setDrag] = useState<Drag | null>(null)
  const [hov, setHov] = useState(false)
  const { az, el } = ctx.cam
  const sc = useMarkScale()

  const g = useMemo(() => {
    const f = frameOf(ctx.box, sc)
    if (!f) return null
    const P = ctx.project
    // elevation arc in profile: the vertical plane square to the view, on the model's right
    const right = az + 90
    const quarter: Vec3[] = []
    for (let e = 0; e <= 90; e += 3) quarter.push(sphPt(f.c, f.R, right, e))
    return {
      ring: ringHalves(P, f, az),
      nodes: NODES.map((t) => ({ p: P(ringPt(f, t)), front: Math.cos((t - az) * RAD) > -0.05 })),
      quarter: pathOf(P, quarter),
      node: P(sphPt(f.c, f.R, right, el)),
      foot: P(ringPt(f, right, Math.cos(el * RAD))),
    }
  }, [ctx.box, ctx.project, az, el, sc])

  if (!g) return null
  const { node, foot } = g
  const dragging = drag != null
  const loud = hov || dragging

  const onDown = (e: RPointerEvent<SVGElement>) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ id: e.pointerId, x0: e.clientX, y0: e.clientY, a0: ctx.cam.az, e0: ctx.cam.el })
  }
  const onMove = (e: RPointerEvent<SVGElement>) => {
    if (!drag || e.pointerId !== drag.id) return
    const a = wrap360(drag.a0 + (e.clientX - drag.x0) * 0.5)
    const v = clamp(drag.e0 - (e.clientY - drag.y0) * 0.5, -89, 89)
    ctx.orbitTo(a, v)
  }
  const onUp = (e: RPointerEvent<SVGElement>) => {
    if (!drag || e.pointerId !== drag.id) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setDrag(null)
  }

  return (
    <Layer ctx={ctx} className="qh-thin">
      <path d={g.ring.back} className="qh-k4 qh-guide" />
      <path d={g.ring.front} className="qh-k2" />
      <path d={g.quarter} className="qh-k4 qh-guide" />
      {node && foot && <line x1={n1(node[0])} y1={n1(node[1])} x2={n1(foot[0])} y2={n1(foot[1])} className="qh-k4 qh-drop" />}
      {g.nodes.map(({ p, front }, i) => p && (
        <circle key={i} cx={n1(p[0])} cy={n1(p[1])} r={n1(2 * Math.sqrt(sc))} className={front ? 'qh-f1' : 'qh-fbg qh-k3'} />
      ))}
      {node && (
        <g>
          <circle cx={n1(node[0])} cy={n1(node[1])} r="7" className="qh-k3 qh-halo" opacity={loud ? 1 : 0} style={{ transition: 'opacity 200ms' }} />
          <circle cx={n1(node[0])} cy={n1(node[1])} r={dragging ? 3.5 : 2.5} className="qh-f1" />
          {loud && (
            <text x={n1(node[0] + 12)} y={n1(node[1] - 8)} className="qh-t2 qh-th">
              {fA(az) + ' · ' + fE(el)}
            </text>
          )}
          <circle
            cx={n1(node[0])}
            cy={n1(node[1])}
            r="12"
            className={'qh-hit qh-grab' + (dragging ? ' qh-on' : '')}
            data-tip="Camera"
            data-tip-desc="Drag to orbit: across for azimuth, up and down for elevation."
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onPointerEnter={() => setHov(true)}
            onPointerLeave={() => setHov(false)}
          />
        </g>
      )}
    </Layer>
  )
}

// ---------------------------------------------------------------------------------------------
// v4 · live: shown only while the view is moving; fades ~800ms after the last change

function useMoving(tick: number, az: number, ms = 800) {
  const [moving, setMoving] = useState(false)
  const [rate, setRate] = useState(0)
  const [seen, setSeen] = useState(false)
  const last = useRef<{ tick: number; az: number; t: number } | null>(null)
  const timer = useRef(0)
  useEffect(() => {
    const now = performance.now()
    const p = last.current
    last.current = { tick, az, t: now }
    if (!p || p.tick === tick) return
    const dt = (now - p.t) / 1000
    if (dt > 0 && dt < 0.5) {
      const v = Math.abs(dArc(p.az, az)) / dt
      setRate((r) => r * 0.7 + v * 0.3)
    }
    setMoving(true)
    setSeen(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setMoving(false)
      setRate(0)
    }, ms)
  }, [tick, az, ms])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return { moving, rate, seen }
}

export function LiveRing({ ctx }: { ctx: HudCtx }) {
  const { az, el } = ctx.cam
  const { moving, rate, seen } = useMoving(ctx.tick, az)
  const sc = useMarkScale()
  // drawn from the first move on; while it fades out the camera is still, so this is the last drawing
  const d = useMemo(() => {
    if (!seen) return null
    const f = frameOf(ctx.box, sc)
    if (!f) return null
    const P = ctx.project
    return {
      ring: ringHalves(P, f, az),
      ticks: ringTicks(P, f, az, 30),
      node: P(ringPt(f, az)),
      ctr: P(f.c),
    }
  }, [seen, ctx.box, ctx.project, az, sc])
  if (!d) return null
  const r = Math.round(rate)
  const label = r >= 1 ? `orbiting · ${r}°/s` : `${fA(az)} / ${fE(el)}`
  const { node } = d
  return (
    <Layer ctx={ctx} className="qh-live" opacity={moving ? 1 : 0}>
      <path d={d.ring.back} className="qh-k4 qh-guide" />
      {d.ticks.map((t, i) => (
        <path key={i} d={t.d} className={t.front ? 'qh-k1' : 'qh-k4'} />
      ))}
      <path d={d.ring.front} className="qh-k1" />
      <path d={cross(d.ctr)} className="qh-k1" />
      {node && (
        <>
          <circle cx={n1(node[0])} cy={n1(node[1])} r="9" className="qh-k1" />
          <circle cx={n1(node[0])} cy={n1(node[1])} r="4" className="qh-f1" />
          <text x={n1(node[0])} y={n1(node[1] + 24)} textAnchor="middle" className="qh-t1 qh-th">
            {label}
          </text>
        </>
      )}
    </Layer>
  )
}

// ---------------------------------------------------------------------------------------------
// v5 · gimbal: the flat gimbal bound to the live camera; its scales and angles show while the hand is
// on it and whenever the camera turns on its own (a drag in the view, the turntable, a shot)

export function GimbalStates({ ctx }: { ctx: HudCtx }) {
  const { az, el, dist } = ctx.cam
  const { moving } = useMoving(ctx.tick, az, 900)
  return (
    <div
      style={{ pointerEvents: 'auto', display: 'inline-flex' }}
      data-tip="Orbit gimbal"
      data-tip-desc="Drag to orbit, double-click to reset. Its angles show while it or the camera moves."
    >
      <QCam flat bare active={moving} value={{ az: wrap360(az), el: clamp(el, 0, 89), dist }} onChange={(c) => ctx.orbitTo(c.az, c.el)} />
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// v6 · gimbal values: the camera's azimuth, elevation and distance, and the four stations under them

export function GimbalValues({ ctx }: { ctx: HudCtx }) {
  const { az, el, dist } = ctx.cam
  const { moving } = useMoving(ctx.tick, az, 900)
  const rows: [string, string][] = [['Az', fA(az)], ['El', fE(el)], ['Dist', dist.toFixed(2)]]
  return (
    <div className="qh-gv" style={{ pointerEvents: 'auto' }}>
      <div className="qh-gv__rows">
        {rows.map(([k, v]) => (
          <span key={k} style={{ display: 'contents' }}>
            <span className="qh-gv__k">{k}</span>
            <span className={'qh-gv__v' + (moving ? ' qh-gv__v--live' : '')}>{v}</span>
          </span>
        ))}
      </div>
      <div className="qh-gv__st">
        {QCAM_STATIONS.map((s) => {
          const on = Math.abs(dArc(s.az, az)) < 1 && Math.abs(el - s.el) < 1
          return (
            <button key={s.label} type="button" className={'qh-gv__b' + (on ? ' qh-gv__b--on' : '')} onClick={() => ctx.orbitTo(s.az, s.el)}>{s.label}</button>
          )
        })}
      </div>
    </div>
  )
}
