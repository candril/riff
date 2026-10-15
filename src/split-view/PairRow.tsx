import { createMemo } from "solid-js"
import type { Row, Side } from "../diff-rows/rows"
import type { SplitEnv } from "./env"
import { Half } from "./Half"

export function PairRow(props: { env: SplitEnv; row: Extract<Row, { kind: "pair" }>; at: number; atCursor: boolean }) {
  const { env, row } = props
  // Memos, so the cursor entering this row or the pane switching re-colours only the half whose value changed.
  const half = (side: Side) => ({
    active: createMemo(() => props.atCursor && env.props.side === side),
    // A line in both halves is one flash target: flash looks for it in the cursor's pane, so only that half labels it.
    flashTargets: createMemo(() => row.left !== row.right || env.props.side === side),
  })
  const left = half("left")
  const right = half("right")
  return (
    <box flexDirection="row" width={env.props.width} height={1} flexShrink={0}>
      <Half
        env={env}
        index={row.left}
        at={props.at}
        side="left"
        active={left.active()}
        flashTargets={left.flashTargets()}
      />
      <Half
        env={env}
        index={row.right}
        at={props.at}
        side="right"
        active={right.active()}
        flashTargets={right.flashTargets()}
      />
    </box>
  )
}
