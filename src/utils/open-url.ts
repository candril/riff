/**
 * Hand a URL to the desktop's browser.
 */

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

export function openUrl(url: string, schemes: readonly string[] = WEB): boolean {
  if (!isOpenableUrl(url, schemes)) return false
  const command =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url]
  try {
    Bun.spawn(command, { stdout: "ignore", stderr: "ignore" })
    return true
  } catch {
    return false
  }
}
