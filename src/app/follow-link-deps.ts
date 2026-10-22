import type { GlobalKeyContext } from "./global-keys"
import { createOpenLink, openerCommand } from "./open-link"
import { expandFiles } from "../state"
import * as fileNavigation from "../features/file-navigation"
import * as externalTools from "../features/external-tools"
import type { FollowLinkContext } from "../features/follow-link"

/** Where `gf`, `gF`, `gx` and `gX` take the link under the cursor. */
export function followLinkContext(ctx: GlobalKeyContext): FollowLinkContext {
  const openLink = createOpenLink(ctx)
  return {
    setState: ctx.setState,
    getVimState: ctx.getVimState,
    getLineMapping: ctx.getLineMapping,
    render: ctx.render,
    jumpToFile: (candidates, line) => {
      const state = ctx.getState()
      const filename = candidates.find((candidate) => state.files.some((file) => file.filename === candidate))
      if (!filename) return false
      const fileIndex = state.files.findIndex((file) => file.filename === filename)

      // A file marked viewed is folded shut; a link to it means to read it.
      if (state.collapsedFiles.has(filename)) {
        ctx.setState((s) => expandFiles(s, [filename]))
        ctx.rebuildLineMapping()
      }
      fileNavigation.revealFile(fileIndex, ctx.fileNavContext)

      if (line !== undefined) {
        const visualLine = ctx.getLineMapping().findVisualLineForFileLine(filename, line)
        if (visualLine !== null) {
          ctx.setVimState({ ...ctx.getVimState(), line: visualLine, col: 0, desiredCol: null })
          ctx.ensureCursorVisible()
        }
      }

      ctx.render()
      return true
    },
    openPath: (candidates, line, tmux) => {
      void (async () => {
        // The reading that exists on disk wins; with neither there, the first
        // is the one the fetch-from-GitHub fallback should ask for.
        let target = candidates[0]!
        for (const candidate of candidates) {
          if (await Bun.file(candidate).exists()) {
            target = candidate
            break
          }
        }

        if (tmux) {
          await externalTools.handleOpenPathInTmuxWindow(ctx.externalToolsContext, target, line)
          return
        }
        await externalTools.handleOpenFileAtLine(ctx.externalToolsContext, target, line ?? 0)
      })()
    },
    openUrl: (url) => {
      Bun.spawn([openerCommand(), url], { stdout: "ignore", stderr: "ignore" })
    },
    copyUrl: (url) => openLink("copy", { label: "link", url }),
  }
}
