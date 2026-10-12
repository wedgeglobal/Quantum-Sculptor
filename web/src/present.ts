// The composition over the view: the HUD you compose yourself around the geometry, for work,
// screenshots, recordings and diagrams. It lives in Lab (Properties · Compose and Output). Presets lay
// out a set of pieces at once; in arrange mode you drag pieces around, resize, select and remove them;
// compositions you like are saved by name.
import { create } from 'zustand'
import type { FrameId } from './frames'
import { toRemove, type TidyLevel } from './hud/tidy'
import { api } from './api'
import { useStore, type Hud, type Layer, type S as StoreState, type Shading } from './store'
import { DEFAULT_COMPOSITION, DEFAULT_HUD, DEFAULT_ID } from './hud/defaultComposition'
import type { SliceColor, SliceOf } from './qs/sectionColor'

export interface Shot { az: number; el: number; dist: number }
/** The frame's padding: room kept clear inside each edge, in % of the frame's short side; `linked`
 *  moves all four together. Pieces sit inside it and the grid starts at it. */
export interface FramePad { t: number; r: number; b: number; l: number; linked: boolean }
/** A simple grade for what leaves the app (videos and frames): exposure in stops (brightness ×2^ev),
 *  contrast and saturation as factors, a lift of the shadows; `preview` shows it on the view too. */
export interface Grade { exposure: number; contrast: number; saturation: number; lift: number; preview: boolean }
export const GRADE: Grade = { exposure: 0, contrast: 1, saturation: 1, lift: 0, preview: true }
/** The grade as a CSS / canvas filter, or 'none' when it changes nothing. */
export function gradeFilter(g: Grade): string {
  const parts: string[] = []
  if (g.exposure) parts.push(`brightness(${(2 ** g.exposure).toFixed(3)})`)
  if (g.lift) parts.push(`contrast(${(1 - g.lift * 0.5).toFixed(3)})`, `brightness(${(1 + g.lift * 0.35).toFixed(3)})`)   // shadows up, highlights kept near
  if (g.contrast !== 1) parts.push(`contrast(${g.contrast.toFixed(3)})`)
  if (g.saturation !== 1) parts.push(`saturate(${g.saturation.toFixed(3)})`)
  return parts.length ? parts.join(' ') : 'none'
}
export const FRAME_PAD: FramePad = { t: 4, r: 4, b: 4, l: 4, linked: true }
/** Fractions of the view: the piece's top-left, or its centre when `c` (where a dragged component was dropped). */
export interface Pos { x: number; y: number; c?: boolean; auto?: boolean; z?: number; out?: boolean; anchor?: boolean }
/** How one component is drawn: emphasis tier (1 primary, 2 secondary, 3 tertiary), line weight and dash
 *  spacing as multiples of its own, size (corner and edge pieces), and whether it is hidden. */
export interface Look { tier?: 1 | 2 | 3; weight?: number; dash?: number; size?: number; hidden?: boolean }
export interface TextNote { id: string; text: string }
/** A saved composition: what is on, where it was put, how it looks. Positions are keyed by piece. */
/** Guides drawn in the scene itself: the grid volume's bounding box and the print grid on its floor
 *  (`div` cells a side). */
export interface Guides { box: boolean; floor: boolean; div: number }
export type PanelTab = 'view' | 'layers' | 'library' | 'notes' | 'motion' | 'output'
/** The look cycling on its own: shading modes, lights, backdrops, `sec` seconds each. */
export interface Cycles { shading: boolean; light: boolean; backdrop: boolean; sec: number }
/** Where the cutting plane runs on the clock: not at all, through the whole loop, or during the mesh. */
export type PlaneRun = 'off' | 'loop' | 'mesh'
/** How one step gives way to the next: a cut, a fade, or a wipe (the next grows up through the plane). */
export type Blend = 'off' | 'fade' | 'wipe'
/** A layer of the view, for the split: the model, the voxels, the result (quantum or Evolve), the mesh. */
export type SplitLayer = 'model' | 'voxels' | 'processed' | 'result'
/** Split view: the cutting plane divides the object, one layer under it and another over it. */
export interface Split { on: boolean; below: SplitLayer; above: SplitLayer }
/** The loop: the run told from the original geometry to the mesh, one segment per step (each can be
 *  left out). Each step holds its own `hold` seconds; Evolve plays its turns at `tps` a second, then holds
 *  `hold.quantum`. Between steps (`blend`) the view cuts, morphs (one layer dissolving into the next) or
 *  grows the next up through the plane; `morph` seconds either way, on the loop and on a click alike.
 *  The cutting plane sweeps between `from` and `to` (fractions of the grid), one pass in `planeSec`,
 *  `planeStep` layers at a time. `sec` is the hold older saves had for every step. */
