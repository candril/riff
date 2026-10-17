import type { SyntaxStyle } from "@opentui/core"
import { linePeekModel, type LinePeekInput } from "./peek-model"
import { peekBox } from "./PeekBox"

export interface LinePeekProps extends LinePeekInput {
  syntaxStyle: SyntaxStyle
}

export function LinePeek({ syntaxStyle, ...input }: LinePeekProps) {
  return peekBox(linePeekModel(input), { syntaxStyle })
}
