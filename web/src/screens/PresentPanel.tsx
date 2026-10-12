// Lab · Properties · Compose and Animate & output: the HUD composed over the view, and everything that
// moves and leaves the app. Compose: one Clear, what the view's own controls show, the component
// library by category, annotations and saved compositions. Animate & output, top to bottom: the frame
// and its size, the clock, what moves (only what is on the view), recording a take, stills and 3D.
import { useEffect, useState, type ReactNode } from 'react'
import { useStore, type Shading } from '../store'
import { SLICE_COLORS, SLICE_OF, type SliceColor, type SliceOf } from '../qs/sectionColor'
import { BACKDROPS, LIGHTS, SHADINGS } from './look'
import { FINISHES, finishOf, setFinish, type Finish } from './finish'
import { clockOf, gradeFilter, isDirty, usePresent } from '../present'
import { CATEGORIES } from '../hud/registry'
import { countOn, savePng, variantsOf } from '../hud/compose'
import { Icon, IconButton } from '../qs/Icon'
import { Panel, Button, Buttons, Checkbox, Note } from '../ui/Panel'
import { Slider } from '../qs/Slider'
import { useLive } from '../live'
import { encodable, exportFrame, exportGlb, mimeOf, recordTake, renderStill, screenshot, stopTake } from './capture'
import { FRAMES, MULTS, frameOf, sizeOf, type FrameId } from '../frames'
import { FloorSize, LayerList, MarkLibrary } from './MarkLibrary'
import { passLength, storySegments } from './animator'
import { useNow } from '../useNow'

/** The library's categories as tabs: the scene (registration and brackets) first, then the Quicksilver sheets. */
// built on first use: the registry imports Properties' cards, which import this file
// Controls (dials, number controls, the view camera as an object) stays in the registry but off the library
const cats = () => CATEGORIES.filter((c) => c.id !== 'controls').map((c) => ({ id: c.id, short: c.id === 'glyphs' ? 'Glyphs' : c.id === 'data' ? 'Data' : c.id === 'charts' ? 'Charts' : c.title }))

/** A group within a page: a small heading and its controls. */
function Group({ label, children }: { label?: string; children: ReactNode }) {
  if (label) return <Panel id={`cmp-${label.toLowerCase().replace(/\W+/g, '-')}`} title={label} sub>{children}</Panel>
  return <section className="pd-sec">{children}</section>
}

/** A section (level 2) or, with `sub`, a section within one (level 3): a header that folds its body,
 *  remembered per id, as the panels on the left do. */
function Section({ title, id, aside, sub, defaultOpen = true, children }: { title: string; id?: string; aside?: ReactNode; sub?: boolean; defaultOpen?: boolean; children: ReactNode }) {
  return <Panel id={`cmp-${id ?? title.toLowerCase().replace(/\W+/g, '-')}`} title={title} aside={aside} sub={sub} defaultOpen={defaultOpen}>{children}</Panel>
}

/** A labelled group of pills, one of which is on. */
function Pills<T extends string>({ label, value, options, onChange }: { label?: string; value: T; options: { id: T; t: string; off?: boolean }[]; onChange: (v: T) => void }) {
  return (
    <div className="pd-field">
      {label && <span className="pd-k">{label}</span>}
      <div className="pd-chips" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o.id} role="radio" aria-checked={value === o.id} disabled={o.off} className={'pd-chip pd-chip--s' + (value === o.id ? ' pd-chip--on' : '')} onClick={() => onChange(o.id)}>{o.t}</button>
        ))}
      </div>
    </div>
  )
}

/** Tabs within a page, with a count each. */
function SubTabs<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; t: string; n?: number }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="pd-subtabs" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id} className={'pd-subtab' + (value === o.id ? ' pd-subtab--on' : '')} onClick={() => onChange(o.id)}>
          {o.t}{o.n ? <span className={'mk-count' + (o.n > 1 ? ' mk-count--many' : '')}>{o.n}</span> : null}
        </button>
      ))}
    </div>
  )
}

