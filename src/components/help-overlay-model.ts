import { helpLayout, helpViewport, type HelpRow } from "./help-sections"

/** The window of each column the help overlay shows, and whether rows lie past either edge. */
export interface HelpOverlayModel {
  version?: string
  /** The overlay's outer width, padding included. */
  width: number
  columns: { id: string; cells: number; rows: HelpRow[] }[]
  scroll: number
  more: { above: boolean; below: boolean }
}

export function helpOverlayModel(version: string | undefined, scroll: number, height: number, width: number): HelpOverlayModel {
  const layout = helpLayout(width)
  const { rows, maxScroll } = helpViewport(height, width)
  const top = Math.max(0, Math.min(maxScroll, scroll))
  const window = {
    width: layout.width,
    columns: layout.columns.map((column) => ({ id: column.id, cells: column.cells, rows: column.rows.slice(top, top + rows) })),
    scroll: top,
    more: { above: top > 0, below: top < maxScroll },
  }
  // Left out rather than undefined, so reconcile sees the same keys every pass.
  return version !== undefined ? { version, ...window } : window
}
