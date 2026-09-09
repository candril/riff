/**
 * VimDiffView - Diff view with vim-style navigation and character cursor
 * 
 * Class-based component using CodeRenderable + LineNumberRenderable for:
 * - Line-level highlighting (cursor line, selection, diff backgrounds)
 * - Character-level cursor (block cursor on current character)
 */

import {
  Box,
  Text,
  ScrollBox,
  h,
  CodeRenderable,
  LineNumberRenderable,
  SyntaxStyle,
  RGBA,
  BoxRenderable,
  TextRenderable,
  TextAttributes,
  type CliRenderer,
  type OptimizedBuffer,
  type ScrollBoxRenderable,
  type LineColorConfig,
  type LineSign,
  type SimpleHighlight,
} from "@opentui/core"
import { colors, theme } from "../theme"
import type { DiffFile } from "../utils/diff-parser"
import type { Comment, FileReviewStatus } from "../types"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import type { VimCursorState } from "../vim-diff/types"
import type { SearchState, IncrementalSearchMatch } from "../vim-diff/search-state"
import type { FlashState } from "../vim-diff/flash-state"
import type { FlashRegion } from "../vim-diff/flash-handler"
import { getSelectionRange } from "../vim-diff/cursor-state"

// Shared syntax style for diff rendering
let sharedSyntaxStyle: SyntaxStyle | null = null

function getSyntaxStyle(): SyntaxStyle {
  if (!sharedSyntaxStyle) {
    sharedSyntaxStyle = SyntaxStyle.fromStyles({
      // Code syntax highlighting
      keyword: { fg: RGBA.fromHex(theme.mauve) },
      string: { fg: RGBA.fromHex(theme.green) },
      number: { fg: RGBA.fromHex(theme.peach) },
      comment: { fg: RGBA.fromHex(theme.overlay0), italic: true },
      function: { fg: RGBA.fromHex(theme.blue) },
      type: { fg: RGBA.fromHex(theme.yellow) },
      variable: { fg: RGBA.fromHex(theme.text) },
      operator: { fg: RGBA.fromHex(theme.sky) },
      punctuation: { fg: RGBA.fromHex(theme.overlay2) },
      property: { fg: RGBA.fromHex(theme.lavender) },
      constant: { fg: RGBA.fromHex(theme.peach) },
      
      // Markdown syntax highlighting
      "markup.heading": { fg: RGBA.fromHex(theme.red), bold: true },
      "markup.heading.1": { fg: RGBA.fromHex(theme.red), bold: true },
      "markup.heading.2": { fg: RGBA.fromHex(theme.peach), bold: true },
      "markup.heading.3": { fg: RGBA.fromHex(theme.yellow), bold: true },
      "markup.heading.4": { fg: RGBA.fromHex(theme.green), bold: true },
      "markup.heading.5": { fg: RGBA.fromHex(theme.blue), bold: true },
      "markup.heading.6": { fg: RGBA.fromHex(theme.mauve), bold: true },
      "markup.strong": { fg: RGBA.fromHex(theme.text), bold: true },
      "markup.italic": { fg: RGBA.fromHex(theme.text), italic: true },
      "markup.strikethrough": { fg: RGBA.fromHex(theme.overlay0) },
      "markup.link": { fg: RGBA.fromHex(theme.blue) },
      "markup.link.url": { fg: RGBA.fromHex(theme.blue), underline: true },
      "markup.link.label": { fg: RGBA.fromHex(theme.lavender) },
      "markup.raw": { fg: RGBA.fromHex(theme.green) },
      "markup.raw.inline": { fg: RGBA.fromHex(theme.green) },
      "markup.raw.block": { fg: RGBA.fromHex(theme.green) },
      "markup.list": { fg: RGBA.fromHex(theme.blue) },
      "markup.quote": { fg: RGBA.fromHex(theme.overlay1), italic: true },
      
      // Search highlight styles
      "search.match": { bg: RGBA.fromHex(theme.yellow), fg: RGBA.fromHex(theme.base) },
      "search.current": { bg: RGBA.fromHex(theme.peach), fg: RGBA.fromHex(theme.base) },
    })
  }
  return sharedSyntaxStyle
}

/**
 * Compute character offsets for each line start in a content string.
 * Returns an array where index i = character offset where line i starts.
 */
function computeLineStartOffsets(content: string): number[] {
  const offsets: number[] = [0]
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') {
      offsets.push(i + 1)
    }
  }
  return offsets
}

/**
 * Convert visual line + column to character offset in content.
 * Returns -1 if out of bounds.
 */
function lineColToOffset(
  lineStartOffsets: number[],
  line: number,
  col: number,
  contentLength: number
): number {
  if (line < 0 || line >= lineStartOffsets.length) return -1
  const lineStart = lineStartOffsets[line]!
  const offset = lineStart + col
  return offset <= contentLength ? offset : -1
}

// Default background color (must provide both gutter and content to avoid Bun crash)
const defaultBg = theme.base

const SPACE_CODE_POINT = 32

/**
 * Columns of context kept between the cursor and the edge it is heading
 * for, so a horizontal move shows what comes next instead of stopping the
 * cursor dead on the last visible column (vim's `sidescrolloff`).
 */
const SIDE_SCROLL_OFF = 8

/** Fallback gutter background — the `bg` the gutter renderable is given. */
const gutterBg = RGBA.fromHex(theme.mantle)
const gutterFg = RGBA.fromHex(theme.overlay0)
const headerBg = RGBA.fromHex(theme.surface0)
const headerDimFg = RGBA.fromHex(theme.overlay1)
const headerFoldFg = RGBA.fromHex(theme.overlay0)
const headerViewedFg = RGBA.fromHex(theme.green)
const headerNameFg = RGBA.fromHex(theme.blue)
const headerAdditionsFg = RGBA.fromHex(theme.green)
const headerDeletionsFg = RGBA.fromHex(theme.red)

/** Parsed once per hex string — the overlay repaints every frame. */
const rgbaCache = new Map<string, RGBA>()
function rgba(color: string | RGBA): RGBA {
  if (typeof color !== "string") return color
  const cached = rgbaCache.get(color)
  if (cached) return cached
  const parsed = RGBA.fromHex(color)
  rgbaCache.set(color, parsed)
  return parsed
}

/** How far flash's backdrop pulls text towards the background it sits on. */
const FLASH_BACKDROP_STRENGTH = 0.7
const flashMatchFg = RGBA.fromHex(theme.text)
const flashMatchBg = RGBA.fromHex(theme.surface1)
const flashLabelFg = RGBA.fromHex(theme.base)
const flashLabelBg = RGBA.fromHex(theme.red)

/**
 * Fade a run of cells towards their own background, leaving the background
 * itself alone — the diff's add/delete tinting stays readable underneath.
 */
function dimCells(buffer: OptimizedBuffer, y: number, fromX: number, toX: number): void {
  const { fg, bg } = buffer.buffers
  for (let x = fromX; x < toX; x++) {
    const i = (y * buffer.width + x) * 4
    for (let channel = 0; channel < 3; channel++) {
      const at = i + channel
      fg[at] = fg[at]! + (bg[at]! - fg[at]!) * FLASH_BACKDROP_STRENGTH
    }
  }
}

/**
 * Repaint a cell in new colors, keeping the glyph the renderer already put
 * there. Reading the glyph back beats re-deriving it from the line mapping:
 * whatever is on screen is what gets highlighted.
 */
function recolorCell(buffer: OptimizedBuffer, x: number, y: number, fg: RGBA, bg: RGBA): void {
  const { char, attributes } = buffer.buffers
  const i = y * buffer.width + x
  const glyph = char[i]!
  buffer.drawChar(glyph === 0 ? SPACE_CODE_POINT : glyph, x, y, fg, bg, attributes[i]!)
}

/**
 * Represents a file section in all-files mode
 * Each section gets its own CodeRenderable for proper syntax highlighting
 */
interface FileSection {
  fileIndex: number
  filename: string
  filetype: string | undefined
  startLine: number  // global visual line index (inclusive)
  endLine: number    // global visual line index (inclusive)
  lineCount: number  // number of lines in this section (content only, excludes header)
  maxLineNumber: number  // largest source line number in the section (gutter width)
  additions: number
  deletions: number
  collapsed: boolean  // whether this file is collapsed (fold closed)
}

/**
 * One rendered row of the diff, resolved to screen coordinates.
 */
interface VisibleRow {
  /** Visual line index, or -1 for a row that holds no mapping line */
  line: number
  /** 0-indexed terminal row */
  screenY: number
  /** 0-indexed terminal column where the line's content starts */
  contentX: number
}

/**
 * Create a styled file header component
 * Clean, minimal design matching ReviewPreview style
 * Uses minWidth: "100%" to ensure all headers stretch to full width
 */
