import { createSignal } from "solid-js"

/** What a draft was written on: a line, or an edit of a comment. */
export type DraftOn =
  | { filename: string; line: number; side: "LEFT" | "RIGHT" }
  | { editingId: string }

export type CommentDraftsState = ReturnType<typeof createCommentDraftsState>

/** What the composer is on: the comment it edits, or else the line it was opened on. */
export function draftOn(ov: { filename: string; line: number; side: "LEFT" | "RIGHT"; editingId: string | null }): DraftOn {
  return ov.editingId ? { editingId: ov.editingId } : { filename: ov.filename, line: ov.line, side: ov.side }
}

function anchorKey(filename: string, line: number, side: "LEFT" | "RIGHT"): string {
  return `${filename}:${line}:${side}`
}

function keyOf(on: DraftOn): string {
  return "editingId" in on ? `edit:${on.editingId}` : anchorKey(on.filename, on.line, on.side)
}

/** The draft `drafts` keeps on a line or an edit, or "" when there is none; for readers handed the map, as the frame is. */
export function draftIn(drafts: ReadonlyMap<string, string>, on: DraftOn): string {
  return drafts.get(keyOf(on)) ?? ""
}

/**
 * The comment composer's kept drafts (spec 061): what Esc left in it, by the
 * line it was written on, or by the comment it was editing. Session-only: a
 * draft is a thought in progress, not a review artefact. The feature owns it
 * rather than AppState, which sheds one slice per feature this way (spec 100,
 * M6; ADR-003). Every change sets a new Map: the signal compares by identity,
 * so a map changed in place would reach no reader.
 */
export function createCommentDraftsState() {
  const [drafts, setDrafts] = createSignal<ReadonlyMap<string, string>>(new Map())

  const forget = (on: DraftOn) => {
    const key = keyOf(on)
    if (!drafts().has(key)) return
    const next = new Map(drafts())
    next.delete(key)
    setDrafts(next)
  }

  return {
    drafts,
    /** The draft kept on a line or an edit, or "" when there is none. */
    on: (on: DraftOn): string => draftIn(drafts(), on),
    /** An empty draft forgets instead: Esc on an empty composer is how you throw one away. */
    remember(on: DraftOn, text: string) {
      if (!text.trim()) return forget(on)
      setDrafts(new Map(drafts()).set(keyOf(on), text))
    },
    forget,
    /** Whether `text` is kept anywhere, so dismissing the composer can say the draft was kept. */
    holds: (text: string): boolean => [...drafts().values()].includes(text),
    clear() {
      if (drafts().size > 0) setDrafts(new Map())
    },
  }
}
