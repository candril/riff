# Agent Chat

**Status**: In Progress

## Description

riff's Claude integration ([036](./036-ai-review-post-comment.md)) opens
`claude` in a tmux split. riff writes the diff to a context file, the
session reads it, and a drafted comment travels back through
`draft-comment.json`, a poller and a clipboard copy. Every step of that is
a seam the reviewer feels: another pane to manage, a context frozen at
launch, a draft that has to be pasted, and a Claude Code session that
behaves like one — it runs `gh` to "verify", `cd`s around, and opens with
an analysis nobody asked for.

The chat moves into riff. A column beside the diff holds a conversation
with an agent that sees what the reviewer sees: the line under the cursor,
the selection, the file, the PR. It answers questions about the code and
does small tasks, briefly. When the reviewer wants a comment, the agent
drafts it into riff's own comment composer, where it is edited and saved
like any comment the reviewer typed.

[tenor](../../tenor) built this already (its specs 004, 005, 020, 026 and
028, ADR-002 and ADR-003). This spec takes its design and fits it to riff.

## Out of Scope

- **The agent writing anywhere.** It never publishes to GitHub, never
  edits files, never runs commands. Drafting a comment is the furthest it
  goes, and the reviewer saves that draft themself (tenor ADR-003).
- **A shell or a raw `gh`.** The agent reads through tools riff provides,
  some of which call `gh` underneath. It cannot pass `gh` arguments of its
  own, so it cannot reach a write endpoint.
- **API-key billing.** The agent runs on the user's Claude subscription
  login, the way tenor does (ADR-002).
- **Several conversations at once.** One chat per review; a new
  conversation replaces it.
- **Reviewing the PR unprompted.** No summary, no issue list, no opening
  analysis.

## Capabilities

### P1 - The column

- **A chat column on the right of the diff**, toggled with a key and
  docked the way the thread panel is: the diff narrows and keeps all of
  its content visible, and split view falls back to unified below 120
  columns as usual. When the thread panel is open as well, it sits
  between the diff and the chat.
- **Focus moves with the existing walk** (`Ctrl-l` / `Ctrl-h`: tree →
  diff → threads → chat). The input's shading shows that the chat has
  focus, so letters typed there never run diff commands.
- **The input** grows from one to six lines. `Enter` sends, or queues the
  question while an answer is still coming; `Ctrl-j` inserts a line break;
  `Esc` interrupts an answer; a new conversation needs the key pressed
  twice.
- **Answers stream in** from the bottom of the column, rendered as
  markdown, with one status line above the input: thinking, answering,
  how long, how many questions wait.
- **The key is `Ctrl-r`** for open and focus, and again for close. It is
  free today. Not `Ctrl-m` (it is `Enter`), `Ctrl-a` (a common tmux
  prefix), `Ctrl-q` (terminal flow control) or `Ctrl-w` (deletes a word
  in the input).
  Free in the global keys, that is: the thread panel's `r` (reply inline)
  and the PR info panel's `r` (expand a section) ignore ctrl, so `Ctrl-r`
  is taken ahead of both and opens the chat there too.

### P1 - What a question carries

- **The reviewer's position goes with every question**, taken when
  `Enter` is pressed: file, side, line, the hunk around it, and the
  selection when there is one. The chat shows it above the question, so
  the reviewer sees what was sent. "This", "here" and "this line" mean
  that position.
- **`@` attaches more on purpose**: `@selection` (or `@s`: every selected
  line on its side, with its hunk header), `@file` (the current file's
  diff), `@pr` (the PR's title, number, description and its file list with
  counts), or `@path` for another changed file. The tokens are expanded
  when the question is sent, against the same position it carries, and the
  agent receives each attachment ahead of the question, which keeps its
  tokens as typed. Each is capped at 400 lines, with a footer that names
  the `read_diff` or `list_files` call for the rest, so one reference
  cannot flood the context. A repeated token attaches once; trailing
  punctuation is not part of a token; `@Inject` or `@handle`, which do not
  look like a path, stay text.
- **A reference that names nothing stops the question**: `@selection`
  with no selection, `@file` with no file under the cursor, `@pr` in a
  local review, or a path that is no changed file. The chat says why, and
  the input keeps the text so it can be fixed.
- **The chat shows what went along**: a short label per attachment
  (`@selection a.ts:12-30`, `@file src/a.ts`, `@pr #812`, `@src/b.ts`)
  beside the position label above the question, on one line.
- **Asking about what is on screen** is one key from the diff: in visual
  mode, `Ctrl-r` opens the chat with `@selection` at the start of the
  input; elsewhere in the diff it puts `@file` there. A token the input
  already holds is not added again, and Ctrl-r from the tree, the thread
  panel or another view adds nothing. This replaces the palette's
  "Claude: Chat about selection/file/whole diff" actions.

### P1 - What the agent can read

- **The change**: the files, their hunks, the diff of any file, and the
  PR's threads.
- **Any file at the PR's head or base**, not only the changed ones: from
  the local VCS for a local diff, through `gh api …/contents?ref=<sha>`
  for a PR. Context outside the change set is how the agent answers
  "where else is this called" or "what did this look like before".
