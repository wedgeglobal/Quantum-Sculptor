// Camera, abstracted (QLMarks4): the view camera as a diagram rather than an object: where it
// stands, what it sees and how it sits against the grid. Ink is the camera; grey is context.
// Small corner diagrams, live from ctx.cam.
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { HudCtx } from './types'
import { useCamTrail } from './useCamTrail'
import './orbit.css'

const RAD = Math.PI / 180
const wrap360 = (v: number) => ((v % 360) + 360) % 360
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const n1 = (v: number) => v.toFixed(1)
const a3 = (v: number) => String(Math.round(wrap360(v)) % 360).padStart(3, '0')
const fA = (v: number) => a3(v) + '°'
const fE = (v: number) => Math.round(v) + '°'
const cross = (x: number, y: number, r = 8) => `M${n1(x - r)} ${n1(y)}H${n1(x + r)}M${n1(x)} ${n1(y - r)}V${n1(y + r)}`

/** Corner card: small-caps title, a mono readout, then the diagram. */
export function Card({ title, value, w = 220, h = 150, children, overflow = false }: { title: string; value: string; w?: number; h?: number; children: ReactNode; overflow?: boolean }) {
  return (
    <div className="qh-card qh-thin" style={{ width: w }}>
      <div className="qh-head">
        <span className="qh-sc">{title}</span>
        <span className="qh-val">{value}</span>
      </div>
      <svg className="qh-svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: overflow ? 'visible' : 'hidden' }}>
        {children}
      </svg>
    </div>
  )
}

// C1–C4 share one drawing: a hairline tile, the camera as the one ink mark (a dot, its line of sight),
// the grid and the model in grey, and one short figure where it is read. No sentences.

/** A tile: the diagram's frame. */
const Tile = ({ x = 0.5, y = 0.5, w, h }: { x?: number; y?: number; w: number; h: number }) => <rect x={x} y={y} width={w} height={h} className="qh-k4" />

// C1 · viewpoint: the camera seen from the side, its elevation and distance to the target --------

export function Viewpoint({ ctx }: { ctx: HudCtx }) {
  const { el, dist, fov } = ctx.cam
  const W = 216, H = 120
  const T = [W - 40, H - 34] as const
  const s = Math.sin(el * RAD), c = Math.cos(el * RAD)
  const L = Math.min(40 + 12 * clamp(dist, 0.6, 8), (T[0] - 18) / Math.max(c, 0.2), (T[1] - 12) / Math.max(Math.abs(s), 0.05))
  const E = [T[0] - L * c, T[1] - L * s]
  const hf = (clamp(fov, 1, 170) / 2) * RAD
  const phi = Math.atan2(T[1] - E[1], T[0] - E[0])
  const ray = (a: number) => `M${n1(E[0])} ${n1(E[1])}L${n1(E[0] + L * 1.15 * Math.cos(a))} ${n1(E[1] + L * 1.15 * Math.sin(a))}`
  const R = 22
  const arc = Math.abs(el) > 0.5 ? `M${n1(T[0] - R)} ${n1(T[1])}A${R} ${R} 0 0 ${el > 0 ? 1 : 0} ${n1(T[0] - R * c)} ${n1(T[1] - R * s)}` : ''
  const mid = [(E[0] + T[0]) / 2, (E[1] + T[1]) / 2]
  return (
    <Card title="Viewpoint" value={`${fE(el)} · ${dist.toFixed(2)}`} w={W + 1} h={H + 1}>
      <Tile w={W} h={H} />
      <line x1="8" x2={W - 8} y1={T[1]} y2={T[1]} className="qh-k4 qh-guide" />
      <path d={ray(phi - hf) + ray(phi + hf)} className="qh-k4" />
      <line x1={n1(E[0])} y1={n1(E[1])} x2={T[0]} y2={T[1]} className="qh-k1" />
      {arc && <path d={arc} className="qh-k3" />}
      <circle cx={n1(E[0])} cy={n1(E[1])} r="3" className="qh-f1" />
      <path d={cross(T[0], T[1], 5)} className="qh-k3" />
      <text x={T[0] - R - 6} y={T[1] - 6} textAnchor="end" className="qh-t1">{fE(el)}</text>
      <text x={n1(mid[0])} y={n1(mid[1] - 8)} textAnchor="middle" className="qh-t3 qh-th">{dist.toFixed(2)}</text>
    </Card>
  )
}

// C2 · frustum plan: from above, the grid, the model's footprint and what the camera takes in ------

