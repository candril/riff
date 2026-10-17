import type { DiffLine } from "../../vim-diff/types"

/**
 * The file's own text on a numbered row, which is what a later patch can be
 * searched for. Not `content`: an aligned markdown table pads it into
 * columns and a folded fence replaces it with a label, while the raw line
 * keeps what the file says behind its one-character diff prefix.
 */
export function rowText(row: DiffLine): string {
  return row.rawLine.slice(1)
}
