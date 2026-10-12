// Capture for Present mode. Screenshot and Record use the browser's tab capture, so they record
// exactly what is on screen, HUD and all (the browser asks for permission each time). Render saves
// the geometry alone at a higher resolution with a transparent background.
import { gradeFilter, usePresent } from '../present'
import { useStore } from '../store'
import type { Engine } from '../view/engine'

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

const frames = (n = 2) => new Promise<void>((r) => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f) })

async function tabStream(): Promise<MediaStream> {
  const opts = { video: { displaySurface: 'browser', frameRate: 60 }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include' }
  return navigator.mediaDevices.getDisplayMedia(opts as DisplayMediaStreamOptions)
}

/** Hide the controls, wait for the layout to settle, then run `fn`. */
async function bare<T>(fn: () => Promise<T>): Promise<T> {
  const p = usePresent.getState()
  const was = { bare: p.bare, drawer: p.drawer }
  p.setBare(true)
  await frames(3)
  try {
    return await fn()
  } finally {
    const q = usePresent.getState()
    if (!q.recording) q.setBare(was.bare)
  }
}

export async function screenshot(): Promise<void> {
  const stream = await tabStream()
  try {
    await bare(async () => {
      const video = document.createElement('video')
      video.srcObject = stream
      video.muted = true
      await video.play()
      await frames(4)
      const c = document.createElement('canvas')
      c.width = video.videoWidth
      c.height = video.videoHeight
      c.getContext('2d')!.drawImage(video, 0, 0)
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'))
      if (blob) download(blob, `quantum-sculptor-${stamp()}.png`)
    })
  } finally {
    stream.getTracks().forEach((t) => t.stop())
  }
}

let recorder: MediaRecorder | null = null

export async function toggleRecording(): Promise<void> {
  const p = usePresent.getState()
  if (recorder) { recorder.stop(); return }
  const stream = await tabStream()
  const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
  const chunks: Blob[] = []
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 12_000_000 })
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
  rec.onstop = () => {
    stream.getTracks().forEach((t) => t.stop())
    recorder = null
    usePresent.getState().setRecording(false)
    usePresent.getState().setBare(false)
    download(new Blob(chunks, { type: type || 'video/webm' }), `quantum-sculptor-${stamp()}.webm`)
  }
  // a framed artboard records only itself where the browser can crop a tab capture to an element
  const view = document.querySelector<HTMLElement>('.stage__view')
  const crop = (globalThis as unknown as { CropTarget?: { fromElement: (e: Element) => Promise<unknown> } }).CropTarget
  const track = stream.getVideoTracks()[0] as MediaStreamTrack & { cropTo?: (t: unknown) => Promise<void> }
  if (view && crop && track?.cropTo && usePresent.getState().frame !== 'window') {
    try { await track.cropTo(await crop.fromElement(view)) } catch { /* records the whole tab */ }
  }
  // the browser's own "Stop sharing" also ends the recording
  stream.getVideoTracks()[0]?.addEventListener('ended', () => recorder?.state === 'recording' && recorder.stop())
  p.setRecording(true)
  p.setBare(true)
  await frames(3)
  recorder = rec
  rec.start(250)
}

export const isRecording = () => !!recorder || !!take

/** The video types this browser can write, best first. */
const MIME = {
  mp4: ['video/mp4;codecs=avc1.640033', 'video/mp4;codecs=avc1.4d0033', 'video/mp4;codecs=avc1', 'video/mp4'],
  webm: ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'],
}
export const mimeOf = (f: 'mp4' | 'webm') => (typeof MediaRecorder === 'undefined' ? undefined : MIME[f].find((t) => MediaRecorder.isTypeSupported(t)))

let take: { stop: () => void } | null = null

/** The encoder each file type uses, as WebCodecs names them (to ask what sizes it takes). */
const CODEC = { mp4: 'avc1.640033', webm: 'vp09.00.51.08' }

/** The largest size of this shape the browser can encode as `format`, at most w × h (even numbers).
 *  H.264 (MP4) stops near 8.9 million pixels, about 4096 × 2176: ×3 of a 4:5 frame is beyond it; VP9
 *  (WebM) goes further. Without WebCodecs to ask, those limits are assumed. */