export function FrustumPlan({ ctx }: { ctx: HudCtx }) {
  const { az, el, dist, fov } = ctx.cam
  const W = 144, H = 144, cx = W / 2, cy = H / 2
  const dh = Math.max(0.05, dist * Math.cos(el * RAD))
  const k = clamp(52 / dh, 20, 48) // px per grid side
  const sa = Math.sin(az * RAD), ca = Math.cos(az * RAD)
  const C = [cx + k * dh * sa, cy + k * dh * ca]
  const phi = Math.atan2(-ca, -sa)
  const aspect = ctx.h > 0 ? ctx.w / ctx.h : 1.6
  const hh = Math.atan(Math.tan((clamp(fov, 1, 170) / 2) * RAD) * aspect)
  const far = k * dh + k * 0.8
  const at = (d: number, side: number) => [C[0] + Math.cos(phi) * d - Math.sin(phi) * side * d * Math.tan(hh), C[1] + Math.sin(phi) * d + Math.cos(phi) * side * d * Math.tan(hh)]
  const fl = at(far, -1), fr = at(far, 1)
  const n = Math.max(ctx.n, 1), b = ctx.box
  const fp = b ? { x: cx - k / 2 + (b.min[0] / n) * k, y: cy + k / 2 - (b.max[1] / n) * k, w: ((b.max[0] - b.min[0]) / n) * k, h: ((b.max[1] - b.min[1]) / n) * k } : null
  // the label sits just behind the camera, away from the cone
  const lab = [C[0] + Math.cos(phi + Math.PI) * 14, C[1] + Math.sin(phi + Math.PI) * 14]
  return (
    <Card title="Frustum" value={fA(az)} w={W + 1} h={H + 1}>
      <Tile w={W} h={H} />
      <defs><clipPath id="qh-fp-clip"><rect x="1" y="1" width={W - 1} height={H - 1} /></clipPath></defs>
      <g clipPath="url(#qh-fp-clip)">
        <path d={`M${n1(C[0])} ${n1(C[1])}L${n1(fl[0])} ${n1(fl[1])}L${n1(fr[0])} ${n1(fr[1])}Z`} className="qh-ffaint" />
        <path d={`M${n1(fl[0])} ${n1(fl[1])}L${n1(C[0])} ${n1(C[1])}L${n1(fr[0])} ${n1(fr[1])}`} className="qh-k3" />
      </g>
      <rect x={n1(cx - k / 2)} y={n1(cy - k / 2)} width={n1(k)} height={n1(k)} className="qh-k4 qh-guide" />
      {fp && <rect x={n1(fp.x)} y={n1(fp.y)} width={n1(fp.w)} height={n1(fp.h)} className="qh-k3" />}
      <line x1={n1(C[0])} y1={n1(C[1])} x2={cx} y2={cy} className="qh-k1" />
      <circle cx={n1(clamp(C[0], 4, W - 4))} cy={n1(clamp(C[1], 4, H - 4))} r="3" className="qh-f1" />
      <text x={n1(clamp(lab[0], 14, W - 14))} y={n1(clamp(lab[1] + 3, 10, H - 4))} textAnchor="middle" className="qh-t1 qh-th">{a3(az)}</text>
    </Card>
  )
}

// C3 · viewport: the frame's shape, its thirds, and where the model sits in it ---------------------

const RATIOS: [number, string][] = [[16 / 9, '16:9'], [16 / 10, '16:10'], [3 / 2, '3:2'], [4 / 3, '4:3'], [1, '1:1'], [21 / 9, '21:9'], [4 / 5, '4:5'], [9 / 16, '9:16'], [1 / 2, '1:2']]

export function Viewport({ ctx }: { ctx: HudCtx }) {
  const a = ctx.h > 0 ? ctx.w / ctx.h : 1.6
  const box = 120
  const fw = a >= 1 ? box * 1.6 > box * a ? box * a : box * 1.6 : box * a, fh = fw / a
  const x0 = 0.5, y0 = 0.5, x1 = x0 + fw, y1 = y0 + fh
  const thirds = `M${n1(x0 + fw / 3)} ${n1(y0)}V${n1(y1)}M${n1(x0 + (2 * fw) / 3)} ${n1(y0)}V${n1(y1)}M${n1(x0)} ${n1(y0 + fh / 3)}H${n1(x1)}M${n1(x0)} ${n1(y0 + (2 * fh) / 3)}H${n1(x1)}`
  const name = RATIOS.find(([r]) => Math.abs(r - a) < 0.03)?.[1] ?? a.toFixed(2)
  const s = ctx.w > 0 ? fw / ctx.w : 0
  const rc = ctx.rect
  return (
    <Card title="Viewport" value={name} w={Math.ceil(fw) + 1} h={Math.ceil(fh) + 16} overflow>
      <rect x={x0} y={y0} width={n1(fw)} height={n1(fh)} className="qh-k3" />
      <path d={thirds} className="qh-k4" />
      {rc && s > 0 && (
        <rect x={n1(x0 + clamp(rc.l, 0, ctx.w) * s)} y={n1(y0 + clamp(rc.t, 0, ctx.h) * s)}
          width={n1(Math.max(0, clamp(rc.r, 0, ctx.w) - clamp(rc.l, 0, ctx.w)) * s)} height={n1(Math.max(0, clamp(rc.b, 0, ctx.h) - clamp(rc.t, 0, ctx.h)) * s)}
          className="qh-ffaint qh-k1" />
      )}
      <path d={cross(x0 + fw / 2, y0 + fh / 2, 4)} className="qh-k1" />
      <text x={x0} y={n1(y1 + 13)} className="qh-t2">{name}</text>
    </Card>
  )
}

