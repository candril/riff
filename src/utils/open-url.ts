/**
 * Hand a URL to the desktop's browser.
 */

import { loadConfig } from "../config"

const WEB = ["http:", "https:"]

/** Refuse anything that isn't http(s) — a comment body is remote input, and
 *  `open` will happily launch a `file://` path or a registered app scheme.
 *  A caller whose URL comes from the user's own config may allow more. */
export function isOpenableUrl(url: string, schemes: readonly string[] = WEB): boolean {
  try {
    return schemes.includes(new URL(url).protocol)
  } catch {
    return false
  }
}

/** A named browser takes web links only: `riff-board:` belongs to its own app. */
export function openCommand(url: string, browserApp?: string, platform: string = process.platform): string[] {
  if (platform === "darwin") {
    return browserApp && isOpenableUrl(url) ? ["open", "-a", browserApp, url] : ["open", url]
  }
  return platform === "win32" ? ["cmd", "/c", "start", "", url] : ["xdg-open", url]
}

export function openUrl(url: string, schemes: readonly string[] = WEB): boolean {
  if (!isOpenableUrl(url, schemes)) return false
  try {
    Bun.spawn(openCommand(url, loadConfig().browser.app), { stdout: "ignore", stderr: "ignore" })
    return true
  } catch {
    return false
  }
}