function FileHeader(props: { filename: string; additions: number; deletions: number; collapsed?: boolean; viewed?: boolean; nameId?: string }): ReturnType<typeof Box> {
  const { filename, additions, deletions, collapsed, viewed, nameId } = props
  
  // Fold indicator: > for collapsed, v for expanded
  const foldIcon = collapsed ? "▶" : "▼"
  // Viewed indicator: ✓ for viewed files
  const viewedIndicator = viewed ? "✓" : " "
  
  return Box(
    {
      minWidth: "100%",
      height: 1,
      flexDirection: "row",
      backgroundColor: theme.surface0,
      paddingX: 1,
      gap: 1,
    },
    // Fold indicator
    Text({ content: foldIcon, fg: collapsed ? theme.overlay1 : theme.overlay0 }),
    // Viewed indicator
    Text({ content: viewedIndicator, fg: viewed ? theme.green : theme.overlay0 }),
    // Filename (dimmed if viewed). The id lets flash find the column the
    // path actually starts at — it is a jump target in the all-files view.
    Text({ id: nameId, content: filename, fg: viewed ? theme.overlay1 : theme.blue }),
    // Stats
    Text({ content: `+${additions}`, fg: theme.green }),
    Text({ content: `-${deletions}`, fg: theme.red }),
  )
}

export interface VimDiffViewOptions {
  renderer: CliRenderer
}

/**
 * VimDiffView class - manages diff rendering with vim cursor
 */
export class VimDiffView {
  private renderer: CliRenderer
  private container: BoxRenderable
  private scrollBox: ScrollBoxRenderable | null = null
  private lineNumberRenderable: LineNumberRenderable | null = null
  private codeRenderable: CodeRenderable | null = null
  
  // Current state
  private files: DiffFile[] = []
  private selectedFileIndex: number | null = null
  private lineMapping: DiffLineMapping | null = null
  private cursorState: VimCursorState | null = null
  private comments: Comment[] = []
  private fileStatuses: Map<string, FileReviewStatus> = new Map()
  private loadingFiles: Set<string> = new Set()
  private searchState: SearchState | null = null
  private flashState: FlashState | null = null
  
  // Last cursor position for highlight removal
  private lastCursorLine: number = -1
  private lastCursorCol: number = -1
  
  // Post-process function for cursor positioning
  private cursorPostProcess: ((buffer: any, deltaTime: number) => void) | null = null
  
  // Track renderer dimensions to detect resize
  private lastRendererWidth: number = 0
  private lastRendererHeight: number = 0
  
  // Visibility state - when false, hide cursor
  private visible: boolean = true
  // When true, positionTerminalCursor leaves the cursor alone — used so
  // an active text input (e.g. inline comment composer) can own the
  // terminal cursor without being clobbered by the diff post-process.
  private suspendCursor: boolean = false

  // File sections for all-files mode (multi-renderable architecture)
  private fileSections: FileSection[] = []
  // Map of section index -> renderables
  private sectionRenderables: Map<number, { lineNumber: LineNumberRenderable; code: CodeRenderable }> = new Map()
  
  // Track gutter width for cursor positioning (set during rebuild)
  private gutterMinWidth: number = 4
  // Track max line number for correct gutter width calculation
  private maxLineNumber: number = 0
  
  // Expected scroll position - set by external scroll logic to avoid stale reads
  // When set, positionTerminalCursor uses this instead of scrollBox.scrollTop
  private expectedScrollTop: number | null = null

  // Scroll preservation across content rebuilds (folds, mark-as-read,
  // comments). A rebuild() throws away the old scrollBox and creates a
  // fresh one at scrollTop=0, which makes the view jump to the top. We
  // capture the previous scrollTop here and re-apply it in the
  // post-process pass — the only point where the new scrollBox's layout
  // (and therefore its clamping range) is settled. `pendingCursorReveal`
  // then runs the cursor-reveal callback so a moved cursor is brought back
  // into view after the scroll is restored.
  private pendingScrollTop: number | null = null
  private pendingCursorReveal: boolean = false
  private onContentRebuilt: (() => void) | null = null
  
  // Line data mirrored out of the last build so the pinned gutter can
  // repaint from it every frame — rebuilding these per frame would walk
  // the whole mapping on every keystroke.
  private lineNumbersCache: Map<number, number> = new Map()
  private hideLineNumbersCache: Set<number> = new Set()
  private lineSignsCache: Map<number, LineSign> = new Map()
  private lineColorsCache: Map<number, LineColorConfig> = new Map()
  /** Display width of each mapping line's content; 0 where nothing is drawn. */
  private lineWidths: number[] = []

  // Sticky file header - shows current file name when its header scrolls out of view
  private stickyHeaderBox: BoxRenderable | null = null
  private stickyHeaderFoldText: TextRenderable | null = null
  private stickyHeaderViewedText: TextRenderable | null = null
  private stickyHeaderFilenameText: TextRenderable | null = null
  private stickyHeaderAdditionsText: TextRenderable | null = null
  private stickyHeaderDeletionsText: TextRenderable | null = null
  private lastStickyFileIndex: number = -1

  constructor(options: VimDiffViewOptions) {
    this.renderer = options.renderer
    
    // Create container using BoxRenderable directly
    this.container = new BoxRenderable(this.renderer, {
      id: "vim-diff-view",
      width: "100%",
      height: "100%",
    })
    
    // Initialize dimensions
    this.lastRendererWidth = this.renderer.width
    this.lastRendererHeight = this.renderer.height
    
    // Register post-process function to position cursor after each render
    this.cursorPostProcess = (buffer) => {
      // Check if renderer dimensions changed (resize occurred)
      if (this.renderer.width !== this.lastRendererWidth ||
          this.renderer.height !== this.lastRendererHeight) {
        this.lastRendererWidth = this.renderer.width
        this.lastRendererHeight = this.renderer.height
        // Dimensions changed - recalculate on next frame to allow layout to settle
      }
      // After a content rebuild, restore the previous scroll position and
      // reveal the cursor now that the new scrollBox has laid out. Doing
      // this here (rather than synchronously in rebuild()) means scrollTop
      // clamps against the real content height instead of snapping to 0.
      if (this.pendingScrollTop !== null && this.scrollBox) {
        this.scrollBox.scrollTop = this.pendingScrollTop
        this.pendingScrollTop = null
      }
      if (this.pendingCursorReveal) {
        this.pendingCursorReveal = false
        this.onContentRebuilt?.()
      }
      // Read the scroll position before positionTerminalCursor consumes
      // `expectedScrollTop` — the flash overlay has to line up with the
      // cursor, so both must resolve the viewport the same way.
      const scrollTop = this.expectedScrollTop ?? this.scrollBox?.scrollTop ?? 0
      this.positionTerminalCursor()

      const scrolledSideways = (this.scrollBox?.scrollLeft ?? 0) > 0
      const rows = this.visible && (scrolledSideways || (this.flashState?.active ?? false))
        ? this.visibleRows(scrollTop)
        : []
      this.renderGutterOverlay(buffer, rows)
      this.renderFlashOverlay(buffer, rows)
    }
    this.renderer.addPostProcessFn(this.cursorPostProcess)
  }

  /**
   * Get the container element to add to the layout
   */
  getContainer(): BoxRenderable {
    return this.container
  }

  /**
   * Format a divider line for display
   * Creates an attractive collapsed context indicator with loading state
   */
  private formatDivider(lineCount: string, filename: string): string {
    const isLoading = this.loadingFiles.has(filename)
    
    if (isLoading) {
      // Loading state - spinner with context
      return `⟳ Expanding ${lineCount}...`
    }
    
    // Collapsed state - clean, minimal fold indicator
    return `▸ ${lineCount}`
  }

  /**
   * Check if two sets have the same contents
   */
  private setsEqual(a: Set<string>, b: Set<string>): boolean {
    if (a.size !== b.size) return false
    for (const item of a) {
      if (!b.has(item)) return false
    }
    return true
  }

  /**
   * Update the view with new data
   */
  update(
    files: DiffFile[],
    selectedFileIndex: number | null,
    lineMapping: DiffLineMapping,
    cursorState: VimCursorState,
    comments: Comment[],
    fileStatuses?: Map<string, FileReviewStatus>,
    loadingFiles?: Set<string>,
    searchState?: SearchState | null
  ): void {
    const newLoadingFiles = loadingFiles ?? new Set()
    const loadingChanged = !this.setsEqual(this.loadingFiles, newLoadingFiles)
    
    const contentChanged = 
      this.files !== files || 
      this.selectedFileIndex !== selectedFileIndex ||
      this.lineMapping !== lineMapping ||
      this.fileStatuses !== fileStatuses ||
      loadingChanged
    
    const commentsChanged = this.comments !== comments
    const searchChanged = this.searchState !== searchState

    this.files = files
    this.selectedFileIndex = selectedFileIndex
    this.lineMapping = lineMapping
    this.cursorState = cursorState
    this.comments = comments
    this.fileStatuses = fileStatuses ?? new Map()
    this.loadingFiles = newLoadingFiles
    this.searchState = searchState ?? null

    if (contentChanged) {
      // Full rebuild needed
      this.rebuild()
      // After rebuild, set up search highlights if we have a search
      if (this.searchState && this.searchState.matches.length > 0) {
        this.updateSearchHighlights()
      }
    } else if (commentsChanged || searchChanged) {
      // Comments or search changed - update line signs, highlights, and search
      this.updateLineSigns()
      this.updateHighlights()
      this.updateSearchHighlights()
    } else {
      // Just update cursor/selection highlighting
      this.updateHighlights()
    }
  }

