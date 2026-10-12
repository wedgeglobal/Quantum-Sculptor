// Navigation as diagrams, in the manner of the capture dots: where the pipeline is, how long the last
// run took, how far a job has come, the steps on a ruler. Marks only, no sentences; small, on the
// 24 px module. Each reads the same pipeline state (ctx.steps, ctx.log, ctx.job).
import { useNow } from '../useNow'
import { useFrozen, useHolding, useMoves } from './motion'
import type { HudCtx } from './types'

const INK = 'var(--qs-ink)', INK3 = 'var(--qs-ink3)', INK4 = 'var(--qs-ink4)', BG = 'var(--qs-bg)'
const f1 = (v: number) => Math.round(v * 10) / 10

/** Seconds on a clock that runs while the piece moves. */
function useT() {
  const moves = useMoves()
  const hold = useHolding()
  const frozen = useFrozen()
  return useNow(moves && !hold && !frozen, 50) / 1000
}

/* ── steps · four nodes on a line: done filled, the live one ringed and breathing ────────────────── */

export function StepNodes({ ctx }: { ctx: HudCtx }) {
  const t = useT()
  const W = 120, H = 24, y = 12, gap = (W - 12) / 3
  const live = ctx.steps.live
  const last = ctx.steps.done.lastIndexOf(true)
  const pulse = 0.5 + 0.5 * Math.sin(t * 3.4)
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible', pointerEvents: 'auto' }}>
      <line x1={6} x2={W - 6} y1={y} y2={y} strokeWidth={0.75} style={{ stroke: INK4 }} />
      {last > 0 && <line x1={6} x2={f1(6 + gap * last)} y1={y} y2={y} strokeWidth={1} style={{ stroke: INK }} />}
      {ctx.steps.done.map((done, i) => {
        const x = 6 + gap * i
        const on = i === live
        return (
          <g key={i} style={{ cursor: 'pointer' }} onClick={() => ctx.goStep(i)} data-tip={ctx.steps.labels[i]?.[0]} data-tip-desc={ctx.steps.labels[i]?.[1]}>
            {on && <circle cx={x} cy={y} r={f1(6 + 2 * pulse)} strokeWidth={0.75} style={{ stroke: INK, fill: 'none', opacity: 1 - 0.6 * pulse }} />}
            <circle cx={x} cy={y} r={on ? 3.5 : 2.5} strokeWidth={0.75} style={{ stroke: done || on ? INK : INK4, fill: done || on ? INK : BG }} />
            <circle cx={x} cy={y} r={9} style={{ fill: 'transparent' }} />
          </g>
        )
      })}
    </svg>
  )
}

/* ── run timeline · the last run's requests as segments to scale ─────────────────────────────────── */

const STEP_OF: [RegExp, number][] = [[/model\//, 0], [/voxelize/, 1], [/process|grid\/processed|nations/, 2], [/mesh/, 3]]

/** Milliseconds each step took in the latest pass, from the request lines in the log. */
function durations(log: HudCtx['log']): number[] {
  const out = [0, 0, 0, 0]
  for (const l of log.slice(-80)) {
    if (l.level !== 'net') continue
    const ms = Number(/(\d+) ms/.exec(l.text)?.[1] ?? 0)
    const s = STEP_OF.find(([re]) => re.test(l.text))?.[1]
    if (s != null) out[s] += ms
  }
  return out
}

export function RunBar({ ctx }: { ctx: HudCtx }) {
  const d = durations(ctx.log)
  const total = d.reduce((a, b) => a + b, 0)
  const W = 168, H = 18, bh = 6
  let x = 0
  return (
    <svg width={W + 40} height={H} viewBox={`0 0 ${W + 40} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
      <rect x={0.5} y={0.5} width={W - 1} height={bh} strokeWidth={0.75} style={{ stroke: INK4, fill: 'none' }} />
      {total > 0 && d.map((ms, i) => {
        const w = (ms / total) * W
        const r = <g key={i}>
          <rect x={f1(x)} y={0} width={f1(Math.max(0, w - 1))} height={bh + 1} style={{ fill: INK, opacity: 1 - i * 0.22 }} />
          <line x1={f1(x)} x2={f1(x)} y1={bh + 2} y2={bh + 6} strokeWidth={0.75} style={{ stroke: INK3 }} />
        </g>
        x += w
        return r
      })}
      <text x={W + 6} y={bh + 1} fontSize={9} style={{ fill: INK3, fontFamily: 'var(--qs-mono)' }}>{total ? `${(total / 1000).toFixed(1)}s` : '—'}</text>
    </svg>
  )
}

/* ── progress · four cells, the live one filling as its job comes back ────────────────────────────── */

export function Progress({ ctx }: { ctx: HudCtx }) {
  const t = useT()
  const W = 144, H = 8, gap = 3, w = (W - 3 * gap) / 4
  const job = ctx.job
  const frac = job && job.status === 'running' && job.tiles_total ? job.tiles_done / job.tiles_total : null
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {ctx.steps.done.map((done, i) => {
        const x = i * (w + gap)
        const live = i === ctx.steps.live
        // the live cell fills by its job, or (nothing running) a slow sheen runs through it
        const fill = done && !live ? 1 : live ? frac ?? (ctx.busy ? (t * 0.4) % 1 : done ? 1 : 0) : 0
        return (
          <g key={i}>
            <rect x={f1(x) + 0.5} y={0.5} width={f1(w - 1)} height={H - 1} strokeWidth={0.75} style={{ stroke: done || live ? INK : INK4, fill: 'none' }} />
            <rect x={f1(x)} y={0} width={f1(w * fill)} height={H} style={{ fill: INK }} />
          </g>
        )
      })}
    </svg>
  )
}

/* ── index · the steps on a vertical ruler, the live one reaching furthest ───────────────────────── */

export function StepRuler({ ctx }: { ctx: HudCtx }) {
  const H = 96, W = 28, gap = (H - 8) / 3
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible', pointerEvents: 'auto' }}>
      <line x1={0.5} x2={0.5} y1={4} y2={H - 4} strokeWidth={0.75} style={{ stroke: INK4 }} />
      {Array.from({ length: 13 }, (_, k) => {
        const y = 4 + (k * (H - 8)) / 12
        return k % 4 ? <line key={k} x1={0} x2={4} y1={f1(y)} y2={f1(y)} strokeWidth={0.75} style={{ stroke: INK4 }} /> : null
      })}
      {ctx.steps.done.map((done, i) => {
        const y = 4 + gap * i
        const live = i === ctx.steps.live
        return (
          <g key={i} style={{ cursor: 'pointer' }} onClick={() => ctx.goStep(i)} data-tip={ctx.steps.labels[i]?.[0]}>
            <line x1={0} x2={live ? W : done ? 16 : 10} y1={f1(y)} y2={f1(y)} strokeWidth={live ? 1.5 : 0.75} style={{ stroke: live || done ? INK : INK3, transition: 'all 300ms' }} />
            <rect x={0} y={f1(y - 6)} width={W} height={12} style={{ fill: 'transparent' }} />
          </g>
        )
      })}
    </svg>
  )
}
