// The size of a mark drawn on the object or over the whole view (the orbit ring, corners, selection,
// callouts, frame marks): a factor the mark applies to its own measures (radius, arm, box, type), since
// such a mark cannot simply be zoomed without leaving the object. Pieces in the corners are zoomed instead.
import { createContext, useContext } from 'react'

export const MarkScale = createContext(1)
export const useMarkScale = () => useContext(MarkScale)
