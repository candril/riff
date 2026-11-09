/**
 * What a code span in a comment can complete to (spec 114): the names on the
 * diff's changed lines and the paths of its files, closest to the comment
 * first, since the fuzzy filter keeps input order between equal scores.
 */

import type { AppState } from "../state"
import type { DiffFile } from "./diff-parser"

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/
const IDENTIFIER = /[\p{L}_$][\p{L}\p{N}_$]*/gu
const SYMBOL_QUERY = /^[\p{L}\p{N}_$./:-]+$/u
const MIN_SYMBOL_LENGTH = 3
// A longer line is minified or generated, and its names are noise.
const LONGEST_LINE = 2000
// Closest first, so the cap only ever drops names from far-away files.
const MAX_CANDIDATES = 5000

const KEYWORDS = new Set([
  "abstract", "and", "any", "as", "async", "await", "bool", "boolean", "break", "byte", "case", "catch", "char",
  "class", "const", "continue", "def", "default", "defer", "del", "delete", "do", "double", "elif", "else", "enum",
  "except", "export", "extends", "false", "final", "finally", "float", "fn", "for", "foreach", "from", "func",
  "function", "get", "global", "go", "if", "impl", "implements", "import", "in", "instanceof", "int", "interface",
  "internal", "is", "lambda", "let", "long", "map", "match", "mod", "module", "mut", "namespace", "new", "nil",
  "none", "None", "not", "null", "number", "object", "of", "or", "override", "package", "pass", "private",
  "protected", "pub", "public", "raise", "readonly", "ref", "return", "sealed", "select", "self", "set", "short",
  "static", "string", "struct", "super", "switch", "this", "throw", "throws", "trait", "True", "False", "true",
  "try", "type", "typeof", "undefined", "unsigned", "use", "using", "val", "var", "virtual", "void", "where",
  "while", "with", "yield",
])

export interface SymbolTrigger {
  query: string
  backtickOffset: number
}

/**
 * Whether the cursor is in an open single-backtick span with a name begun.
 * A bare backtick is not a trigger: it starts every span and every fence.
 */
export function detectSymbolTrigger(text: string, cursorOffset: number): SymbolTrigger | null {
  if (cursorOffset < 2 || cursorOffset > text.length) return null
  const before = text.slice(0, cursorOffset)
  const lineStart = before.lastIndexOf("\n") + 1
  if (insideFence(before.slice(0, lineStart))) return null
  const line = before.slice(lineStart)
  const backtick = openBacktick(line)
  if (backtick === null) return null
  const query = line.slice(backtick + 1)
  if (!SYMBOL_QUERY.test(query)) return null
  return { query, backtickOffset: lineStart + backtick }
}

/** Where the line's unclosed single backtick is; a span closes only on a run as long as the one that opened it. */
function openBacktick(line: string): number | null {
  let open: { at: number; length: number } | null = null
  for (const run of line.matchAll(/`+/g)) {
    const at = run.index
    const length = run[0].length
    if (open === null) {
      if (line[at - 1] !== "\\") open = { at, length }
    } else if (length === open.length) {
      open = null
    }
  }
  return open?.length === 1 ? open.at : null
}

function insideFence(linesBefore: string): boolean {
  let fence: { marker: string; length: number } | null = null
  for (const line of linesBefore.split("\n")) {
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (!match) continue
    const run = match[1] ?? ""
    const rest = match[2] ?? ""
    const marker = run.charAt(0)
    if (fence === null) {
      // A backtick in the info string makes the line a code span, not a fence.
      if (marker !== "`" || !rest.includes("`")) fence = { marker, length: run.length }
    } else if (marker === fence.marker && run.length >= fence.length && rest.trim() === "") {
      fence = null
    }
  }
  return fence !== null
}

interface HunkSymbols {
  oldStart: number
  oldEnd: number
  newStart: number
  newEnd: number
  names: string[]
}

// By object: a file whose content is replaced is a new object, so nothing goes stale.
const hunksOfFile = new WeakMap<DiffFile, HunkSymbols[]>()

function hunksOf(file: DiffFile): HunkSymbols[] {
  const known = hunksOfFile.get(file)
  if (known) return known
  const hunks: HunkSymbols[] = []
  let current: HunkSymbols | null = null
  for (const row of file.content.split("\n")) {
    const header = HUNK_HEADER.exec(row)
    if (header) {
      const oldStart = Number(header[1])
      const newStart = Number(header[3])
      current = {
        oldStart,
        oldEnd: oldStart + Math.max(Number(header[2] ?? 1), 1) - 1,
        newStart,
        newEnd: newStart + Math.max(Number(header[4] ?? 1), 1) - 1,
        names: [],
      }
      hunks.push(current)
      continue
    }
    if (current === null || (row[0] !== "+" && row[0] !== "-") || row.length > LONGEST_LINE) continue
    for (const [name] of row.slice(1).matchAll(IDENTIFIER)) {
      if (name.length >= MIN_SYMBOL_LENGTH && !KEYWORDS.has(name)) current.names.push(name)
    }
  }
  hunksOfFile.set(file, hunks)
  return hunks
}

export interface SymbolFocus {
  filename: string
  line: number
  side: "LEFT" | "RIGHT"
}

function holdsFocus(hunk: HunkSymbols, { line, side }: SymbolFocus): boolean {
  return side === "LEFT" ? line >= hunk.oldStart && line <= hunk.oldEnd : line >= hunk.newStart && line <= hunk.newEnd
}

export function collectSymbolCandidates(files: readonly DiffFile[], focus: SymbolFocus): string[] {
  const reviewed = files.filter((file) => file.status !== "unchanged")
  const seen = new Set<string>()
  const add = (names: readonly string[]) => {
    for (const name of names) {
      if (seen.size >= MAX_CANDIDATES) return
      seen.add(name)
    }
  }

  const focused = reviewed.find((file) => file.filename === focus.filename)
  if (focused) {
    const hunks = hunksOf(focused)
    hunks.filter((hunk) => holdsFocus(hunk, focus)).forEach((hunk) => add(hunk.names))
    hunks.forEach((hunk) => add(hunk.names))
  }
  for (const { filename } of reviewed) add([filename, filename.slice(filename.lastIndexOf("/") + 1)])
  for (const file of reviewed) {
    if (file !== focused) hunksOf(file).forEach((hunk) => add(hunk.names))
  }
  return [...seen]
}

let memo: { files: readonly DiffFile[]; focus: SymbolFocus; candidates: string[] } | null = null

/** One list per diff and comment position: the frame and the picker's keys both ask for it on every keystroke. */
export function composerSymbolCandidates(state: AppState): readonly string[] {
  const { filename, line, side } = state.inlineCommentOverlay
  if (
    memo &&
    memo.files === state.files &&
    memo.focus.filename === filename &&
    memo.focus.line === line &&
    memo.focus.side === side
  ) {
    return memo.candidates
  }
  const focus = { filename, line, side }
  memo = { files: state.files, focus, candidates: collectSymbolCandidates(state.files, focus) }
  return memo.candidates
}
