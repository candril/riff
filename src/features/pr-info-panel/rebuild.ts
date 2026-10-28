import type { PRInfoPanelSection } from "../../state"

export interface PanelRebuild {
  /** Run the stack and base lookups again for the new panel. */
  reread?: boolean
}

export type RecreatePrInfoPanel = (openSections?: ReadonlySet<PRInfoPanelSection>, rebuild?: PanelRebuild) => void

export function rereadsLookups({ reread = true }: PanelRebuild = {}, { hadPanel }: { hadPanel: boolean }): boolean {
  // A poll that builds the first panel has no answers to keep.
  return reread || !hadPanel
}

/**
 * What a new panel opens. One that replaces a panel is handed the reader's
 * position after it is built, so it needs nothing here; the first one built
 * after startup, once PR info that was missing arrives, opens what was saved
 * for the review as a panel built at startup would.
 */
export function sectionsForRebuild(
  openSections: ReadonlySet<PRInfoPanelSection> | undefined,
  { hadPanel, saved }: { hadPanel: boolean; saved: ReadonlySet<PRInfoPanelSection> }
): ReadonlySet<PRInfoPanelSection> | undefined {
  return openSections ?? (hadPanel ? undefined : saved)
}

/**
 * The comment poll's rebuild. The poll only changes comments, so the head and
 * base the lookups compared are unchanged, and the new panel keeps what they
 * answered instead of spending up to four REST calls to hear it again.
 */
export function commentPollRebuild(recreate: RecreatePrInfoPanel): () => void {
  return () => recreate(undefined, { reread: false })
}
