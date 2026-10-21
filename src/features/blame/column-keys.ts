import type { BlameSide } from "../../providers/blame/sides"
import type { FileBlame } from "../../providers/blame/types"
import type { AppState } from "../../state"
import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import type { VimCursorState } from "../../vim-diff/types"
import { dropBlameColumn, settleBlameColumn, toggleBlameColumn } from "./column-state"
import type { BlameDeps } from "./keys"

export interface BlameColumnKeysContext {
  deps: Pick<BlameDeps, "source">
  getState(): AppState
  setState(fn: (state: AppState) => AppState): void
  getLineMapping(): DiffLineMapping
  getVimState(): VimCursorState
  render(): void
  toast(message: string, type: "success" | "error" | "info"): void
}

/** The file `zB` acts on: the one shown, or in all files the one the cursor is in, its header included. */
function fileUnderCursor(ctx: BlameColumnKeysContext): AppState["files"][number] | undefined {
  const state = ctx.getState()
  if (state.selectedFileIndex !== null) return state.files[state.selectedFileIndex]
  const filename = ctx.getLineMapping().getLine(ctx.getVimState().line)?.filename
  return state.files.find((file) => file.filename === filename)
}

export function createBlameColumnKeys(ctx: BlameColumnKeysContext) {
  function load(file: AppState["files"][number]): void {
    const path = file.filename
    // An added file has no base to blame and a deleted one no head; asking would only fail.
    const read = (side: BlameSide, wanted: boolean, at: string): Promise<FileBlame | null> =>
      wanted ? ctx.deps.source.fileBlame(at, side).then((loaded) => loaded?.blame ?? null) : Promise.resolve(null)
    // A column turned off while it loaded has nothing left to fill or to explain.
    const stillLoading = () => ctx.getState().blameColumns.get(path)?.status === "loading"
    Promise.all([
      read("head", file.status !== "deleted", path),
      // A rename's base holds the file under its old name.
      read("base", file.status !== "added", file.oldFilename ?? path),
    ]).then(
      ([head, base]) => {
        if (!stillLoading()) return
        if (head || base) {
          ctx.setState((s) => settleBlameColumn(s, path, { head, base }))
        } else {
          ctx.toast(`No blame for ${path}`, "info")
          ctx.setState((s) => dropBlameColumn(s, path))
        }
        ctx.render()
      },
      (error: unknown) => {
        if (!stillLoading()) return
        const message = error instanceof Error ? error.message : String(error)
        ctx.toast(`Blame failed: ${message}`, "error")
        ctx.setState((s) => settleBlameColumn(s, path, { message }))
        ctx.render()
      },
    )
  }

  return {
    /** `zB`: the blame column for the file under the cursor, on or off (spec 103). */
    toggle(): void {
      const file = fileUnderCursor(ctx)
      if (!file) {
        ctx.toast("No file to blame here", "info")
        return
      }
      const toggled = toggleBlameColumn(ctx.getState(), file.filename)
      ctx.setState(() => toggled.state)
      ctx.render()
      if (toggled.on) load(file)
    },
  }
}
