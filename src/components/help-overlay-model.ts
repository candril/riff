import { HELP_COLUMN_ROWS, helpViewport, type HelpRow } from "./help-sections"

const [LEFT_ROWS, RIGHT_ROWS] = HELP_COLUMN_ROWS

/** The window of each column the help overlay shows, and whether rows lie past either edge. */
export interface HelpOverlayModel {
  version?: string
  left: HelpRow[]
  right: HelpRow[]
  scroll: number
  more: { above: boolean; below: boolean }
}

export function helpOverlayModel(version: string | undefined, scroll: number, height: number): HelpOverlayModel {
  const { rows, maxScroll } = helpViewport(height)
  const top = Math.max(0, Math.min(maxScroll, scroll))
  const window = {
    left: LEFT_ROWS.slice(top, top + rows),
    right: RIGHT_ROWS.slice(top, top + rows),
    scroll: top,
    more: { above: top > 0, below: top < maxScroll },
  }
  // Left out rather than undefined, so reconcile sees the same keys every pass.
  return version !== undefined ? { version, ...window } : window
}
