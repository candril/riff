import { createMemo } from "solid-js"
import type { Row, Side } from "../diff-rows/rows"
import type { SplitEnv } from "./env"
import { Half } from "./Half"

export function PairRow(props: { env: SplitEnv; row: Extract<Row, { kind: "pair" }>; at: number; atCursor: boolean }) {
  const { env, row } = props
  // Memos, so the cursor entering this row or the pane switching re-colours only the half whose value changed.
  const activeOn = (side: Side) => createMemo(() => props.atCursor && env.props.side === side)
  const left = activeOn("left")
  const right = activeOn("right")
  return (
    <box flexDirection="row" width={env.props.width} height={1} flexShrink={0}>
      <Half env={env} index={row.left} at={props.at} side="left" active={left()} />
      <Half env={env} index={row.right} at={props.at} side="right" active={right()} />
    </box>
  )
}