- **The repository's tree** at head, to find files by path.
- **Reads are paged** (2,000 lines with an offset to continue) and
  capped per answer, and diff lines carry their old and new numbers so the
  agent quotes `path:line` without counting.

### P1 - Drafting comments

- **The agent proposes a comment with a tool** (`propose_comment`: path,
  line or line range, side, text). riff checks that the line can carry a
  comment on that side; if not, the tool returns why and nothing opens.
- **The proposal opens in riff's comment composer** in the thread panel,
  prefilled with the agent's text, exactly as if the reviewer had pressed
  the comment key on that line and typed it. The reviewer edits it there
  and saves it locally, publishes it, or drops it with `Esc`, with the
  composer's usual keys. A GitHub suggestion block works like any other
  text.
- **The tool waits for that outcome** and returns it to the agent: saved
  (with the final text), published, or dropped. One proposal at a time;
  a second is refused until the first closes. A half-written comment of
  the reviewer's is never replaced; the proposal waits for it.
- **`propose_edit`** offers new wording for one of the reviewer's
  existing local comments the same way, opening it in edit mode.

### P1 - How the agent answers

- **Briefly.** The system prompt makes length the first rule: one
  sentence that answers, then at most three one-line bullets with their
  `path:line`, under ten lines in all; longer only when asked. No
  headings, no preamble, no closing offer of help. The prompt ends with
  the length rule again, because the last instruction is the one a model
  keeps.
- **It does not start by analysing the PR.** It does not review,
  summarise or list issues unless that is the question. tenor found that
  the bare Claude Code preset answers the first question with a full
  review; the posture text is what stops it.
- **It reads before it claims.** Anything about code it has not read, it
  reads first.
- **It writes comments only when asked**, and never rewrites the
  reviewer's own unasked.

### P2 - Continuity

- **The conversation survives a restart** of riff on the same review: the
  session id is stored with the review in `.riff/<source>/chat.json`, and
  resumed when its session still exists. When it does not, the chat says
  so and starts fresh.
- **The agent hears about changes once**, with the next question: new
  commits on the PR, a refresh, comments the reviewer added or removed.
- **Searching the repository.** Text search across the head revision,
  not only reading by path. For a local diff that is the working copy;
  for a PR it needs a checkout riff keeps out of the reviewed repo (a
  shallow clone of the head under riff's cache), which is why it is not
  P1.

### P3 - Tasks beyond answers

- **Proposing a review** (approve, request changes, comment) as a card
  riff shows and the reviewer confirms with a key, with the body empty
  unless asked for — tenor's `propose_review` under ADR-003.

## Technical Notes

- **Agent SDK, not a spawned CLI.** `@anthropic-ai/claude-agent-sdk`,
  pinned exact like OpenTUI, with one long-lived `query()` fed by an
  async inbox, `includePartialMessages` for streaming and `interrupt()`
  for `Esc`. tenor's `src/providers/agent/` is the model: an `Agent`
  interface in core, the SDK as one implementation.
- **Locked down.** `tools: []` turns off every built-in tool,
  `settingSources: []` and `strictMcpConfig` keep out CLAUDE.md, hooks,
  skills and the user's MCP servers, `permissionMode: "dontAsk"`, and the
  only tools are riff's own, in an in-process MCP server with
  `alwaysLoad` (without it the model spends a round trip on ToolSearch).
- **Not inside the reviewed repo.** The SDK's working directory is
  riff's state directory: the `claude_code` preset otherwise describes
  that repo's git state to the model. The environment drops
  `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN`, which would silently
  switch billing to the API.
- **The compiled binary** cannot spawn the SDK's bundled `claude`; it
  points `pathToClaudeCodeExecutable` at the installed one. A `claude`
  that drifts from the pinned SDK can break the chat, so riff checks the
  version at startup and says so in the chat rather than failing on the
  first question.
- **The system prompt** is the preset plus riff's posture, the review's
  target (PR title, number, state, description; or the local revision),
  the changed files with their counts (directories with counts above 300
  files), and the length reminder last. tenor's
  `src/providers/agent/prompt.ts` is the starting text.
- **Tools**: `list_files`, `list_hunks`, `read_diff`, `read_file(path,
  side)`, `list_tree`, `list_threads`, `read_thread`, `list_comments`,
  `propose_comment`, `propose_edit`; `search` with P2.
- **The proposal path** is `openInlineCommentOverlay(…, "compose", …)`
  with the composer's input set to the agent's text; saving goes through
  the existing `submitInlineDraft`, so an agent's draft is stored,
  anchored and published exactly like the reviewer's.
- **What goes away**: `src/features/ai-review/` (the context files under
  `.git/riff-ai-review/`, the system-prompt file, the `/riff-comment`
  command, the draft poller and `DraftNotification`) and its palette
  actions. Spec 036 becomes `Superseded by 102`.
- **The column** reuses the content row's docking: a third column after
  the thread panel, a width helper like the thread panel's, and a new
  `focusedPanel` value in the focus walk. tenor's `ChatPane.tsx`,
  `state.ts` and `keys.ts` port across nearly as they are once spec 100
  has moved riff's chrome to Solid.
- **Decision record.** Running the agent on the subscription is a
  decision with a known grey area; riff records it as its own ADR, citing
  tenor's ADR-002, when this spec is built.