export interface Reel {
  on: boolean; sec: number; tps: number; segs: { model: boolean; voxels: boolean; quantum: boolean; mesh: boolean }
  hold: { model: number; voxels: number; quantum: number; mesh: number }
  blend: Blend; morph: number
  plane: PlaneRun; planeSec: number; planeMode: 'bounce' | 'up' | 'down'; from: number; to: number; planeStep: number
}
export const REEL: Reel = {
  on: true, sec: 4, tps: 3, segs: { model: true, voxels: true, quantum: true, mesh: true },
  hold: { model: 4, voxels: 4, quantum: 4, mesh: 4 },
  blend: 'fade', morph: 0.75, plane: 'loop', planeSec: 8, planeMode: 'bounce', from: 0, to: 1, planeStep: 1,
}
/** A loop from a save of any age: missing fields from the defaults, each step's hold from the old `sec`. */
export function reelOf(r: Partial<Omit<Reel, 'blend'>> & { blend?: Blend | boolean } | undefined): Reel {
  const sec = r?.sec ?? REEL.sec
  return {
    ...REEL, ...r, segs: { ...REEL.segs, ...r?.segs }, blend: blendOf(r?.blend),
    hold: { model: sec, voxels: sec, quantum: sec, mesh: sec, ...r?.hold },
  }
}
/** Pieces that move by themselves: the selection marks and callouts pick cells on the object on their
 *  own (one every `hop` seconds) when nothing is hovered or pinned; the tracking overlay follows `boxes`
 *  cells at once, joined by lines when `links`. */
export interface Auto { targets: boolean; hop: number; boxes: number; links: boolean }
export const AUTO: Auto = { targets: true, hop: 1.6, boxes: 9, links: true }
/** How a saved composition plays: the loop, the pieces holding still, the split, the clock's speed and
 *  loop, the look of the slice. Older saves have none and keep what is set. */
export interface SavedMotion { reel: Reel; still: Record<string, true>; split: Split; speed: number; loop: boolean; slice?: { of: SliceOf; color: SliceColor }; auto?: Auto }
/** How a saved composition looks besides its pieces: the scene's shading, lighting, backdrop and
 *  entanglement shader, the view's own controls (and explanations in pieces), which layers are shown,
 *  the look cycling, the turntable and the frame. Older saves have none and keep what is set. */
export interface SavedView {
  shading: Shading; shade: StoreState['shade']; hud: Hud; notes: boolean
  layers: Partial<Record<Layer, boolean>>; cycles: Cycles
  spin: boolean; spinSpeed: number; spinDir: 1 | -1; frame: FrameId
  /** Saved since: the output's grade, the frame's padding and size, the HUD's size, the rhythm, the frame rate. */
  grade?: Grade; pad?: FramePad; outSize?: number; hudSize?: number; rhythm?: P['rhythm']; fps?: 30 | 60
}
export interface Saved { id: string; name: string; compose: Record<string, string>; pos: Record<string, Pos>; looks: Record<string, Look>; texts: TextNote[]; guides?: Guides; motion?: SavedMotion; view?: SavedView
  /** The Default only: its published revision. A browser keeping an older one takes the newer. */
  rev?: number }