// C4 · az / el chart: the sphere unwrapped; cross-hairs through the camera, presets as ticks ---------

const PRESETS: { label: string; az: number; el: number }[] = [
  { label: 'Front', az: 0, el: 0 }, { label: 'Right', az: 90, el: 0 }, { label: 'Back', az: 180, el: 0 },
  { label: 'Left', az: 270, el: 0 }, { label: 'Iso', az: 45, el: 35 }, { label: 'Top', az: 0, el: 89 },
]
const CX0 = 0.5, CW = 216, CY0 = 0.5, CH = 108
const ax = (az: number) => CX0 + (wrap360(az) / 360) * CW
const ey = (el: number) => CY0 + CH / 2 - (clamp(el, -90, 90) / 90) * (CH / 2)

export function AzElChart({ ctx }: { ctx: HudCtx }) {
  const { az, el } = ctx.cam
  const trail = useCamTrail(ctx.tick, az, el)
  const [hot, setHot] = useState(-1)
  let path = ''
  let prev: number | null = null
  for (const [a, e] of [...trail, [wrap360(az), el] as [number, number]]) {
    path += (prev == null || Math.abs(a - prev) > 180 ? 'M' : 'L') + n1(ax(a)) + ' ' + n1(ey(e))
    prev = a
  }
  const x = ax(az), y = ey(el)
  return (
    <div style={{ pointerEvents: 'none' }}>
      <Card title="Az / el" value={`${fA(az)} · ${fE(el)}`} w={CW + 1} h={CH + 16} overflow>
        <Tile w={CW} h={CH} />
        <path d={`M${CX0} ${n1(ey(0))}H${CX0 + CW}${[90, 180, 270].map((t) => `M${n1(ax(t))} ${CY0}V${CY0 + CH}`).join('')}`} className="qh-k4 qh-guide" />
        {path && <path d={path} className="qh-k3" />}
        <path d={`M${n1(x)} ${CY0}V${CY0 + CH}M${CX0} ${n1(y)}H${CX0 + CW}`} className="qh-k3" />
        {PRESETS.map((p, i) => {
          const px = ax(p.az), py = ey(p.el)
          return (
            <g key={p.label}>
              <rect x={n1(px - 2)} y={n1(py - 2)} width="4" height="4" className={hot === i ? 'qh-f1' : 'qh-fbg qh-k3'} />
              <circle cx={n1(px)} cy={n1(py)} r="8" className="qh-hit qh-press" data-tip={`${p.label} · ${a3(p.az)} / ${p.el}`} data-tip-desc="Click to swing the camera here."
                onPointerEnter={() => setHot(i)} onPointerLeave={() => setHot(-1)} onClick={() => ctx.orbitTo(p.az, p.el)} />
            </g>
          )
        })}
        <circle cx={n1(x)} cy={n1(y)} r="3" className="qh-f1" />
        <text x={n1(clamp(x, 12, CW - 12))} y={CY0 + CH + 12} textAnchor="middle" className="qh-t1">{a3(az)}</text>
        <text x={x > CW / 2 ? CX0 + 4 : CX0 + CW - 4} y={n1(clamp(y - 4, 10, CH - 2))} textAnchor={x > CW / 2 ? 'start' : 'end'} className="qh-t1">{fE(el)}</text>
      </Card>
    </div>
  )
}

// C5 · three views: camera direction in plan and elevation -----------------------------------