/** The composition on the view (name, save, start clean) and the saved ones, one row each. */
function Compositions() {
  const p = usePresent()
  const cur = p.saved.find((x) => x.id === p.current)
  const dirty = isDirty(p)
  const [name, setName] = useState<string | null>(null)
  const [ask, setAsk] = useState(false)
  const startClean = () => { if (dirty && !ask) { setAsk(true); return } setAsk(false); p.clear() }
  const [paste, setPaste] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const copy = async (id: string) => {
    const json = p.exportSaved(id)
    try { await navigator.clipboard.writeText(json); setMsg('Copied as JSON.') }
    catch {
      // no clipboard (an insecure origin): hand it over as a file instead
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
      a.download = `${p.saved.find((x) => x.id === id)?.name ?? 'composition'}.json`
      a.click()
      setMsg('Saved as a JSON file.')
    }
  }
  const publish = async () => {
    try { const rev = await p.publishDefault(); setMsg(`Published as Default (rev ${rev}) to web/src/hud/defaultComposition.json. Commit and push it to main so everyone gets it.`) }
    catch (e) { setMsg(`Not published: ${e instanceof Error ? e.message : 'the local service is not running'}. Publishing needs the app running on this computer.`) }
  }
  const bring = () => {
    try { p.importSaved(paste ?? ''); setPaste(null); setMsg('Composition added.') }
    catch { setMsg('That is not a composition.') }
  }
  return (
    <Group>
      <div className="pd-now">
        <input className="pd-in" value={name ?? cur?.name ?? ''} placeholder="Untitled composition" aria-label="Composition name"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { if (name != null && cur && name.trim()) p.rename(cur.id, name.trim()); if (cur || !name?.trim()) setName(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur() }} />
        <button className="pd-chip pd-chip--ink" disabled={!dirty} onClick={() => { p.save(name ?? undefined); setName(null) }}>Save</button>
      </div>
      {p.saved.length > 0 && (
        <div className="pd-list">
          {p.saved.map((c, i) => (
            <div key={c.id} role="button" tabIndex={0} className={'pd-save' + (c.id === p.current ? ' pd-save--on' : '')}
              onClick={() => p.load(c.id)} onKeyDown={(e) => { if (e.key === 'Enter') p.load(c.id) }}>
              <span className="pd-save__n">{i + 1}</span>
              <span className="pd-save__t">{c.name}{c.id === p.current && dirty ? ' · changed' : ''}</span>
              <span onClick={(e) => e.stopPropagation()}>
                <button className="pd-chip pd-chip--s" onClick={() => copy(c.id)} data-tip="Copy" data-tip-desc="The whole composition as JSON: pieces, animation, shading, lighting and what the view shows.">Copy</button>
                <IconButton name="clear" size={22} title="Delete" onClick={() => p.removeSaved(c.id)} />
              </span>
            </div>
          ))}
        </div>
      )}
      {paste != null && (
        <div className="pd-row">
          <textarea className="pd-in pd-paste" value={paste} placeholder="Paste a composition (JSON)" aria-label="Composition JSON" onChange={(e) => setPaste(e.target.value)} />
        </div>
      )}
      {msg && <Note>{msg}</Note>}
      <div className="pd-row">
        {cur && <button className="pd-chip pd-chip--s" onClick={() => { p.saveNew(`${cur.name} copy`); setName(null) }}>Save as new</button>}
        <button className="pd-chip pd-chip--s" onClick={publish} data-tip="Publish as Default"
          data-tip-desc="Writes what is on screen into the code as everyone's Default (web/src/hud/defaultComposition.json). Commit and push it to main; whoever pulls gets it on screen when they open the app.">Publish as Default</button>
        {paste == null
          ? <button className="pd-chip pd-chip--s" onClick={() => { setPaste(''); setMsg(null) }}>Import</button>
          : <><button className="pd-chip pd-chip--s" disabled={!paste.trim()} onClick={bring}>Add</button><button className="pd-chip pd-chip--s" onClick={() => setPaste(null)}>Cancel</button></>}
        <span className="pd-grow" />
        {ask
          ? <><button className="pd-chip pd-chip--s" onClick={startClean}>Discard changes</button><button className="pd-chip pd-chip--s" onClick={() => setAsk(false)}>Keep</button></>
          : <button className="pd-chip pd-chip--s" onClick={startClean}>Start clean</button>}
      </div>
    </Group>
  )
}

/** Compose's head, over the tabs: one action, start over. A second click confirms it. */
function ComposeHead() {
  const p = usePresent()
  const [ask, setAsk] = useState(false)
  const on = countOn(p.compose, CATEGORIES.flatMap((c) => c.fams)) + p.texts.length
  return (
    <div className="cmp-head">
      <div className="cmp-head__acts">
        {ask
          ? <><Button kind="primary" onClick={() => { p.reset(); setAsk(false) }} tip="Clear everything">Clear everything</Button><Button onClick={() => setAsk(false)}>Keep</Button></>
          : <Button onClick={() => setAsk(true)} disabled={!on && !p.spin && !p.stageReel.on && !p.playing} tip="Clear"
              desc="Start over: every piece off the view and every motion back to rest. Saved compositions stay.">Clear</Button>}
      </div>
      {p.crowded > 0 && <Note warn>{p.crowded === 1 ? 'One piece overlaps others.' : `${p.crowded} pieces overlap others.`}</Note>}
      {p.leftOut > 0 && <Note warn>{p.leftOut === 1 ? 'One piece does not fit this frame.' : `${p.leftOut} pieces do not fit this frame.`}</Note>}
    </div>
  )
}

