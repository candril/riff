# App Modularization

**Status**: Draft

## Description

Split `src/app.ts` (1574 lines) into focused, feature-based modules. The current file handles too many concerns mixed together. This refactoring extracts vertical feature slices - each feature owns its state, input handling, and actions together.

## Out of Scope

- Changing functionality (this is a pure refactor)
- Migrating to React reconciler (see spec 016)
- Modifying vim-diff module internals
- Adding new features

## Current State Analysis

The file mixes concerns across features:

| Feature | Input Handling | State/Actions | Rendering |
|---------|---------------|---------------|-----------|
| Action Menu | lines 1050-1121 | state.ts | ActionMenu component |
| Review Preview | lines 1124-1220 | state.ts | ReviewPreviewPanel |
| File Tree | lines 1310-1379 | state.ts | FileTreePanel |
| Comments View | lines 1383-1501 | state.ts | CommentsViewPanel |
| Diff/Vim | lines 1505-1562 | vim-diff/* | VimDiffView |
| Comment Editing | lines 530-661 | state.ts | editor utils |
| Review Submission | lines 876-994 | state.ts | github provider |

## Capabilities

### P1 - Extract Feature Modules

Each feature becomes a self-contained module with its own input handling, state operations, and coordination logic.

- **Extract `src/features/action-menu/`**: Menu state, input, filtering, execution
- **Extract `src/features/review-preview/`**: Preview state, input, submission
- **Extract `src/features/comments/`**: Comment CRUD, editor integration, submission
- **Extract `src/features/file-tree/`**: Tree navigation, selection, expansion

### P2 - Extract Remaining Features

- **Extract `src/features/diff-view/`**: Vim integration, divider expansion, cursor management
- **Extract `src/features/comments-view/`**: Comments list navigation, jump-to-diff

### P3 - Slim App Core

- **Slim `app.ts`**: Becomes ~200 line orchestrator that wires features together
- **Extract `src/app/init.ts`**: Data loading, state initialization
- **Extract `src/app/render.ts`**: Main render coordination

## Technical Notes

### Architecture Overview

```
src/
  app.ts                         # Orchestrator (~200 lines)
  app/
    init.ts                      # Initialization
    render.ts                    # Render coordination
  features/
    action-menu/
      index.ts                   # Public API
      input.ts                   # Keyboard handling
      state.ts                   # State slice + actions
    review-preview/
      index.ts
      input.ts
      state.ts
      submit.ts                  # Submission logic
    comments/
      index.ts
      input.ts                   # 'c' key, 'S' key in diff
      editor.ts                  # Editor integration
      submit.ts                  # Single comment submission
    file-tree/
      index.ts
      input.ts
      navigation.ts              # Tree traversal logic
    diff-view/
      index.ts
      input.ts                   # Vim passthrough, Enter for dividers
      dividers.ts                # Expansion logic
    comments-view/
      index.ts
      input.ts
      navigation.ts              # j/k, Enter to jump
```

### Feature Module Pattern

Each feature exports a consistent interface:

```typescript
// src/features/action-menu/index.ts
export { handleInput } from "./input"
export { 
  isOpen,
  open,
  close,
  setQuery,
  moveSelection,
  getFilteredActions,
} from "./state"

// Re-export types
export type { ActionMenuState } from "./state"
```

### Feature Input Handler

Each feature owns its complete input handling:

```typescript
// src/features/action-menu/input.ts
import type { KeyEvent } from "@opentui/core"
import type { FeatureContext } from "../types"
import * as state from "./state"
import { executeAction } from "./execute"

/**
 * Handle input when action menu is open.
 * Returns true if key was handled (menu is open), false otherwise.
 */
