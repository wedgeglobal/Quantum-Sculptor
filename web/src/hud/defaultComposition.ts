// The Default: the one preset, the whole composition as designed (pieces, annotations, animation,
// shading, lighting and what the view shows). It lives in defaultComposition.json, written by
// Compose · Saved compositions · Publish as Default (POST /api/default-composition), which raises
// `rev`; a browser that last saw a lower rev puts the new Default on screen when it opens.
import type { Saved } from '../present'
import data from './defaultComposition.json'

export const DEFAULT_ID = 'default'
export const DEFAULT_COMPOSITION = data as unknown as Saved   // an older save may lack newer motion fields (reelOf fills them)
/** The view's own controls for a Default saved before compositions kept them: none (the tool shelf
 *  and navigation, the camera readout and the cutting plane stay off), so the view reads as the object and its marks. */
export const DEFAULT_HUD = { tools: false, axes: false, nav: false, camera: false, caption: false, legend: false, frame: false, slice: false }
