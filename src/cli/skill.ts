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

Run it from the repo root. Each row has \`shortId\`, \`file\`, \`line\`, \`side\`,
\`body\`, \`resolved\`, \`inReplyTo\`, \`diffHunk\` (the diff the comment was
written against) and \`path\` (the comment file itself).

If the review was of something other than the working copy, pass the same
target the user reviewed with — \`riff comments --json HEAD~3\`,
\`riff comments --json 123\`.

## Act on them

Skip rows with \`resolved: true\` — those are done. For every open comment:

1. Read the file around \`line\`; \`diffHunk\` shows what the reviewer saw.
2. Make the change it asks for, or explain why you didn't. Keep it minimal
   and in the style of the surrounding code.
3. Retire the comment immediately, so the list always reflects what's left:
   - \`riff comments resolve <shortId>\` — handled. The note stays, marked
     resolved, and a resolved local thread is never published.
   - \`riff comments remove <shortId>\` — delete it outright.

Replies belong to their root comment; resolving the root closes the thread.

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