export function handleInput(key: KeyEvent, ctx: FeatureContext): boolean {
  if (!state.isOpen(ctx.state)) {
    return false
  }
  
  const filtered = state.getFilteredActions(ctx.state)
  
  switch (key.name) {
    case "escape":
      ctx.setState(state.close)
      return true
    
    case "return":
    case "enter":
      const selected = filtered[ctx.state.actionMenu.selectedIndex]
      if (selected) {
        ctx.setState(state.close)
        executeAction(selected.id, ctx)
      }
      return true
    
    case "up":
      ctx.setState(s => state.moveSelection(s, -1))
      return true
    
    case "down":
      ctx.setState(s => state.moveSelection(s, 1))
      return true
    
    case "p":
      if (key.ctrl) {
        ctx.setState(s => state.moveSelection(s, -1))
        return true
      }
      ctx.setState(s => state.setQuery(s, s.actionMenu.query + "p"))
      return true
    
    case "n":
      if (key.ctrl) {
        ctx.setState(s => state.moveSelection(s, 1))
        return true
      }
      ctx.setState(s => state.setQuery(s, s.actionMenu.query + "n"))
      return true
    
    case "backspace":
      if (ctx.state.actionMenu.query.length > 0) {
        ctx.setState(s => state.setQuery(s, s.actionMenu.query.slice(0, -1)))
      }
      return true
    
    default:
      if (key.sequence?.length === 1 && !key.ctrl && !key.meta) {
        ctx.setState(s => state.setQuery(s, s.actionMenu.query + key.sequence))
      }
      return true  // Capture all keys when open
  }
}
```

### Feature State Slice

Each feature defines its state operations:

```typescript
// src/features/action-menu/state.ts
import type { AppState } from "../../state"
import { getAvailableActions } from "../../actions"
import { fuzzyFilter } from "../../utils/fuzzy"

// Selectors
export function isOpen(state: AppState): boolean {
  return state.actionMenu.open
}

export function getFilteredActions(state: AppState) {
  const available = getAvailableActions(state)
  if (!state.actionMenu.query) return available
  return fuzzyFilter(state.actionMenu.query, available, a => [a.label, a.id, a.description])
}

// Actions (return new state)
export function open(state: AppState): AppState {
  return {
    ...state,
    actionMenu: {
      ...state.actionMenu,
      open: true,
      query: "",
      selectedIndex: 0,
    },
  }
}

export function close(state: AppState): AppState {
  return {
    ...state,
    actionMenu: {
      ...state.actionMenu,
      open: false,
    },
  }
}

export function setQuery(state: AppState, query: string): AppState {
  return {
    ...state,
    actionMenu: {
      ...state.actionMenu,
      query,
      selectedIndex: 0,  // Reset selection on query change
    },
  }
}

export function moveSelection(state: AppState, delta: number): AppState {
  const filtered = getFilteredActions(state)
  const maxIndex = Math.max(0, filtered.length - 1)
  const newIndex = Math.max(0, Math.min(maxIndex, state.actionMenu.selectedIndex + delta))
  
  return {
    ...state,
    actionMenu: {
      ...state.actionMenu,
      selectedIndex: newIndex,
    },
  }
}
```

### Shared Feature Context

Features receive a minimal context for state access and updates:

```typescript
// src/features/types.ts
import type { AppState } from "../state"
import type { VimCursorState } from "../vim-diff/types"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import type { CliRenderer } from "@opentui/core"

export interface FeatureContext {
  // Current state (read-only, use setState to update)
  readonly state: AppState
  readonly vimState: VimCursorState
  readonly lineMapping: DiffLineMapping
  
  // State updates
  setState: (updater: (s: AppState) => AppState) => void
  setVimState: (state: VimCursorState) => void
  rebuildLineMapping: () => void
  
  // Renderer access (for suspend/resume, scroll refs)
  renderer: CliRenderer
  
  // Source identifier for persistence
  source: string
  
  // Render trigger
  render: () => void
}
```

### Comments Feature (More Complex Example)

```typescript
// src/features/comments/index.ts
export { handleDiffInput, handleViewInput } from "./input"
export { handleAddComment } from "./editor"
export { handleSubmitComment } from "./submit"

// src/features/comments/input.ts
import type { KeyEvent } from "@opentui/core"
import type { FeatureContext } from "../types"
import { handleAddComment } from "./editor"
import { handleSubmitComment } from "./submit"
import { getCurrentComment } from "./selectors"

