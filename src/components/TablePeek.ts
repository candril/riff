import { tablePeekModel, type TablePeekInput } from "./peek-model"
import { peekBox } from "./PeekBox"

export type TablePeekProps = TablePeekInput

export function TablePeek(props: TablePeekProps) {
  return peekBox(tablePeekModel(props))
}