/** The view's own controls and the scene guides: what is drawn besides the composed pieces. */
function OnTheView() {
  const hud = useStore((s) => s.hud)
  const setHud = useStore((s) => s.setHud)
  const p = usePresent()
  const st = useStore()
  const lv = useLive()
  return (
    <>
      <Section title="Look">
        <Pills<Shading> label="Shading" value={st.shading} onChange={(v) => st.setShading(v)} options={SHADINGS.map((x) => ({ id: x.id, t: x.t }))} />
        <Pills<Finish> label="Surface" value={finishOf(st)} onChange={setFinish} options={FINISHES.map((x) => ({ id: x.value, t: x.label }))} />
        <Pills<typeof st.shade.light> label="Light" value={st.shade.light} onChange={(v) => st.setShading(st.shading, { light: v })} options={LIGHTS.map((x) => ({ id: x.id, t: x.t }))} />
        <div className="pd-field">
          <span className="pd-k">Backdrop</span>
          <div className="swatches" role="radiogroup" aria-label="Backdrop">
            {BACKDROPS.map((b) => (
              <button key={b.id} role="radio" aria-checked={st.shade.backdrop === b.id} className={'swatch' + (st.shade.backdrop === b.id ? ' swatch--on' : '')}
                onClick={() => st.setShading(st.shading, { backdrop: b.id })} data-tip={b.t} data-tip-desc={b.d}>
                <span className={'swatch__bd backdrop--' + b.id} />
                <span className="swatch__t">{b.t}</span>
              </button>
            ))}
          </div>
        </div>
      </Section>
      <Section title="Camera">
        <div className="pd-checks">
          <Checkbox label="Keep the object centred" tip="The camera turns round the object's own middle, so it stays on the centre mark; layouts only set the distance." checked={p.centred} onChange={p.setCentred} />
        </div>
        <Buttons><Button onClick={() => lv.engine?.homeCentred()} tip="Centre and reset the view" desc="Back to the starting angle, the object in the middle.">Centre and reset view</Button></Buttons>
      </Section>
      <Section title="Controls">
        <div className="pd-checks">
          <Checkbox label="Tool shelf" tip="Navigate, probe, annotate, measure and slice, on the left of the view." checked={hud.tools} onChange={(v) => setHud({ tools: v })} />
          <Checkbox label="Navigation" tip="Zoom, pan, orbit and reset, on the right of the view." checked={hud.nav} onChange={(v) => setHud({ nav: v })} />
          <Checkbox label="Axis gizmo" tip="Click an axis to look along it." checked={hud.axes} onChange={(v) => setHud({ axes: v })} />
          <Checkbox label="Camera" tip="Azimuth and elevation under the gizmo." checked={hud.camera} onChange={(v) => setHud({ camera: v })} />
          <Checkbox label="Readout on hover" tip="The cell under the pointer: its address and value, beside it." checked={hud.probe} onChange={(v) => setHud({ probe: v })} />
          <Checkbox label="Info" tip="What the view shows, top left." checked={hud.caption} onChange={(v) => setHud({ caption: v })} />
          <Checkbox label="Value scale" tip="In the shaded views, bottom right." checked={hud.legend} onChange={(v) => setHud({ legend: v })} />
          <Checkbox label="Corners" tip="The view's corner marks, when no frame piece is on." checked={hud.frame} onChange={(v) => setHud({ frame: v })} />
          <Checkbox label="Explanations in pieces" tip="Captions and notes inside the pieces. Off, they show data only." checked={p.notes} onChange={p.setNotes} />
        </div>
      </Section>
      <Section title="Guides">
        <div className="pd-checks">
          <Checkbox label="Grid box" tip="The dashed n³ outline of the grid." checked={p.guides.box} onChange={(v) => p.setGuides({ box: v })} />
          <Checkbox label="Print grid" tip="Lines on the floor under the model." checked={p.guides.floor} onChange={(v) => p.setGuides({ floor: v })} />
        </div>
        {p.guides.floor && <FloorSize />}
      </Section>
    </>
  )
}

function LibraryPage({ hover }: { hover: (k: string | null, on: boolean) => void }) {
  const p = usePresent()
  const counts: Record<string, number> = {}
  for (const c of CATEGORIES) counts[c.id] = countOn(p.compose, c.fams)
  const CATS = cats()
  const cat = CATS.some((c) => c.id === p.libCat) ? p.libCat : 'marks'
  return (
    <>
      <Section title="Category"><SubTabs label="Library categories" value={cat} onChange={p.setLibCat} options={CATS.map((c) => ({ id: c.id, t: c.short, n: counts[c.id] }))} /></Section>
      <Group>
        <MarkLibrary compose={p.compose} cats={[cat]} drag opened={cat === 'scene' ? ['frame'] : p.opened} onOpen={p.toggleOpened}
          onToggle={(f, id, now) => (now ? p.place(f, id) : p.removePiece(`${f}:${id}`))}
          onPreview={hover}
          onDragStart={() => { p.setPreview(null); p.setHl(null); p.setComposing(true) }} />
      </Group>
    </>
  )
}

/** The pass on one line: the story's segments to scale, the playhead; drag anywhere on it to scrub. */
function Timeline({ len }: { len: number }) {
  const p = usePresent()
  const now = useNow(p.playing, 50)
  const raw = clockOf(p, now)
  const t = len ? (p.loop ? raw % len : Math.min(raw, len)) : 0
  const segs = storySegments(p.stageReel)
  const seg = segs.find((x) => t >= x.start && t < x.start + x.dur) ?? (t >= len && segs.length ? segs[segs.length - 1] : null)
  const turn = useStore((s) => s.evolve.turn)
  const seekAt = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    p.seek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * len)
  }
  return (
    <div className="anim-time">
      <div className="anim-time__bar" role="slider" aria-label="Time" aria-valuemin={0} aria-valuemax={len} aria-valuenow={+t.toFixed(1)} tabIndex={0}
        onPointerDown={(e) => { if (!len) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); seekAt(e) }}
        onPointerMove={(e) => { if (e.buttons & 1 && len) seekAt(e) }}
        onKeyDown={(e) => { if (e.key === 'ArrowRight') p.seek(Math.min(len, t + 1)); if (e.key === 'ArrowLeft') p.seek(Math.max(0, t - 1)) }}>
        {segs.map((x) => (
          <span key={x.stage} className={'anim-time__seg' + (t >= x.start && t < x.start + x.dur ? ' anim-time__seg--on' : '')} style={{ left: `${(x.start / (len || 1)) * 100}%`, width: `${(x.dur / (len || 1)) * 100}%` }}
            data-tip={`${x.t} · ${x.dur.toFixed(1)} s`}>{x.t}</span>
        ))}
        {!segs.length && <span className="anim-time__empty">{len ? 'values and look' : 'nothing to play'}</span>}
        <span className="anim-time__head" style={{ left: `${len ? (t / len) * 100 : 0}%` }} />
      </div>
      <div className="anim-time__read"><span>{t.toFixed(1)} s</span><span className="anim-time__now">{seg ? seg.t : ''}{seg?.turns != null ? ` · T ${turn}` : ''}</span><span>{len.toFixed(1)} s</span></div>
    </div>
  )
}


