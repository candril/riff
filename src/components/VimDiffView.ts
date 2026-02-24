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

  constructor(options: VimDiffViewOptions) {
    this.renderer = options.renderer
    
    // Create container using BoxRenderable directly
    this.container = new BoxRenderable(this.renderer, {
      id: "vim-diff-view",
      width: "100%",
      height: "100%",
    })
    
    // Register post-process function to position cursor after each render
    this.cursorPostProcess = () => {
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

    this.files = files
    this.selectedFileIndex = selectedFileIndex
    this.lineMapping = lineMapping
    this.cursorState = cursorState
    this.comments = comments

    if (contentChanged) {
      // Full rebuild needed
      this.rebuild()
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
        minWidth: 4,
        paddingRight: 1,
      },
        h(CodeRenderable, {
          id: "diff-code",
          content,
          filetype,
          syntaxStyle: getSyntaxStyle(),
          drawUnstyledText: true,
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
    if (!this.scrollBox || !this.cursorState || !this.lineMapping) return
    if (!this.lineNumberRenderable || !this.codeRenderable) return

    const line = this.cursorState.line
    const col = this.cursorState.col

    // Calculate the visual position of the cursor
    // We need to account for:
    // 1. The scroll position
    // 2. The line number gutter width
    // 3. The +/- prefix in diff lines

    const scrollTop = this.scrollBox.scrollTop
    const scrollLeft = this.scrollBox.scrollLeft

    // Visual line relative to viewport
    const visualLine = line - scrollTop

    // Skip if cursor line is not visible
    if (visualLine < 0 || visualLine >= this.scrollBox.height) {
      this.renderer.setCursorPosition(0, 0, false)
      return
    }

    // Get gutter width (line numbers + padding)
    const gutterWidth = this.lineNumberRenderable.width

    // Visual column relative to viewport (subtract horizontal scroll)
    // Note: col is now in terms of the raw line (including +/- prefix)
    // so no adjustment needed
    const visualCol = col - scrollLeft

    // Skip if cursor column is not visible
    if (visualCol < 0) {
      this.renderer.setCursorPosition(0, 0, false)
      return
    }

    // Calculate absolute screen position using known layout structure:
    // - Header: 1 row at top (terminal row 1)
    // - FileTreePanel: 35 columns when visible (cols 1-35 in terminal coords)
    // - VimDiffView: starts after file panel
    // - ScrollBox content area: where the actual code is rendered
    //
    // Terminal coordinates are 1-indexed, so:
    // - Header at row 1
    // - First content row at row 2
    // - File panel uses columns 1-35
    // - Code content starts at column 36 + gutter width
    const headerHeight = 2  // First content row is terminal row 2
    const filePanelWidth = this.filePanelVisible ? this.filePanelWidth + 1 : 1  // +1 for 1-indexed
    
    // Get the actual gutter width from the LineNumberRenderable
    // This includes the line number digits plus any padding
    // Note: lineNumberRenderable.width gives the total width, not just gutter
    // The gutter width is typically: digits + paddingRight (1)
    // But we need to account for how LineNumberRenderable actually renders
    const lineCount = this.lineMapping.lineCount
    const digits = Math.max(4, String(lineCount).length)
    // LineNumberRenderable appears to add extra spacing - use observed offset
    // Content starts at column 44 when file panel ends at 35, so gutter is 8 cols
    const calculatedGutterWidth = digits + 4 // Additional padding observed in rendering
    
    // Base position: after header row and file panel
    const baseX = filePanelWidth
    const baseY = headerHeight

    const screenX = baseX + calculatedGutterWidth + visualCol
    const screenY = baseY + visualLine

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
          lines.push(line.rawLine)
          break
        case "hunk-header":
          lines.push(line.content)
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
        lineColors.set(i, { gutter: theme.surface0, content: theme.surface0 })
      } else if (line.type === "hunk-header") {
        lineColors.set(i, { gutter: theme.surface0, content: theme.surface0 })
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

    // Third pass: cursor line
    lineColors.set(this.cursorState.line, {
      gutter: theme.pink,
      content: theme.surface1,
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
        const color =
          comment.status === "synced"
            ? theme.green
            : comment.status === "pending"
              ? theme.yellow
              : theme.blue

        signs.set(visualLine, {
          before: "* ",
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
