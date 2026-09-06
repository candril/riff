import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { RIFF_COMMENTS_SKILL } from "./skill"

/**
 * The skill exists twice on purpose: as a string the compiled binary can write
 * (`riff comments install-skill`), and as a file the Claude Code plugin ships.
 * Neither can read the other at runtime, so this is what keeps them equal.
 */
describe("riff-comments skill", () => {
  test("the plugin's SKILL.md matches the string the CLI installs", async () => {
    const path = join(import.meta.dir, "..", "..", "plugins", "riff", "skills", "riff-comments", "SKILL.md")
    const onDisk = await Bun.file(path).text()
    expect(onDisk).toBe(RIFF_COMMENTS_SKILL)
  })
})
