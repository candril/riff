import { afterEach, beforeEach, expect, mock, setSystemTime } from "bun:test"
import { PRInfoPanelClass } from "../components/PRInfoPanel"
import type { PrCheck, PrInfo } from "../providers/github"
import type { PRInfoPanelSection } from "../state"
import type { Comment } from "../types"
import type { DiffFile } from "../utils/diff-parser"
import { mountRenderable, pinStdoutColumns } from "./frame"
import { checks, commits, conversationComments, prInfo, PR_NOW, reviews, reviewThreadComments } from "./pr-info"

export const PR_FILES: DiffFile[] = [
  { filename: "src/greet.ts", additions: 3, deletions: 1, status: "modified", content: "" },
  { filename: "src/farewell.ts", additions: 5, deletions: 0, status: "added", content: "" },
]

export const fullPr = (): PrInfo =>
  prInfo("Adds the **skill**.\n\nSecond line with `code`.", {
    reviews: reviews(),
    conversationComments: conversationComments(),
    checks: checks(),
    commits: commits(23),
  })

/** What markdown prose is drawn in: the markdown renderer's default, not theme.text. */
export const MARKDOWN_WHITE = "#ffffff"

/** Where `needle` first shows, as [column, row]. */
export function find(lines: string[], needle: string, from = 0): [number, number] {
  for (let y = from; y < lines.length; y++) {
    const x = lines[y]!.indexOf(needle)
    if (x >= 0) return [x, y]
  }
  throw new Error(`"${needle}" is not on screen`)
}

export interface MountPrInfoPanel {
  info?: PrInfo
  files?: DiffFile[]
  comments?: Comment[]
  height?: number
  /** process.stdout.columns while the panel is built and drawn, instead of the screen's width. */
  columns?: number
  /** Opened and made active before `prepare` runs. */
  section?: PRInfoPanelSection
  prepare?: (panel: PRInfoPanelClass) => void
}

/**
 * The PR info panel on a 120-wide screen, torn down after each test.
 *
 * The clock is frozen, since the times read `new Date()`, and
 * process.stdout.columns is pinned to the screen's width, since the panel
 * cuts its rows to the terminal's width rather than its own.
 *
 * Expanding a failing check whose annotations are not settled asks the app
 * for them. Every fixture check has them settled, so the panel is handed a
 * request that throws, and any test that slips fails.
 */
export function usePrInfoPanel() {
  const askedForAnnotations = mock((_check: PrCheck) => {
    throw new Error("a frame test asked for check annotations")
  })
  // A test can mount a second panel, as a refresh rebuilds one.
  let mounted: Awaited<ReturnType<typeof mountRenderable>>[] = []
  let panels: PRInfoPanelClass[] = []
  let restoreColumns: (() => void) | null = null

  beforeEach(() => {
    askedForAnnotations.mockClear()
    setSystemTime(PR_NOW)
    restoreColumns = pinStdoutColumns(120)
  })

  afterEach(async () => {
    for (const panel of panels) panel.destroy()
    panels = []
    for (const screen of mounted) await screen.dispose()
    mounted = []
    restoreColumns?.()
    setSystemTime()
    expect(askedForAnnotations).not.toHaveBeenCalled()
  })

  /** The panel showing `info`, after `section` is opened and `prepare` has run, as drawn. */
  return async function mount({
    info = fullPr(),
    files = PR_FILES,
    comments = reviewThreadComments(),
    height = 40,
    columns,
    section,
    prepare = () => {},
  }: MountPrInfoPanel = {}) {
    const restore = columns === undefined ? null : pinStdoutColumns(columns)
    try {
      let shown!: PRInfoPanelClass
      const screen = await mountRenderable(
        (renderer) => {
          shown = new PRInfoPanelClass(renderer, info, files, comments)
          shown.setOnOpenFailingCheck(askedForAnnotations)
          panels.push(shown)
          return shown.getContainer()
        },
        { width: 120, height }
      )
      mounted.push(screen)
      if (section) {
        shown.setActiveSection(section)
        shown.expandSection()
      }
      prepare(shown)
      const lines = (await screen.frame()).split("\n")
      return { lines, spans: screen.setup.captureSpans(), panel: shown, mounted: screen }
    } finally {
      restore?.()
    }
  }
}