  /**
   * Update just the cursor position (fast path)
   */
  updateCursor(cursorState: VimCursorState): void {
    this.cursorState = cursorState
    this.updateHighlights()
  }

  /**
   * Get the scroll box for scrolling control
   */
  getScrollBox(): ScrollBoxRenderable | null {
    return this.scrollBox
  }

  /**
   * Set visibility - when false, hides the cursor
   */
  setVisible(visible: boolean): void {
    this.visible = visible
    if (!visible) {
      // Hide cursor immediately when becoming invisible
      this.renderer.setCursorPosition(0, 0, false)
    }
  }

  /**
   * Set expected scroll position for cursor positioning.
   * This is used to avoid reading stale scrollTop values from the scrollBox
   * when the scroll position was just changed by ensureCursorVisible().
   */
  setExpectedScrollTop(scrollTop: number): void {
    this.expectedScrollTop = scrollTop
  }

  /**
   * Clear the expected scroll position, reverting to reading from scrollBox.
   */
  clearExpectedScrollTop(): void {
    this.expectedScrollTop = null
  }

  /**
   * Register a callback invoked after a content rebuild, once the new
   * scrollBox has laid out (in the post-process pass). The app wires this
   * to `ensureCursorVisible()` so that operations which rebuild the diff
   * (fold toggle, mark-as-read, comments) keep the cursor in view instead
   * of snapping the viewport to the top.
   */
  setOnContentRebuilt(cb: () => void): void {
    this.onContentRebuilt = cb
  }

  /**
   * Convert a cursor line (mapping index) to the visual row in the scrollbox.
   * In single-file mode, the visual row equals the cursor line.
   * In all-files mode, file headers are separate components, and collapsed
   * files take only 1 row (the header), so the visual row may differ.
   * Returns -1 if the line is not found.
   */
  cursorLineToVisualRow(cursorLine: number): number {
    // Single-file mode: 1:1 mapping
    if (this.fileSections.length === 0) {
      return cursorLine
    }

    // All-files mode: calculate visual row accounting for headers and collapsed sections
    let screenRow = 0
    for (const section of this.fileSections) {
      const headerRow = 1 // FileHeader component is always 1 row

      // Find the header line for this section
      let headerLineInMapping = -1
      if (this.lineMapping) {
        for (let i = 0; i < this.lineMapping.lineCount; i++) {
          const mappingLine = this.lineMapping.getLine(i)
          if (mappingLine?.type === "file-header" && mappingLine.fileIndex === section.fileIndex) {
            headerLineInMapping = i
            break
          }
        }
      }

      if (headerLineInMapping === -1) continue

      // Cursor is on this file's header
      if (cursorLine === headerLineInMapping) {
        return screenRow
      }

      if (section.collapsed) {
        // Collapsed: just the header row
        screenRow += headerRow
        continue
      }

      // Expanded: check if cursor is in this section's content
      if (cursorLine >= section.startLine && cursorLine <= section.endLine) {
        const localLine = cursorLine - section.startLine
        return screenRow + headerRow + localLine
      }

      // Skip past this section
      const sectionContentLines = Math.max(0, section.endLine - section.startLine + 1)
      screenRow += headerRow + sectionContentLines
    }

    return -1
  }

  /**
   * Build file sections from line mapping (for all-files mode)
   * Groups consecutive lines by fileIndex into sections
   */
  private buildFileSections(): FileSection[] {
    if (!this.lineMapping) return []
    
    const sections: FileSection[] = []
    let currentSection: FileSection | null = null
    
    for (let i = 0; i < this.lineMapping.lineCount; i++) {
      const line = this.lineMapping.getLine(i)
      if (!line) continue
      
      // File header marks the start of a new section
      if (line.type === "file-header" && line.fileIndex !== undefined && line.filename) {
        // Save previous section
        if (currentSection) {
          currentSection.endLine = i - 1
          currentSection.lineCount = currentSection.endLine - currentSection.startLine
          sections.push(currentSection)
        }
        
        // Start new section (content starts after the header)
        const file = this.files[line.fileIndex]
        currentSection = {
          fileIndex: line.fileIndex,
          filename: line.filename,
          filetype: getFiletypeFromPath(line.filename),
          startLine: i + 1,  // Content starts after header
          endLine: i + 1,    // Will be updated
          lineCount: 0,
          maxLineNumber: 0,
          additions: file?.additions ?? 0,
          deletions: file?.deletions ?? 0,
          collapsed: line.isCollapsed ?? false,
        }
      }
    }
    
    // Save last section
    if (currentSection) {
      currentSection.endLine = this.lineMapping.lineCount - 1
      currentSection.lineCount = currentSection.endLine - currentSection.startLine + 1
      sections.push(currentSection)
    }

    for (const section of sections) {
      for (let i = section.startLine; i <= section.endLine; i++) {
        const line = this.lineMapping.getLine(i)
        const lineNum = line?.newLineNum ?? line?.oldLineNum
        if (lineNum !== undefined && lineNum > section.maxLineNumber) {
          section.maxLineNumber = lineNum
        }
      }
    }

    return sections
  }

  /**
   * Rebuild the entire view
   */
  private rebuild(): void {
    // Capture the outgoing scroll position before the old scrollBox is
    // discarded. It's re-applied in the post-process pass once the new
    // scrollBox has laid out (see cursorPostProcess), so content changes
    // don't snap the viewport back to the top.
    const prevScrollTop = this.scrollBox?.scrollTop ?? null

    // Clear container and section renderables
    for (const child of this.container.getChildren()) {
      this.container.remove(child.id)
    }
    this.sectionRenderables.clear()
    this.fileSections = []
    // Clear sticky header references (the box was already removed above)
    this.stickyHeaderBox = null
    this.stickyHeaderFoldText = null
    this.stickyHeaderViewedText = null
    this.stickyHeaderFilenameText = null
    this.stickyHeaderAdditionsText = null
    this.stickyHeaderDeletionsText = null
    this.lastStickyFileIndex = -1

    // Handle empty state
    if (this.files.length === 0 || !this.lineMapping || this.lineMapping.lineCount === 0) {
      this.container.add(
        Box(
          {
            width: "100%",
            height: "100%",
            justifyContent: "center",
            alignItems: "center",
          },
          Text({ content: this.emptyMessage, fg: colors.textDim })
        )
      )
      this.scrollBox = null
      this.lineNumberRenderable = null
      this.codeRenderable = null
      return
    }

    this.buildLineWidths()

    // Determine mode: single file or all files
    const isAllFilesMode = this.selectedFileIndex === null

    if (isAllFilesMode) {
      this.rebuildAllFilesMode()
    } else {
      this.rebuildSingleFileMode()
    }

    // Defer scroll restoration + cursor reveal to the post-process pass,
    // where the freshly-built scrollBox has a settled layout (and thus a
    // valid clamp range). Without this, the new scrollBox stays at
    // scrollTop=0 and the view jumps to the top on every content change.
    this.pendingScrollTop = prevScrollTop
    this.pendingCursorReveal = true
  }

  /**
   * Rebuild for single file mode (original implementation)
   */
  private rebuildSingleFileMode(): void {
    // Build content
    const content = this.buildDiffContent()
    const filetype = this.getFiletype()
    const lineColors = this.buildLineColors()
    const lineSigns = this.buildLineSigns()
    const { lineNumbers, hideLineNumbers } = this.buildLineNumbers()
    
    // Calculate gutter width based on max line number
    let maxLineNum = 0
    for (const lineNum of lineNumbers.values()) {
      if (lineNum > maxLineNum) maxLineNum = lineNum
    }
    this.maxLineNumber = maxLineNum
    this.gutterMinWidth = Math.max(4, String(maxLineNum).length)

    // Create the component tree using h()
    const scrollBoxElement = ScrollBox(
      {
        id: "diff-scroll",
        width: "100%",
        height: "100%",
        scrollY: true,
        scrollX: true,
        verticalScrollbarOptions: {
          showArrows: false,
          trackOptions: {
            backgroundColor: theme.surface0,
            foregroundColor: theme.surface2,
          },
        },
      },
      h(LineNumberRenderable, {
        id: "diff-line-numbers",
        fg: theme.overlay0,
        bg: theme.mantle,
        showLineNumbers: true,
        lineColors,
        lineSigns,
        lineNumbers,
        hideLineNumbers,
        minWidth: this.gutterMinWidth,
        paddingRight: 1,
      },
        h(CodeRenderable, {
          id: "diff-code",
          content,
          filetype,
          syntaxStyle: getSyntaxStyle(),
          drawUnstyledText: true,
          conceal: false,
          wrapMode: "none",  // Disable line wrapping - use horizontal scroll instead
        })
      )
    )

    this.container.add(scrollBoxElement)

    // Get references to the renderables for later updates
    this.scrollBox = this.container.findDescendantById("diff-scroll") as ScrollBoxRenderable | null
    this.hideHorizontalScrollbar()
    this.lineNumberRenderable = this.container.findDescendantById("diff-line-numbers") as LineNumberRenderable | null
    this.codeRenderable = this.container.findDescendantById("diff-code") as CodeRenderable | null
  }

