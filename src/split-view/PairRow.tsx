import type { Row } from "../diff-rows/rows"
import type { SplitEnv } from "./env"
import { Half } from "./Half"

export function PairRow(props: { env: SplitEnv; row: Extract<Row, { kind: "pair" }>; atCursor: boolean }) {
  const { env, row } = props
  return (
    <box flexDirection="row" width={env.props.width} height={1} flexShrink={0}>
      <Half env={env} index={row.left} side="left" active={props.atCursor && env.props.side === "left"} />
      <Half env={env} index={row.right} side="right" active={props.atCursor && env.props.side === "right"} />
    </box>
  )
}
