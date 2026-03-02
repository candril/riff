import { Box, Text, ScrollBox, h, DiffRenderable, type ScrollBoxRenderable, type DiffRenderable as DiffRenderableType, SyntaxStyle, RGBA } from "@opentui/core"
import { colors, theme } from "../theme"
import type { DiffFile } from "../utils/diff-parser"
import { getFileColor } from "../utils/file-colors"

// Shared syntax style for highlighting (created once, reused)
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
    })
  }
  return sharedSyntaxStyle
}

export interface DiffViewProps {
  /** Single diff content (when file is selected) */
  diff?: string
  filetype?: string
  view?: "unified" | "split"
  showLineNumbers?: boolean
  /** Multiple files (when showing all) */
  files?: DiffFile[]
}

export function DiffView({
  diff,
  filetype,
  view = "unified",
  showLineNumbers = true,
  files,
}: DiffViewProps) {
  // Determine what to show
  const showAllFiles = files && files.length > 0 && !diff
  const singleDiff = diff || ""
  
  if (!showAllFiles && !singleDiff.trim()) {
    return Box(
      {
        width: "100%",
        height: "100%",
        justifyContent: "center",
        alignItems: "center",
      },
      Text({ content: "No changes to display", fg: colors.textDim })
    )
  }

  // Single file mode
  if (!showAllFiles) {
    return ScrollBox(
      {
        id: "diff-scroll",
        width: "100%",
        height: "100%",
        scrollY: true,
        scrollX: false,
        verticalScrollbarOptions: {
          showArrows: false,
          trackOptions: {
            backgroundColor: theme.surface0,
            foregroundColor: theme.surface2,
          },
        },
      },
      h(DiffRenderable, {
        id: "diff-content",
        diff: singleDiff,
        view,
        filetype,
        syntaxStyle: getSyntaxStyle(),
        showLineNumbers,
        addedBg: colors.addedBg,
        removedBg: colors.removedBg,
        contextBg: colors.contextBg,
        addedSignColor: colors.addedFg,
        removedSignColor: colors.removedFg,
        lineNumberFg: theme.overlay0,
      })
    )
  }
  
  // All files mode - concatenate with headers
  return ScrollBox(
    {
      id: "diff-scroll",
      width: "100%",
      height: "100%",
      scrollY: true,
      scrollX: false,
      verticalScrollbarOptions: {
        showArrows: false,
        trackOptions: {
          backgroundColor: theme.surface0,
          foregroundColor: theme.surface2,
        },
      },
    },
    Box(
      { flexDirection: "column", width: "100%" },
      ...files!.flatMap((file, index) => [
        // File header
        FileHeader({ filename: file.filename, additions: file.additions, deletions: file.deletions }),
        // File diff
        h(DiffRenderable, {
          id: `diff-content-${index}`,
          diff: file.content,
          view,
          filetype: getFiletypeFromPath(file.filename),
          syntaxStyle: getSyntaxStyle(),
          showLineNumbers,
          addedBg: colors.addedBg,
          removedBg: colors.removedBg,
          contextBg: colors.contextBg,
          addedSignColor: colors.addedFg,
          removedSignColor: colors.removedFg,
          lineNumberFg: theme.overlay0,
        }),
        // Spacing between files
        Box({ height: 1 }),
      ])
    )
  )
}

interface FileHeaderProps {
  filename: string
  additions: number
  deletions: number
}

function FileHeader({ filename, additions, deletions }: FileHeaderProps) {
  // Use file-type color for filename, fallback to primary
  const fileColor = getFileColor(filename) || colors.primary
  
  return Box(
    {
      width: "100%",
      height: 1,
      backgroundColor: theme.surface0,
      paddingX: 1,
      flexDirection: "row",
      justifyContent: "space-between",
    },
    Box(
      { flexDirection: "row" },
      Text({ content: "─── ", fg: colors.textDim }),
      Text({ content: filename, fg: fileColor }),
      Text({ content: " ", fg: colors.textDim }),
    ),
    Box(
      { flexDirection: "row" },
      Text({ content: `+${additions}`, fg: theme.green }),
      Text({ content: " ", fg: colors.textDim }),
      Text({ content: `-${deletions}`, fg: theme.red }),
    )
  )
}

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

/**
 * Get a reference to the scroll box for programmatic scrolling
 */
export function getScrollBox(renderer: { root: { findDescendantById: (id: string) => unknown } }): ScrollBoxRenderable | null {
  return renderer.root.findDescendantById("diff-scroll") as ScrollBoxRenderable | null
}

/**
 * Get a reference to the diff renderable
 */
export function getDiffRenderable(renderer: { root: { findDescendantById: (id: string) => unknown } }): DiffRenderableType | null {
  return renderer.root.findDescendantById("diff-content") as DiffRenderableType | null
}