  /**
   * Rebuild for all-files mode with per-file syntax highlighting
   */
  private rebuildAllFilesMode(): void {
    // Build file sections
    this.fileSections = this.buildFileSections()
    
    // Build global data structures
    const globalLineColors = this.buildLineColors()
    const globalLineSigns = this.buildLineSigns()
    const { lineNumbers: globalLineNumbers, hideLineNumbers: globalHideLineNumbers } = this.buildLineNumbers()
    
    // Calculate consistent gutter width across all sections
    // Find the maximum line number to determine digit count
    let maxLineNum = 0
    for (const lineNum of globalLineNumbers.values()) {
      if (lineNum > maxLineNum) maxLineNum = lineNum
    }
    // Store max line number for cursor positioning
    this.maxLineNumber = maxLineNum
    // Minimum 4 digits to match single-file mode
    this.gutterMinWidth = Math.max(4, String(maxLineNum).length)
    
    // Create section elements
    const sectionElements: ReturnType<typeof Box>[] = []
    
    for (let sectionIdx = 0; sectionIdx < this.fileSections.length; sectionIdx++) {
      const section = this.fileSections[sectionIdx]!
      
      // Build content for this section only
      const content = this.buildSectionContent(section)
      
      // Convert global line indices to section-local indices
      const localLineColors = new Map<number, LineColorConfig>()
      const localLineSigns = new Map<number, LineSign>()
      const localLineNumbers = new Map<number, number>()
      const localHideLineNumbers = new Set<number>()
      
      for (let globalLine = section.startLine; globalLine <= section.endLine; globalLine++) {
        const localLine = globalLine - section.startLine
        
        const color = globalLineColors.get(globalLine)
        if (color) localLineColors.set(localLine, color)
        
        const sign = globalLineSigns.get(globalLine)
        if (sign) localLineSigns.set(localLine, sign)
        
        const lineNum = globalLineNumbers.get(globalLine)
        if (lineNum !== undefined) localLineNumbers.set(localLine, lineNum)
        
        if (globalHideLineNumbers.has(globalLine)) {
          localHideLineNumbers.add(localLine)
        }
      }
      
      // Always add a placeholder sign on line 0 to reserve sign column width
      // This ensures consistent gutter width across all sections
      if (!localLineSigns.has(0)) {
        localLineSigns.set(0, { before: " " })
      }
      
      // Create file header + code section
      // For collapsed files, only show the header
      let sectionElement: ReturnType<typeof Box>
      
      // Check if this file is viewed
      const isViewed = this.fileStatuses.get(section.filename)?.viewed ?? false
      
      if (section.collapsed) {
        // Collapsed file - just show header
        sectionElement = Box(
          {
            id: `section-${sectionIdx}`,
            width: "100%",
            flexDirection: "column",
          },
          FileHeader({
            filename: section.filename,
            additions: section.additions,
            deletions: section.deletions,
            collapsed: true,
            viewed: isViewed,
            nameId: `section-${sectionIdx}-name`,
          }),
        )
      } else {
        // Expanded file - show header + code content
        sectionElement = Box(
          {
            id: `section-${sectionIdx}`,
            width: "100%",
            flexDirection: "column",
          },
          // File header
          FileHeader({
            filename: section.filename,
            additions: section.additions,
            deletions: section.deletions,
            collapsed: false,
            viewed: isViewed,
            nameId: `section-${sectionIdx}-name`,
          }),
          // Code content
          h(LineNumberRenderable, {
            id: `line-numbers-${sectionIdx}`,
            fg: theme.overlay0,
            bg: theme.mantle,
            showLineNumbers: true,
            lineColors: localLineColors,
            lineSigns: localLineSigns,
            lineNumbers: localLineNumbers,
            hideLineNumbers: localHideLineNumbers,
            minWidth: this.gutterMinWidth,
            paddingRight: 1,
          },
            h(CodeRenderable, {
              id: `code-${sectionIdx}`,
              content,
              filetype: section.filetype,
              syntaxStyle: getSyntaxStyle(),
              drawUnstyledText: true,
              conceal: false,
              wrapMode: "none",  // Disable line wrapping - use horizontal scroll instead
            })
          )
        )
      }
      
      sectionElements.push(sectionElement)
    }
    
    // Create scroll container with all sections
    const scrollBoxElement = ScrollBox(
      {
        id: "diff-scroll",
        width: "100%",
        height: "100%",
        scrollY: true,
        scrollX: true,
        verticalScrollbarOptions: {
          showArrows: false,
          trackOptions: {
            backgroundColor: theme.surface0,
            foregroundColor: theme.surface2,
          },
        },
      },
      Box(
        {
          id: "sections-container",
          width: "100%",
          flexDirection: "column",
        },
        ...sectionElements
      )
    )
    
    this.container.add(scrollBoxElement)
    
    // Get references
    this.scrollBox = this.container.findDescendantById("diff-scroll") as ScrollBoxRenderable | null
    this.hideHorizontalScrollbar()
    
    // Store section renderables for updates
    for (let sectionIdx = 0; sectionIdx < this.fileSections.length; sectionIdx++) {
      const lineNumber = this.container.findDescendantById(`line-numbers-${sectionIdx}`) as LineNumberRenderable | null
      const code = this.container.findDescendantById(`code-${sectionIdx}`) as CodeRenderable | null
      if (lineNumber && code) {
        this.sectionRenderables.set(sectionIdx, { lineNumber, code })
      }
    }
    
    // For single-file compat, set main renderable to null in all-files mode
    this.lineNumberRenderable = null
    this.codeRenderable = null
    
    // Create sticky file header overlay (positioned absolutely over the scroll area)
    this.createStickyHeader()
  }

  /**
   * Drop the horizontal scrollbar.
   *
   * One long line anywhere in the diff makes the content wider than the
   * viewport, and the bar then sits across the bottom of every file for
   * the rest of the review — a row of screen spent on a control nobody
   * drags, in OpenTUI's default grey rather than the diff's palette.
   * Hiding it sets `display: none` on the bar, so the row goes back to
   * the diff; `scrollLeft` is untouched by its visibility.
   */
  private hideHorizontalScrollbar(): void {
    if (this.scrollBox) {
      this.scrollBox.horizontalScrollBar.visible = false
    }
  }

  /**
   * Build content string for a single section
   */
  private buildSectionContent(section: FileSection): string {
    if (!this.lineMapping) return ""
    
    const lines: string[] = []
    for (let i = section.startLine; i <= section.endLine; i++) {
      const line = this.lineMapping.getLine(i)
      if (!line) continue

      switch (line.type) {
        case "file-header":
          // Skip - handled by FileHeader component
          break
        case "hunk-header":
          lines.push(line.content)
          break
        case "divider":
          // Collapsed context - use formatted divider with loading state
          const divLabel = line.content || "..."
          const divFilename = line.filename ?? ""
          lines.push(this.formatDivider(divLabel, divFilename))
          break
        case "addition":
        case "deletion":
        case "context":
          lines.push(line.content)
          break
        case "no-newline":
          lines.push(line.content)
          break
        case "spacing":
          lines.push("")
          break
      }
    }
    return lines.join("\n")
  }

  /**
   * Update line colors without full rebuild
   */
  private updateHighlights(): void {
    if (!this.lineMapping || !this.cursorState) return

    const globalLineColors = this.buildLineColors()
    
    // Single-file mode
    if (this.lineNumberRenderable) {
      this.lineNumberRenderable.setLineColors(globalLineColors)
      return
    }
    
    // All-files mode - update each section's renderables
    let anyUpdated = false
    for (let sectionIdx = 0; sectionIdx < this.fileSections.length; sectionIdx++) {
      const section = this.fileSections[sectionIdx]!
      const renderables = this.sectionRenderables.get(sectionIdx)
      if (!renderables) continue
      
      // Convert global line indices to section-local indices
      const localLineColors = new Map<number, LineColorConfig>()
      for (let globalLine = section.startLine; globalLine <= section.endLine; globalLine++) {
        const localLine = globalLine - section.startLine
        const color = globalLineColors.get(globalLine)
        if (color) localLineColors.set(localLine, color)
      }
      
      renderables.lineNumber.setLineColors(localLineColors)
      anyUpdated = true
    }
    
    // If no renderables were updated (e.g. all files collapsed), we still need
    // a render cycle so positionTerminalCursor runs and updates the cursor
    if (!anyUpdated) {
      this.renderer.requestRender()
    }
  }

  /**
   * Update search character highlights on CodeRenderable(s)
   * Uses the onHighlight callback to inject search match highlights
   */
  private updateSearchHighlights(): void {
    if (!this.searchState || this.searchState.matches.length === 0) {
      // Clear search highlights by setting onHighlight to undefined
      if (this.codeRenderable) {
        this.codeRenderable.onHighlight = undefined
      }
      for (const renderables of this.sectionRenderables.values()) {
        renderables.code.onHighlight = undefined
      }
      return
    }

    const searchState = this.searchState

    // Single-file mode
    if (this.codeRenderable) {
      this.codeRenderable.onHighlight = (highlights, context) => {
        return this.injectSearchHighlights(
          highlights,
          context.content,
          searchState,
          0 // No line offset in single-file mode
        )
      }
      return
    }

    // All-files mode - set onHighlight for each section
    for (let sectionIdx = 0; sectionIdx < this.fileSections.length; sectionIdx++) {
      const section = this.fileSections[sectionIdx]!
      const renderables = this.sectionRenderables.get(sectionIdx)
      if (!renderables) continue

      const lineOffset = section.startLine
      renderables.code.onHighlight = (highlights, context) => {
        return this.injectSearchHighlights(
          highlights,
          context.content,
          searchState,
          lineOffset
        )
      }
    }
  }