/** Play, at the top of Animate and output: start and stop everything that moves, from the start or
 *  on, round again or once, at a global speed. */
function PlayBar() {
  const p = usePresent()
  const len = passLength(p.stageReel, p.cycles)
  return (
    <div className="play-bar">
      <div className="anim-transport">
        <Button kind="primary" active={p.playing} onClick={() => p.setPlaying(!p.playing)} tip={p.playing ? 'Pause' : 'Play'} desc="Everything switched on under Animate moves. Key: P">{p.playing ? 'Pause' : 'Play'}</Button>
        <Button onClick={() => p.seek(0)} tip="Back to the start">Start</Button>
        <Button active={p.loop} onClick={() => p.setLoop(!p.loop)} tip="Loop" desc="Round again at the end of the pass; off, it plays once and stops.">Loop</Button>
      </div>
      <Pills<string> label="Speed" value={String(p.speed)} onChange={(v) => p.setSpeed(+v)} options={[0.25, 0.5, 1, 2, 4].map((v) => ({ id: String(v), t: `×${v}` }))} />
      <Pills<string> label="Frame rate" value={String(p.fps)} onChange={(v) => p.setFps(+v as 30 | 60)} options={[{ id: '30', t: '30 fps · lighter' }, { id: '60', t: '60 fps' }]} />
      {len > 0 && <Timeline len={len} />}
    </div>
  )
}

/** One thing that can move: its name and switch, its settings under it while it is on. */
function Mover({ name, on, onChange, aside, children }: { name: string; on: boolean; onChange: (v: boolean) => void; aside?: ReactNode; children?: ReactNode }) {
  return (
    <div className={'mv' + (on ? ' mv--on' : '')}>
      <div className="mv__h">
        <Checkbox label={name} checked={on} onChange={onChange} />
        {aside != null && <span className="mv__a">{aside}</span>}
      </div>
      {on && children && <div className="mv__b">{children}</div>}
    </div>
  )
}

const BUILD = ['model', 'voxels', 'mesh'] as const

/** Animate: what moves, each switched on by itself. The object's transformation (geometry, voxels,
 *  the quantum step or Evolve, mesh), Evolve's turns, the slicers, the camera. Switching one on starts
 *  the clock. */
