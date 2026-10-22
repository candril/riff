import type { AppKeyContext } from "./key-context"
import { switchView } from "../state"
import { openerCommand } from "./open-link"
import * as commentsPicker from "../features/comments-picker"
import * as feed from "../features/feed"

/**
 * What the feed needs to act: where its rows lead (spec 070), and whether
 * a chord is pending, whose second key the feed leaves to the layers behind.
 */
export function feedKeyDeps(
  ctx: AppKeyContext,
  chord: { chordPending(): boolean },
): feed.FeedKeyDeps {
  return {
    getState: ctx.getState,
    setState: ctx.setState,
    render: ctx.render,
    chordPending: () => chord.chordPending(),
    onOpenEvent: (event) => {
      const target = event.target
      if (!target) return
      switch (target.kind) {
        case "commit":
          // The diff, scoped to that commit — `]g`/`[g` already know how.
          ctx.setState((s) => switchView(s, "diff"))
          ctx.onCommitSelected(target.sha)
          return
        case "comment": {
          const comment = ctx.getState().comments.find((c) => c.id === target.commentId)
          if (!comment) return
          ctx.setState((s) => switchView(s, "diff"))
          commentsPicker.jumpToComment(comment, {
            getState: ctx.getState,
            setState: ctx.setState,
            getVimState: ctx.getVimState,
            setVimState: ctx.setVimState,
            getLineMapping: ctx.getLineMapping,
            ensureCursorVisible: ctx.ensureCursorVisible,
            render: ctx.render,
            fileNavContext: ctx.fileNavContext,
          })
          return
        }
        case "check":
        case "url": {
          if (target.url) Bun.spawn([openerCommand(), target.url], { stdout: "ignore", stderr: "ignore" })
          return
        }
      }
    },
    onOpenCommitFile: (sha, filename) => {
      ctx.setState((s) => switchView(s, "diff"))
      ctx.onCommitSelected(sha, filename)
    },
  }
}

/** What `za` needs to open a feed row: the files of a commit row it has just opened. */
export function feedExpandDeps(ctx: AppKeyContext): feed.FeedExpandDeps {
  return {
    getState: ctx.getState,
    setState: ctx.setState,
    render: ctx.render,
    onExpandCommit: (sha) => {
      void feed.loadCommitFiles(ctx.feedLoadContext, sha)
    },
  }
}