  /**
   * Inject search match highlights into the highlights array
   */
  private injectSearchHighlights(
    highlights: SimpleHighlight[],
    content: string,
    searchState: SearchState,
    lineOffset: number
  ): SimpleHighlight[] {
    const lineStartOffsets = computeLineStartOffsets(content)
    const result = [...highlights]

    for (let i = 0; i < searchState.matches.length; i++) {
      const match = searchState.matches[i]!
      // Convert global visual line to local line within this content
      const localLine = match.line - lineOffset
      
      // Skip if match is not in this section
      if (localLine < 0 || localLine >= lineStartOffsets.length) continue

      const startOffset = lineColToOffset(lineStartOffsets, localLine, match.startCol, content.length)
      const endOffset = lineColToOffset(lineStartOffsets, localLine, match.endCol, content.length)

      if (startOffset < 0 || endOffset < 0) continue

      // Use current match scope if this is the current match
      const scope = i === searchState.currentMatchIndex ? "search.current" : "search.match"
      
      // Add highlight - SimpleHighlight format: [start, end, scope, metadata?]
      result.push([startOffset, endOffset, scope])
    }

    return result
  }

  /**
   * Update line signs (comment indicators) without full rebuild
   */
  private updateLineSigns(): void {
    const globalLineSigns = this.buildLineSigns()
    
    // Single-file mode
    if (this.lineNumberRenderable) {
      this.lineNumberRenderable.setLineSigns(globalLineSigns)
      return
    }
    
    // All-files mode - update each section's renderables
    for (let sectionIdx = 0; sectionIdx < this.fileSections.length; sectionIdx++) {
      const section = this.fileSections[sectionIdx]!
      const renderables = this.sectionRenderables.get(sectionIdx)
      if (!renderables) continue
      
      // Convert global line indices to section-local indices
      const localLineSigns = new Map<number, LineSign>()
      for (let globalLine = section.startLine; globalLine <= section.endLine; globalLine++) {
        const localLine = globalLine - section.startLine
        const sign = globalLineSigns.get(globalLine)
        if (sign) localLineSigns.set(localLine, sign)
      }
      
      renderables.lineNumber.setLineSigns(localLineSigns)
    }
  }

  /**
   * Create the sticky file header overlay.
   * This is an absolutely-positioned box at the top of the container
   * that shows the current file's header when it scrolls out of view.
   */
  private createStickyHeader(): void {
    // Remove old sticky header if present
    this.destroyStickyHeader()
    
    this.stickyHeaderBox = new BoxRenderable(this.renderer, {
      id: "sticky-file-header",
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: 1,
      flexDirection: "row",
      backgroundColor: theme.surface0,
      paddingLeft: 1,
      gap: 1,
      zIndex: 10,
    })
    this.stickyHeaderBox.visible = false
    
    // Fold indicator
    this.stickyHeaderFoldText = new TextRenderable(this.renderer, {
      id: "sticky-header-fold",
      content: "▼",
      fg: theme.overlay0,
    })
    this.stickyHeaderBox.add(this.stickyHeaderFoldText)
    
    // Viewed indicator
    this.stickyHeaderViewedText = new TextRenderable(this.renderer, {
      id: "sticky-header-viewed",
      content: " ",
      fg: theme.overlay0,
    })
    this.stickyHeaderBox.add(this.stickyHeaderViewedText)
    
    // Filename
    this.stickyHeaderFilenameText = new TextRenderable(this.renderer, {
      id: "sticky-header-filename",
      content: "",
      fg: theme.blue,
    })
    this.stickyHeaderBox.add(this.stickyHeaderFilenameText)
    
    // Additions
    this.stickyHeaderAdditionsText = new TextRenderable(this.renderer, {
      id: "sticky-header-additions",
      content: "",
      fg: theme.green,
    })
    this.stickyHeaderBox.add(this.stickyHeaderAdditionsText)
    
    // Deletions
    this.stickyHeaderDeletionsText = new TextRenderable(this.renderer, {
      id: "sticky-header-deletions",
      content: "",
      fg: theme.red,
    })
    this.stickyHeaderBox.add(this.stickyHeaderDeletionsText)
    
    this.container.add(this.stickyHeaderBox)
    this.lastStickyFileIndex = -1
  }
  
  /**
   * Remove the sticky header from the container
   */
  private destroyStickyHeader(): void {
    if (this.stickyHeaderBox) {
      this.container.remove(this.stickyHeaderBox.id)
      this.stickyHeaderBox = null
      this.stickyHeaderFoldText = null
      this.stickyHeaderViewedText = null
      this.stickyHeaderFilenameText = null
      this.stickyHeaderAdditionsText = null
      this.stickyHeaderDeletionsText = null
      this.lastStickyFileIndex = -1
    }
  }
  
  /**
   * Compute which file section's header should be shown as sticky.
   * Returns the section whose header has scrolled above the viewport,
   * or null if the first file's header is still visible.
   */
  private computeStickySection(scrollTop: number): FileSection | null {
    if (this.fileSections.length === 0) return null
    
    let visualRow = 0
    let stickySection: FileSection | null = null
    
    for (const section of this.fileSections) {
      const headerRow = visualRow
      
      if (headerRow < scrollTop) {
        // This header is scrolled above the viewport
        stickySection = section
      } else {
        // This header is visible or below - stop looking
        break
      }
      
      // Advance past this section: 1 for header + content lines
      visualRow += 1  // header row
      if (!section.collapsed) {
        visualRow += section.lineCount
      }
    }
    
    return stickySection
  }
  
  /**
   * Update the sticky header visibility and content based on scroll position.
   * Called during post-process (every frame).
   */
  private updateStickyHeader(scrollTop: number): void {
    if (!this.stickyHeaderBox) return
    
    // Only show in all-files mode
    if (this.fileSections.length === 0 || this.selectedFileIndex !== null) {
      this.stickyHeaderBox.visible = false
      this.lastStickyFileIndex = -1
      return
    }
    
    const stickySection = this.computeStickySection(scrollTop)
    
    if (!stickySection) {
      // First file's header is still visible - hide sticky
      this.stickyHeaderBox.visible = false
      this.lastStickyFileIndex = -1
      return
    }
    
    // Show the sticky header
    this.stickyHeaderBox.visible = true
    
    // Only update text content if the file changed (avoid unnecessary updates)
    if (stickySection.fileIndex !== this.lastStickyFileIndex) {
      this.lastStickyFileIndex = stickySection.fileIndex
      
      const isViewed = this.fileStatuses.get(stickySection.filename)?.viewed ?? false
      
      this.stickyHeaderFoldText!.content = stickySection.collapsed ? "▶" : "▼"
      this.stickyHeaderFoldText!.fg = stickySection.collapsed ? theme.overlay1 : theme.overlay0
      
      this.stickyHeaderViewedText!.content = isViewed ? "✓" : " "
      this.stickyHeaderViewedText!.fg = isViewed ? theme.green : theme.overlay0
      
      this.stickyHeaderFilenameText!.content = stickySection.filename
      this.stickyHeaderFilenameText!.fg = isViewed ? theme.overlay1 : theme.blue
      
      this.stickyHeaderAdditionsText!.content = `+${stickySection.additions}`
      this.stickyHeaderDeletionsText!.content = `-${stickySection.deletions}`
    }
  }

  // Track whether file panel is visible (set via setFilePanelVisible)
  private filePanelVisible: boolean = true
  private filePanelWidth: number = 35

  private emptyMessage: string = "No changes to display"

  /**
   * What to show when there is nothing to render. A tree filter that matches
   * nothing empties the view, and "no changes" would read as a claim about
   * the diff rather than about the filter. Read at rebuild time, which a
   * filter change always triggers.
   */
  setEmptyMessage(message: string): void {
    this.emptyMessage = message
  }
  
  /**
   * Set file panel visibility (needed for cursor position calculation)
   */
  setFilePanelVisible(visible: boolean, width: number = 35): void {
    this.filePanelVisible = visible
    this.filePanelWidth = width
  }

  /**
   * When set, positionTerminalCursor becomes a no-op so another
   * renderable (e.g. a focused TextareaRenderable) can keep ownership
   * of the native terminal cursor it set during the render pass.
   */
  setSuspendCursor(suspend: boolean): void {
    this.suspendCursor = suspend
  }

  /**
   * Set flash jump state. Null (or an inactive state) removes the overlay.
   */
  setFlashState(flashState: FlashState | null): void {
    const next = flashState?.active ? flashState : null
    if (next === this.flashState) return
    this.flashState = next
    this.renderer.requestRender()
  }

