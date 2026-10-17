import { diagramPeekModel, type DiagramPeekInput } from "./peek-model"
import { peekBox } from "./PeekBox"

export type DiagramPeekProps = DiagramPeekInput

export function DiagramPeek(props: DiagramPeekProps) {
  return peekBox(diagramPeekModel(props))
}