interface P {
  /** Present composition: family → variant ids, comma-separated, or 'off'. Empty is clean. */
  compose: Record<string, string>
  setCompose: (c: Record<string, string>) => void
  /** Dragged positions per piece key ("family:variant", "text:<id>" or a chrome key), prefixed by mode. */
  pos: Record<string, Pos>
  setPos: (key: string, p: Pos | null) => void
  /** Lab only: drag the lab readouts around. */
  arrange: boolean
  setArrange: (v: boolean) => void
  /** Present compose mode: pieces can be dragged, selected, deleted, and components dropped in. */
  composing: boolean
  setComposing: (v: boolean) => void
  /** The selected piece (compose mode). */
  sel: string | null
  setSel: (k: string | null) => void
  /** The piece whose layer row is hovered: the others dim so you can see which is which. */
  hl: string | null
  setHl: (k: string | null) => void
  /** A component ("family:variant") shown on the view while its library tile is hovered; not part of the composition. */
  preview: string | null
  setPreview: (k: string | null) => void
  /** The compose panel's page, the library category on show, and the families opened in it. */
  tab: PanelTab
  setTab: (t: PanelTab) => void
  libCat: string
  setLibCat: (c: string) => void
  opened: string[]
  toggleOpened: (family: string) => void
  /** Pieces that found no free room on the view, even scaled down. */
  crowded: number
  setCrowded: (n: number) => void
  /** Pieces the last layout left out of this frame: no room for them at a readable size. */
  leftOut: number
  setLeftOut: (n: number) => void
  /** Bumped by a tidy: the view lays every piece out again for the frame (see hud/tidy.ts). */
  tidyKey: number
  /** Bumped when a layout was asked for (a preset, a tidy, a frame): the object is framed again in the
   *  centre of the room the pieces leave. A layout after a resize keeps the camera where it is. */
  aim: number
  tidyUp: () => void
  /** Tidy at a degree: arrange everything, drop repeats, or keep only the quantum essentials. */
  tidy: (level: TidyLevel) => void
  /** Put the default composition back, pieces where they were laid out by hand. */
  applyDefault: () => void
  /** The artboard's shape (frames.ts) and the export size picked for it (index into its sizes). */
  frame: FrameId
  setFrame: (f: FrameId) => void
  outSize: number
  setOutSize: (i: number) => void
  pad: FramePad
  setPad: (p: Partial<FramePad>) => void
  grade: Grade
  setGrade: (g: Partial<Grade>) => void
  /** The padding drawn dashed on the view (never exported). */
  padGuide: boolean
  setPadGuide: (v: boolean) => void
  /** The camera orbits round the object's own centre, and a layout frames it in the middle of the view. */
  centred: boolean
  setCentred: (v: boolean) => void
  /** Frames a second while something animates: 30 (lighter, the rate of most social video) or 60. */
  fps: 30 | 60
  setFps: (v: 30 | 60) => void
  /** Every piece on the view at this multiple of its own size, in any frame (1: as designed). */
  hudSize: number
  setHudSize: (v: number) => void
  /** Put a component on the view: at a point (centre, fractions of the view) or in its usual place. */
  place: (family: string, id: string, at?: { x: number; y: number }) => void
  /** Take a piece off the view. */
  removePiece: (key: string) => void
  /** Hide every control (H) for clean screenshots. */
  bare: boolean
  setBare: (v: boolean) => void
  shots: Shot[]
  shot: number
  /** Bumped when the user steps to a shot (not when one is saved), so only stepping flies the camera. */
  fly: number
  addShot: (s: Shot) => void
  removeShot: (i: number) => void
  setShot: (i: number) => void
  /** Turntable and shot reel motion. */
  spin: boolean
  setSpin: (v: boolean) => void
  reel: boolean
  setReel: (v: boolean) => void
  /** Seconds per shot in the reel, turntable speed (degrees per second), seconds per saved composition. */
  reelSec: number
  spinSpeed: number
  cycleSec: number
  setMotion: (p: Partial<Pick<P, 'reelSec' | 'spinSpeed' | 'cycleSec'>>) => void
  /** Rhythm: beat after beat the camera pulls back, turns `angle` degrees, comes back in and holds
   *  (one beat every `beat` seconds, out by `zoom` of its distance). Turntable and rhythm exclude each other. */
  rhythm: { on: boolean; angle: number; beat: number; zoom: number; tilt: number; roll: number; random: number; ease: 'smooth' | 'snappy' | 'float' }
  setRhythm: (r: Partial<P['rhythm']>) => void
  /** Turntable direction: 1 counter-clockwise seen from above, -1 clockwise. */
  spinDir: 1 | -1
  setSpinDir: (d: 1 | -1) => void
  /** The compose panel at the side. */
  drawer: boolean
  setDrawer: (v: boolean) => void
  /** Step through the saved compositions on their own. */
  cycle: boolean
  setCycle: (v: boolean) => void
  recording: boolean
  setRecording: (v: boolean) => void
  /** Per-piece looks, keyed like positions but without the mode. */
  looks: Record<string, Look>
  setLook: (key: string, l: Partial<Look> | null) => void
  /** Free text placed anywhere on the view. */
  texts: TextNote[]
  addText: (at?: { x: number; y: number }) => void
  setText: (id: string, text: string | null) => void
  guides: Guides
  setGuides: (g: Partial<Guides>) => void
  /** Explanations inside the pieces (captions, notes, empty-state sentences); off, the pieces show data only. */
  notes: boolean
  setNotes: (v: boolean) => void
  /** Ink of exported PNGs (see savePng). */
  pngInk: 'auto' | 'dark' | 'light'
  setPngInk: (i: 'auto' | 'dark' | 'light') => void
  /** Animation: the look cycling, the loop through the steps, and whether they are playing. */
  cycles: Cycles
  setCycles: (c: Partial<Cycles>) => void
  stageReel: Reel
  setStageReel: (r: Partial<Reel>) => void
  /** Pieces that move by themselves (auto targets, the tracking overlay). */
  auto: Auto
  setAuto: (a: Partial<Auto>) => void
  /** Video out: seconds to record (0: one pass of the animation) and the file type. */
  take: { sec: number; format: 'mp4' | 'webm' }
  setTake: (t: Partial<{ sec: number; format: 'mp4' | 'webm' }>) => void
  /** Pieces that hold still instead of moving with the clock (keyed "family:variant"). */
  still: Record<string, true>
  setStill: (k: string, still: boolean) => void
  /** The clock is moving the cutting plane right now (so the view shows it). */
  planeLive: boolean
  /** A wipe from one step to the next under way: the layers either side of the plane (animator.ts). */
  wipe: { below: SplitLayer; above: SplitLayer } | null
  split: Split
  setSplit: (s: Partial<Split>) => void
  /** The one clock all of it reads: `t0` seconds into the pass when play began (or where it is paused),
   *  `playFrom` the wall time it began (ms), at `speed`; `loop` goes round at the end. `seekKey` bumps on
   *  every seek so a paused view shows that moment. */
  playing: boolean
  playFrom: number
  t0: number
  speed: number
  loop: boolean
  seekKey: number
  setPlaying: (v: boolean) => void
  seek: (t: number) => void
  setSpeed: (v: number) => void
  setLoop: (v: boolean) => void
  /** Saved compositions, and the one on screen (null: not saved yet). */
  saved: Saved[]
  current: string | null
  save: (name?: string) => void
  saveNew: (name?: string) => void
  load: (id: string) => void
  rename: (id: string, name: string) => void
  removeSaved: (id: string) => void
  /** The Default's revision this browser last took (see hud/defaultComposition.ts). */
  defaultRev: number
  /** Write what is on screen into the repo as the Default (local service only); resolves to its rev. */
  publishDefault: () => Promise<number>
  /** A saved composition as JSON, to send or keep. */
  exportSaved: (id: string) => string
  /** Add a composition from JSON (one with the id of a saved one replaces it) and put it on screen. */
  importSaved: (json: string) => void
  /** Start clean: nothing on the view. */
  clear: () => void
  /** Start over: nothing on the view and every motion back to rest (the clock stopped at 0). */
  reset: () => void
}