function Animate() {
  const p = usePresent()
  const s = useStore()
  const r = p.stageReel
  const evolve = s.q.mode === 'nations'
  const turns = s.evolve.history ? s.evolve.turns : null
  const name = { model: 'Geometry', voxels: 'Voxels', quantum: evolve ? 'Evolve' : 'Quantum', mesh: 'Mesh' }
  const n = s.grid?.n ?? 32, mm = s.grid?.voxel_size ?? 1
  const at = (f: number) => Math.round(f * (n - 1))
  const layer = (i: number) => `${i} · ${(i * mm).toFixed(0)} mm`
  // the transformation and the turns are one loop (the Reel): the transformation is its steps besides
  // the quantum step, the turns are the quantum step
  const build = r.on && BUILD.some((k) => r.segs[k])
  const turnsOn = r.on && r.segs.quantum
  const go = (v: boolean) => { if (v && !p.playing) { p.seek(0); p.setPlaying(true) } }
  const setBuild = (v: boolean) => {
    const segs = { ...r.segs, model: v, voxels: v, mesh: v, quantum: v ? true : r.segs.quantum }
    p.setStageReel({ segs, on: v || turnsOn }); go(v)
  }
  const setTurns = (v: boolean) => { p.setStageReel({ segs: { ...r.segs, quantum: v }, on: v || build }); go(v) }
  const slicers = variantsOf(p.compose, 'plane').length
  const sweep = r.plane !== 'off'
  return (
    <Section title="Animate">
      <Mover name="Transform" on={build} onChange={setBuild} aside={build ? BUILD.filter((k) => r.segs[k]).length + (r.segs.quantum ? 1 : 0) + ' stages' : undefined}>
        <div className="anim-steps" role="group" aria-label="Stages">
          {(['model', 'voxels', 'quantum', 'mesh'] as const).map((id) => (
            <button key={id} type="button" className={'anim-step' + (r.segs[id] ? ' anim-step--on' : '')} aria-pressed={r.segs[id]}
              onClick={() => p.setStageReel({ segs: { ...r.segs, [id]: !r.segs[id] } })}>{name[id]}</button>
          ))}
        </div>
        <Slider label="Each stage holds" value={r.hold.voxels} min={0.5} max={10} step={0.5} format={(v) => `${v} s`} onChange={(v) => p.setStageReel({ hold: { ...r.hold, model: v, voxels: v, mesh: v } })} />
        <Pills<typeof r.blend> label="Change" value={r.blend} onChange={(v) => p.setStageReel({ blend: v })} options={[{ id: 'fade', t: 'Morph' }, { id: 'wipe', t: 'Grow' }, { id: 'off', t: 'Cut' }]} />
        {r.blend !== 'off' && <Slider label="Change takes" value={r.morph} min={0.2} max={3} step={0.05} format={(v) => `${v.toFixed(2)} s`} onChange={(v) => p.setStageReel({ morph: v })} />}
      </Mover>
      <Mover name={evolve ? 'Evolve turns' : 'Quantum result'} on={turnsOn} onChange={setTurns} aside={evolve ? (turns != null ? `${turns} turns · ${r.tps}/s` : 'not run') : undefined}>
        {evolve ? (
          <>
            <Slider label="Turns per second" value={r.tps} min={0.5} max={20} step={0.5} format={(v) => `${v} / s${turns ? ` · ${(turns / v).toFixed(0)} s` : ''}`} onChange={(v) => p.setStageReel({ tps: v })} />
            <Slider label="Hold the last turn" value={r.hold.quantum} min={0} max={10} step={0.5} format={(v) => `${v} s`} onChange={(v) => p.setStageReel({ hold: { ...r.hold, quantum: v } })} />
            {turns == null && <Note>Run Evolve (Quantum → Evolve) for a history to play: the nations grow, war and take each other’s cells turn by turn.</Note>}
          </>
        ) : (
          <Slider label="Holds" value={r.hold.quantum} min={0.5} max={10} step={0.5} format={(v) => `${v} s`} onChange={(v) => p.setStageReel({ hold: { ...r.hold, quantum: v } })} />
        )}
      </Mover>
      <Mover name="Slicers" on={sweep && slicers > 0} onChange={(v) => { if (v && !slicers) p.place('plane', 'v1'); p.setStageReel({ plane: v ? 'loop' : 'off' }); go(v) }}
        aside={slicers ? `${variantsOf(p.compose, 'plane').map((v) => ({ v1: 'Z', v2: 'X', v3: 'Y' } as Record<string, string>)[v]).join(' ')}` : undefined}>
        <div className="anim-steps anim-steps--3" role="group" aria-label="Slicers">
          {([['v2', 'X'], ['v3', 'Y'], ['v1', 'Z']] as const).map(([id, t]) => {
            const onv = variantsOf(p.compose, 'plane').includes(id)
            return <button key={id} type="button" className={'anim-step' + (onv ? ' anim-step--on' : '')} aria-pressed={onv} onClick={() => (onv ? p.removePiece(`plane:${id}`) : p.place('plane', id))}>{t}</button>
          })}
        </div>
        <Pills<SliceOf> label="Cuts" value={s.sliceOf} onChange={s.setSliceOf} options={SLICE_OF.map((x) => ({ id: x.value, t: x.label }))} />
        <Pills<SliceColor> label="Colours" value={s.sliceColor} onChange={s.setSliceColor} options={SLICE_COLORS.map((x) => ({ id: x.value, t: x.label }))} />
        <Pills<typeof r.planeMode> value={r.planeMode} onChange={(v) => p.setStageReel({ planeMode: v })} options={[{ id: 'bounce', t: 'Up and down' }, { id: 'up', t: 'Up' }, { id: 'down', t: 'Down' }]} />
        <Slider label="One pass" value={r.planeSec} min={2} max={30} step={1} ticks={7} format={(v) => `${v} s`} onChange={(v) => p.setStageReel({ planeSec: v })} />
        <Slider label="Step" value={r.planeStep} min={1} max={8} step={1} ticks={8} format={(v) => (v === 1 ? 'every layer' : `${v} layers`)} onChange={(v) => p.setStageReel({ planeStep: v })} />
        <Slider label="From" value={at(r.from)} min={0} max={n - 1} step={1} ticks={8} format={layer} onChange={(v) => p.setStageReel({ from: v / (n - 1) })} />
        <Slider label="To" value={at(r.to)} min={0} max={n - 1} step={1} ticks={8} format={layer} onChange={(v) => p.setStageReel({ to: v / (n - 1) })} />
      </Mover>
      <Mover name="Camera" on={p.spin || p.rhythm.on} onChange={(v) => { if (v) p.setRhythm({ on: true }); else { p.setSpin(false); p.setRhythm({ on: false }) } go(v) }}
        aside={p.rhythm.on ? `rhythm · ${p.rhythm.angle}°` : p.spin ? `turntable · ${p.spinSpeed}°/s` : undefined}>
        <Pills<string> value={p.rhythm.on ? 'rhythm' : 'turn'} onChange={(v) => (v === 'rhythm' ? p.setRhythm({ on: true }) : p.setSpin(true))}
          options={[{ id: 'rhythm', t: 'Rhythm' }, { id: 'turn', t: 'Turntable' }]} />
        {p.rhythm.on ? (
          <>
            <Pills<string> label="Turn each beat" value={String(p.rhythm.angle)} onChange={(v) => p.setRhythm({ angle: +v })} options={[15, 30, 45, 60, 90].map((v) => ({ id: String(v), t: `${v}°` }))} />
            <Slider label="Beat" value={p.rhythm.beat} min={1} max={8} step={0.25} format={(v) => `${v} s`} onChange={(v) => p.setRhythm({ beat: v })} />
            <Slider label="Tilt up and down" value={p.rhythm.tilt} min={0} max={35} step={1} format={(v) => `±${v}°`} onChange={(v) => p.setRhythm({ tilt: v })} />
            <Slider label="Zoom in and out" value={p.rhythm.zoom} min={0} max={0.6} step={0.05} format={(v) => `±${Math.round(v * 100)} %`} onChange={(v) => p.setRhythm({ zoom: v })} />
            <Slider label="Roll" value={p.rhythm.roll} min={0} max={20} step={1} format={(v) => `±${v}°`} onChange={(v) => p.setRhythm({ roll: v })} />
            <Slider label="Randomness" value={p.rhythm.random} min={0} max={1} step={0.05} format={(v) => (v ? `${Math.round(v * 100)} %` : 'none · a steady turn')} onChange={(v) => p.setRhythm({ random: v })} />
            <Pills<typeof p.rhythm.ease> label="Ease" value={p.rhythm.ease} onChange={(v) => p.setRhythm({ ease: v })} options={[{ id: 'smooth', t: 'Smooth' }, { id: 'snappy', t: 'Snappy' }, { id: 'float', t: 'Float' }]} />
          </>
        ) : (
          <Slider label="Speed" value={p.spinSpeed} min={2} max={45} step={1} ticks={9} format={(v) => `${v}°/s`} onChange={(v) => p.setMotion({ spinSpeed: v })} />
        )}
        <Pills<string> label="Direction" value={String(p.spinDir)} onChange={(v) => p.setSpinDir(+v as 1 | -1)} options={[{ id: '1', t: '↺ Left' }, { id: '-1', t: '↻ Right' }]} />
      </Mover>
    </Section>
  )
}

