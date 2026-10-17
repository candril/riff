import { For, Show } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { colors, theme } from "../theme"
import { cellsOf } from "../diff-rows/cells"
import { RIGHT_GAP, naturalCells, versionFits } from "./header-fit"
import type { HeaderModel, HeaderPart } from "./header-model"

export type HeaderViewProps = HeaderModel & {
  /** The build, as `riff --version` names it; omitted, nothing is drawn. */
  version?: string
}

const contentsOf = (runs: HeaderPart[][]) => runs.map((run) => run.map((part) => part.content))

function Run(props: { run: HeaderPart[] }) {
  return (
    <Show
      when={props.run.length === 1}
      fallback={
        <box flexDirection="row">
          <For each={props.run}>{(part) => <text fg={part.fg}>{part.content}</text>}</For>
        </box>
      }
    >
      <text fg={props.run[0]!.fg}>{props.run[0]!.content}</text>
    </Show>
  )
}

/**
 * The one-row header: `left` shrinks and clips, `right` keeps its width,
 * and the version, when given, is shown at the far right only while the
 * rest fits whole beside it.
 */
export function Header(props: HeaderViewProps) {
  // The header spans the terminal, and the terminal's width is known before the first layout, unlike the row's own.
  const terminal = useTerminalDimensions()
  const versionShown = () => {
    const version = props.version
    if (version === undefined) return false
    const natural = {
      left: naturalCells(contentsOf(props.left), props.leftGap),
      right: naturalCells(contentsOf(props.right), RIGHT_GAP),
    }
    return versionFits(terminal().width, natural, cellsOf(version))
  }

  return (
    <box
      height={1}
      width="100%"
      backgroundColor={colors.headerBg}
      paddingLeft={1}
      paddingRight={1}
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
    >
      <box flexDirection="row" gap={props.leftGap} flexShrink={1} overflow="hidden">
        <For each={props.left}>{(run) => <Run run={run} />}</For>
      </box>
      <box flexDirection="row" gap={RIGHT_GAP} flexShrink={0}>
        <For each={props.right}>{(run) => <Run run={run} />}</For>
        <Show when={versionShown()}>
          <text fg={theme.overlay0}>{props.version}</text>
        </Show>
      </box>
    </box>
  )
}