const KEY = 'qs-present'
const VERSION = 2   // v2: compositions start clean and are saved by name; the old presets are gone
type Kept = Partial<P> & { v?: number; story?: Partial<Omit<Reel, 'blend'>> & { blend?: Blend | boolean } }
// the blend was a yes or no before the wipe came
function blendOf(b: Blend | boolean | undefined): Blend { return b === false ? 'off' : b === true || b == null ? 'wipe' : b }
const read = (): Kept => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} } }
const raw = read()
// a first visit opens on the default composition (Lab's layout as laid out by hand)
const fresh = !Object.keys(raw).length
/** The Default in the code is newer than the one this browser last put on screen. */
const newDefault = (DEFAULT_COMPOSITION.rev ?? 0) > (raw.defaultRev ?? 0)
const firstPos = Object.fromEntries(Object.entries(DEFAULT_COMPOSITION.pos).map(([k, v]) => [`present|${k}`, v]))
const saved: Kept = raw.v === VERSION ? raw : {
  shots: raw.shots, spin: raw.spin, reelSec: raw.reelSec, spinSpeed: raw.spinSpeed,
  cycleSec: raw.cycleSec, drawer: raw.drawer, pngInk: raw.pngInk, spinDir: raw.spinDir,
}
const keep = (s: P) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      v: VERSION, compose: s.compose, pos: s.pos, shots: s.shots, spin: s.spin, rhythm: s.rhythm, reelSec: s.reelSec, spinSpeed: s.spinSpeed,
      cycleSec: s.cycleSec, drawer: s.drawer, looks: s.looks, cycles: s.cycles, story: s.stageReel, still: s.still, auto: s.auto, take: s.take, split: s.split, speed: s.speed, loop: s.loop, notes: s.notes, frame: s.frame, outSize: s.outSize, pad: s.pad, padGuide: s.padGuide, grade: s.grade, hudSize: s.hudSize, centred: s.centred, fps: s.fps, spinDir: s.spinDir, texts: s.texts, pngInk: s.pngInk, saved: s.saved, current: s.current, defaultRev: s.defaultRev, guides: s.guides, tab: s.tab, libCat: s.libCat, opened: s.opened,
    }))
  } catch { /* per-viewer only */ }
}

const PRE = 'present|'
const variants = (v: string | undefined) => (v ?? 'off').split(',').filter((x) => x && x !== 'off')
const uid = () => Math.random().toString(36).slice(2, 8)
/** Present positions without the mode prefix, and back. */
const strip = (pos: Record<string, Pos>) => Object.fromEntries(Object.entries(pos).filter(([k]) => k.startsWith(PRE)).map(([k, v]) => [k.slice(PRE.length), v]))
const withOthers = (pos: Record<string, Pos>, mine: Record<string, Pos>) => ({
  ...Object.fromEntries(Object.entries(pos).filter(([k]) => !k.startsWith(PRE))),
  ...Object.fromEntries(Object.entries(mine).map(([k, v]) => [PRE + k, v])),
})

