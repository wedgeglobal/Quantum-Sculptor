// Cells that pieces pick on their own: points on the object's surface, one per slot, each held for a
// beat and then gliding to the next. The selection marks follow one when nothing is hovered, callouts
// pin a few when nothing is pinned, and the tracking overlay follows many at once. Wall-clock driven,
// so they move whether or not the animation plays; a piece holding still keeps where they were.
import { useMemo } from 'react'
import { usePresent } from '../present'
import { useNow } from '../useNow'
import { useFrozen, useHolding } from './motion'
import type { HudCtx, Vec3 } from './types'

export interface AutoCell { cell: Vec3; value: number; x: number; y: number; /** 0 → 1 over the glide to this cell */ u: number; /** bumps on each new cell */ key: string; /** seconds on the clock */ t: number }

type Field = { n: number; data: Float32Array }
const cache = new WeakMap<Float32Array, Int32Array>()
const partCache = new WeakMap<Float32Array, Int32Array>()

/** Cells only partly filled (the edge of a coverage grid, where the value says something). */
function partial(f: Field): Int32Array {
  const hit = partCache.get(f.data)
  if (hit) return hit
  const out: number[] = []
  for (let i = 0; i < f.data.length; i++) { const v = f.data[i]; if (v > 0.06 && v < 0.94) out.push(i) }
  const arr = Int32Array.from(out)
  partCache.set(f.data, arr)
  return arr
}

/** Flat indices of solid cells with an empty neighbour: the outside of the object. */
function surface(f: Field): Int32Array {
  const hit = cache.get(f.data)
  if (hit) return hit
  const { n, data } = f
  const at = (x: number, y: number, z: number) => (x < 0 || y < 0 || z < 0 || x >= n || y >= n || z >= n ? 0 : data[(x * n + y) * n + z])
  const out: number[] = []
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) {
    if (data[(x * n + y) * n + z] < 0.5) continue
    if (at(x - 1, y, z) < 0.5 || at(x + 1, y, z) < 0.5 || at(x, y - 1, z) < 0.5 || at(x, y + 1, z) < 0.5 || at(x, y, z - 1) < 0.5 || at(x, y, z + 1) < 0.5) out.push((x * n + y) * n + z)
  }
  const arr = Int32Array.from(out)
  cache.set(f.data, arr)
  return arr
}

/** A repeatable random number in [0, 1) for two integers. */
export function hash(a: number, b: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const ease = (u: number) => 1 - Math.pow(1 - u, 3)
const GLIDE = 0.45 // seconds from one cell to the next

/** `count` surface cells for this piece, each held `hop` seconds (staggered across slots) and gliding
 *  between picks; null when there is nothing to pick or `on` is false. `seed` keeps pieces apart. */
export function useAutoCells(ctx: HudCtx, count: number, on: boolean, { hop: hopX = 1, seed = 0, edge = false }: { hop?: number; seed?: number; /** in the model and voxel steps, prefer cells only partly filled */ edge?: boolean } = {}): AutoCell[] | null {
  const auto = usePresent((p) => p.auto)
  const holding = useHolding()
  const frozen = useFrozen()
  const live = on && auto.targets && count > 0
  const now = useNow(live && !holding && !frozen, 33)
  // the step on screen decides which grid the cells come from: the input for the model and voxels
  const early = ctx.view === 'model' || ctx.view === 'voxels'
  const field = early ? ctx.data.grid ?? ctx.data.proc : ctx.data.proc ?? ctx.data.grid
  const cells = useMemo(() => {
    if (!live || !field) return null
    const part = edge && early ? partial(field) : null
    return part && part.length >= 8 ? part : surface(field)
  }, [live, field, edge, early])
  if (!live || !field || !cells?.length) return null
  const n = field.n
  const hop = Math.max(0.4, auto.hop * hopX)
  const t = now / 1000
  const xyz = (i: number): Vec3 => [Math.floor(i / (n * n)), Math.floor(i / n) % n, i % n]
  const pick = (slot: number, epoch: number) => cells[Math.floor(hash(slot * 7919 + seed * 104729, epoch) * cells.length)]
  const out: AutoCell[] = []
  for (let s = 0; s < count; s++) {
    const tt = t + (hop * s) / count
    const e = Math.floor(tt / hop)
    const a = xyz(pick(s, e - 1)), b = xyz(pick(s, e))
    const u = Math.min(1, (tt - e * hop) / GLIDE), k = ease(u)
    const p: Vec3 = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
    const q = ctx.project(p)
    if (!q) continue
    out.push({ cell: b, value: field.data[(b[0] * n + b[1]) * n + b[2]], x: q[0], y: q[1], u, key: `${s}:${e}`, t })
  }
  return out
}
