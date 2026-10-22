import type { SplitRows } from "../../diff-rows/row-source"
import type { BlameSource, LineBlame } from "../../providers/blame/source"
import type { BlameCommit } from "../../providers/blame/types"
import type { RepoRef } from "../../providers/repo"
import type { AppState } from "../../state"
import type { CopyResult } from "../../utils/clipboard"
import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import type { VimCursorState } from "../../vim-diff/types"
import { blameLinkOf } from "./link"
import { closeBlamePeek, openBlamePeek, settleBlamePeek, type BlameOutcome } from "./peek-state"
import { blameTargetOf } from "./target"

/** What `gb` and its peek reach outside riff's state; every spawn is injected, so tests stub them all. */
export interface BlameDeps {
  source: BlameSource
  openUrl(url: string): void
  copy(text: string): Promise<CopyResult>
  repoRef(): Promise<RepoRef | null>
  /** The split view's rows while it is drawn; null in unified. */
  splitRows(): SplitRows | null
}

export interface BlameKeysContext {
  deps: BlameDeps
  getState(): AppState
  setState(fn: (state: AppState) => AppState): void
  getLineMapping(): DiffLineMapping
  getVimState(): VimCursorState
  render(): void
  toast(message: string, type: "success" | "error" | "info"): void
}

export function createBlameKeys(ctx: BlameKeysContext) {
  // Never reset, so an answer for a peek already closed can never match a later one.
  let lastRequest = 0

  function settle(request: number, outcome: BlameOutcome): void {
    ctx.setState((s) => settleBlamePeek(s, request, outcome))
    ctx.render()
  }

  function open(): void {
    const { deps } = ctx
    const target = blameTargetOf({
      mapping: ctx.getLineMapping(),
      vim: ctx.getVimState(),
      rows: deps.splitRows(),
      files: ctx.getState().files,
    })
    if (!target) {
      ctx.toast("No line to blame here", "info")
      return
    }
    const request = ++lastRequest
    ctx.setState((s) => openBlamePeek(s, target, request))
    ctx.render()
    deps.source.lineBlame(target.path, target.side, target.line).then(
      (result) => settle(request, { result }),
      (error: unknown) => settle(request, { message: error instanceof Error ? error.message : String(error) }),
    )
  }

  function close(): void {
    ctx.setState(closeBlamePeek)
    ctx.render()
  }

  /** The peek's commit, or null once it has toasted why there is none to act on. */
  function committedResult(noCommit: string): { result: LineBlame; commit: BlameCommit } | null {
    const peek = ctx.getState().blamePeek
    if (peek?.status === "loading") {
      ctx.toast("Blame is still loading", "info")
      return null
    }
    const result = peek?.status === "ready" ? peek.result : null
    if (result?.line.kind === "uncommitted") {
      ctx.toast("Not committed yet", "info")
      return null
    }
    if (result?.line.kind !== "commit") {
      ctx.toast(noCommit, "info")
      return null
    }
    return { result, commit: result.line.commit }
  }

  function copySha(): void {
    const committed = committedResult("No commit to copy")
    if (!committed) return
    const { sha, shortSha } = committed.commit
    void ctx.deps.copy(sha).then((copied) =>
      copied.ok ? ctx.toast(`Copied ${shortSha}`, "success") : ctx.toast(`Copy failed: ${copied.error}`, "error"),
    )
  }

  return {
    /** `gb`: opens the peek on the cursor's line, or closes it, as `gl` toggles its own. */
    toggle(): void {
      if (ctx.getState().blamePeek) close()
      else open()
    },

    close,
    copySha,

    /** `go` with the peek up: the PR that brought the line in, or its commit. False when no peek is open. */
    openLink(): boolean {
      if (!ctx.getState().blamePeek) return false
      const committed = committedResult("No commit to open")
      if (!committed) return true
      const { deps } = ctx
      void deps.repoRef().then((repo) => {
        const url = blameLinkOf(committed.result, repo)
        if (url) deps.openUrl(url)
        else ctx.toast("No GitHub remote to open the commit on", "info")
      })
      return true
    },
  }
}

export type BlameKeys = ReturnType<typeof createBlameKeys>
