import { theme } from "../theme"

export interface CaptureStyle {
  fg?: string
  bg?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
}

// Plain data rather than a SyntaxStyle: the split view merges colours itself, and both views
// have to read one table to look the same.
export const SYNTAX_PALETTE: Record<string, CaptureStyle> = {
  // Code syntax highlighting
  keyword: { fg: theme.mauve },
  string: { fg: theme.green },
  number: { fg: theme.peach },
  comment: { fg: theme.overlay0, italic: true },
  function: { fg: theme.blue },
  type: { fg: theme.yellow },
  variable: { fg: theme.text },
  operator: { fg: theme.sky },
  punctuation: { fg: theme.overlay2 },
  property: { fg: theme.lavender },
  constant: { fg: theme.peach },
  attribute: { fg: theme.teal },

  // Markdown syntax highlighting
  "markup.heading": { fg: theme.red, bold: true },
  "markup.heading.1": { fg: theme.red, bold: true },
  "markup.heading.2": { fg: theme.peach, bold: true },
  "markup.heading.3": { fg: theme.yellow, bold: true },
  "markup.heading.4": { fg: theme.green, bold: true },
  "markup.heading.5": { fg: theme.blue, bold: true },
  "markup.heading.6": { fg: theme.mauve, bold: true },
  "markup.strong": { fg: theme.text, bold: true },
  "markup.italic": { fg: theme.text, italic: true },
  "markup.strikethrough": { fg: theme.overlay0 },
  "markup.link": { fg: theme.blue },
  "markup.link.url": { fg: theme.blue, underline: true },
  "markup.link.label": { fg: theme.lavender },
  "markup.raw": { fg: theme.green },
  "markup.raw.inline": { fg: theme.green },
  "markup.raw.block": { fg: theme.green },
  "markup.list": { fg: theme.blue },
  "markup.quote": { fg: theme.overlay1, italic: true },

  // Search highlight styles
  "search.match": { bg: theme.yellow, fg: theme.base },
  "search.current": { bg: theme.peach, fg: theme.base },

  // The spans that changed inside a paired line (spec 096). Background
  // only: the syntax scope underneath keeps the foreground, so a string
  // is still green where it changed.
  "diff.word.removed": { bg: "#6b2b3f" },
  "diff.word.added": { bg: "#2b6b4a" },
}

// OpenTUI falls back from the exact name straight to the first dotted part, never to the
// prefixes in between: "markup.heading.7" finds nothing, not "markup.heading".
export function styleOfCapture(capture: string): CaptureStyle | undefined {
  const style = ownStyle(capture)
  if (style) return style
  const dot = capture.indexOf(".")
  return dot < 0 ? undefined : ownStyle(capture.slice(0, dot))
}

// Grammars capture names like "constructor", which a plain lookup finds on Object.prototype.
function ownStyle(name: string): CaptureStyle | undefined {
  return Object.hasOwn(SYNTAX_PALETTE, name) ? SYNTAX_PALETTE[name] : undefined
}