export function ThreeViews({ ctx }: { ctx: HudCtx }) {
  const { az, el } = ctx.cam
  const b = ctx.box
  const ext = b ? [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]] : [ctx.n, ctx.n, ctx.n]
  const sc = 30 / Math.max(ext[0], ext[1], ext[2], 1)
  const ce = Math.cos(el * RAD)
  const se = Math.sin(el * RAD)
  const sa = Math.sin(az * RAD)
  const ca = Math.cos(az * RAD)
  const tiles = [
    { x: 6, name: 'top', w: ext[0], h: ext[1], v: [ce * sa, ce * ca] },
    { x: 80, name: 'front', w: ext[0], h: ext[2], v: [ce * sa, -se] },
    { x: 154, name: 'side', w: ext[1], h: ext[2], v: [-ce * ca, -se] },
  ]
  return (
    <Card title="Three views" value={`${fA(az)} · ${fE(el)}`} h={112}>
      {tiles.map((t) => {
        const cx = t.x + 30
        const cy = 38
        const len = Math.hypot(t.v[0], t.v[1])
        const C = [cx + 26 * t.v[0], cy + 26 * t.v[1]]
        const end = [C[0] + (cx - C[0]) * 0.5, C[1] + (cy - C[1]) * 0.5]
        return (
          <g key={t.name}>
            <rect x={t.x} y="8" width="60" height="60" className="qh-k4" />
            <rect x={n1(cx - (t.w * sc) / 2)} y={n1(cy - (t.h * sc) / 2)} width={n1(t.w * sc)} height={n1(t.h * sc)} className="qh-k3" />
            {len > 0.15 ? (
              <>
                <line x1={n1(C[0])} y1={n1(C[1])} x2={n1(end[0])} y2={n1(end[1])} className="qh-k1" />
                <circle cx={n1(C[0])} cy={n1(C[1])} r="3" className="qh-f1" />
              </>
            ) : (
              <>
                <circle cx={cx} cy={cy} r="6" className="qh-k1" />
                <circle cx={cx} cy={cy} r="2" className="qh-f1" />
              </>
            )}
            <text x={t.x} y="86" className="qh-t2">{t.name}</text>
          </g>
        )
      })}
    </Card>
  )
}

// C6 · look-at: distance and up axis ---------------------------------------------------------

export function LookAt({ ctx }: { ctx: HudCtx }) {
  const { el, dist } = ctx.cam
  const s = Math.sin(el * RAD)
  const c = Math.cos(el * RAD)
  let L = clamp(50 + 14 * dist, 60, 150)
  if (Math.abs(s) > 0.01) L = Math.min(L, 96 / Math.abs(s))
  const M = [116, 76]
  const E = [M[0] - (L / 2) * c, M[1] - (L / 2) * s]
  const T = [M[0] + (L / 2) * c, M[1] + (L / 2) * s]
  // dimension line on the far side from the up arrow
  const nx = -s
  const ny = c
  const o = 14
  const tk = 5
  const dim =
    `M${n1(E[0] + nx * o)} ${n1(E[1] + ny * o)}L${n1(T[0] + nx * o)} ${n1(T[1] + ny * o)}` +
    `M${n1(E[0] + nx * (o - tk))} ${n1(E[1] + ny * (o - tk))}L${n1(E[0] + nx * (o + tk))} ${n1(E[1] + ny * (o + tk))}` +
    `M${n1(T[0] + nx * (o - tk))} ${n1(T[1] + ny * (o - tk))}L${n1(T[0] + nx * (o + tk))} ${n1(T[1] + ny * (o + tk))}`
  const lx = M[0] + nx * (o + 10)
  const ly = M[1] + ny * (o + 10)
  return (
    <Card title="Look-at" value={`el ${fE(el)}`}>
      <line x1={n1(E[0])} y1={n1(E[1])} x2={n1(T[0])} y2={n1(T[1])} className="qh-k1" />
      <path d={dim} className="qh-k3" />
      <text x={n1(lx)} y={n1(ly)} textAnchor="middle" dominantBaseline="middle" transform={`rotate(${n1(el)} ${n1(lx)} ${n1(ly)})`} className="qh-t1">
        {'dist ' + dist.toFixed(2)}
      </text>
      <circle cx={n1(E[0])} cy={n1(E[1])} r="3.5" className="qh-f1" />
      <path d={`M${n1(E[0])} ${n1(E[1])}V${n1(E[1] - 26)}M${n1(E[0] - 4)} ${n1(E[1] - 20)}L${n1(E[0])} ${n1(E[1] - 26)}L${n1(E[0] + 4)} ${n1(E[1] - 20)}`} className="qh-k1" />
      <text x={n1(E[0] + 7)} y={n1(E[1] - 18)} className="qh-t2">up +z</text>
      <path d={cross(T[0], T[1])} className="qh-k1" />
    </Card>
  )
}