/**
 * Handle comment-related keys in diff view.
 */
export function handleDiffInput(key: KeyEvent, ctx: FeatureContext): boolean {
  // 'c' - add comment
  if (key.name === "c" && !key.ctrl) {
    handleAddComment(ctx)
    return true
  }
  
  // 'S' (shift+s) - submit comment on current line
  if (key.name === "s" && key.shift) {
    const comment = getCurrentComment(ctx)
    if (comment && (comment.status === "local" || comment.localEdit)) {
      handleSubmitComment(ctx, comment)
    }
    return true
  }
  
  return false
}

/**
 * Handle comment-related keys in comments view.
 */
export function handleViewInput(key: KeyEvent, ctx: FeatureContext): boolean {
  // 'S' - submit selected comment
  if (key.name === "s" && key.shift) {
    const comment = getSelectedComment(ctx)
    if (comment && (comment.status === "local" || comment.localEdit)) {
      handleSubmitComment(ctx, comment)
    }
    return true
  }
  
  // 'r' - reply to selected comment (jumps to diff)
  if (key.name === "r") {
    jumpToDiffAndComment(ctx)
    return true
  }
  
  return false
}

// src/features/comments/editor.ts
import type { FeatureContext } from "../types"
import { openCommentEditor, parseEditorOutput, extractDiffHunk } from "../../utils/editor"
import { createComment } from "../../types"
import { saveComment } from "../../storage"
import { getCurrentUser } from "../../providers/github"
import { getSelectionRange, exitVisualMode } from "../../vim-diff/cursor-state"
import { addComment } from "../../state"

export async function handleAddComment(ctx: FeatureContext): Promise<void> {
  const { state, vimState, lineMapping, setState, setVimState, renderer, source, render } = ctx
  
  if (state.files.length === 0) return

  // Determine line range (visual selection or current line)
  const selectionRange = getSelectionRange(vimState)
  const [startLine, endLine] = selectionRange ?? [vimState.line, vimState.line]

  // Find commentable anchor
  let anchor = null
  for (let i = startLine; i <= endLine && !anchor; i++) {
    anchor = lineMapping.getCommentAnchor(i)
  }
  if (!anchor) return

  const file = state.files.find(f => f.filename === anchor!.filename)
  if (!file) return

  // Build context
  const thread = state.comments.filter(
    c => c.filename === anchor!.filename && c.line === anchor!.line && c.side === anchor!.side
  )
  
  const contextLines: string[] = []
  for (let i = startLine; i <= endLine; i++) {
    const line = lineMapping.getLine(i)
    if (line && lineMapping.isCommentable(i)) {
      contextLines.push(line.rawLine)
    }
  }

  let username = "@you"
  if (state.appMode === "pr") {
    try { username = await getCurrentUser() } catch {}
  }

  // Suspend TUI, open editor
  renderer.suspend()

  try {
    const rawContent = await openCommentEditor({
      diffContent: contextLines.join("\n") || file.content,
      filePath: anchor.filename,
      line: anchor.line,
      thread,
      username,
    })

    if (rawContent !== null) {
      const result = parseEditorOutput(rawContent)
      
      // Handle edits to existing comments
      for (const [shortId, newBody] of result.editedComments) {
        await applyCommentEdit(ctx, shortId, newBody)
      }
      
      // Handle new comment/reply
      if (result.newReply) {
        const comment = createComment(anchor.filename, anchor.line, result.newReply, anchor.side, username)
        comment.diffHunk = contextLines.join("\n") || extractDiffHunk(file.content, anchor.line)
        
        if (thread.length > 0) {
          comment.inReplyTo = thread[thread.length - 1]!.id
        }
        
        setState(s => addComment(s, comment))
        await saveComment(comment, source)
      }
    }
  } finally {
    if (vimState.mode === "visual-line") {
      setVimState(exitVisualMode(vimState))
    }
    renderer.resume()
    render()
  }
}