  /**
   * The slice of the diff currently on screen, for flash to search.
   * Returns null when there is nothing rendered yet.
   */
  getVisibleRegion(): FlashRegion | null {
    if (!this.scrollBox) return null

    const scrollTop = this.expectedScrollTop ?? this.scrollBox.scrollTop
    const rows = this.visibleRows(scrollTop)
    if (rows.length === 0) return null

    // The gutter is per-file in all-files mode, so the widest one bounds the
    // column window that is certainly on screen for every visible row.
    const widestGutter = Math.max(...rows.map((row) => row.contentX))
    const scrollLeft = this.scrollBox.scrollLeft

    return {
      lines: rows.map((row) => row.line).filter((line) => line >= 0),
      startCol: scrollLeft,
      endCol: scrollLeft + Math.max(0, this.renderer.width - widestGutter),
    }
  }

  /**
   * Index of the section a mapping line belongs to, or null in
   * single-file mode. -1 when the line is a file header, which sits
   * between sections rather than inside one.
   */
  private sectionIndexForLine(line: number): number | null {
    if (this.fileSections.length === 0) return null
    return this.fileSections.findIndex((s) => line >= s.startLine && line <= s.endLine)
  }

  /**
   * The terminal columns the scrollable area occupies. Read off the
   * scrollbox's viewport rather than the container so the vertical
   * scrollbar's columns aren't counted as code.
   */
  private paneBounds(): { left: number; right: number } | null {
    const viewport = this.scrollBox?.viewport
    if (!viewport || viewport.width <= 0) return null
    return { left: viewport.x, right: viewport.x + viewport.width }
  }

  /**
   * The slice of a line the pane can show: `width` columns starting at
   * `firstCol`.
   *
   * The gutter scrolls away with the content, so it is repainted over the
   * pane's left edge (`renderGutterOverlay`). What that repaint covers is
   * exactly the columns already scrolled past, which is what makes the
   * visible window `[scrollLeft, scrollLeft + width)` at every scroll
   * position instead of drifting by the gutter's width.
   */
  private codeWindow(line: number): { firstCol: number; width: number; originX: number } | null {
    const bounds = this.paneBounds()
    if (!bounds || !this.scrollBox) return null

    const sectionIdx = this.sectionIndexForLine(line)
    const originX = this.sectionContentOriginX(sectionIdx)
    const width = bounds.right - originX
    if (width <= 0) return null

    return { firstCol: this.scrollBox.scrollLeft, width, originX }
  }

  /**
   * Unscrolled content origin for the section holding a line, falling
   * back to the estimate for the frames before layout settles and for
   * rows (file headers) that belong to no section.
   */
  private sectionContentOriginX(sectionIdx: number | null): number {
    const measured = sectionIdx === -1 ? null : this.contentOriginX(sectionIdx)
    if (measured !== null) return measured

    const orphan = sectionIdx === null || sectionIdx === -1
    return this.estimateContentOriginX(
      orphan ? this.lineMapping?.lineCount ?? 0 : this.fileSections[sectionIdx]!.lineCount,
      orphan ? this.maxLineNumber : this.fileSections[sectionIdx]!.maxLineNumber
    )
  }

  /**
   * Scroll horizontally until `col` is inside the window, keeping
   * SIDE_SCROLL_OFF columns of lookahead where the window is wide enough
   * to spare them. This is the horizontal half of the cursor reveal: the
   * diff never wraps, so without it `$`, `w` and a search match past the
   * right edge move the cursor somewhere the viewport isn't.
   */
  revealColumn(line: number, col: number): void {
    if (!this.scrollBox) return

    const window = this.codeWindow(line)
    if (!window) return

    const margin = Math.min(SIDE_SCROLL_OFF, Math.max(0, Math.floor(window.width / 2) - 1))

    if (col < window.firstCol + margin) {
      this.scrollBox.scrollLeft = Math.max(0, col - margin)
    } else if (col > window.firstCol + window.width - 1 - margin) {
      this.scrollBox.scrollLeft = col - window.width + 1 + margin
    }
  }

  /** Scroll the code window sideways by whole columns (`zh`, `zl`). */
  scrollColumnsBy(delta: number): void {
    if (!this.scrollBox) return
    this.scrollBox.scrollLeft = Math.max(0, this.scrollBox.scrollLeft + delta)
  }

  /** Half a code window, for the screen-wise scrolls (`zH`, `zL`). */
  halfColumnWindow(line: number): number {
    return Math.max(1, Math.floor((this.codeWindow(line)?.width ?? 2) / 2))
  }

  /** Put a column against the left (`zs`) or right (`ze`) edge. */
  scrollColumnToEdge(line: number, col: number, edge: "start" | "end"): void {
    if (!this.scrollBox) return
    const window = this.codeWindow(line)
    if (!window) return
    this.scrollBox.scrollLeft = edge === "start" ? col : Math.max(0, col - window.width + 1)
  }

  /**
   * The column closest to `col` that the window actually shows, so an
   * explicit horizontal scroll drags the cursor along instead of leaving
   * it off screen.
   */
  clampColumnToWindow(line: number, col: number): number {
    const window = this.codeWindow(line)
    if (!window) return col
    const lastOnLine = Math.max(0, (this.lineWidths[line] ?? 0) - 1)
    const clamped = Math.min(Math.max(col, window.firstCol), window.firstCol + window.width - 1)
    return Math.min(clamped, lastOnLine)
  }

  /**
   * Cursor column and total width for the status bar, or null when the
   * line fits the window and there is nothing worth reporting.
   */
  getColumnStatus(line: number, col: number): { col: number; total: number } | null {
    const total = this.lineWidths[line] ?? 0
    if (total === 0) return null
    const window = this.codeWindow(line)
    if (!window || total <= window.width) return null
    return { col: col + 1, total }
  }

  /**
   * Terminal column where a section's content starts, ignoring horizontal
   * scroll (callers subtract `scrollLeft` themselves).
   *
   * Read off the CodeRenderable rather than re-derived from the gutter
   * width: `.x` is absolute and already includes the scroll translate, so
   * adding `scrollLeft` back recovers the unscrolled origin. Recomputing
   * the gutter drifts from what OpenTUI actually laid out — it uses the
   * renderable's own `virtualLineCount` and sign widths, which riff can
   * only approximate — and every column on screen shifts with it.
   */
  /**
   * Terminal column where a section header's filename starts, unscrolled.
   * Read off the Text renderable for the same reason as `contentOriginX`:
   * re-deriving it from the header's padding and gaps drifts from what
   * OpenTUI laid out.
   */
  private headerNameOriginX(sectionIdx: number): number | null {
    const name = this.renderer.root.findDescendantById(`section-${sectionIdx}-name`)
    if (!name) return null
    const origin = name.x + (this.scrollBox?.scrollLeft ?? 0)
    return origin > 0 ? origin : null
  }

  private contentOriginX(sectionIdx: number | null): number | null {
    const code = sectionIdx === null
      ? this.codeRenderable
      : this.sectionRenderables.get(sectionIdx)?.code
    if (!code) return null
    const origin = code.x + (this.scrollBox?.scrollLeft ?? 0)
    return origin > 0 ? origin : null
  }

  /**
   * Fallback content origin for the frames before layout settles, using
   * OpenTUI's gutter formula: max(minWidth, digits + paddingRight + 1)
   * plus the sign column.
   */
  private estimateContentOriginX(lineCount: number, maxLineNumber: number): number {
    const maxLineNum = Math.max(lineCount, maxLineNumber)
    const digits = maxLineNum > 0 ? Math.floor(Math.log10(maxLineNum)) + 1 : 1
    const gutterWidth = Math.max(this.gutterMinWidth, digits + 1 + 1) + 1
    return (this.filePanelVisible ? this.filePanelWidth : 0) + gutterWidth
  }

  /**
   * Walk the on-screen rows, mapping each back to its visual line and to the
   * terminal cell where that line's first content column is drawn.
   * `line` is -1 for rows that hold no mapping line.
   */
  private visibleRows(scrollTop: number): VisibleRow[] {
    if (!this.scrollBox || !this.lineMapping) return []

    const viewportHeight = Math.floor(this.scrollBox.height)
    if (viewportHeight <= 0) return []

    // The app header owns terminal row 0; the scrollbox starts below it.
    const headerHeight = 1
    const rows: VisibleRow[] = []

    const push = (line: number, visualRow: number, contentX: number): void => {
      const visualLine = visualRow - scrollTop
      if (visualLine < 0 || visualLine >= viewportHeight) return
      rows.push({ line, screenY: headerHeight + visualLine, contentX })
    }

    // Single-file mode: visual rows and mapping lines are 1:1.
    if (this.fileSections.length === 0) {
      const contentX = this.contentOriginX(null)
        ?? this.estimateContentOriginX(this.lineMapping.lineCount, this.maxLineNumber)
      const first = Math.max(0, scrollTop)
      const last = Math.min(this.lineMapping.lineCount - 1, scrollTop + viewportHeight - 1)
      for (let line = first; line <= last; line++) {
        push(line, line, contentX)
      }
      return rows
    }

    // All-files mode: each section is a header row plus its content rows,
    // and a collapsed section contributes the header alone.
    let visualRow = 0
    for (let sectionIdx = 0; sectionIdx < this.fileSections.length; sectionIdx++) {
      if (visualRow - scrollTop >= viewportHeight) break
      const section = this.fileSections[sectionIdx]!

      const contentRows = section.collapsed
        ? 0
        : Math.max(0, section.endLine - section.startLine + 1)

      // Skip whole sections that scrolled off the top rather than walking
      // their lines — this runs every frame while flash is up.
      if (visualRow + 1 + contentRows <= scrollTop) {
        visualRow += 1 + contentRows
        continue
      }

      const contentX = this.contentOriginX(sectionIdx)
        ?? this.estimateContentOriginX(section.lineCount, section.maxLineNumber)
      // The header row's path sits left of the code gutter, so flash's
      // overlay needs that column, not the section's.
      push(section.startLine - 1, visualRow, this.headerNameOriginX(sectionIdx) ?? contentX)
      visualRow++

      for (let line = section.startLine; line < section.startLine + contentRows; line++) {
        if (visualRow - scrollTop >= viewportHeight) break
        push(line, visualRow, contentX)
        visualRow++
      }
    }

    return rows
  }

