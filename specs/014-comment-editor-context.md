# 014 - Comment Editor Context

Status: Ready

## Overview

When opening the comment editor (`c` key), show context about existing comments, threads, and the diff. User's new comment starts at line 1 for immediate typing. Own comments in the thread can be edited in-place.

## Editor Buffer Structure

```
[new reply here - cursor starts here]

--- THREAD (edit your comments below, other comments are read-only) ---

@alice (2h ago):
This looks wrong, should be `baz`

  @bob (1h ago):
  Good catch, fixing now

  <!-- @stefan (pending) [edit:9e8aa9af] -->
  I'll fix this in the next commit
  <!-- /edit -->

--- CONTEXT ---

+    const foo = bar;
     // some context  
-    const old = value;

--- FULL CHANGE ---

@@ -40,6 +40,8 @@
     // more lines...
+    const foo = bar;
     // some context
-    const old = value;
     // trailing context
```

## Rules

1. **Line 1**: New reply (always empty, cursor starts here)
2. **THREAD block**: 
   - Shows existing comments with `@username (time ago):`
   - Indent replies with 2 spaces
   - Own comments wrapped in `<!-- @username (status) [edit:ID] -->` and `<!-- /edit -->` markers
   - ID is the short comment ID (first 8 chars) for identification on save
   - Status: `(pending)`, `(local)`, or `(synced)`
   - Other users' comments are plain text (read-only, changes ignored)
3. **CONTEXT block**: 3 lines around the selected line(s) from diff
4. **FULL CHANGE block**: Complete diff hunk for reference

## Username Display

- GitHub PR mode: Use actual GitHub username (e.g., `@stefan`)
- Local mode: Use `@you`

## Parsing on Save

1. Extract new reply: Text before `--- THREAD` marker (or `--- CONTEXT` if no thread)
2. Extract edited own comments: Content between `<!-- @username ... [editable] -->` and `<!-- end editable -->`
3. Compare edited content with original - if changed, update that comment
4. If new reply is non-empty, create as reply to thread
5. Empty new reply = no new comment (not a delete)

## Markers

```
--- THREAD (edit your comments below, other comments are read-only) ---
<!-- @username (status) [edit:COMMENT_ID] -->
<!-- /edit -->
--- CONTEXT ---
--- FULL CHANGE ---
```

- `COMMENT_ID`: Short ID (first 8 chars of UUID, or `gh-123456` for GitHub comments)

## Edge Cases

- No existing comments: Skip THREAD block, user creates first comment
- No diff context available: Skip CONTEXT block
- No full hunk available: Skip FULL CHANGE block
- User has no comments in thread: No editable blocks, just new reply area
