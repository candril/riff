/**
 * A markdown file drawn as its reader sees it, one row per source line.
 *
 * The rows replace the file's diff rows, so everything that addresses a
 * line — the cursor, search, marks, comments — has to keep finding one.
 * That is why nothing here re-flows: a rendered row is always the source
 * line it sits on, minus its markup, and a line that renders to nothing (a
 * fence) has no row rather than a row that belongs to another line.
 */
import { Lexer, type Token, type Tokens } from "marked"
import type { CaptureSpan } from "../../diff-rows/segments"
import { MARKDOWN_FILE, alignMarkdownTables } from "../../utils/markdown-tables"
import { getFiletypeFromFence } from "../../vim-diff/filetype"
import type { RenderedCode } from "../../vim-diff/types"

export interface RenderedRow {
  text: string
  /** 1-based line in the source the row was rendered from. */
  sourceLine: number
  /** Columns in `text`. */
  spans: readonly CaptureSpan[]
  /** Set on a row of a fenced block in a language riff can parse; `spans`
   *  stays the flat colour until that parse lands. */
  code?: RenderedCode
}

// Wrap rules are not built yet, so a rule cannot follow the view's width.
const RULE_WIDTH = 40
const NESTED_INDENT = "  "
const QUOTE_BAR = "│ "
// alignMarkdownTables only aligns rows of a markdown file.
const TABLE_FILENAME = "rendered.md"

export function isMarkdownFile(filename: string): boolean {
  return MARKDOWN_FILE.test(filename)
}

export function renderMarkdown(source: string): RenderedRow[] {
  return renderBlocks(source, 1)
}

function renderBlocks(source: string, firstLine: number): RenderedRow[] {
  const rows: RenderedRow[] = []
  let line = firstLine
  for (const token of Lexer.lex(source, { gfm: true })) {
    rows.push(...renderBlock(token, line))
    line += countNewlines(token.raw)
  }
  return withBlankLines(rows, source, firstLine)
}

/**
 * A blank line belongs to no block, but it is still a line the cursor and a
 * comment can land on, and dropping it would squash the document's rhythm.
 */
function withBlankLines(rows: RenderedRow[], source: string, firstLine: number): RenderedRow[] {
  const covered = new Set(rows.map((row) => row.sourceLine))
  const sourceLines = source === "" ? [] : source.split("\n")
  // The newline that ends the last line does not start another.
  if (source.endsWith("\n")) sourceLines.pop()

  const blanks = sourceLines.flatMap((text, index) => {
    const sourceLine = firstLine + index
    return text.trim() === "" && !covered.has(sourceLine) ? [{ text: "", sourceLine, spans: [] }] : []
  })
  if (blanks.length === 0) return rows
  return [...rows, ...blanks].sort((a, b) => a.sourceLine - b.sourceLine)
}

function renderBlock(token: Token, line: number): RenderedRow[] {
  switch (token.type) {
    case "space":
      return []
    case "heading":
      return renderHeading(token as Tokens.Heading, line)
    case "paragraph":
      return splitRows(inline((token as Tokens.Paragraph).tokens), line)
    case "list":
      return renderList(token as Tokens.List, line)
    case "blockquote":
      return prefixRows(renderBlocks((token as Tokens.Blockquote).text, line), QUOTE_BAR, QUOTE_BAR, "markup.quote")
    case "hr":
      return [{ text: "─".repeat(RULE_WIDTH), sourceLine: line, spans: [] }]
    case "code":
      return renderCode(token as Tokens.Code, line)
    case "table":
      return renderTable(token.raw, line)
    default:
      return rawLines(token.raw).map((text, index) => ({ text, sourceLine: line + index, spans: [] }))
  }
}

function renderHeading(token: Tokens.Heading, line: number): RenderedRow[] {
  const capture = `markup.heading.${token.depth}`
  return splitRows(inline(token.tokens), line).map((row) => ({
    ...row,
    spans: [[0, row.text.length, capture] as const, ...row.spans],
  }))
}

function renderList(token: Tokens.List, line: number): RenderedRow[] {
  const start = typeof token.start === "number" ? token.start : 1
  let itemLine = line
  return token.items.flatMap((item, index) => {
    const marker = item.task ? (item.checked ? "☑ " : "☐ ") : token.ordered ? `${start + index}. ` : "• "
    const bullet = token.ordered && item.task ? `${start + index}. ${marker}` : marker
    const sourceLine = itemLine
    const content = renderBlocks(item.text, sourceLine)
    itemLine += countNewlines(item.raw)

    if (content.length === 0) return [{ text: bullet, sourceLine, spans: [[0, bullet.length, "markup.list"]] }]
    const [first, ...rest] = content
    return [
      ...prefixRows([first!], bullet, bullet, "markup.list"),
      ...prefixRows(rest, NESTED_INDENT, NESTED_INDENT),
    ]
  })
}