  /**
   * Repaint the gutter at the pane's left edge while scrolled sideways.
   *
   * The gutter renderable lives inside the scrolling content, so without
   * this the line numbers and comment signs slide out of view exactly
   * when a long line is being read. What the repaint covers is the
   * columns that have already scrolled past, so no code is lost — and it
   * is what makes the visible window start at `scrollLeft` rather than
   * `scrollLeft` minus the gutter's width (see `codeWindow`).
   */
  private renderGutterOverlay(buffer: OptimizedBuffer, rows: VisibleRow[]): void {
    const bounds = this.paneBounds()
    if (!bounds || !this.lineMapping) return
    if ((this.scrollBox?.scrollLeft ?? 0) <= 0) return

    const inSections = this.fileSections.length > 0

    for (const row of rows) {
      if (row.screenY >= buffer.height || row.line < 0) continue

      const line = this.lineMapping.getLine(row.line)
      if (inSections && line?.type === "file-header") {
        this.drawPinnedFileHeader(buffer, row, bounds)
        continue
      }

      const width = Math.min(row.contentX, bounds.right) - bounds.left
      if (width <= 0) continue

      const bg = rgba(this.lineColorsCache.get(row.line)?.gutter ?? gutterBg)
      buffer.fillRect(bounds.left, row.screenY, width, 1, bg)

      // Mirrors the gutter renderable's own layout: the sign occupies the
      // first column (riff reserves it on every section), and the line
      // number is right-aligned inside the remaining space, one column of
      // padding short of the code.
      const sign = this.lineSignsCache.get(row.line)
      if (sign?.before) {
        buffer.drawText(sign.before, bounds.left, row.screenY, rgba(sign.beforeColor ?? gutterFg), bg)
      }

      const lineNumber = this.lineNumbersCache.get(row.line)
      if (lineNumber !== undefined && !this.hideLineNumbersCache.has(row.line)) {
        const text = String(lineNumber)
        const x = bounds.left + width - text.length - 1
        if (x > bounds.left) {
          buffer.drawText(text, x, row.screenY, gutterFg, bg)
        }
      }
    }
  }

  /**
   * Redraw a file header's label at the pane's left edge. The header row
   * stretches to the content's width, so scrolling sideways otherwise
   * leaves a blank bar where the filename was.
   */
  private drawPinnedFileHeader(
    buffer: OptimizedBuffer,
    row: VisibleRow,
    bounds: { left: number; right: number }
  ): void {
    const section = this.fileSections.find((candidate) => candidate.startLine - 1 === row.line)
    if (!section) return

    const viewed = this.fileStatuses.get(section.filename)?.viewed ?? false
    buffer.fillRect(bounds.left, row.screenY, bounds.right - bounds.left, 1, headerBg)

    // paddingX + gap of the FileHeader component this stands in for.
    let x = bounds.left + 1
    const put = (text: string, fg: RGBA): void => {
      const room = bounds.right - x
      if (room <= 0) return
      buffer.drawText(text.slice(0, room), x, row.screenY, fg, headerBg)
      x += text.length + 1
    }

    put(section.collapsed ? "▶" : "▼", section.collapsed ? headerDimFg : headerFoldFg)
    put(viewed ? "✓" : " ", viewed ? headerViewedFg : headerFoldFg)
    put(section.filename, viewed ? headerDimFg : headerNameFg)
    put(`+${section.additions}`, headerAdditionsFg)
    put(`-${section.deletions}`, headerDeletionsFg)
  }

  /**
   * Draw flash's backdrop and jump labels straight onto the frame buffer.
   *
   * Overlaying here rather than restyling the content keeps the labels off
   * the CodeRenderable: no rebuild, no re-highlight, and a label can sit on
   * top of a character without shifting the columns the cursor is measured
   * against.
   */
  private renderFlashOverlay(buffer: OptimizedBuffer, rows: VisibleRow[]): void {
    const flash = this.flashState
    if (!flash?.active || !this.visible || !this.scrollBox) return
    if (rows.length === 0) return

    const rightEdge = Math.min(buffer.width, this.paneBounds()?.right ?? this.renderer.width)
    for (const row of rows) {
      if (row.screenY >= buffer.height) continue
      dimCells(buffer, row.screenY, Math.max(0, row.contentX), rightEdge)
    }

    const rowByLine = new Map(rows.map((row) => [row.line, row]))
    const scrollLeft = this.scrollBox.scrollLeft

    for (const match of flash.matches) {
      const row = rowByLine.get(match.line)
      if (!row || row.screenY >= buffer.height) continue

      for (let col = match.startCol; col < match.endCol; col++) {
        const x = row.contentX + col - scrollLeft
        if (x < row.contentX || x >= rightEdge) continue
        recolorCell(buffer, x, row.screenY, flashMatchFg, flashMatchBg)
      }

      if (!match.label) continue

      // The label overlays the match's first character — where the cursor
      // will land. flash.nvim puts it one past the match instead, which
      // reads as pointing at the wrong character.
      const labelX = row.contentX + match.startCol - scrollLeft
      if (labelX < row.contentX || labelX >= rightEdge) continue
      buffer.setCell(
        labelX,
        row.screenY,
        match.label,
        flashLabelFg,
        flashLabelBg,
        TextAttributes.BOLD
      )
    }
  }

  /**
   * Position the native terminal cursor at the current vim cursor position.
   * Called as a post-process function after each render.
   */
  private positionTerminalCursor(): void {
    // Yield the cursor to whoever owns it (e.g. the inline comment
    // composer's textarea). Without this our post-process fires after
    // the textarea's renderCursor and would erase its cursor.
    if (this.suspendCursor) return

    // Hide cursor when view is not visible
    if (!this.visible) {
      this.renderer.setCursorPosition(0, 0, false)
      return
    }
    
    if (!this.scrollBox || !this.cursorState || !this.lineMapping) return
    
    // Need either single-file mode renderable or all-files mode sections
    const isAllFilesMode = this.fileSections.length > 0
    if (!isAllFilesMode && (!this.lineNumberRenderable || !this.codeRenderable)) return

    const line = this.cursorState.line
    const col = this.cursorState.col

    // Get scroll position - prefer expected value to avoid stale reads
    const scrollTop = this.expectedScrollTop ?? this.scrollBox.scrollTop
    const scrollLeft = this.scrollBox.scrollLeft
    
    // Clear expected scroll position after using it
    this.expectedScrollTop = null
    
    // Update sticky file header based on scroll position
    this.updateStickyHeader(scrollTop)

    // Calculate visual line relative to scroll position
    const visualRow = this.cursorLineToVisualRow(line)
    if (visualRow < 0) {
      this.renderer.setCursorPosition(0, 0, false)
      return
    }
    const visualLine = visualRow - scrollTop

    // Get the scrollbox's viewport height
    const viewportHeight = this.scrollBox.height

    // Skip if cursor line is not visible
    if (visualLine < 0 || visualLine >= viewportHeight) {
      this.renderer.setCursorPosition(0, 0, false)
      return
    }

    // Visual column relative to viewport (subtract horizontal scroll)
    const visualCol = col - scrollLeft

    // Skip if cursor column is not visible
    if (visualCol < 0) {
      this.renderer.setCursorPosition(0, 0, false)
      return
    }

    // Screen position:
    // - Row 0 is the app header, so the scrollbox starts at terminal row 2
    // - contentOriginX is where the cursor's own section draws column 0
    // - +1 because terminal coordinates are 1-indexed
    //
    // In all-files mode each section has its own gutter width, so the origin
    // has to come from the section holding the cursor. A file-header line
    // sits at `startLine - 1`, outside every section's range, and falls back
    // to the estimate.
    const headerHeight = 1

    const contentOriginX = this.sectionContentOriginX(this.sectionIndexForLine(line))

    const screenX = contentOriginX + visualCol + 1
    const screenY = headerHeight + visualLine + 1

    // Past the right edge the cursor would be drawn over whatever sits
    // beside the diff — the comments panel, or the terminal's last
    // column. Sidescroll normally keeps it inside; an explicit `zl` or a
    // resize can still put it out here.
    const bounds = this.paneBounds()
    if (bounds && screenX - 1 >= bounds.right) {
      this.renderer.setCursorPosition(0, 0, false)
      return
    }

    // Set terminal cursor to block style and position it
    this.renderer.setCursorStyle({ style: "block", blinking: false })
    this.renderer.setCursorPosition(screenX, screenY, true)

    this.lastCursorLine = line
    this.lastCursorCol = col
  }

