import type { ToastState } from "../features/toast/state"
import { copyToClipboard } from "../utils/clipboard"

export type OpenLink = (action: "open" | "copy", link: { label: string; url: string }) => void

/** The platform's "open this the way the desktop would" command. */
export function openerCommand(): string {
  if (process.platform === "darwin") return "open"
  return process.platform === "win32" ? "start" : "xdg-open"
}

/**
 * Open a link in the browser, or put it on the clipboard. riff never
 * ticks a deploy checkbox — a row opens and copies, and that is all it
 * does (spec 068).
 */
export function createOpenLink(deps: {
  render: () => void
  toast: Pick<ToastState, "show" | "clear">
}): OpenLink {
  return (action, link) => {
    if (action === "open") {
      Bun.spawn([openerCommand(), link.url], { stdout: "ignore", stderr: "ignore" })
      return
    }
    void copyToClipboard(link.url).then((copied) => {
      deps.toast.show(
        copied.ok ? `Copied ${link.label}` : `Copy failed: ${copied.error}`,
        copied.ok ? "success" : "error"
      )
      deps.render()
      setTimeout(() => {
        deps.toast.clear()
        deps.render()
      }, 2000)
    })
  }
}
