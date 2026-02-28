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
} from "@opentui/core"
import { colors, theme } from "../theme"
import type { DiffFile } from "../utils/diff-parser"
import type { Comment } from "../types"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import type { VimCursorState } from "../vim-diff/types"
import { getSelectionRange } from "../vim-diff/cursor-state"

// Shared syntax style for diff rendering
let sharedSyntaxStyle: SyntaxStyle | null = null

function getSyntaxStyle(): SyntaxStyle {
  if (!sharedSyntaxStyle) {
    sharedSyntaxStyle = SyntaxStyle.fromStyles({
      // Diff-specific syntax highlighting
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
    })
  }
  return sharedSyntaxStyle
}

// Default background color (must provide both gutter and content to avoid Bun crash)
const defaultBg = theme.base

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
   * Update the view with new data
   */
  update(
    files: DiffFile[],
    selectedFileIndex: number | null,
    lineMapping: DiffLineMapping,
    cursorState: VimCursorState,
    comments: Comment[]
  ): void {
    const contentChanged = 
      this.files !== files || 
      this.selectedFileIndex !== selectedFileIndex ||
      this.lineMapping !== lineMapping
    
    const commentsChanged = this.comments !== comments

    this.files = files
    this.selectedFileIndex = selectedFileIndex
    this.lineMapping = lineMapping
    this.cursorState = cursorState
    this.comments = comments

    if (contentChanged) {
      // Full rebuild needed
      this.rebuild()
    } else if (commentsChanged) {
      // Comments changed - update line signs
      this.updateLineSigns()
      this.updateHighlights()
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
   * Rebuild the entire view
   */
  private rebuild(): void {
    // Clear container
    for (const child of this.container.getChildren()) {
      this.container.remove(child.id)
    }

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

    // Build content
    const content = this.buildDiffContent()
    const filetype = this.getFiletype()
    const lineColors = this.buildLineColors()
    const lineSigns = this.buildLineSigns()
    const { lineNumbers, hideLineNumbers } = this.buildLineNumbers()

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
        minWidth: 4,
        paddingRight: 1,
      },
        h(CodeRenderable, {
          id: "diff-code",
          content,
          filetype,
          syntaxStyle: getSyntaxStyle(),
          drawUnstyledText: true,
          conceal: false,  // Don't hide markdown syntax - show raw content for diffs
        })
      )
    )

    this.container.add(scrollBoxElement)

    // Get references to the renderables for later updates
    // Important: search within this.container, not renderer.root,
    // because the container may not be attached to root yet
    this.scrollBox = this.container.findDescendantById("diff-scroll") as ScrollBoxRenderable | null
    this.lineNumberRenderable = this.container.findDescendantById("diff-line-numbers") as LineNumberRenderable | null
    this.codeRenderable = this.container.findDescendantById("diff-code") as CodeRenderable | null
    
    // Cursor positioning is handled by the post-process function
  }

  /**
   * Update line colors without full rebuild
   */
  private updateHighlights(): void {
    if (!this.lineNumberRenderable || !this.lineMapping || !this.cursorState) return

    // Update line colors
    const lineColors = this.buildLineColors()
    this.lineNumberRenderable.setLineColors(lineColors)
    
    // Cursor positioning is handled by the post-process function
  }

  /**
   * Update line signs (comment indicators) without full rebuild
   */
  private updateLineSigns(): void {
    if (!this.lineNumberRenderable) return
    
    const lineSigns = this.buildLineSigns()
    this.lineNumberRenderable.setLineSigns(lineSigns)
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
    if (!this.lineNumberRenderable || !this.codeRenderable) return

    const line = this.cursorState.line
    const col = this.cursorState.col

    // Get scroll position
    const scrollTop = this.scrollBox.scrollTop
    const scrollLeft = this.scrollBox.scrollLeft

    // Visual line relative to viewport
    const visualLine = line - scrollTop

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
    
    // Calculate the gutter width based on line count
    // Looking at actual render output:
    // - File panel ends at column 35
    // - Line number "1" appears at column 39-40  
    // - Content starts at column 41
    // So gutter is columns 36-40 = 5 columns total
    // This is: sign(1 or 0) + padding(1) + digits(min 3) + padding(1) = ~5
    const lineCount = this.lineMapping.lineCount
    const digits = Math.max(3, String(lineCount).length)
    const gutterWidth = digits + 2  // digits + padding around them
    
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
          // Divider showing collapsed line count
          // Format: ··· 47 lines ···
          const label = line.content || "..."
          lines.push(`··· ${label} ···`)
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
        // Divider with subtle but visible styling (slightly darker than content)
        lineColors.set(i, { gutter: theme.mantle, content: theme.mantle })
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

    // Third pass: cursor line - only highlight gutter, keep content as diff color
    const cursorLine = this.cursorState.line
    const existing = lineColors.get(cursorLine)
    lineColors.set(cursorLine, {
      gutter: theme.pink,
      content: existing?.content ?? defaultBg,
    })

    return lineColors
  }

  /**
   * Build line signs map for comment indicators
   */
  private buildLineSigns(): Map<number, LineSign> {
    const signs = new Map<number, LineSign>()
    if (!this.lineMapping) return signs

    for (const comment of this.comments) {
      const visualLine = this.lineMapping.findLineForComment(comment)
      if (visualLine !== null) {
        // Determine color based on status and local edits
        let color: string
        if (comment.status === "synced" && comment.localEdit !== undefined) {
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
