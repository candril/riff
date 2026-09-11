# Resolved References

**Status**: Done

## Description

`#412` in a comment tells the person who wrote it what it refers to and tells
everyone else to go and look it up. riff looks it up: references in comment
bodies and in the PR description carry the title and state of what they point
at, and a pasted GitHub URL becomes the reference it was standing in for.

```
Fixed in #412                    →  Fixed in #412 Draw mermaid blocks (merged)
Blocked by other/tool#3          →  Blocked by other/tool#3 Add a flag (closed)
https://github.com/o/r/pull/7    →  #7 Long lines scroll badly (open)
```

## Out of Scope

- References in the diff itself. The rows there are the file's own text, and
  padding them with a title would move every column a comment anchors to.
- Commit SHAs, `GH-412`, reference-style links and GitHub Enterprise hosts.
- Opening what a reference points at. `gx` on the URL is the answer where
  there is a URL; the comments panel has no cursor to point with.
- Remembering answers across sessions. A title is cheap to fetch and a state
  goes stale.

## Capabilities

### P1

- `#412`, `owner/repo#412` and `https://github.com/owner/repo/(pull|issues)/412`
  are found in comment bodies, in a comment being edited locally, and in the
  PR description.
- A bare number resolves against the PR's own repo, or in local mode against
  the repo the working directory is in.
- `repo#412` — the form people inside one organisation write, and the one
  GitHub itself declines to link — resolves against the PR's owner. It is
  only ever shown once it has resolved: `C#5` reads the same and is prose.
- The state is shown as GitHub reports it — open, closed, merged, or draft for
  a pull request that has not been marked ready.
- Code is left alone: a `#412` inside backticks or a fence is text about a
  reference, not a reference.
- A markdown link's own label is left alone too — the author already chose
  what it should say.
- Anything riff cannot resolve — a number that does not exist, a private repo,
  a failed call, being offline — is left exactly as it was written.
- Answers arrive in the background and the panels redraw when they do.

## Technical Notes

### One query, not one per reference

`getReferenceTitles` batches every unknown reference into a single GraphQL
query with an alias per repository, 25 at a time. A thread routinely mentions
a dozen numbers and a round trip each would be slower than the panel they are
drawn into.

One unknown number makes `gh` exit non-zero while still printing every answer
it did get, so the exit code is deliberately ignored and the body is parsed
either way.

### Where the answers live

In a session-wide cache in `features/references/store.ts`, not in `AppState`.
The answers are the same for every reader, nothing about them is undoable, and
the two places they are used — the comments panel and the PR overview — build
their markdown deep inside component code with no state threaded through. The
mention roster is kept the same way, for the same reason.

Keys that have been asked about are remembered separately from the answers, so
a number that does not resolve is asked about once rather than on every pass.

### When it runs

Once at startup, and again whenever the comment poll reports a change or the
PR panel is rebuilt after a refresh — the two moments a reference riff has
never seen can arrive. Each pass only asks about what it has not asked about
before.
