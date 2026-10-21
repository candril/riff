import { tmpdir } from "os"
import { join } from "path"
import { randomUUID } from "crypto"

/**
 * Write `content` to a temp file that keeps `filename`'s extension, so an
 * editor opening it still gets syntax highlighting. The caller owns cleanup.
 */
export async function writeSnapshotFile(filename: string, content: string): Promise<string> {
  const ext = filename.includes(".") ? filename.split(".").pop() : "txt"
  const tmpFile = join(tmpdir(), `riff-view-${randomUUID()}.${ext}`)
  await Bun.write(tmpFile, content)
  return tmpFile
}

/**
 * The configured diff command, as argv (spec 075).
 *
 * `{old}` and `{new}` are whole arguments wherever they appear, so a path
 * with a space in it survives without any quoting rules of riff's own.
 */
export function diffCommand(template: string, oldPath: string, newPath: string): string[] {
  return template
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.replace("{old}", oldPath).replace("{new}", newPath))
}

/**
 * Open a file diff in an external diff viewer.
 * Suspends the TUI while the viewer is open.
 * 
 * @param oldContent - The old version of the file
 * @param newContent - The new version of the file  
 * @param filename - Original filename (for temp file extension)
 * @param viewer - Which diff viewer to use
 */
export async function openExternalDiffViewer(
  oldContent: string,
  newContent: string,
  filename: string,
  viewer: "difftastic" | "delta" | "nvim"
): Promise<void> {
  const ext = filename.includes(".") ? filename.split(".").pop() : "txt"
  const baseName = filename.split("/").pop()?.replace(/\.[^.]+$/, "") || "file"
  const oldFile = join(tmpdir(), `riff-old-${baseName}-${randomUUID().slice(0, 8)}.${ext}`)
  const newFile = join(tmpdir(), `riff-new-${baseName}-${randomUUID().slice(0, 8)}.${ext}`)
  
  await Bun.write(oldFile, oldContent)
  await Bun.write(newFile, newContent)
  
  let proc: ReturnType<typeof Bun.spawn>
  
  switch (viewer) {
    case "difftastic":
      // difftastic (dft) with side-by-side diff, piped to less for paging
      // --color=always forces color output when piped
      proc = Bun.spawn(["sh", "-c", `difft --color=always "${oldFile}" "${newFile}" | less -R`], {
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      })
      break
      
    case "delta":
      // delta reads unified diff from stdin
      // Generate diff with git diff --no-index, pipe to delta
      proc = Bun.spawn(["sh", "-c", `git diff --no-index --color=always "${oldFile}" "${newFile}" | delta --paging=always`], {
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      })
      break
      
    case "nvim":
      // neovim diff mode
      proc = Bun.spawn(["nvim", "-d", oldFile, newFile], {
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      })
      break
  }
  
  await proc.exited
  
  // Clean up temp files
  try {
    const { unlink } = await import("fs/promises")
    await Promise.all([unlink(oldFile), unlink(newFile)])
  } catch {
    // Ignore cleanup errors
  }
}