export async function encodable(w: number, h: number, format: 'mp4' | 'webm'): Promise<[number, number]> {
  const even = (v: number) => Math.max(2, Math.round(v / 2) * 2)
  const ask = async (a: number, b: number) => {
    const VE = (globalThis as unknown as { VideoEncoder?: { isConfigSupported: (c: object) => Promise<{ supported?: boolean }> } }).VideoEncoder
    if (!VE) return format === 'webm' ? a * b <= 35e6 : a * b <= 8.9e6 && Math.max(a, b) <= 4096
    try { return !!(await VE.isConfigSupported({ codec: CODEC[format], width: a, height: b, bitrate: 20e6, framerate: 30 })).supported } catch { return false }
  }
  let k = 1
  for (let i = 0; i < 40; i++) {
    const a = even(w * k), b = even(h * k)
    if (await ask(a, b)) return [a, b]
    k *= 0.95
  }
  return [even(w * k), even(h * k)]
}

/** Shoots a take: hides the controls, starts the clock from 0, records the view alone for `sec` seconds
 *  at `size` (w × h px; null for the view's own pixels) as `format`, then saves it. The browser asks
 *  once to share this tab; its pixels are drawn into a canvas of the exact size, cropped to the view.
 *  Call again (or stopTake) to end early. */
export async function recordTake({ sec, format, size }: { sec: number; format: 'mp4' | 'webm'; size: [number, number] | null }): Promise<void> {
  if (take) { take.stop(); return }
  const mime = mimeOf(format) ?? mimeOf(format === 'mp4' ? 'webm' : 'mp4')
  if (!mime) throw new Error('This browser cannot record video')
  const stream = await tabStream()
  const video = document.createElement('video')
  video.srcObject = stream
  video.muted = true
  await video.play()
  const p = usePresent.getState()
  const was = { loop: p.loop, playing: p.playing }
  p.setRecording(true)
  p.setBare(true)
  await frames(4)
  const view = document.querySelector<HTMLElement>('.stage__view')
  const vr0 = view?.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const W = size?.[0] ?? Math.round((vr0?.width ?? video.videoWidth) * dpr), H = size?.[1] ?? Math.round((vr0?.height ?? video.videoHeight) * dpr)
  // no larger than the encoder takes: beyond it the browser records nothing at all
  const [cw, ch] = await encodable(W, H, mime.startsWith('video/mp4') ? 'mp4' : 'webm')
  const c = document.createElement('canvas')
  c.width = cw
  c.height = ch
  const g = c.getContext('2d')!
  g.imageSmoothingQuality = 'high'
  // the grade: already in the captured pixels when it is previewed on the view, else laid on here
  const gr = usePresent.getState().grade
  g.filter = gr.preview ? 'none' : gradeFilter(gr)
  let raf = 0
  const draw = () => {
    const vr = view?.getBoundingClientRect()
    const k = video.videoWidth / window.innerWidth
    if (vr && video.videoWidth) g.drawImage(video, vr.left * k, vr.top * k, vr.width * k, vr.height * k, 0, 0, c.width, c.height)
    raf = requestAnimationFrame(draw)
  }
  draw()
  const rec = new MediaRecorder(c.captureStream(p.fps), { mimeType: mime, videoBitsPerSecond: Math.round(Math.min(40, Math.max(8, (c.width * c.height) / 1e5)) * 1_000_000) })
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
  let failed: string | null = null
  rec.onerror = (e) => { failed = String((e as unknown as { error?: Error }).error?.message ?? 'the recorder stopped') }
  const done = new Promise<void>((res, rej) => {
    rec.onstop = () => {
      cancelAnimationFrame(raf)
      stream.getTracks().forEach((t) => t.stop())
      clearTimeout(timer)
      take = null
      const q = usePresent.getState()
      q.setRecording(false)
      q.setBare(false)
      usePresent.setState({ loop: was.loop })
      if (!was.playing) q.setPlaying(false)
      const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm'
      const blob = new Blob(chunks, { type: mime.split(';')[0] })
      // an empty take is a failure, not a file
      if (!blob.size) { rej(new Error(`Nothing was recorded at ${c.width} × ${c.height}${failed ? `: ${failed}` : ''}. Try a smaller size or WebM.`)); return }
      download(blob, `quantum-sculptor-${c.width}x${c.height}-${stamp()}.${ext}`)
      res()
    }
  })
  const stop = () => { if (rec.state === 'recording') rec.stop() }
  // the browser's own "Stop sharing" ends the take too
  stream.getVideoTracks()[0]?.addEventListener('ended', stop)
  take = { stop }
  // from the top: the clock at 0 and playing, looping if the take outlasts one pass; an Evolve history
  // back to its founding (turn 0), whatever plays its turns
  usePresent.setState({ loop: true })
  const st = useStore.getState()
  if (st.evolve.history) { st.pause(); await st.setTurn(0) }
  usePresent.getState().seek(0)
  usePresent.getState().setPlaying(true)
  rec.start(250)
  const timer = setTimeout(stop, Math.max(1, sec) * 1000)
  return done
}
/** Ends a take early; false when none is running. */
export const stopTake = () => { if (!take) return false; take.stop(); return true }

