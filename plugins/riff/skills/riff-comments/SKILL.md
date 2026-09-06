---
name: riff-comments
description: Work through the local code-review comments riff keeps in .riff/ — list them with the riff CLI, act on each one in the code, then resolve or remove it. Use when the user mentions riff comments, review comments, review notes, or asks to address, fix, apply or work through a local review.
---

# Working through riff's local comments

riff stores review comments as markdown files under `.riff/comments/`. A
comment is local until published; the user wants the local ones acted on,
then retired.

## Read them

```sh
riff comments --json
```

Run it from the repo root. Each row has `shortId`, `file`, `line`, `side`,
`body`, `resolved`, `inReplyTo`, `diffHunk` (the diff the comment was
written against) and `path` (the comment file itself).

If the review was of something other than the working copy, pass the same
target the user reviewed with — `riff comments --json HEAD~3`,
`riff comments --json 123`.

## Act on them

Skip rows with `resolved: true` — those are done. For every open comment:

1. Read the file around `line`; `diffHunk` shows what the reviewer saw.
2. Make the change it asks for, or explain why you didn't. Keep it minimal
   and in the style of the surrounding code.
3. Retire the comment immediately, so the list always reflects what's left:
   - `riff comments resolve <shortId>` — handled. The note stays, marked
     resolved, and a resolved local thread is never published.
   - `riff comments remove <shortId>` — delete it outright.

Replies belong to their root comment; resolving the root closes the thread.

## Rules

- Never run `gh` and never push. A local review stays local.
- Don't touch synced (GitHub) comments — the CLI won't either.
- `riff comments clear` deletes every local comment. Only on an explicit ask.
- Finish with a short summary: one line per comment, what changed.
