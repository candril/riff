import type { KeyEvent } from "@opentui/core"
import type { AppKeyContext } from "./key-context"
import type { MarkChordKeyDeps } from "./mark-chord-keys"
import { diffTakesMarkChord } from "./mark-chord-gate"
import { appKeyTakes } from "./app-keys"

/** What the mark layer needs of the app, and of the chat, which a key it reaches is asked about first. */
export function markChordKeyDeps(ctx: AppKeyContext, askedFirst: (key: KeyEvent) => boolean): MarkChordKeyDeps {
  return {
    marksContext: ctx.marksContext,
    diffTakesMarkChord: () => diffTakesMarkChord(ctx),
    askedFirst,
    ignoresChords: appKeyTakes,
  }
}