const blobOf = (url: string) => fetch(url).then((r) => r.blob())
const img = (src: Blob) => new Promise<HTMLImageElement>((res, rej) => {
  const i = new Image()
  i.onload = () => res(i)
  i.onerror = rej
  i.src = URL.createObjectURL(src)
})

const PAINT = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'fill-opacity', 'stroke-opacity', 'font-family', 'font-size', 'font-weight', 'letter-spacing'] as const
/** html-to-image drops paint that SVG shapes get from class rules (lines vanish, unfilled boxes turn
 *  black): write it onto each shape's own style for the capture, and put it back afterwards. */
export function inlineSvgPaint(root: Element): () => void {
  const undo: (() => void)[] = []
  root.querySelectorAll<SVGElement>('svg *').forEach((el) => {
    if (!(el instanceof SVGElement) || !el.getAttribute('class')) return
    const was = el.getAttribute('style')
    const cs = getComputedStyle(el)
    for (const k of PAINT) if (!el.style.getPropertyValue(k)) el.style.setProperty(k, cs.getPropertyValue(k))
    undo.push(() => { if (was == null) el.removeAttribute('style'); else el.setAttribute('style', was) })
  })
  return () => undo.forEach((f) => f())
}

/** The whole composition as one PNG of exactly w × h px: the backdrop, the geometry, then the HUD,
 *  pins and notes over it. The view has the frame's shape, so nothing is cropped or stretched. */
export async function exportFrame(engine: Engine | undefined, w: number, h: number, name: string): Promise<void> {
  const view = document.querySelector<HTMLElement>('.stage__view')
  if (!engine || !view) return
  await bare(async () => {
    const { toPng } = await import('html-to-image')
    const vw = view.clientWidth, vh = view.clientHeight
    const scale = w / vw
    const skip = (n: Node) => !(n instanceof Element && n.matches('canvas, .hud-piece__bar, [data-no-export], [data-hud^="chrome:"], .stage__drop, .landing, .qs-probe-rulers'))
    // 1 · the ground and its backdrop: the view's own background, no children
    const ground = await toPng(view, { pixelRatio: scale, width: vw, height: vh, filter: (n) => n === view })
    // 2 · the geometry, rendered at the target size
    const pr = engine.pixelRatio()
    const geo = await engine.render(scale / pr)
    // 3 · everything drawn over it, on a transparent ground
    const restore = inlineSvgPaint(view)
    const over = await toPng(view, { pixelRatio: scale, width: vw, height: vh, style: { background: 'none' }, filter: skip }).finally(restore)
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const g = c.getContext('2d')!
    // the grade over the whole frame (the view's own preview filter is not in these renders)
    g.filter = gradeFilter(usePresent.getState().grade)
    g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--qs-bg').trim() || '#E3E4E7'
    g.fillRect(0, 0, w, h)
    for (const part of [await blobOf(ground), geo, await blobOf(over)]) {
      if (!part) continue
      const i = await img(part)
      g.drawImage(i, 0, 0, w, h)
      URL.revokeObjectURL(i.src)
    }
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'))
    if (blob) download(blob, `quantum-sculptor-${name}-${w}x${h}-${stamp()}.png`)
  })
}

/** What is on the view as a glTF binary (.glb): meshes and voxels as shown, for Blender, Rhino or the web. */
export async function exportGlb(engine: Engine | undefined): Promise<void> {
  if (!engine) return
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')
  const data = await new GLTFExporter().parseAsync(engine.exportable(), { binary: true, onlyVisible: true })
  download(new Blob([data as ArrayBuffer], { type: 'model/gltf-binary' }), `quantum-sculptor-${stamp()}.glb`)
}

export async function renderStill(engine: Engine | undefined, scale = 3): Promise<void> {
  if (!engine) return
  const blob = await engine.render(scale)
  if (blob) download(blob, `quantum-sculptor-render-${scale}x-${stamp()}.png`)
}
