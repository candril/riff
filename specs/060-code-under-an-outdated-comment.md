# Code Under an Outdated Comment

**Status**: Draft

## Description

A comment goes outdated when the lines it was written against have changed
since. GitHub greys it out and hides the code; riff shows the comment but
anchors it wherever the line has drifted to, or drops it out of the diff
entirely. Either way the one thing that would explain it — the code as it was
when someone objected to it — is not on screen.

The idea: on an outdated comment, show the original hunk it was written
against.

## Open Questions

- Where does the old code come from? A review comment carries `diff_hunk` and
  `original_commit_id` / `original_line` from the API, so the hunk may already
  be in the data riff loads, without any extra request.
- Where does it go? A peek overlay is the obvious home (`gl` already draws
  what the cursor's row really is), but the comment lives in the panel, not
  the diff, so the key would have to belong to the panel.
- Should it show the hunk as it was, or a diff between then and now? The
  second answers "what changed under this comment", which is the actual
  question, and costs a second blob.
- What about a comment whose file is gone?

## Notes

Raised while building spec 059. Nothing is implemented; this is here so the
idea is not lost.
