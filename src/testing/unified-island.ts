import type { BoxRenderable } from "@opentui/core"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { createUnifiedIsland } from "../app/unified-island"
import { LineSpans } from "../diff-rows/line-spans"
import { parseDiff } from "../utils/diff-parser"
import { FileParses } from "../vim-diff/file-parses"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import type { DiffLineMappingOptions } from "../vim-diff/types"
import { trimFrame } from "./frame"

export interface MountIslandOptions {
  raw: string
  width?: number
  height?: number
  scrollOff?: number
  mode?: "single" | "all"
  wrap?: boolean
  emptyMessage?: string
  mappingOptions?: DiffLineMappingOptions
  parent?: (setup: TestRendererSetup) => BoxRenderable
  /** What to mount around the host, built with it where the order of siblings matters. */
  around?: (host: BoxRenderable, setup: TestRendererSetup) => Parameters<TestRendererSetup["renderer"]["root"]["add"]>[0]
  /** Leaves the island without inputs, to see what it answers before the app's first render. */
  bare?: boolean
}

/** The host's laid-out size reaches the island a tick after the frame that laid it out. */
const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0))

/** createUnifiedIsland alone on a test screen, 80 by 10 unless told otherwise, fed the app's first full update. */
export async function mountIsland(options: MountIslandOptions) {
  const { raw, width = 80, height = 10, scrollOff = 2, mode = "all", wrap = false } = options
  const setup = await createTestRenderer({ width, height })
  const island = createUnifiedIsland(setup.renderer, scrollOff)
  if (options.around) setup.renderer.root.add(options.around(island.host, setup))
  else (options.parent?.(setup) ?? setup.renderer.root).add(island.host)
  const files = parseDiff(raw)
  const mapping = new DiffLineMapping(files, mode, mode === "single" ? 0 : undefined, options.mappingOptions)
  if (!options.bare) {
    island.update({
      mapping,
      files,
      lineSpans: new LineSpans(new FileParses(async () => null), async () => null),
      highlightVersion: 0,
      comments: [],
      marks: [],
      fileStatuses: new Map(),
      expandingDivider: null,
      cursor: { line: 0, col: 0 },
      wrap,
      focused: true,
      selection: null,
      search: null,
      flash: null,
      emptyMessage: options.emptyMessage ?? "No changes to display",
    })
  }
  const frame = async () => {
    await setup.renderOnce()
    await nextTick()
    await setup.renderOnce()
    return trimFrame(setup.captureCharFrame()).split("\n")
  }
  const dispose = () => {
    island.dispose()
    setup.renderer.destroy()
  }
  return { setup, island, mapping, files, frame, dispose }
}