export const usePresent = create<P>()((set, get) => {
  const up = (p: Partial<P>) => { set(p); keep(get()) }
  const snap = (): Omit<Saved, 'id' | 'name'> => {
    const s = get()
    const st = useStore.getState()
    // the whole compose: the pieces and how it plays
    const motion: SavedMotion = { reel: { ...s.stageReel, segs: { ...s.stageReel.segs }, hold: { ...s.stageReel.hold } }, still: { ...s.still }, split: { ...s.split }, speed: s.speed, loop: s.loop, slice: { of: st.sliceOf, color: st.sliceColor }, auto: { ...s.auto } }
    // and everything else that decides what is on screen
    const view: SavedView = {
      shading: st.shading, shade: { ...st.shade }, hud: { ...st.hud }, notes: s.notes,
      layers: Object.fromEntries(Object.entries(st.layers).map(([k, v]) => [k, v.visible])), cycles: { ...s.cycles },
      spin: s.spin, spinSpeed: s.spinSpeed, spinDir: s.spinDir, frame: s.frame,
      grade: { ...s.grade }, pad: { ...s.pad }, outSize: s.outSize, hudSize: s.hudSize, rhythm: { ...s.rhythm }, fps: s.fps,
    }
    return { compose: { ...s.compose }, pos: strip(s.pos), looks: { ...s.looks }, texts: [...s.texts], guides: { ...s.guides }, motion, view }
  }
  /** Put a saved composition on screen, all of it: pieces, motion and view. */
  const apply = (c: Saved, current: string | null) => {
    const s = get(), st = useStore.getState()
    up({ compose: { ...c.compose }, pos: withOthers(s.pos, c.pos), looks: { ...c.looks }, texts: [...c.texts], guides: c.guides ?? s.guides, current, sel: null })
    const m = c.motion
    if (m) {
      up({ stageReel: reelOf(m.reel), still: { ...m.still }, split: { ...m.split }, speed: m.speed, loop: m.loop, auto: { ...AUTO, ...m.auto } })
      if (m.slice) { st.setSliceOf(m.slice.of); st.setSliceColor(m.slice.color) }
    }
    const v = c.view
    if (v) {
      st.setShading(v.shading, v.shade)
      st.setHud(v.hud)
      for (const [l, on] of Object.entries(v.layers) as [Layer, boolean][]) st.setLayer(l, { visible: on })
      up({ notes: v.notes, cycles: { ...v.cycles }, spin: v.spin, spinSpeed: v.spinSpeed, spinDir: v.spinDir })
      // the frame as it was saved, with the pieces where they were saved (no fresh layout)
      if (v.frame !== get().frame) up({ frame: v.frame, outSize: 0 })
      if (v.grade) up({ grade: { ...GRADE, ...v.grade } })
      if (v.pad) up({ pad: { ...FRAME_PAD, ...v.pad } })
      if (v.outSize != null) up({ outSize: v.outSize })
      if (v.hudSize != null) up({ hudSize: v.hudSize })
      if (v.rhythm) up({ rhythm: { ...get().rhythm, ...v.rhythm } })
      if (v.fps) up({ fps: v.fps })
    }
    set({ aim: get().aim + 1 })
  }
  return {
      compose: saved.compose ?? (fresh ? { ...DEFAULT_COMPOSITION.compose } : {}),
    setCompose: (c) => up({ compose: { ...get().compose, ...c } }),
    pos: saved.pos ?? (fresh ? firstPos : {}),
    setPos: (key, p) => {
      const pos = { ...get().pos }
      if (p) pos[key] = p
      else delete pos[key]
      up({ pos })
    },
    arrange: false,
    setArrange: (v) => set({ arrange: v }),
    tab: (saved.tab as string) === 'capture' ? 'output' : saved.tab ?? 'view',
    setTab: (t) => up({ tab: t }),
    libCat: saved.libCat ?? 'marks',
    setLibCat: (c) => up({ libCat: c }),
    opened: saved.opened ?? [],
    toggleOpened: (f) => up({ opened: get().opened.includes(f) ? get().opened.filter((x) => x !== f) : [...get().opened, f] }),
    crowded: 0,
    setCrowded: (n) => { if (n !== get().crowded) set({ crowded: n }) },
    leftOut: 0,
    setLeftOut: (n) => { if (n !== get().leftOut) set({ leftOut: n }) },
    tidyKey: 0,
    aim: 0,
    tidyUp: () => set({ tidyKey: get().tidyKey + 1 }),
    tidy: (level) => {
      const s = get()
      const keys = Object.entries(s.compose).flatMap(([f, v]) => variants(v).map((id) => `${f}:${id}`))
      const gone = toRemove(keys, level, useStore.getState().q.mode)
      const compose = { ...s.compose }
      for (const k of gone) {
        const [f, id] = k.split(':')
        const left = variants(compose[f]).filter((v) => v !== id)
        compose[f] = left.length ? left.join(',') : 'off'
      }
      // every piece is laid out afresh: forget where they were put
      up({ compose, pos: withOthers(s.pos, Object.fromEntries(Object.entries(strip(s.pos)).filter(([k]) => k.startsWith('text:')))), sel: null })
      set({ tidyKey: get().tidyKey + 1, aim: get().aim + 1 })
    },
    applyDefault: () => {
      // the Default in the saved list when there is one (it may have been saved over), else the built-in
      const mine = get().saved.find((x) => x.id === DEFAULT_ID)
      const d = mine ?? DEFAULT_COMPOSITION
      apply(d, mine ? DEFAULT_ID : null)
      if (!d.view) useStore.getState().setHud(DEFAULT_HUD)
    },
    frame: saved.frame ?? 'window',
    setFrame: (f) => { up({ frame: f, outSize: 0 }); setTimeout(() => set({ tidyKey: get().tidyKey + 1, aim: get().aim + 1 }), 80) },
    outSize: saved.outSize ?? 0,
    setOutSize: (i) => up({ outSize: i }),
    centred: saved.centred ?? true,
    setCentred: (v) => { up({ centred: v }); set({ aim: get().aim + 1 }) },
    fps: saved.fps ?? 30,
    setFps: (v) => up({ fps: v }),
    hudSize: saved.hudSize ?? 1,
    setHudSize: (v) => up({ hudSize: v }),
    pad: { ...FRAME_PAD, ...saved.pad },
    padGuide: saved.padGuide ?? true,
    grade: { ...GRADE, ...saved.grade },
    setGrade: (g) => up({ grade: { ...get().grade, ...g } }),
    setPadGuide: (v) => up({ padGuide: v }),
    setPad: (x) => {
      const cur = get().pad
      // linked: whichever side moved, all four follow
      const v = ['t', 'r', 'b', 'l'].map((k) => x[k as 't']).find((n) => n != null)
      const next = { ...cur, ...x }
      up({ pad: next.linked && v != null ? { ...next, t: v, r: v, b: v, l: v } : next })
    },
    composing: false,
    setComposing: (v) => set({ composing: v, sel: v ? get().sel : null }),
    sel: null,
    setSel: (k) => set({ sel: k }),
    hl: null,
    setHl: (k) => set({ hl: k }),
    preview: null,
    setPreview: (k) => set({ preview: k }),
    place: (family, id, at) => {
      const s = get()
      const cur = variants(s.compose[family])
      const compose = cur.includes(id) ? s.compose : { ...s.compose, [family]: [...cur, id].join(',') }
      const pos = { ...s.pos }
      if (at) pos[`${PRE}${family}:${id}`] = { x: at.x, y: at.y, c: true }
      // a drop selects what was dropped and stays where it fell; a click puts it in its usual place (the view
      // moves it to a free spot if that is taken)
      up({ compose, pos, sel: at ? `${family}:${id}` : s.sel })
      // a piece that works with the cutting plane sets it sweeping up and down (the clock starts)
      // a slicer turned on alone becomes the main plane (the Slice panel, the layer stack read its axis)
      if (family === 'plane' && !cur.length) {
        const ax = ({ v1: 'z', v2: 'x', v3: 'y' } as const)[id as 'v1']
        if (ax) useStore.getState().setSlice({ axis: ax })
      }
      if (['plane', 'slicecard', 'scan'].includes(family)) {
        if (get().stageReel.plane === 'off') up({ stageReel: { ...get().stageReel, plane: 'loop' } })
        if (!get().playing) get().setPlaying(true)
      }
    },
    removePiece: (key) => {
      const s = get()
      if (key.startsWith('text:')) { s.setText(key.slice(5), null); set({ sel: null }); return }
      const [family, id] = key.split(':')
      const left = variants(s.compose[family]).filter((v) => v !== id)
      const pos = { ...s.pos }
      delete pos[PRE + key]
      const looks = { ...s.looks }
      delete looks[key]
      up({ compose: { ...s.compose, [family]: left.length ? left.join(',') : 'off' }, pos, looks, sel: s.sel === key ? null : s.sel })
    },
    bare: false,
    setBare: (v) => set({ bare: v }),
    shots: saved.shots ?? [],
    shot: 0,
    fly: 0,
    addShot: (s) => up({ shots: [...get().shots, s].slice(-10), shot: Math.min(9, get().shots.length) }),
    removeShot: (i) => up({ shots: get().shots.filter((_, j) => j !== i), shot: 0 }),
    setShot: (i) => set({ shot: i, fly: get().fly + 1 }),
    spin: saved.spin ?? false,
    setSpin: (v) => up(v ? { spin: true, rhythm: { ...get().rhythm, on: false } } : { spin: false }),
    rhythm: { on: false, angle: 45, beat: 3, zoom: 0.2, tilt: 12, roll: 4, random: 0.6, ease: 'smooth', ...saved.rhythm },
    setRhythm: (r) => { const next = { ...get().rhythm, ...r }; up(next.on ? { rhythm: next, spin: false } : { rhythm: next }) },
    reel: false,
    setReel: (v) => set({ reel: v }),
    reelSec: saved.reelSec ?? 5,
    spinSpeed: saved.spinSpeed ?? 8,
    cycleSec: saved.cycleSec ?? 6,
    setMotion: (p) => up(p),
    spinDir: saved.spinDir ?? 1,
    setSpinDir: (d) => up({ spinDir: d }),
    drawer: saved.drawer ?? true,
    setDrawer: (v) => up(v ? { drawer: v } : { drawer: v, preview: null, hl: null }),
    cycle: false,
    setCycle: (v) => set({ cycle: v }),
    recording: false,
    setRecording: (v) => set({ recording: v }),
    looks: saved.looks ?? {},
    setLook: (key, l) => {
      const looks = { ...get().looks }
      if (l) looks[key] = { ...looks[key], ...l }
      else delete looks[key]
      up({ looks })
    },
    texts: saved.texts ?? [],
    addText: (at) => {
      const id = uid()
      const n = get().texts.length
      up({
        texts: [...get().texts, { id, text: 'Note' }],
        pos: { ...get().pos, [`${PRE}text:${id}`]: at ? { ...at, c: true } : { x: 0.42, y: 0.12 + 0.06 * (n % 8) } },
        sel: `text:${id}`,
      })
    },
    setText: (id, text) => {
      if (text === null) {
        const pos = { ...get().pos }
        delete pos[`${PRE}text:${id}`]
        up({ texts: get().texts.filter((t) => t.id !== id), pos })
      } else up({ texts: get().texts.map((t) => (t.id === id ? { ...t, text } : t)) })
    },
    guides: { box: true, floor: true, div: 4, ...(fresh ? DEFAULT_COMPOSITION.guides : null), ...saved.guides },
    setGuides: (g) => up({ guides: { ...get().guides, ...g } }),
    notes: saved.notes ?? false,
    setNotes: (v) => up({ notes: v }),
    pngInk: saved.pngInk ?? 'auto',
    setPngInk: (i) => up({ pngInk: i }),
    cycles: { shading: false, light: false, backdrop: false, sec: 3, ...saved.cycles },
    setCycles: (c) => up({ cycles: { ...get().cycles, ...c } }),
    // the loop is kept under `story` (the older stage reel, off by default, is left behind)
    stageReel: reelOf(saved.story),
    setStageReel: (r) => up({ stageReel: { ...get().stageReel, ...r } }),
    still: saved.still ?? {},
    auto: { ...AUTO, ...saved.auto },
    setAuto: (a) => up({ auto: { ...get().auto, ...a } }),
    take: { sec: 10, format: 'mp4', ...saved.take },
    setTake: (t) => up({ take: { ...get().take, ...t } }),
    planeLive: false,
    wipe: null,
    split: { on: false, below: 'voxels', above: 'processed', ...saved.split },
    setSplit: (x) => up({ split: { ...get().split, ...x } }),
    setStill: (k, v) => { const still = { ...get().still }; if (v) still[k] = true; else delete still[k]; up({ still }) },
    playing: false,
    playFrom: 0,
    t0: 0,
    speed: saved.speed ?? 1,
    loop: saved.loop ?? true,
    seekKey: 0,
    setPlaying: (v) => {
      const s = get()
      if (v === s.playing) return
      set(v ? { playing: true, playFrom: Date.now() } : { playing: false, t0: clockOf(s, Date.now()) })
    },
    seek: (t) => set({ t0: Math.max(0, t), playFrom: Date.now(), seekKey: get().seekKey + 1 }),
    setSpeed: (v) => { const s = get(); up({ speed: v, t0: clockOf(s, Date.now()) }); set({ playFrom: Date.now() }) },
    setLoop: (v) => up({ loop: v }),
    saved: (() => {
      const list = saved.saved ?? []
      // a newer published Default replaces the one this browser kept (or joins the list)
      if (!newDefault) return list
      return list.some((x) => x.id === DEFAULT_ID) ? list.map((x) => (x.id === DEFAULT_ID ? DEFAULT_COMPOSITION : x)) : [DEFAULT_COMPOSITION, ...list]
    })(),
    defaultRev: saved.defaultRev ?? 0,
    publishDefault: async () => {
      const c: Saved = { ...snap(), id: DEFAULT_ID, name: 'Default' }
      const { rev } = await api.publishDefault(c)
      const s = get(), next = { ...c, rev }
      up({ saved: s.saved.some((x) => x.id === DEFAULT_ID) ? s.saved.map((x) => (x.id === DEFAULT_ID ? next : x)) : [next, ...s.saved], current: DEFAULT_ID, defaultRev: rev })
      return rev
    },
    current: saved.current ?? (fresh ? DEFAULT_ID : null),
    save: (name) => {
      const s = get()
      const cur = s.saved.find((x) => x.id === s.current)
      if (!cur) return s.saveNew(name)
      up({ saved: s.saved.map((x) => (x.id === cur.id ? { ...x, ...snap(), name: name ?? x.name } : x)) })
    },
    saveNew: (name) => {
      const s = get()
      const id = uid()
      up({ saved: [...s.saved, { id, name: name?.trim() || `Composition ${s.saved.length + 1}`, ...snap() }], current: id })
    },
    load: (id) => {
      const c = get().saved.find((x) => x.id === id)
      if (c) apply(c, id)
    },
    exportSaved: (id) => {
      const c = get().saved.find((x) => x.id === id)
      return c ? JSON.stringify(c, null, 2) : ''
    },
    importSaved: (json) => {
      const c = JSON.parse(json) as Saved
      if (!c || typeof c !== 'object' || !c.compose || !c.pos) throw new Error('Not a composition')
      const s = get()
      // a composition with the id of one already here replaces it (the Default, sent back); else it is added
      const id = c.id && s.saved.some((x) => x.id === c.id) ? c.id : uid()
      const next: Saved = { ...c, id, name: c.name || 'Imported', texts: c.texts ?? [], looks: c.looks ?? {} }
      up({ saved: s.saved.some((x) => x.id === id) ? s.saved.map((x) => (x.id === id ? next : x)) : [...s.saved, next] })
      apply(next, id)
    },
    rename: (id, name) => up({ saved: get().saved.map((x) => (x.id === id ? { ...x, name } : x)) }),
    removeSaved: (id) => up({ saved: get().saved.filter((x) => x.id !== id), current: get().current === id ? null : get().current }),
    clear: () => up({ compose: {}, pos: withOthers(get().pos, {}), looks: {}, texts: [], guides: { ...get().guides, box: false, floor: false }, current: null, sel: null }),
    reset: () => {
      get().clear()
      up({ still: {}, spin: false, rhythm: { ...get().rhythm, on: false }, reel: false, cycle: false, cycles: { shading: false, light: false, backdrop: false, sec: 3 }, stageReel: { ...REEL, on: false, plane: 'off' }, split: { ...get().split, on: false }, speed: 1, loop: true, auto: { ...AUTO } })
      set({ playing: false, t0: 0, playFrom: Date.now(), seekKey: get().seekKey + 1 })
    },
  }
})

