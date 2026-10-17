import { hunkPeekModel, type HunkPeekInput } from "./peek-model"
import { peekBox } from "./PeekBox"

export type HunkPeekProps = HunkPeekInput

export function HunkPeek(props: HunkPeekProps) {
  // Above the comments panel (50), which is what this is drawn over.
  return peekBox(hunkPeekModel(props), { zIndex: 60 })
}
