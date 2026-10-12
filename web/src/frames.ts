// Output frames: the shape of the artboard and the pixel size it exports at. The view takes the frame's
// shape inside the window, the HUD scales with it, and Output saves it at its base size times ×1–×4.
// 'window' is the whole view, its size on screen times the multiplier.
export type FrameId = 'window' | 'wide' | 'cinema' | 'link' | 'square' | 'post' | 'story' | 'long' | 'poster'
export interface Frame { id: FrameId; t: string; ratio: number | null; use: string; sizes: [number, number][] }
/** The size multipliers; a frame's `outSize` picks one (×1 at 0). */
export const MULTS = [1, 2, 3, 4] as const

export const FRAMES: Frame[] = [
  { id: 'window', t: 'Window', ratio: null, use: 'The whole window, as shown', sizes: [] },
  { id: 'wide', t: '16:9', ratio: 16 / 9, use: 'Slides, video, screens', sizes: [[1920, 1080]] },
  { id: 'cinema', t: '21:9', ratio: 21 / 9, use: 'Banners, web headers', sizes: [[2520, 1080]] },
  { id: 'link', t: '1.91:1', ratio: 1.91, use: 'Link cards: LinkedIn, X', sizes: [[1200, 628]] },
  { id: 'square', t: '1:1', ratio: 1, use: 'Instagram square post', sizes: [[1080, 1080]] },
  { id: 'post', t: '4:5', ratio: 4 / 5, use: 'Instagram portrait post', sizes: [[1080, 1350]] },
  { id: 'story', t: '9:16', ratio: 9 / 16, use: 'Stories, Reels, TikTok', sizes: [[1080, 1920]] },
  { id: 'long', t: '1:2', ratio: 1 / 2, use: 'Long vertical, carousels', sizes: [[1080, 2160]] },
  { id: 'poster', t: 'A · 1:√2', ratio: 1 / Math.SQRT2, use: 'Posters: A4 at 300 dpi; ×2 for A2', sizes: [[2480, 3508]] },
]
export const frameOf = (id: FrameId | undefined) => FRAMES.find((f) => f.id === id) ?? FRAMES[0]

/** The largest box of `ratio` inside w × h. */
export function fit(ratio: number, w: number, h: number): { w: number; h: number } {
  return w / h > ratio ? { w: Math.round(h * ratio), h: Math.round(h) } : { w: Math.round(w), h: Math.round(w / ratio) }
}

/** The pixel size a frame exports at: its base (or, for the window, the view's size on screen) times
 *  the multiplier picked. */
export function sizeOf(f: Frame, outSize: number, view?: { w: number; h: number }): [number, number] | null {
  const k = MULTS[Math.max(0, Math.min(MULTS.length - 1, outSize))]
  const base = f.sizes[0] ?? (view ? [view.w, view.h] : null)
  return base ? [Math.round(base[0] * k), Math.round(base[1] * k)] : null
}
