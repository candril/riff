import { createSignal } from "solid-js"
import { LineSpans } from "../diff-rows/line-spans"
import { RowLineSource } from "../diff-rows/row-source"
import { SplitDiffView, type SplitDiffViewProps } from "../split-view/SplitDiffView"
import { parseDiff } from "../utils/diff-parser"
import { FileParses } from "../vim-diff/file-parses"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import type { DiffLineMappingOptions } from "../vim-diff/types"
import { mountJsx } from "./frame"

export interface MountSplitOptions extends Partial<Omit<SplitDiffViewProps, "mapping" | "source" | "files" | "lineSpans">> {
  raw: string
  mappingOptions?: DiffLineMappingOptions
}

/** The split view alone on a test screen, at 120 columns unless told otherwise. */
export async function mountSplit(options: MountSplitOptions) {
  const { raw, mappingOptions, ...rest } = options
  const files = parseDiff(raw)
  const mapping = new DiffLineMapping(files, "all", undefined, mappingOptions)
  const props: SplitDiffViewProps = {
    mapping,
    source: new RowLineSource(mapping, "split"),
    files,
    // No parser answers, so nothing waits on a worker and every line is plain text.
    lineSpans: new LineSpans(new FileParses(async () => null), async () => null),
    highlightVersion: 0,
    comments: [],
    marks: [],
    fileStatuses: new Map(),
    expandingDivider: null,
    cursor: { row: -1, col: 0 },
    side: "right",
    scrollTop: 0,
    columns: { left: 0, right: 0 },
    width: 120,
    height: 20,
    focused: true,
    selection: null,
    search: null,
    flash: null,
    ...rest,
  }
  const [focused, setFocused] = createSignal(props.focused)
  const [side, setSide] = createSignal(props.side)
  const live = {
    ...props,
    get focused() { return focused() },
    get side() { return side() },
  }
  const mounted = await mountJsx(() => <SplitDiffView {...live} />, { width: props.width, height: props.height })
  return { ...mounted, mapping, setFocused, setSide }
}

export { bgAt, fgAt, ints } from "./frame"