function renderCode(token: Tokens.Code, line: number): RenderedRow[] {
  const source = rawLines(token.raw)
  const block = (text: string, sourceLine: number): RenderedRow => ({
    text,
    sourceLine,
    spans: text.length > 0 ? [[0, text.length, "markup.raw.block"]] : [],
  })

  if (token.codeBlockStyle === "indented") {
    return source.map((text, index) => block(text.replace(/^( {1,4}|\t)/, ""), line + index))
  }

  const closed = source.length > 1 && /^\s*(```|~~~)/.test(source.at(-1)!)
  const contentLines = source.length - 1 - (closed ? 1 : 0)
  const lines = token.text.split("\n")
  const text = Array.from({ length: contentLines }, (_, index) => lines[index] ?? "")
  const rows = text.map((content, index) => block(content, line + 1 + index))
  const filetype = getFiletypeFromFence(token.lang ?? "")
  if (!filetype) return rows
  const code = `${text.join("\n")}\n`
  return rows.map((row, at) => ({ ...row, code: { filetype, block: code, at } }))
}

function renderTable(raw: string, line: number): RenderedRow[] {
  const source = rawLines(raw)
  const aligned = [...source]
  const lines = source.map((content) => ({ type: "context", content, filename: TABLE_FILENAME }))
  for (const change of alignMarkdownTables(lines)) aligned[change.index] = change.content
  return aligned.map((text, index) => ({ text, sourceLine: line + index, spans: [] }))
}

interface Inline {
  text: string
  spans: CaptureSpan[]
}

const INLINE_CAPTURES: Record<string, string> = {
  strong: "markup.strong",
  em: "markup.italic",
  del: "markup.strikethrough",
  link: "markup.link",
}

function inline(tokens: readonly Token[]): Inline {
  const out: Inline = { text: "", spans: [] }
  walkInline(tokens, out)
  out.spans.sort((a, b) => a[0] - b[0])
  return out
}

function walkInline(tokens: readonly Token[], out: Inline): void {
  for (const token of tokens) {
    const capture = INLINE_CAPTURES[token.type]
    if (capture) {
      const from = out.text.length
      walkInline((token as Tokens.Strong).tokens, out)
      if (out.text.length > from) out.spans.push([from, out.text.length, capture])
      continue
    }

    switch (token.type) {
      case "text":
        if ("tokens" in token && token.tokens) walkInline(token.tokens, out)
        else out.text += (token as Tokens.Text).text
        break
      case "escape":
        out.text += (token as Tokens.Escape).text
        break
      case "codespan": {
        const from = out.text.length
        out.text += codespanText(token.raw)
        if (out.text.length > from) out.spans.push([from, out.text.length, "markup.raw.inline"])
        break
      }
      case "br":
        out.text += "\n"
        break
      default:
        out.text += token.raw
    }
  }
}

/**
 * Taken from the raw span rather than marked's text, which turns a newline
 * inside the span into a space and would merge two source lines into one row.
 */
function codespanText(raw: string): string {
  const body = raw.replace(/^`+/, "").replace(/`+$/, "")
  return body.length > 2 && body.startsWith(" ") && body.endsWith(" ") && body.trim() !== "" ? body.slice(1, -1) : body
}

function splitRows(content: Inline, line: number): RenderedRow[] {
  let from = 0
  return content.text.split("\n").map((text, index) => {
    const to = from + text.length
    const spans = content.spans.flatMap(([start, end, capture]) => {
      const clipped = [Math.max(start, from) - from, Math.min(end, to) - from] as const
      return clipped[1] > clipped[0] ? [[clipped[0], clipped[1], capture] as const] : []
    })
    from = to + 1
    return { text, sourceLine: line + index, spans }
  })
}

function prefixRows(rows: readonly RenderedRow[], first: string, rest: string, capture?: string): RenderedRow[] {
  return rows.map((row, index) => {
    const prefix = index === 0 ? first : rest
    const shifted = row.spans.map(([from, to, name]) => [from + prefix.length, to + prefix.length, name] as const)
    // No `code`: its parse is in the block's columns, which the prefix has moved.
    return {
      text: prefix + row.text,
      sourceLine: row.sourceLine,
      spans: capture ? [[0, prefix.length, capture] as const, ...shifted] : shifted,
    }
  })
}

function rawLines(raw: string): string[] {
  return raw.replace(/\n+$/, "").split("\n")
}

function countNewlines(text: string): number {
  let count = 0
  for (const char of text) if (char === "\n") count++
  return count
}
