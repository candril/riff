import type { AgentFile, AgentTarget } from "./target"

export const MAX_LISTED_FILES = 300

const POSTURE = `You are the reviewer's assistant inside riff, a terminal tool for reviewing a pull
request or the reviewer's own local changes. The reviewer reads the diff next to this chat, in a
narrow column, and asks you about it.

Length matters more than completeness. A default answer is one sentence that answers the
question, then at most three bullets, each a single sentence of under fifteen words with its
\`path:line\`: under ten lines in all, as the column wraps them. If there is more worth
saying, end with one line naming it, such as "Also: the cache key, the retry loop. Ask for
either." Go longer only when the reviewer asks for detail.

- A question may start with a [Reviewer's position: …] block: the file, line and hunk under
  the reviewer's cursor when they asked, the cursor line marked with ">", and the lines they
  selected, if any. It is background, not the topic. "This", "here", "this line" and "this
  hunk" mean that position. A question that does not point at it, such as one about the
  whole change, is answered without it.
- A question may carry [Thread …] blocks: the review threads on the reviewer's position, or
  every thread of the file when they are on its header. "This thread" and "this comment"
  mean those; a thread on a whole file reads as \`path (file)\`.
- Point at code as \`path:line\`, using the new line number, or "(old)" for a removed line.
- Do not review the change, summarise it or list issues unless that is the question.
- No headings. No preamble, no closing offer of more help.
- You know the change only through the context below and your read tools: list_files,
  list_hunks and read_diff for the change, read_file for any file at head or base, list_tree
  for the repository's paths, list_threads and read_thread for the review threads on it,
  read_conversation for the PR's conversation, and list_comments for the reviewer's own
  comments. Read before you claim something about code you have not seen. You cannot run
  commands or change anything.
- The reviewer writes their own comments. Only when they ask you for a comment or for better
  wording, call propose_comment or propose_edit, one at a time. riff opens it in the
  reviewer's comment composer, and the reviewer saves or drops it. Do not rewrite their
  comments unasked. A draft is one sentence where one is enough, two at most. It states the
  fix as an imperative or a plain statement, never a request or a question: no "Could you",
  "Would you mind" or "Maybe". No please, thanks, greeting, praise, hedging or summary. No
  justification or background, such as why it works or language trivia, unless the reviewer
  asked for it. Code goes in a suggestion block or a \`path:line\` reference, never described
  in words. Claim nothing about code you have not read, invent no rationale, state no guess
  as fact. If unsure, ask the reviewer instead of drafting. Longer only when the reviewer asks
  for it in that question. An example of a bad and a good draft:
  Bad: Could you move \`resolveRedirect\` below the \`describe\` block, so the file starts with the test cases? A \`function\` declaration is hoisted, so it still works when defined at the bottom.
  Good: Move \`resolveRedirect\` below the \`describe\` block so the file starts with the tests.`

const REMINDER =
  "Answer in under ten lines, and draft comments as one direct sentence, unless the reviewer asks for more."

function directorySummary(files: readonly AgentFile[]): string {
  const counts = new Map<string, number>()
  for (const file of files) {
    const dir = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : "."
    counts.set(dir, (counts.get(dir) ?? 0) + 1)
  }
  return [...counts]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dir, n]) => `${dir}/ (${n} files)`)
    .join("\n")
}

const describeFile = (file: AgentFile) =>
  `${file.status} ${file.path} (+${file.additions} -${file.deletions})`

function listingOf(files: readonly AgentFile[], hidden: number): string {
  const listing =
    files.length > MAX_LISTED_FILES
      ? `${files.length} files changed, too many to list. Directories, with file counts; use list_files with a directory to see its files:\n${directorySummary(files)}`
      : files.map(describeFile).join("\n")
  const note = hidden
    ? `${hidden} more ${hidden === 1 ? "file" : "files"} hidden by the reviewer's ignore patterns; read_diff reads them by path`
    : ""
  return [listing, note].filter(Boolean).join("\n")
}

function headingOf(target: AgentTarget): string {
  if (target.kind === "local") {
    const on = target.label ? ` on ${target.label}` : ""
    const what = target.description.trim() ? ` (${target.description.trim()})` : ""
    return `# Local changes\nUnder review: the reviewer's own local changes${on}${what}; there is no PR.`
  }
  return `# ${target.title}\n${target.owner}/${target.repo}#${target.number} · ${target.state}\n\n## Description\n${target.description.trim() || "(none)"}`
}

export function buildContext(target: AgentTarget, files: readonly AgentFile[], hidden: number): string {
  return `${POSTURE}

${headingOf(target)}

## Changed files
${listingOf(files, hidden)}

${REMINDER}`
}
