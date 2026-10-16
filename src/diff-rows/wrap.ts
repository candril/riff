import { isHighSurrogate } from "./cells"
import { TAB } from "./segments"

/**
 * One visual row of a wrapped line. Columns are UTF-16 units of the line,
 * `endCol` exclusive; cells count as the cell walk counts them.
 */
export interface WrapSlice {
  startCol: number
  endCol: number
  startCell: number
  /** Cells drawn; whitespace hanging past the edge is not. */
  cells: number
}

const SPACE = 0x20
const TAB_CODE = 0x09

// What OpenTUI's word wrap breaks after, read off the renderer by sweeping
// every printable ASCII character; wrap.parity.test.ts holds this to it.
const BREAK_AFTER = new Set([..."!(),-./:;?[\\]{}"].map((char) => char.charCodeAt(0)))

const isWhitespace = (code: number) => code === SPACE || code === TAB_CODE
const isBreak = (code: number) => isWhitespace(code) || BREAK_AFTER.has(code)

/**
 * Where OpenTUI's `wrapMode: "word"` breaks `content` at `width` cells. A
 * row breaks after the last whitespace or break character that fits; a run
 * with none is cut at the edge. Whitespace that reaches past the edge
 * after a word hangs on that row rather than opening the next, but a row
 * of nothing but whitespace — indentation wider than the row — is cut like
 * a word.
 *
 * The break set was measured on ASCII only. Unicode spaces, CJK break
 * opportunities and wide glyphs are not modelled, as split does not model
 * them either; the parity corpus leaves them out on purpose.
 */
export function wrapLine(content: string, width: number): WrapSlice[] {
  const slices: WrapSlice[] = []
  let rowCol = 0
  let rowCell = 0
  let breakCol = -1
  let breakCell = 0
  let rowHasWord = false
  let col = 0
  let cell = 0
  let drawnCell = 0
  while (col < content.length) {
    const code = content.charCodeAt(col)
    const cells = code === TAB_CODE ? TAB.length : 1
    const units = isHighSurrogate(code) && col + 1 < content.length ? 2 : 1
    const overflows = width > 0 && cell + cells - rowCell > width
    if (overflows && !(rowHasWord && isWhitespace(code))) {
      // A character wider than the whole row still has to land somewhere.
      const lone = col === rowCol
      const endCol = breakCol > rowCol ? breakCol : lone ? col + units : col
      const endCell = breakCol > rowCol ? breakCell : lone ? cell + cells : cell
      const drawn = lone ? cells : Math.min(endCell, drawnCell) - rowCell
      slices.push({ startCol: rowCol, endCol, startCell: rowCell, cells: drawn })
      // Whatever follows the break up to here is the start of a word.
      rowHasWord = endCol < col
      rowCol = endCol
      rowCell = endCell
      breakCol = -1
      if (lone) {
        col = endCol
        cell = endCell
        drawnCell = endCell
      }
      continue
    }
    col += units
    cell += cells
    if (!overflows) drawnCell = cell
    if (!isWhitespace(code)) rowHasWord = true
    if (isBreak(code)) {
      breakCol = col
      breakCell = cell
    }
  }
  slices.push({ startCol: rowCol, endCol: content.length, startCell: rowCell, cells: drawnCell - rowCell })
  return slices
}
