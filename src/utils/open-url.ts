/**
 * Hand a URL to the desktop's browser.
 */

/** Refuse anything that isn't http(s) — a comment body is remote input, and
 *  `open` will happily launch a `file://` path or a registered app scheme. */
export function isOpenableUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === "http:" || protocol === "https:"
  } catch {
    return false
  }
}

export function openUrl(url: string): boolean {
  if (!isOpenableUrl(url)) return false
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
