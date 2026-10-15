import { Box } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { VimDiffView } from "../components/VimDiffView"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { createCursorState } from "../vim-diff/cursor-state"
import { parseDiff } from "../utils/diff-parser"
import type { DiffLineMappingOptions } from "../vim-diff/types"
import type { Comment, FileReviewStatus } from "../types"

/** Trailing spaces and blank rows are padding, and would make the literals unreadable. */
export function trimFrame(frame: string): string {
  return frame.split("\n").map((line) => line.trimEnd()).join("\n").replace(/\n+$/, "")
}

export interface MountDiffViewOptions {
  raw: string
  width?: number
  height?: number
  mode?: "single" | "all"
  selectedFileIndex?: number | null
  mappingOptions?: DiffLineMappingOptions
  comments?: Comment[]
  fileStatuses?: Map<string, FileReviewStatus>
  wrap?: boolean
}

/** VimDiffView under the one-row header the app gives it, as chrome.test.ts mounts it. */
export async function mountDiffView(options: MountDiffViewOptions) {
  const { raw, width = 80, height = 16, mode = "all", selectedFileIndex = null } = options
  const files = parseDiff(raw)
  const setup = await createTestRenderer({ width, height })

  const shell = Box(
    { id: "shell", width: "100%", height: "100%", flexDirection: "column" },
    Box({ id: "header", width: "100%", height: 1 })
  )
  setup.renderer.root.add(shell)

  const view = new VimDiffView({ renderer: setup.renderer })
  ;(setup.renderer.root.findDescendantById("shell") as unknown as { add: (c: unknown) => void })
    .add(view.getContainer())
  if (options.wrap) view.setWrap(true)
  const mapping = new DiffLineMapping(files, mode, selectedFileIndex ?? undefined, options.mappingOptions)
  const cursor = createCursorState()
  view.update(files, selectedFileIndex, mapping, cursor, options.comments ?? [], options.fileStatuses ?? new Map(), null, null)

  // Two passes: the first lays out, the second paints what the post-process overlays read off that layout.
  const frame = async () => {
    await setup.renderOnce()
    await setup.renderOnce()
    return trimFrame(setup.captureCharFrame())
  }
  const dispose = async () => {
    await setup.waitForVisualIdle().catch(() => {})
    view.destroy()
    setup.renderer.destroy()
  }
  return { view, mapping, files, cursor, frame, setup, dispose }
}