/** Whether what is on the view differs from the saved composition it came from (or anything is on, if none). */
export function isDirty(s: Pick<P, 'saved' | 'current' | 'compose' | 'pos' | 'looks' | 'texts' | 'guides'>): boolean {
  const cur = s.saved.find((x) => x.id === s.current)
  if (!cur) return Object.values(s.compose).some((v) => variants(v).length > 0) || s.texts.length > 0 || s.guides.box || s.guides.floor
  const norm = (o: object) => JSON.stringify(o, (_, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== 'off').sort()) : v))
  return norm({ compose: s.compose, pos: strip(s.pos), looks: s.looks, texts: s.texts, guides: s.guides }) !== norm({ compose: cur.compose, pos: cur.pos, looks: cur.looks, texts: cur.texts, guides: cur.guides ?? s.guides })
}

/** Seconds into the pass on the composition's clock (not wrapped: the animator loops or stops it). */
export const clockOf = (p: Pick<P, 'playing' | 'playFrom' | 't0' | 'speed'>, now: number) =>
  p.playing ? p.t0 + ((now - p.playFrom) / 1000) * p.speed : p.t0

// a newer Default, pulled with the code, goes on screen as the browser opens: everyone sees the latest
// design without exporting anything (their own saved compositions stay)
if (newDefault) {
  setTimeout(() => {
    usePresent.getState().applyDefault()
    usePresent.setState({ defaultRev: DEFAULT_COMPOSITION.rev ?? 0 })
    keep(usePresent.getState())
  }, 0)
}
