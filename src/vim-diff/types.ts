/**
 * Types for the vim-diff module
 */

/**
 * Type of line in a diff
 */
export type DiffLineType =
  | "file-header" // File separator header (all-files view)
  | "hunk-header" // @@ -1,3 +1,4 @@ (legacy, being phased out)
  | "divider" // Subtle divider between chunks (replaces hunk-header)
  | "context" // Unchanged line (space prefix)
  | "addition" // Added line (+ prefix)
  | "deletion" // Removed line (- prefix)
  | "no-newline" // \ No newline at end of file
  | "spacing" // Empty line between files (all-files view)

/**
 * Information about a hunk header
 */
export interface HunkInfo {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
}

/**
 * Represents a single line in the parsed diff
 */
export interface DiffLine {
  /** 0-indexed position in rendered output */
  visualIndex: number
  /** Type of this line */
  type: DiffLineType
  /** The actual text content (without +/- prefix for content lines) */
  content: string
  /** Original line from diff (with +/- prefix) */
  rawLine: string

  /** Line number in old file (undefined for headers/hunks/additions) */
  oldLineNum?: number
  /** Line number in new file (undefined for headers/hunks/deletions) */
  newLineNum?: number

  /** Which file this belongs to (for all-files view) */
  fileIndex?: number
  /** Filename (for headers and content tracking) */
  filename?: string

  /** Hunk information (only for hunk-header type) */
  hunkInfo?: HunkInfo
  
  /** Divider key for expansion (only for divider type) */
  dividerKey?: string
  
  /** Whether this file is collapsed (only for file-header type in all-files mode) */
  isCollapsed?: boolean
  
  /** Hunk key for collapse/expand (only for hunk-header type) */
  hunkKey?: string
  
  /** Number of lines in this hunk (for collapsed display) */
  hunkLineCount?: number
}

/**
 * Anchor point for a comment
 */
export interface CommentAnchor {
  filename: string
  line: number
  side: "LEFT" | "RIGHT"
}

/**
 * Result of a search operation
 */
export interface SearchMatch {
  line: number
  col: number
  length: number
}

/**
 * Vim editing mode
 */
export type VimMode = "normal" | "visual-line"

/**
 * State of the vim cursor and navigation
 */
export interface VimCursorState {
  /** 0-indexed visual line */
  line: number
  /** 0-indexed column (for horizontal motions) */
  col: number

  /** Current mode */
  mode: VimMode

  /** Line where V was pressed (for visual-line mode) */
  selectionAnchor: number | null

  /** Jump list for Ctrl-o/Ctrl-i */
  jumpList: number[]
  /** Current position in jump list */
  jumpIndex: number

  /** Named marks (a-z) */
  marks: Map<string, number>

  /** Last search pattern */
  lastSearch: string | null
  /** Direction of last search */
  searchDirection: "forward" | "backward"

  /** Desired column for vertical movement (column memory) */
  desiredCol: number | null

  /** Pending character for f/F/t/T motions */
  pendingFindChar: {
    type: "f" | "F" | "t" | "T"
  } | null

  /** Last f/F/t/T motion for ; and , repeat */
  lastFindChar: {
    type: "f" | "F" | "t" | "T"
    char: string
  } | null
}

/**
 * Line color configuration for LineNumberRenderable
 */
export interface LineColorConfig {
  gutter?: string
  content?: string
}

/**
 * Line sign configuration for LineNumberRenderable
 */
export interface LineSign {
  before?: string
  beforeColor?: string
  after?: string
  afterColor?: string
}

/**
 * Options for creating a DiffLineMapping with expansion support
 */
export interface DiffLineMappingOptions {
  /** Set of expanded divider keys ("filename:hunkIndex") */
  expandedDividers?: Set<string>
  /** Map of filename -> full file content (new version) */
  fileContents?: Map<string, string>
  /** Set of collapsed file names (for all-files mode) */
  collapsedFiles?: Set<string>
  /** Set of collapsed hunk keys ("filename:hunkIndex") */
  collapsedHunks?: Set<string>
}
