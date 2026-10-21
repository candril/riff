import { test, expect, describe, afterEach } from "bun:test"
import { mkdtemp, rm, chmod } from "fs/promises"
import { existsSync } from "fs"
import { tmpdir } from "os"
import { basename, join } from "path"
import { editInTempFile } from "./spawn"

let dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })))
  dirs = []
})

/**
 * A stand-in for $EDITOR: runs `body` on the file it is handed, and notes
 * that file's path in `seen` so the test can check it after the edit.
 */
async function stubEditor(body: string): Promise<{ editor: string; seen: string }> {
  const dir = await mkdtemp(join(tmpdir(), "riff-stub-editor-"))
  dirs.push(dir)
  const editor = join(dir, "editor")
  const seen = join(dir, "seen")
  await Bun.write(editor, `#!/bin/sh\nprintf '%s' "$1" > '${seen}'\n${body}\n`)
  await chmod(editor, 0o755)
  return { editor, seen }
}

describe("editing a temp file", () => {
  test("what the editor saves comes back, and the temp file is gone", async () => {
    const { editor, seen } = await stubEditor(`printf 'typed' > "$1"`)

    expect(await editInTempFile("riff-comment", "md", "seed", editor)).toBe("typed")

    const path = await Bun.file(seen).text()
    expect(path).not.toBe("")
    expect(existsSync(path)).toBe(false)
  })

  test("an editor that exits non-zero cancels, and the temp file is gone", async () => {
    const { editor, seen } = await stubEditor("exit 1")

    expect(await editInTempFile("riff-comment", "md", "seed", editor)).toBeNull()

    const path = await Bun.file(seen).text()
    expect(path).not.toBe("")
    expect(existsSync(path)).toBe(false)
  })

  test("the editor is handed a file with the caller's prefix and extension", async () => {
    const { editor, seen } = await stubEditor("exit 0")

    await editInTempFile("riff-pr-create", "diff", "seed", editor)

    expect(basename(await Bun.file(seen).text())).toMatch(/^riff-pr-create-[0-9a-f-]{36}\.diff$/)
  })
})
