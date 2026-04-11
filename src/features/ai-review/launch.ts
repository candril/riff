/**
 * Launch Claude Code with a pre-written context file.
 *
 * In tmux: split the current window vertically (tmux `-h`, left/right split)
 * and run `claude` in the new pane. Detached so riff keeps running.
 *
 * Outside tmux: suspend riff's renderer, run `claude` inline, resume on exit.
 *
 * Permission grants
 * -----------------
 * The context and system-prompt files live inside cwd (under `.git/` or
 * `.jj/`), so claude already trusts them — no `--add-dir` prompt. We pass:
 *
 *   --allowedTools Read,Glob,Grep,Write(<rel draft path>)
 *     so read-type tools never prompt for path, and writing the one
 *     specific `draft-comment.json` file (spec 036) never triggers the
 *     "Do you want to create draft-comment.json?" prompt. The path is
 *     relative to cwd so it matches what Claude displays in any prompt
 *     and avoids the absolute-path `//abs` quirk in the permission
 *     grammar.
 *
 *   --append-system-prompt-file <f>
 *     so the review directives land in the system prompt (not in the
 *     user message), making them binding and invisible to the chat
 *     transcript.
 *
 * Every *other* Edit/Write/Bash still prompts as usual — we deliberately
 * don't bypass all permissions. A review conversation is analysis, not
 * authoring; the only authored artefact is the single draft file.
 */

import { relative } from "node:path"

export interface LaunchContext {
  suspendRenderer: () => void
  resumeRenderer: () => void
  render: () => void
}

export interface LaunchResult {
  mode: "tmux" | "inline"
}

/**
 * Launch `claude` with an opening prompt that points at the given context file.
 *
 * The opener intentionally just tells Claude where the context is and waits
 * for the user's first question — no canned review prompt. The behavioural
 * directives (don't run `gh`, don't `cd`, etc.) live in the file at
 * `systemPromptPath`, passed via `--append-system-prompt-file`.
 *
 * `draftPath` is the absolute path `handlers.ts::draftPathFor` computed
 * for this launch — we pre-authorize Write access to it via `--allowedTools`
 * so Claude can save the JSON draft without prompting the user (spec 036).
 */
export async function launchClaudeWithContext(
  contextPath: string,
  systemPromptPath: string,
  draftPath: string,
  ctx: LaunchContext,
): Promise<LaunchResult> {
  const opener = `I've put code-review context at ${contextPath}. Please read it, then wait for my question.`
  const args = buildClaudeArgs(systemPromptPath, draftPath, opener)

  if (process.env.TMUX) {
    // tmux `-h` produces a vertical divider (left/right split).
    Bun.spawn(
      ["tmux", "split-window", "-h", "-p", "50", ...args],
      { stdio: ["ignore", "ignore", "ignore"] },
    ).unref()
    return { mode: "tmux" }
  }

  // Inline fallback: suspend the TUI, run claude attached to the terminal,
  // resume on exit. Same pattern as handleOpenFileInEditor.
  ctx.suspendRenderer()
  try {
    const proc = Bun.spawn(args, {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    })
    await proc.exited
  } finally {
    ctx.resumeRenderer()
    ctx.render()
  }
  return { mode: "inline" }
}

/**
 * Build the claude CLI invocation. Kept separate so it's easy to eyeball
 * the flag ordering — commander's variadic parsing means the positional
 * prompt must come after single-value flags, and the comma-separated
 * `--allowedTools` value avoids greedy consumption of the prompt.
 *
 * The Write grant uses a path relative to cwd (e.g.
 * `.git/riff-ai-review/gh-owner-repo-N/draft-comment.json`). Absolute
 * paths in the permission grammar require a `//abs/path` prefix that's
 * easy to get wrong — since `draftPath` always sits inside `cwd`, a
 * relative literal is both correct and matches what Claude displays.
 */
function buildClaudeArgs(
  systemPromptPath: string,
  draftPath: string,
  opener: string,
): string[] {
  const relDraftPath = relative(process.cwd(), draftPath)
  return [
    "claude",
    "--allowedTools",
    `Read,Glob,Grep,Write(${relDraftPath})`,
    "--append-system-prompt-file",
    systemPromptPath,
    opener,
  ]
}
