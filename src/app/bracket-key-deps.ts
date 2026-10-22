import type { GlobalKeyContext } from "./global-keys"
import type { BracketDeps } from "./bracket-commands"
import { diffTakesMarkChord } from "./mark-chord-gate"

/** What the `]`/`[` motions need of the app. */
export function bracketDeps(ctx: GlobalKeyContext): BracketDeps {
  return {
    getState: ctx.getState,
    render: ctx.render,
    vimHandler: {
      moveToFile: (direction) => ctx.vimHandler.moveToFile(direction),
      moveToHunk: (direction) => ctx.vimHandler.moveToHunk(direction),
    },
    fileNavContext: ctx.fileNavContext,
    threadMotionContext: ctx.threadMotionContext,
    marksContext: ctx.marksContext,
    onCommitSelected: (sha) => ctx.onCommitSelected(sha),
    diffTakesMarkChord: () => diffTakesMarkChord(ctx),
  }
}
