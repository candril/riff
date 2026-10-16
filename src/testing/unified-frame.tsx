import { createStore } from "solid-js/store"
import { LineSpans } from "../diff-rows/line-spans"
import { UnifiedDiffView, type UnifiedDiffViewProps } from "../split-view/UnifiedDiffView"
import { parseDiff } from "../utils/diff-parser"
import { FileParses } from "../vim-diff/file-parses"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import type { DiffLineMappingOptions } from "../vim-diff/types"
import { mountJsx } from "./frame"

export interface MountUnifiedOptions
  extends Partial<Omit<UnifiedDiffViewProps, "mapping" | "files" | "lineSpans" | "width" | "height">> {
  raw: string
  mode?: "single" | "all"
  selectedFileIndex?: number
  mappingOptions?: DiffLineMappingOptions
  /** The screen's; the view gets all of it, less the header row when there is one. */
  width?: number
  height?: number
  /** Under the one-row header mountDiffView gives VimDiffView, so the two frames line up. */
  header?: boolean
}

/** The unified view on a test screen, 80 by 16 unless told otherwise; `set` patches its props. */
export async function mountUnified(options: MountUnifiedOptions) {
  const { raw, mode = "all", selectedFileIndex, mappingOptions, width = 80, height = 16, header = false, ...rest } = options
  const files = parseDiff(raw)
  const mapping = new DiffLineMapping(files, mode, selectedFileIndex, mappingOptions)
  const [props, set] = createStore<UnifiedDiffViewProps>({
    mapping,
    files,
    // No parser answers, so nothing waits on a worker and every line is plain text.
    lineSpans: new LineSpans(new FileParses(async () => null), async () => null),
    highlightVersion: 0,
    comments: [],
    fileStatuses: new Map(),
    expandingDivider: null,
    cursor: { line: 0 },
    scrollTop: 0,
    column: 0,
    wrap: false,
    width,
    height: header ? height - 1 : height,
    focused: true,
    selection: null,
    search: null,
    flash: null,
    ...rest,
  })
  const view = () => <UnifiedDiffView {...props} />
  const mounted = await mountJsx(
    () =>
      header ? (
        <box width="100%" height="100%" flexDirection="column">
          <box width="100%" height={1} flexShrink={0} />
          {view()}
        </box>
      ) : (
        view()
      ),
    { width, height }
  )
  return { ...mounted, mapping, files, set }
}