async function applyCommentEdit(ctx: FeatureContext, shortId: string, newBody: string): Promise<void> {
  // ... edit logic
}

// src/features/comments/submit.ts
import type { FeatureContext } from "../types"
import type { Comment } from "../../types"
import { submitSingleComment, submitReply, updateComment, getPrHeadSha, getCurrentUser } from "../../providers/github"
import { saveComment } from "../../storage"
import { showToast, clearToast } from "../../state"

export async function handleSubmitComment(ctx: FeatureContext, comment: Comment): Promise<void> {
  const { state, setState, source, render } = ctx
  
  if (state.appMode !== "pr" || !state.prInfo) return

  const { owner, repo, number: prNumber } = state.prInfo
  const isEdit = comment.status === "synced" && comment.localEdit !== undefined

  let result
  if (isEdit && comment.githubId) {
    result = await updateComment(owner, repo, comment.githubId, comment.localEdit!)
  } else {
    const headSha = await getPrHeadSha(prNumber, owner, repo)
    
    if (comment.inReplyTo) {
      const parent = state.comments.find(c => c.id === comment.inReplyTo)
      if (!parent?.githubId) return
      result = await submitReply(owner, repo, prNumber, comment, parent.githubId)
    } else {
      result = await submitSingleComment(owner, repo, prNumber, comment, headSha)
    }
  }

  if (result.success) {
    let author = comment.author
    if (!author) {
      try { author = await getCurrentUser() } catch {}
    }
    
    const updated: Comment = isEdit
      ? { ...comment, body: comment.localEdit!, localEdit: undefined, author }
      : { ...comment, status: "synced", githubId: result.githubId, githubUrl: result.githubUrl, author }
    
    setState(s => ({
      ...s,
      comments: s.comments.map(c => c.id === comment.id ? updated : c),
    }))
    setState(s => showToast(s, isEdit ? "Comment updated" : "Comment submitted", "success"))
    
    await saveComment(updated, source)
    render()
    
    setTimeout(() => { setState(clearToast); render() }, 3000)
  } else {
    setState(s => showToast(s, result.error ?? "Failed to submit", "error"))
    render()
    setTimeout(() => { setState(clearToast); render() }, 5000)
  }
}
```

### App Orchestrator

After extraction, `app.ts` wires features together:

```typescript
// src/app.ts (~200 lines)
import { createCliRenderer, type KeyEvent } from "@opentui/core"
import { initializeApp } from "./app/init"
import { createRenderFunction } from "./app/render"
import type { FeatureContext } from "./features/types"

// Feature imports
import * as actionMenu from "./features/action-menu"
import * as reviewPreview from "./features/review-preview"
import * as fileTree from "./features/file-tree"
import * as comments from "./features/comments"
import * as commentsView from "./features/comments-view"
import * as diffView from "./features/diff-view"

export async function createApp(options: AppOptions = {}) {
  // Initialize
  const { state: initialState, vimState: initialVimState, source, renderer, panels } = 
    await initializeApp(options)
  
  let state = initialState
  let vimState = initialVimState
  let lineMapping = createLineMapping(state)
  
  // Render function
  const render = createRenderFunction({ renderer, panels, getState: () => state, ... })
  
  // Feature context
  const ctx: FeatureContext = {
    get state() { return state },
    get vimState() { return vimState },
    get lineMapping() { return lineMapping },
    setState: (fn) => { state = fn(state); render() },
    setVimState: (s) => { vimState = s },
    rebuildLineMapping: () => { lineMapping = createLineMapping(state) },
    renderer,
    source,
    render,
  }
  
  // Input dispatch - features in priority order
  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    // Modal overlays (capture all input)
    if (actionMenu.handleInput(key, ctx)) return
    if (reviewPreview.handleInput(key, ctx)) return
    
    // Global keys
    if (handleGlobalKeys(key, ctx)) return
    
    // Context-specific
    if (state.showFilePanel && state.focusedPanel === "tree") {
      if (fileTree.handleInput(key, ctx)) return
    }
    
    if (state.viewMode === "comments") {
      if (commentsView.handleInput(key, ctx)) return
      if (comments.handleViewInput(key, ctx)) return
    }
    
    if (state.viewMode === "diff") {
      if (diffView.handleInput(key, ctx)) return
      if (comments.handleDiffInput(key, ctx)) return
    }
  })
  
  render()
  
  return { renderer, quit: () => { renderer.destroy(); process.exit(0) }, getState: () => state }
}

