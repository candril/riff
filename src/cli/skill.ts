/**
 * The Claude Code skill for working through a local riff review (spec 049).
 *
 * riff doesn't launch Claude for this and doesn't hand anything over: you
 * install the skill once, then in any Claude session in the repo you say
 * "look at the riff comments" and it drives the `riff comments` CLI itself.
 */

import { mkdirSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

export const SKILL_RELATIVE_PATH = join(".claude", "skills", "riff-comments", "SKILL.md")

export const RIFF_COMMENTS_SKILL = `---
name: riff-comments
description: Work through the local code-review comments riff keeps in .riff/ — list them with the riff CLI, act on each one in the code, then resolve or remove it. Use when the user mentions riff comments, review comments, review notes, or asks to address, fix, apply or work through a local review.
---

# Working through riff's local comments

riff stores review comments as markdown files under \`.riff/comments/\`. A
comment is local until published; the user wants the local ones acted on,
then retired.

## Read them

\`\`\`sh
riff comments --json
\`\`\`

One call, from anywhere in the repo, and it has everything — don't grep for
the comments and don't open the comment files:

- \`counts\` — \`threads\`, \`open\`, \`resolved\`.
- \`threads[]\` — one entry per thread, already grouped:
  - \`id\` — the short id every other command takes
  - \`file\`, \`line\`, \`side\` — where it is anchored
  - \`body\` and \`replies[]\` — what was said
  - \`code\` — that line as it reads in the working copy *now*
  - \`context\` — the numbered lines around it, \`>\` marking the anchor
  - \`diffHunk\` — the diff the reviewer was looking at
  - \`resolve\` / \`remove\` — the exact command to retire it
  - \`commentFile\` — the markdown file, if you ever need the raw note

Open a file only when \`context\` isn't enough to make the change safely.
A \`code\` of \`null\` means the anchor can't be shown from the working copy
(a deleted line, or a review of another revision) — use \`diffHunk\` then.

If the user reviewed something other than the working copy, pass the same
target: \`riff comments --json HEAD~3\`, \`riff comments --json 123\`.

## Act on them

Skip threads with \`resolved: true\` — those are done. For each open thread:

1. Make the change its \`body\` asks for, using \`context\` to place it. Keep
   it minimal and in the style of the surrounding code.
2. Retire it straight away, with the command the thread carries:
   - \`resolve\` — handled. The note stays, marked resolved, and a resolved
     local thread is never published.
   - \`remove\` — delete it outright.
3. Move to the next one. Don't re-run \`--json\` between threads; you already
   have them all.

Replies belong to their root thread; resolving the root closes the thread.

## Rules

- Never run \`gh\` and never push. A local review stays local.
- Don't touch synced (GitHub) comments — the CLI won't either.
- \`riff comments clear\` deletes every local comment. Only on an explicit ask.
- Finish with a short summary: one line per comment, what changed.
`

/**
 * Write the skill into the repo (default) or the user's Claude config, and
 * return the path written.
 */
export function installSkill(global: boolean): string {
  const path = global
    ? join(homedir(), SKILL_RELATIVE_PATH)
    : join(process.cwd(), SKILL_RELATIVE_PATH)
  mkdirSync(join(path, ".."), { recursive: true })
  writeFileSync(path, RIFF_COMMENTS_SKILL, "utf8")
  return path
}
