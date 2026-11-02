import { createSignal } from "solid-js"
import { LineSpans } from "../diff-rows/line-spans"
import { RowLineSource } from "../diff-rows/row-source"
import { SplitDiffView, type SplitDiffViewProps } from "../split-view/SplitDiffView"
import { parseDiff } from "../utils/diff-parser"
import { FileParses, type FileVersions, type Parse } from "../vim-diff/file-parses"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import type { DiffLineMappingOptions } from "../vim-diff/types"
import { mountJsx } from "./frame"

export interface MountSplitOptions extends Partial<Omit<SplitDiffViewProps, "mapping" | "source" | "files" | "lineSpans">> {
  raw: string
  mappingOptions?: DiffLineMappingOptions
  /** Answers every parse; by default none answers. */
  parse?: Parse
  /** The files' own text, parsed as whole files the way the app does (spec 080). */
  fileVersions?: ReadonlyMap<string, FileVersions>
}

/** The split view alone on a test screen, at 120 columns unless told otherwise. */
export async function mountSplit(options: MountSplitOptions) {
  // No parser answers, so nothing waits on a worker and every line is plain text.
  const { raw, mappingOptions, parse = async () => null, fileVersions, ...rest } = options
  const files = parseDiff(raw)
  const mapping = new DiffLineMapping(files, "all", undefined, mappingOptions)
  const parses = new FileParses(parse)
  const lineSpans = new LineSpans(parses, parse)
  const props: SplitDiffViewProps = {
    mapping,
    source: new RowLineSource(mapping, "split"),
    files,
    lineSpans,
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
  // As the app does, so a parse that lands draws again.
  const [highlightVersion, setHighlightVersion] = createSignal(props.highlightVersion)
  lineSpans.onSpans = () => setHighlightVersion((version) => version + 1)
  parses.onParsed = () => setHighlightVersion((version) => version + 1)
  if (fileVersions) parses.set(fileVersions)
  const live = {
    ...props,
    get highlightVersion() { return highlightVersion() },
    get focused() { return focused() },
    get side() { return side() },
  }
  const mounted = await mountJsx(() => <SplitDiffView {...live} />, { width: props.width, height: props.height })
  return { ...mounted, mapping, setFocused, setSide }
}

export { bgAt, fgAt, ints } from "./frame"
