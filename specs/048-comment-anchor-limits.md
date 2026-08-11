## Comment Anchoring Limits

**Status**: Done

## Description

Commenting on an expanded (unchanged, out-of-hunk) line failed with a bare
"gh: Validation Failed (HTTP 422)" toast after the user had already written
the comment. Two problems: riff was hiding the API's explanation, and it let
the user compose a comment GitHub was always going to reject.

## What GitHub actually allows

Measured against a live PR (`candril/jj-test#4`), not inferred:

| Target | REST `POST /pulls/{n}/comments` | GraphQL `addPullRequestReviewThread` |
|---|---|---|
| Added / deleted line | works | works |
| Unchanged line **inside a hunk** | works | works |
| Unchanged line **outside every hunk** | 422 `pull_request_review_thread.line could not be resolved` | silently returns `thread: null` |
| Whole file (`subject_type=file`) | works | n/a |

So a context line that the diff already shows is commentable — that is the
common case, and riff always supported it. A line only visible because the
user expanded a collapsed region cannot be anchored by any public API. The
web UI can, because its expansion re-resolves positions server-side against
an expanded diff; that path isn't exposed.

Two other findings worth recording:

- `addPullRequestReviewThread` with `pullRequestId` creates a **pending**
  review holding the thread — it does not publish a comment.
- A pending review left on the PR makes REST comment creation fail with
  `user_id can only have one pending review per pull request`. This is a
  second, unrelated source of the same 422 toast.

## Capabilities

### P1 - MVP

- Comment entry points refuse an out-of-diff line up front, explaining why,
  instead of failing after the comment is written.
- `getCommentAnchor` returns null for expanded lines, so every consumer
  (comments, PR diff links) agrees on what is anchorable.
- API failures surface GitHub's own message, with a plain-language hint for
  the three known cases (unresolvable line, pending review, stale commit).

## Technical Notes

### Error surfacing

`extractShellError` only read **stderr**, where `gh` writes a terse
"Validation Failed (HTTP 422)". The API's JSON body — with the specific
`errors[].field` and `errors[].message` — goes to **stdout**. It now reads
stdout first, prefers `errors[]` over the generic `message`, and maps known
wordings through `API_ERROR_HINTS`.

### Marking expanded lines

`DiffLine.expanded` is set where the line mapping materialises a collapsed
region. `isOutsideDiff(visualIndex)` exposes it so the comment handlers can
explain the refusal, while blob permalinks — which address the file, not the
diff — keep working on those lines.