/** Brightness and colour for what leaves the app: videos read darker on a phone than on this screen. */
function Grade() {
  const p = usePresent()
  const g = p.grade
  const touched = gradeFilter(g) !== 'none'
  return (
    <Section title="Brightness" aside={touched ? `${g.exposure >= 0 ? '+' : ''}${g.exposure.toFixed(1)} EV` : undefined}>
      <Slider label="Exposure" value={g.exposure} min={-1} max={2} step={0.1} origin={0} defaultValue={0} format={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} EV`} onChange={(v) => p.setGrade({ exposure: v })} />
      <Slider label="Lift shadows" value={g.lift} min={0} max={1} step={0.05} defaultValue={0} format={(v) => (v ? `${Math.round(v * 100)} %` : 'off')} onChange={(v) => p.setGrade({ lift: v })} />
      <Slider label="Contrast" value={g.contrast} min={0.5} max={1.6} step={0.05} origin={1} defaultValue={1} format={(v) => `×${v.toFixed(2)}`} onChange={(v) => p.setGrade({ contrast: v })} />
      <Slider label="Saturation" value={g.saturation} min={0} max={2} step={0.05} origin={1} defaultValue={1} format={(v) => `×${v.toFixed(2)}`} onChange={(v) => p.setGrade({ saturation: v })} />
      <div className="pd-checks"><Checkbox label="Preview on the view" tip="See the grade here as it will be in the video and the images." checked={g.preview} onChange={(v) => p.setGrade({ preview: v })} /></div>
      {touched && <Buttons><Button onClick={() => p.setGrade({ exposure: 0, contrast: 1, saturation: 1, lift: 0 })}>Reset</Button></Buttons>}
    </Section>
  )
}

const LENGTHS = [5, 10, 15, 30]

/** The view's size on screen in CSS px, for the window frame's export size. */
const viewSize = () => {
  const v = document.querySelector<HTMLElement>('.stage__view')
  return v ? { w: v.clientWidth, h: v.clientHeight } : undefined
}

/** Record: how long, what file, how big; then one button shoots it from the start. */
function Record() {
  const p = usePresent()
  const fr = frameOf(p.frame)
  const size = sizeOf(fr, p.outSize, viewSize())
  const pass = passLength(p.stageReel, p.cycles) / Math.max(0.1, p.speed)
  const sec = p.take.sec || pass || 10
  const [msg, setMsg] = useState<string | null>(null)
  const mp4 = !!mimeOf('mp4')
  const format = mp4 ? p.take.format : 'webm'
  // what the encoder takes at this size (MP4 stops near 8.9 million pixels)
  const sw = size?.[0] ?? 0, sh = size?.[1] ?? 0, fitKey = `${sw}x${sh}:${format}`
  const [fit, setFit] = useState<{ key: string; size: [number, number] } | null>(null)
  useEffect(() => {
    let live = true
    if (sw && sh) encodable(sw, sh, format).then((f) => { if (live) setFit({ key: `${sw}x${sh}:${format}`, size: f }) })
    return () => { live = false }
  }, [sw, sh, format])
  const fitted = fit?.key === fitKey ? fit.size : null
  const smaller = fitted && size && (fitted[0] < size[0] || fitted[1] < size[1])
  const shoot = () => {
    setMsg(null)
    recordTake({ sec, format: p.take.format, size }).catch((e) => setMsg(e instanceof Error && e.name !== 'NotAllowedError' ? e.message : 'Recording was not allowed.'))
  }
  return (
    <Section title="Record" aside={fitted ? `${fitted[0]} × ${fitted[1]}` : size ? `${size[0]} × ${size[1]}` : undefined}>
      <Pills<string> label="Length" value={String(p.take.sec)} onChange={(v) => p.setTake({ sec: +v })}
        options={[...(pass ? [{ id: '0', t: `One pass · ${pass.toFixed(0)} s` }] : []), ...LENGTHS.map((v) => ({ id: String(v), t: `${v} s` }))]} />
      <Pills<'mp4' | 'webm'> label="File" value={mp4 ? p.take.format : 'webm'} onChange={(v) => p.setTake({ format: v })}
        options={[{ id: 'mp4', t: 'MP4', off: !mp4 }, { id: 'webm', t: 'WebM' }]} />
      <div className="anim-transport anim-transport--rec">
        <button className={'pd-chip pd-chip--ink rec-btn' + (p.recording ? ' rec-btn--on' : '')} onClick={() => (p.recording ? stopTake() : shoot())}
          data-tip={p.recording ? 'Stop' : 'Record'} data-tip-desc="Hides the controls, plays from the start and records the view alone at the size above; the file downloads when it ends.">
          <span className="pd-rec" />{p.recording ? 'Stop' : `Record ${sec.toFixed(0)} s`}
        </button>
      </div>
      {smaller && <Note warn>{`An MP4 can be at most ${fitted![0]} × ${fitted![1]} in this frame, so that is what it records. For the full ${size![0]} × ${size![1]}, pick WebM.`}</Note>}
      {msg && <Note warn>{msg}</Note>}
    </Section>
  )
}

/** A frame's shape drawn small, so the ratios read at a glance. */
function FrameGlyph({ ratio }: { ratio: number | null }) {
  const r = ratio ?? 1.6, w = r >= 1 ? 18 : 18 * r, h = r >= 1 ? 18 / r : 18
  return <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden><rect x={10 - w / 2} y={10 - h / 2} width={w} height={h} fill="none" stroke="currentColor" strokeDasharray={ratio ? undefined : '2 2'} /></svg>
}

/** Output · the frame: the artboard's shape and the export size. */
function FramePick() {
  const p = usePresent()
  const fr = frameOf(p.frame)
  const size = sizeOf(fr, p.outSize, viewSize())
  return (
    <>
      <div className="pd-frames" role="radiogroup" aria-label="Frame">
        {FRAMES.map((f) => (
          <button key={f.id} role="radio" aria-checked={p.frame === f.id} className={'pd-frame' + (p.frame === f.id ? ' pd-frame--on' : '')}
            onClick={() => p.setFrame(f.id as FrameId)} data-tip={f.t} data-tip-desc={f.use}>
            <FrameGlyph ratio={f.ratio} /><span>{f.t}</span>
          </button>
        ))}
      </div>
      <Section title="Size" id="out-size" sub aside={size ? `${size[0]} × ${size[1]}` : undefined}>
      <Pills<string> label="File" value={String(Math.min(p.outSize, MULTS.length - 1))} onChange={(v) => p.setOutSize(+v)}
        options={MULTS.map((k, i) => ({ id: String(i), t: `×${k}` }))} />
      <Slider label="HUD" value={p.hudSize} min={0.7} max={1.5} step={0.05} ticks={9} format={(v) => `×${v.toFixed(2)}`} onChange={p.setHudSize} />
      </Section>
      <Section title="Padding" id="out-pad" sub aside={p.pad.linked ? `${p.pad.t} %` : `${p.pad.t} ${p.pad.r} ${p.pad.b} ${p.pad.l} %`}>
      <div className="pd-field">
        <div className="pd-chips">
          <button className={'pd-chip pd-chip--s' + (p.pad.linked ? ' pd-chip--on' : '')} onClick={() => p.setPad({ linked: true, t: p.pad.t })}>All sides</button>
          <button className={'pd-chip pd-chip--s' + (!p.pad.linked ? ' pd-chip--on' : '')} onClick={() => p.setPad({ linked: false })}>Each side</button>
        </div>
      </div>
      <div className="pd-checks"><Checkbox label="Show the padding on the view" tip="The dashed line inside the frame; never in an image or a video." checked={p.padGuide} onChange={p.setPadGuide} /></div>
      {p.pad.linked
        ? <Slider label="All sides" value={p.pad.t} min={0} max={20} step={0.5} format={(v) => `${v} %`} onChange={(v) => p.setPad({ t: v })} />
        : (['t', 'r', 'b', 'l'] as const).map((k) => (
          <Slider key={k} label={{ t: 'Top', r: 'Right', b: 'Bottom', l: 'Left' }[k]} value={p.pad[k]} min={0} max={30} step={0.5} format={(v) => `${v} %`} onChange={(v) => p.setPad({ [k]: v })} />
        ))}
      </Section>
    </>
  )
}

/** Output · stills and 3D. */
function Exports() {
  const p = usePresent()
  const st = useStore()
  const lv = useLive()
  const fr = frameOf(p.frame)
  const size = sizeOf(fr, p.outSize, viewSize())
  const [busy, setBusy] = useState<string | null>(null)
  const run = (k: string, fn: () => Promise<unknown>) => { setBusy(k); fn().catch(() => {}).finally(() => setBusy(null)) }
  const hudPng = () => {
    const el = document.querySelector<HTMLElement>('.stage__view')
    if (el) return savePng(el, 'hud', 2)
    return Promise.resolve()
  }
  const stl = async () => {
    await st.exportStl()
    const f = useStore.getState().exported?.file
    if (f) window.open(`/api/download/${encodeURIComponent(f)}`)
  }
  return (
    <>
      <Section title="Image">
        <div className="pd-grid2">
          <button className="pd-chip pd-chip--ink" disabled={!!busy || !lv.engine} onClick={() => run('png', () => (size ? exportFrame(lv.engine, size[0], size[1], fr.id) : screenshot()))}
            data-tip={size ? 'Save the frame' : 'Save the view'} data-tip-desc={size ? 'Backdrop, geometry, pieces, pins and notes as one PNG at the size above.' : 'Pick a frame for an exact size; without one this saves the view as it is.'}>
            <Icon name="export" size={14} />{busy === 'png' ? 'Saving…' : size ? `PNG ${size[0]}×${size[1]}` : 'Save PNG'}
          </button>
          <button className="pd-chip" onClick={() => run('geo', () => renderStill(lv.engine, 3))} data-tip="Geometry only" data-tip-desc="The geometry alone at 3×, on a transparent background."><Icon name="model" size={14} />Geometry</button>
          <button className="pd-chip" onClick={() => run('hud', hudPng)} data-tip="Pieces only" data-tip-desc="Every piece, pin and note without the geometry, transparent, at 2×."><Icon name="layers" size={14} />Pieces only</button>
          <button className="pd-chip" onClick={() => p.setBare(true)} data-tip="Hide controls" data-tip-key="H" data-tip-desc="Only the view and its pieces. H or Esc brings the controls back.">Hide controls</button>
        </div>
        <Pills<'auto' | 'dark' | 'light'> label="Ink of transparent PNGs" value={p.pngInk} onChange={p.setPngInk} options={[{ id: 'auto', t: 'As shown' }, { id: 'dark', t: 'Dark' }, { id: 'light', t: 'Light' }]} />
      </Section>
      <Section title="3D">
        <div className="pd-grid2">
          <button className="pd-chip" disabled={!st.report || !!busy} onClick={() => run('stl', stl)} data-tip="STL" data-tip-desc="The printable surface, with a .json of every setting, written to output/ and downloaded."><Icon name="print" size={14} />STL</button>
          <button className="pd-chip" disabled={!st.model || !!busy} onClick={() => run('glb', () => exportGlb(lv.engine))} data-tip="glTF" data-tip-desc="What the view shows (mesh or voxels, with colours) as .glb for Blender, Rhino or the web."><Icon name="model" size={14} />GLB</button>
        </div>
      </Section>
    </>
  )
}

const TABS = [
  { id: 'view', t: 'View' },
  { id: 'library', t: 'Library' },
  { id: 'active', t: 'Active' },
  { id: 'saved', t: 'Saved' },
] as const
type ComposeTab = (typeof TABS)[number]['id']
const TAB_KEY = 'qs-compose-tab'
const savedTab = (): ComposeTab => {
  try { const v = localStorage.getItem(TAB_KEY); return TABS.some((t) => t.id === v) ? (v as ComposeTab) : 'library' } catch { return 'library' }
}

/** Properties · 05 Compose: what goes on the view. Three levels: the tabs, a section's heading, its rows. */
export function ComposeSections() {
  const p = usePresent()
  const [tab, setTab] = useState<ComposeTab>(savedTab)
  const pick = (t: ComposeTab) => { setTab(t); try { localStorage.setItem(TAB_KEY, t) } catch { /* per-viewer */ } }
  // hovering a library row: it shows on the view and everything else dims
  const hover = (k: string | null, on: boolean) => { p.setPreview(k && !on ? k : null); p.setHl(k) }
  const on = countOn(p.compose, CATEGORIES.flatMap((c) => c.fams)) + p.texts.length
  const n: Partial<Record<ComposeTab, number>> = { active: on, saved: p.saved.length }
  // leaving Compose lets go of a library row's highlight (the pointer may never leave the row)
  useEffect(() => () => { usePresent.getState().setHl(null); usePresent.getState().setPreview(null) }, [])
  return (
    <div className={'pd pd--props cmp' + (p.composing ? ' pd--composing' : '')} onPointerLeave={() => { p.setHl(null); p.setPreview(null) }}>
      <ComposeHead />
      <div className="cmp-tabs" role="tablist" aria-label="Compose">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={'cmp-tab' + (tab === t.id ? ' cmp-tab--on' : '')} onClick={() => pick(t.id)}>
            {t.t}{n[t.id] ? <span className="cmp-tab__n">{n[t.id]}</span> : null}
          </button>
        ))}
      </div>
      <div className="cmp-page" role="tabpanel">
        {tab === 'view' && <OnTheView />}
        {tab === 'library' && <LibraryPage hover={hover} />}
        {tab === 'active' && <Section title="On the view" aside={on || undefined}><LayerList /></Section>}
        {tab === 'saved' && <Section title="Compositions" aside={p.saved.length || undefined}><Compositions /></Section>}
      </div>
    </div>
  )
}

/** Properties · 06 Animate and output: one run from top to bottom, to shoot a take. The frame and its
 *  size; the clock; what moves (the camera and steps, then only what is on the view); recording a
 *  take; and stills and 3D. */
export function OutputSections() {
  const frame = usePresent((p) => frameOf(p.frame).t)
  return (
    <div className="pd pd--props cmp">
      <PlayBar />
      <div className="cmp-page">
        <Section title="Frame" aside={frame}><FramePick /></Section>
        <Animate />
        <Grade />
        <Record />
        <Exports />
      </div>
    </div>
  )
}
