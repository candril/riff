---
name: riff-comment
description: Draft an inline PR review comment for the user to post (spec 036)
disable-model-invocation: true
---

You're pair-reviewing a PR with the user inside riff. They want you to
turn a piece of feedback into an inline PR review comment that they will
post themselves.

Follow the drafting protocol from your system prompt — the draft path,
JSON schema, and "don't run gh" rules are already defined there. Do not
repeat them back and do not ask for them.

Be fast:

1. If the context file has a `## Draft anchor` section, use those
   `filename` / `side` / `line` / `startLine` values verbatim. They
   reflect the visual-line selection the user made in riff and are
   already GitHub-compatible.
2. Otherwise, look at the diff in your review-context file to pick the
   exact file and line numbers. Use the `+` side (`RIGHT`) unless the
   feedback is about a deleted line.
3. If the feedback below reads like a concrete replacement ("rename to",
   "inline this", "replace with", "use pattern"), draft it as a **code
   suggestion** (```suggestion fence in the body, range covers the
   exact lines being replaced). Otherwise, draft a plain comment
   anchored at the first row of the selection.
4. Write the draft JSON immediately and then tell the user:
   "Draft written — press `gd` in riff to copy it."
5. If it's ambiguous which lines are meant (and no Draft anchor section
   exists), ask **one** clarifying question before drafting. Don't
   deliberate beyond that.

Do not run `gh`, `git`, or any shell command to post. The user posts
the comment themselves after copying it out of riff.

User feedback to turn into a review comment:
$ARGUMENTS
