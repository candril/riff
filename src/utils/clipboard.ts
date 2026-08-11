/**
 * Clipboard access.
 *
 * Spawning the platform clipboard binary is the only portable option here —
 * a TUI has no OSC-52 guarantee across the terminals riff runs in.
 * Failures are returned rather than thrown so callers can toast them.
 */

export type CopyResult = { ok: true } | { ok: false; error: string }

/**
 * Await the helper's exit rather than firing and forgetting: the write is
 * still in flight when `spawn` returns, so a copy followed closely by quitting
 * riff — or by another copy — silently lands nothing on the clipboard.
 */
export async function copyToClipboard(text: string): Promise<CopyResult> {
  const cmd =
    process.platform === "darwin"
      ? ["pbcopy"]
      : ["xclip", "-selection", "clipboard"]
  try {
    const proc = Bun.spawn(cmd, { stdin: "pipe" })
    proc.stdin.write(text)
    await proc.stdin.end()
    const exitCode = await proc.exited
    return exitCode === 0
      ? { ok: true }
      : { ok: false, error: `${cmd[0]} exited with ${exitCode}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
