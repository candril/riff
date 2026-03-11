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
  type CliRenderer,
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
  additions: number
  deletions: number
  collapsed: boolean  // whether this file is collapsed (fold closed)
}

/**
 * Create a styled file header component
 * Clean, minimal design matching ReviewPreview style
 * Uses minWidth: "100%" to ensure all headers stretch to full width
 */
function FileHeader(props: { filename: string; additions: number; deletions: number; collapsed?: boolean; viewed?: boolean }): ReturnType<typeof Box> {
  const { filename, additions, deletions, collapsed, viewed } = props
  
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
    // Filename (dimmed if viewed)
    Text({ content: filename, fg: viewed ? theme.overlay1 : theme.blue }),
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
  
  // File sections for all-files mode (multi-renderable architecture)
  private fileSections: FileSection[] = []
  // Map of section index -> renderables
  private sectionRenderables: Map<number, { lineNumber: LineNumberRenderable; code: CodeRenderable }> = new Map()
  
  // Track gutter width for cursor positioning (set during rebuild)
  private gutterMinWidth: number = 4
  
  // Expected scroll position - set by external scroll logic to avoid stale reads
  // When set, positionTerminalCursor uses this instead of scrollBox.scrollTop
  private expectedScrollTop: number | null = null

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
    this.cursorPostProcess = () => {
      // Check if renderer dimensions changed (resize occurred)
      if (this.renderer.width !== this.lastRendererWidth || 
          this.renderer.height !== this.lastRendererHeight) {
        this.lastRendererWidth = this.renderer.width
        this.lastRendererHeight = this.renderer.height
        // Dimensions changed - recalculate on next frame to allow layout to settle
      }
      this.positionTerminalCursor()
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
    
    return sections
  }

  /**
   * Rebuild the entire view
   */
  private rebuild(): void {
    // Clear container and section renderables
    for (const child of this.container.getChildren()) {
      this.container.remove(child.id)
    }
    this.sectionRenderables.clear()
    this.fileSections = []

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
          Text({ content: "No changes to display", fg: colors.textDim })
        )
      )
      this.scrollBox = null
      this.lineNumberRenderable = null
      this.codeRenderable = null
      return
    }

    // Determine mode: single file or all files
    const isAllFilesMode = this.selectedFileIndex === null
    
    if (isAllFilesMode) {
      this.rebuildAllFilesMode()
    } else {
      this.rebuildSingleFileMode()
    }
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
    let maxLineNumber = 0
    for (const lineNum of lineNumbers.values()) {
      if (lineNum > maxLineNumber) maxLineNumber = lineNum
    }
    this.gutterMinWidth = Math.max(4, String(maxLineNumber).length)

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
    let maxLineNumber = 0
    for (const lineNum of globalLineNumbers.values()) {
      if (lineNum > maxLineNumber) maxLineNumber = lineNum
    }
    // Minimum 4 digits to match single-file mode
    this.gutterMinWidth = Math.max(4, String(maxLineNumber).length)
    
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

  // Track whether file panel is visible (set via setFilePanelVisible)
  private filePanelVisible: boolean = true
  private filePanelWidth: number = 35
  
  /**
   * Set file panel visibility (needed for cursor position calculation)
   */
  setFilePanelVisible(visible: boolean, width: number = 35): void {
    this.filePanelVisible = visible
    this.filePanelWidth = width
  }

  /**
   * Position the native terminal cursor at the current vim cursor position.
   * Called as a post-process function after each render.
   */
  private positionTerminalCursor(): void {
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

    // Calculate screen position using layout measurements
    // 
    // Layout structure (from top-left):
    // - Row 1: Header (1 row)
    // - Row 2+: Main content area containing:
    //   - Column 1-35: FileTreePanel (when visible)
    //   - Column 36+: VimDiffView container -> ScrollBox -> LineNumberRenderable -> CodeRenderable
    // - Last row: StatusBar (1 row)
    //
    // The container's position within its parent gives us the X offset
    // The gutter (LineNumberRenderable) width tells us where code content starts
    
    // Header is 1 row, so content starts at terminal row 2
    const headerHeight = 1
    
    // Get file panel offset from the external state
    // The container.x is relative to its direct parent, not absolute screen position
    // So we use the known file panel width from setFilePanelVisible()
    const filePanelOffset = this.filePanelVisible ? this.filePanelWidth : 0
    
    // Calculate gutter width to match OpenTUI's LineNumberRenderable
    // Formula: max(minWidth, digits + paddingRight + 1) + signWidth
    // We use minWidth=gutterMinWidth, paddingRight=1, signWidth=1
    const maxLineNum = this.lineMapping.lineCount
    const digits = maxLineNum > 0 ? Math.floor(Math.log10(maxLineNum)) + 1 : 1
    const baseWidth = Math.max(this.gutterMinWidth, digits + 1 + 1)  // digits + paddingRight + 1
    const gutterWidth = baseWidth + 1  // + signWidth
    
    // Screen position calculation:
    // - filePanelOffset: width of file panel (0 if hidden)
    // - gutterWidth: width of line number gutter
    // - visualCol: 0-indexed column in content
    // The gutter already accounts for the 1-indexed terminal offset
    const screenX = filePanelOffset + gutterWidth + visualCol
    const screenY = headerHeight + visualLine + 1

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

    return signs
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
