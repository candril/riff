import type { KeyEvent } from "@opentui/core"
import type { GlobalKeyContext } from "./global-keys"
import type { MarkChordKeyDeps } from "./mark-chord-keys"
import { diffTakesMarkChord } from "./mark-chord-gate"
import { appKeyTakes } from "./app-keys"

/** What the mark layer needs of the app, and of the chat, which a key it reaches is asked about first. */
export function markChordKeyDeps(ctx: GlobalKeyContext, askedFirst: (key: KeyEvent) => boolean): MarkChordKeyDeps {
  return {
    marksContext: ctx.marksContext,
    diffTakesMarkChord: () => diffTakesMarkChord(ctx),
    askedFirst,
    ignoresChords: appKeyTakes,
  }
}