  /**
   * Build diff content string
   * Note: No +/- prefixes - color coding is sufficient to show additions/deletions
   */
  private buildDiffContent(): string {
    if (!this.lineMapping) return ""
    
    const lines: string[] = []
    for (let i = 0; i < this.lineMapping.lineCount; i++) {
      const line = this.lineMapping.getLine(i)!

      switch (line.type) {
        case "file-header":
          // More prominent file header with filename and stats
          const stats = line.rawLine.match(/\([^)]+\)/)?.[0] ?? ""
          lines.push(`━━━ ${line.filename} ${stats}`)
          break
        case "hunk-header":
          // Legacy - shouldn't appear anymore
          lines.push(line.content)
          break
        case "divider":
          // Divider showing collapsed line count with loading state
          const label = line.content || "..."
          const filename = line.filename ?? ""
          lines.push(this.formatDivider(label, filename))
          break
        case "addition":
        case "deletion":
        case "context":
          // No prefix - color coding shows the line type
          lines.push(line.content)
          break
        case "no-newline":
          lines.push(line.content)
          break
        case "spacing":
          lines.push("")
          break
      }
    }
    return lines.join("\n")
  }

  /**
   * Build line numbers map (visual index -> actual file line number)
   * and set of lines where line numbers should be hidden
   */
  private buildLineNumbers(): { lineNumbers: Map<number, number>; hideLineNumbers: Set<number> } {
    const lineNumbers = new Map<number, number>()
    const hideLineNumbers = new Set<number>()
    
    if (!this.lineMapping) return { lineNumbers, hideLineNumbers }
    
    for (let i = 0; i < this.lineMapping.lineCount; i++) {
      const line = this.lineMapping.getLine(i)!
      
      switch (line.type) {
        case "file-header":
        case "divider":
        case "hunk-header":
        case "spacing":
        case "no-newline":
          // Hide line numbers for non-content lines
          hideLineNumbers.add(i)
          break
        case "addition":
        case "context":
          // Show new file line number for additions and context
          if (line.newLineNum !== undefined) {
            lineNumbers.set(i, line.newLineNum)
          }
          break
        case "deletion":
          // Show old file line number for deletions
          if (line.oldLineNum !== undefined) {
            lineNumbers.set(i, line.oldLineNum)
          }
          break
      }
    }
    
    this.lineNumbersCache = lineNumbers
    this.hideLineNumbersCache = hideLineNumbers
    return { lineNumbers, hideLineNumbers }
  }

  /**
   * Get filetype for syntax highlighting
   */
  private getFiletype(): string | undefined {
    if (this.selectedFileIndex === null) {
      return undefined
    }
    const file = this.files[this.selectedFileIndex]
    if (!file) {
      return undefined
    }
    return getFiletypeFromPath(file.filename)
  }

  /**
   * Build line colors map
   * IMPORTANT: Always set BOTH gutter and content to avoid Bun segfault bug
   */
  private buildLineColors(): Map<number, LineColorConfig> {
    const lineColors = new Map<number, LineColorConfig>()
    if (!this.lineMapping || !this.cursorState) return lineColors

    // First pass: diff-specific backgrounds
    for (let i = 0; i < this.lineMapping.lineCount; i++) {
      const line = this.lineMapping.getLine(i)
      if (!line) continue

      if (line.type === "addition") {
        lineColors.set(i, { gutter: defaultBg, content: "#1e3a2f" })
      } else if (line.type === "deletion") {
        lineColors.set(i, { gutter: defaultBg, content: "#3a1e2f" })
      } else if (line.type === "file-header") {
        // Prominent file header with accent color
        lineColors.set(i, { gutter: theme.blue, content: theme.surface1 })
      } else if (line.type === "hunk-header") {
        // Legacy - shouldn't appear anymore
        lineColors.set(i, { gutter: theme.surface0, content: theme.surface0 })
      } else if (line.type === "divider") {
        // Divider with subtle styling - check loading state for visual feedback
        const divFilename = line.filename ?? ""
        const isLoading = this.loadingFiles.has(divFilename)
        if (isLoading) {
          // Loading - slightly brighter to draw attention
          lineColors.set(i, { gutter: theme.surface0, content: theme.surface0 })
        } else {
          // Collapsed - subtle dark background
          lineColors.set(i, { gutter: theme.mantle, content: theme.mantle })
        }
      }
    }

    // Second pass: visual selection
    const selectionRange = getSelectionRange(this.cursorState)
    if (selectionRange) {
      const [start, end] = selectionRange
      for (let i = start; i <= end; i++) {
        lineColors.set(i, { gutter: theme.surface1, content: theme.surface0 })
      }
    }

    // Third pass: cursor line - subtle full-line highlight (cursorline)
    // Apply a very subtle background to the entire line, blending with diff colors
    const cursorLine = this.cursorState.line
    const existing = lineColors.get(cursorLine)
    const cursorLineType = this.lineMapping.getLine(cursorLine)?.type
    
    // Determine cursor line content background - blend with diff colors
    let cursorContentBg: string
    if (cursorLineType === "addition") {
      cursorContentBg = "#243d32"  // Slightly brighter green for cursor on addition
    } else if (cursorLineType === "deletion") {
      cursorContentBg = "#3d2432"  // Slightly brighter red for cursor on deletion  
    } else {
      cursorContentBg = "#232330"  // Subtle highlight for normal lines
    }
    
    lineColors.set(cursorLine, {
      gutter: existing?.gutter ?? defaultBg,  // Keep gutter as-is
      content: cursorContentBg,
    })

    this.lineColorsCache = lineColors
    return lineColors
  }

  /**
   * Build line signs map for comment indicators
   */
  private buildLineSigns(): Map<number, LineSign> {
    const signs = new Map<number, LineSign>()
    if (!this.lineMapping) return signs

    // Always add a placeholder sign on line 0 to reserve sign column width
    // This ensures consistent gutter width and prevents layout shifts
    signs.set(0, { before: " " })

    // Add comment indicators
    for (const comment of this.comments) {
      const visualLine = this.lineMapping.findLineForComment(comment)
      if (visualLine !== null) {
        // Determine color based on status, resolved state, and local edits
        let color: string
        if (comment.isThreadResolved) {
          // Resolved threads get dimmed color
          color = colors.commentResolved
        } else if (comment.status === "synced" && comment.localEdit !== undefined) {
          // Synced but has local edits pending
          color = theme.yellow
        } else if (comment.status === "synced") {
          color = theme.green
        } else if (comment.status === "pending") {
          color = theme.yellow
        } else {
          // local
          color = theme.blue
        }

        signs.set(visualLine, {
          before: "●",
          beforeColor: color,
        })
      }
    }

    this.lineSignsCache = signs
    return signs
  }

  /**
   * Display width of every line's content, for the overflow markers.
   * File headers and dividers are drawn by something other than the code
   * renderable, so they get 0 and never claim to run off the edge.
   */
  private buildLineWidths(): void {
    const widths: number[] = []
    if (this.lineMapping) {
      for (let i = 0; i < this.lineMapping.lineCount; i++) {
        const line = this.lineMapping.getLine(i)
        const measurable =
          line?.type === "addition" ||
          line?.type === "deletion" ||
          line?.type === "context" ||
          line?.type === "no-newline"
        widths[i] = measurable ? Bun.stringWidth(line.content) : 0
      }
    }
    this.lineWidths = widths
  }

  /**
   * Destroy the view and clean up
   */
  destroy(): void {
    // Remove post-process function
    if (this.cursorPostProcess) {
      this.renderer.removePostProcessFn(this.cursorPostProcess)
      this.cursorPostProcess = null
    }
    
    // Hide cursor
    this.renderer.setCursorPosition(0, 0, false)
    
    // Clean up sticky header
    this.destroyStickyHeader()
    
    for (const child of this.container.getChildren()) {
      this.container.remove(child.id)
    }
    this.scrollBox = null
    this.lineNumberRenderable = null
    this.codeRenderable = null
  }
}

/**
 * Get filetype for syntax highlighting from filename
 */
function getFiletypeFromPath(path: string): string | undefined {
  const ext = path.split(".").pop()?.toLowerCase()
  if (!ext) return undefined

  const extMap: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    cs: "csharp",
    php: "php",
    swift: "swift",
    kt: "kotlin",
    scala: "scala",
    md: "markdown",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    xml: "xml",
    html: "html",
    css: "css",
    scss: "scss",
    sql: "sql",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    // Avro has no tree-sitter parser: .avdl is close enough to Java to
    // borrow its highlighting, and .avsc/.avpr are literally JSON.
    avdl: "java",
    avsc: "json",
    avpr: "json",
  }

  return extMap[ext]
}

// Keep the old functional component for backward compatibility during transition
export function VimDiffViewFunctional(props: {
  files: DiffFile[]
  selectedFileIndex: number | null
  cursorState: VimCursorState
  comments: Comment[]
  lineMapping: DiffLineMapping
}) {
  // This is kept for reference but should not be used
  throw new Error("Use VimDiffView class instead")
}
