import { For } from "solid-js"
import { colors } from "../theme"
import type { MatchSpan } from "./match-spans"

/** Inside a `<text>`: the text's runs, the ones the query matched picked out. */
export function MatchedSpans(props: { spans: readonly MatchSpan[]; fg: string }) {
  return (
    <For each={props.spans}>
      {(span) => (
        <span style={span.matched ? { fg: colors.filterMatchFg, bg: colors.filterMatchBg } : { fg: props.fg }}>
          {span.text}
        </span>
      )}
    </For>
  )
}
