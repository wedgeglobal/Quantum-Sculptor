// The surface's finish in one choice: stepped (the cells as they are, faces shown), smooth (polished
// triangles shaded smooth: fast) or smoothest (the volume smoothed before the skin is taken: slower).
import { useStore } from '../store'

export type Finish = 'stepped' | 'smooth' | 'smoothest'
export const FINISHES: { value: Finish; label: string; d: string }[] = [
  { value: 'stepped', label: 'Stepped', d: 'The cells as they are, every face shown. Fastest.' },
  { value: 'smooth', label: 'Smooth', d: 'The triangles polished and shaded smooth. Fast.' },
  { value: 'smoothest', label: 'Finest', d: 'The volume blurred before the skin is taken, then polished. Slower; thin walls may skip it.' },
]

/** Which finish the mesh settings amount to. */
export function finishOf(s: { m: { vfilter: string; smooth: number }; shade: { facets: boolean } }): Finish {
  if (s.m.vfilter !== 'none') return 'smoothest'
  return s.m.smooth > 0 && !s.shade.facets ? 'smooth' : 'stepped'
}

export function setFinish(f: Finish) {
  const st = useStore.getState()
  st.setShading(st.shading, { facets: f === 'stepped' })
  st.setM(f === 'stepped' ? { vfilter: 'none', smooth: 0 } : f === 'smooth' ? { vfilter: 'none', smooth: Math.max(8, st.m.smooth) } : { vfilter: 'gaussian', vwidth: Math.max(1, st.m.vwidth), smooth: Math.max(8, st.m.smooth) })
}