function handleGlobalKeys(key: KeyEvent, ctx: FeatureContext): boolean {
  switch (key.name) {
    case "q":
      ctx.renderer.destroy()
      process.exit(0)
    
    case "p":
      if (key.ctrl) {
        ctx.setState(actionMenu.open)
        return true
      }
      break
    
    case "b":
      if (key.ctrl) {
        ctx.setState(s => {
          const toggled = toggleFilePanel(s)
          return toggled.showFilePanel ? { ...toggled, focusedPanel: "tree" } : toggled
        })
        return true
      }
      break
    
    case "tab":
      ctx.setState(toggleViewMode)
      return true
    
    // ... other global keys
  }
  return false
}
```

### Migration Path

1. **Phase 1 - Action Menu Feature**
   - Create `src/features/types.ts` with `FeatureContext`
   - Create `src/features/action-menu/` with input.ts and state.ts
   - Wire into app.ts, test menu functionality
   - Remove old code from app.ts

2. **Phase 2 - Review Preview Feature**
   - Create `src/features/review-preview/`
   - Include submission logic in submit.ts
   - Wire and test

3. **Phase 3 - Comments Feature**
   - Create `src/features/comments/`
   - Extract editor integration, submission
   - Handle both diff-view and comments-view input

4. **Phase 4 - File Tree Feature**
   - Create `src/features/file-tree/`
   - Extract navigation, expansion logic

5. **Phase 5 - View Features**
   - Create `src/features/diff-view/` (vim passthrough, dividers)
   - Create `src/features/comments-view/` (list navigation)

6. **Phase 6 - App Cleanup**
   - Extract init to `src/app/init.ts`
   - Extract render to `src/app/render.ts`
   - Slim app.ts to orchestrator

### File Structure After Refactor

```
src/
  app.ts                              # ~200 lines, orchestration
  app/
    init.ts                           # ~80 lines, data loading
    render.ts                         # ~100 lines, render function
  features/
    types.ts                          # FeatureContext interface
    action-menu/
      index.ts                        # exports
      input.ts                        # ~60 lines
      state.ts                        # ~50 lines
    review-preview/
      index.ts
      input.ts                        # ~80 lines
      state.ts                        # ~40 lines
      submit.ts                       # ~80 lines
    comments/
      index.ts
      input.ts                        # ~40 lines
      editor.ts                       # ~100 lines
      submit.ts                       # ~70 lines
      selectors.ts                    # ~30 lines
    file-tree/
      index.ts
      input.ts                        # ~60 lines
      navigation.ts                   # ~40 lines
    diff-view/
      index.ts
      input.ts                        # ~50 lines
      dividers.ts                     # ~60 lines
    comments-view/
      index.ts
      input.ts                        # ~60 lines
      navigation.ts                   # ~30 lines
```

### Benefits of Feature Slicing

1. **Cohesion**: All action-menu code is in one place, not spread across app.ts and state.ts

2. **Discoverability**: "How does review submission work?" → Look in `features/review-preview/`

3. **Testing**: Each feature can be tested in isolation with a mock `FeatureContext`

4. **Ownership**: Features can evolve independently

5. **Onboarding**: New developers understand one feature at a time

### Key Considerations

1. **Shared state**: Features read/write to the same `AppState`. The `FeatureContext.setState` pattern keeps this clean.

2. **Feature dependencies**: Comments feature needs vim state for selection range. Pass through context, don't import directly.

3. **Avoid premature extraction**: If a feature is < 50 lines total, it may not need its own directory yet.

4. **Components stay separate**: UI components remain in `src/components/`. Features are logic, not rendering.
