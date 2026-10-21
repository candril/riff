import { editorCommand } from "./spawn"

/**
 * Open a command in a new tmux pane beside riff, leaving riff running.
 *
 * A pane rather than a window: the diff riff is showing is the reason you
 * opened the editor, and a window would hide it (spec 075).
 */
export async function openInTmuxPane(
  argv: string[],
  opts: { cwd?: string; removeWhenClosed?: string[] } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cleanup = opts.removeWhenClosed ?? []
  const command = cleanup.length > 0
    ? [
        "sh",
        "-c",
        `${argv.map(shellQuote).join(" ")}; rm -f ${cleanup.map(shellQuote).join(" ")}`,
      ]
    : argv

  const args = ["tmux", "split-window", "-h", ...(opts.cwd ? ["-c", opts.cwd] : []), ...command]

  try {
    const proc = Bun.spawn(args, { stdin: "ignore", stdout: "ignore", stderr: "pipe" })
    const exitCode = await proc.exited
    if (exitCode === 0) return { ok: true }
    const stderr = (await new Response(proc.stderr).text()).trim()
    return { ok: false, error: stderr || `tmux exited with ${exitCode}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** riff can only hand a file to tmux when it is itself running inside one. */
export function insideTmux(): boolean {
  return Boolean(process.env.TMUX)
}

/**
 * Open a file in $EDITOR in a new tmux window, leaving riff running in the
 * current one.
 *
 * `tmux new-window` returns as soon as the window exists, so nothing here
 * waits for the editor: the point is to keep both alive side by side. A
 * temp file therefore cannot be cleaned up by riff — the wrapper shell in
 * the new window removes it once the editor exits.
 *
 * @param path - File to open; absolute, or relative to `cwd`
 * @param lineNumber - Optional line to jump to
 * @param opts.cwd - Working directory for the new window
 * @param opts.removeWhenClosed - Delete `path` after the editor exits
 */
export async function openInTmuxWindow(
  path: string,
  lineNumber?: number,
  opts: { cwd?: string; removeWhenClosed?: boolean } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const editor = editorCommand()
  const editorArgs = lineNumber && lineNumber > 0
    ? [editor, `+${lineNumber}`, path]
    : [editor, path]

  const command = opts.removeWhenClosed
    ? ["sh", "-c", `${editorArgs.map(shellQuote).join(" ")}; rm -f ${shellQuote(path)}`]
    : editorArgs

  const args = ["tmux", "new-window", ...(opts.cwd ? ["-c", opts.cwd] : []), ...command]

  try {
    // `tmux new-window` exits as soon as the window is created, so awaiting
    // it reports a real failure (no server, bad cwd) without waiting on the
    // editor session itself.
    const proc = Bun.spawn(args, { stdin: "ignore", stdout: "ignore", stderr: "pipe" })
    const exitCode = await proc.exited
    if (exitCode === 0) return { ok: true }
    const stderr = (await new Response(proc.stderr).text()).trim()
    return { ok: false, error: stderr || `tmux exited with ${exitCode}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}
