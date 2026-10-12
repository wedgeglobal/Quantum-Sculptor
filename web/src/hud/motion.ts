// Whether a piece moves with the clock. Every piece reads the same run, so all of them can play with
// it; a piece set to hold still (Library · its motion switch) keeps showing what it showed when the
// clock took over (playing, or scrubbed away from the start) and drops its own easing and motion.
import { createContext, useContext, useState } from 'react'
import { usePresent } from '../present'
import type { HudModule } from './types'

export const MotionCtx = createContext(true)

/** True when this piece moves with the clock (the default). */
export const useMoves = () => useContext(MotionCtx)

/** The clock is paused part way through a pass: everything that moves holds where it is. Before the
 *  first Play (the clock at 0) pieces move on their own, so they can be seen. */
export const useFrozen = () => usePresent((p) => !p.playing && p.t0 > 0)

/** True while this piece holds still: it doesn't move, and the clock is engaged. */
export function useHolding(): boolean {
  const moves = useContext(MotionCtx)
  const engaged = usePresent((p) => p.playing || p.t0 > 0)
  return !moves && engaged
}

/** `v` as the piece shows it: live, or what it was when the piece began holding. */
export function useHeld<T>(v: T): T {
  const hold = useHolding()
  const [held, setHeld] = useState<{ v: T } | null>(null)
  // taken as it begins holding, let go when it stops
  if (hold && !held) setHeld({ v })
  if (!hold && held) setHeld(null)
  return hold && held ? held.v : v
}

/** Pieces with something to animate: all but the frame marks (registration, brackets). The cutting
 *  plane's switch is its sweep. */
export const animatable = (m: Pick<HudModule, 'family' | 'slot'>) => m.family !== 'frame'

/** A piece's motion switch: the cutting plane sweeps or holds; any other piece moves with the clock or
 *  holds what it shows. */
export function toggleMotion(m: Pick<HudModule, 'family' | 'id'>) {
  const p = usePresent.getState()
  if (m.family === 'plane') {
    const on = p.stageReel.plane === 'off'
    p.setStageReel({ plane: on ? 'loop' : 'off' })
    if (on && !p.playing) p.setPlaying(true)
    return
  }
  const k = `${m.family}:${m.id}`
  p.setStill(k, !p.still[k])
}

