// The look of the view: shading modes, lights and backdrops, shared by the view's Shading and render
// menu and Compose · View.
import type { Shading } from '../store'

export const LIGHTS = [
  { id: 'studio', t: 'Key', d: 'A key light from the upper left of the camera, with sky fill.' },
  { id: 'soft', t: 'Soft', d: 'Mostly sky light; gentle shading, good for dense voxels.' },
  { id: 'flat', t: 'Flat', d: 'No shading at all: tone shows only the value.' },
  { id: 'rim', t: 'Rim', d: 'A backlight outlines the silhouette.' },
] as const
export const BACKDROPS = [
  { id: 'plain', t: 'Plain', d: 'The page background.' },
  { id: 'dots', t: 'Dots', d: 'A 24 px dot grid behind the model.' },
  { id: 'lines', t: 'Grid', d: 'A fine square grid, like graph paper.' },
  { id: 'gradient', t: 'Vignette', d: 'Lighter at the centre, darker at the edges.' },
  { id: 'studio', t: 'Studio', d: 'A soft horizon, like a photo cyclorama.' },
] as const

export const SHADINGS: { id: Shading; icon: string; t: string; d: string }[] = [
  { id: 'wire', icon: 'wire', t: 'Wireframe', d: 'Edges only: voxels as a lattice, meshes as triangles.' },
  { id: 'solid', icon: 'solid', t: 'Solid', d: 'The form alone, in one grey: no values, no nations.' },
  { id: 'value', icon: 'value', t: 'Value', d: 'Coloured by the data: cells darker where denser, meshes by the density under their surface, Evolve by nation.' },
  { id: 'entangle', icon: 'entangle', t: 'Entangle', d: "Entanglement: thin-film interference from tables computed by Moth's entanglement-shader-v1; the value (or, in Evolve, the nation) sets the film's thickness." },
]
