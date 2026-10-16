import { colors } from "../theme"
import type { DiffLineMapping } from "../vim-diff/line-mapping"

export const isEmpty = (props: { files: readonly unknown[]; mapping: DiffLineMapping }) =>
  props.files.length === 0 || props.mapping.lineCount === 0

/** Why there is no diff to draw, dim and centred in the pane. */
export function EmptyMessage(props: { text: string }) {
  return (
    <box width="100%" height="100%" justifyContent="center" alignItems="center">
      <text fg={colors.textDim}>{props.text}</text>
    </box>
  )
}
