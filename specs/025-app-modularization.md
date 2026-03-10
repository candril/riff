# App Modularization

**Status**: Ready

## Description

Split `src/app.ts` (3634 lines) into focused, feature-based modules. The current file handles too many concerns mixed together. This refactoring extracts vertical feature slices - each feature owns its state, input handling, and actions together.

## Out of Scope

- Changing functionality (this is a pure refactor)
- Migrating to React reconciler (see spec 016)
- Modifying vim-diff module internals
- Adding new features

## Current State Analysis

The file has grown significantly and mixes many concerns:

| Feature | Input Handling | State/Actions | Lines (approx) |
|---------|---------------|---------------|----------------|
| **Modal Overlays** | | | |
| Action Menu | lines 2625-2699 | state.ts | ~75 |
| File Picker | lines 2701-2796 | state.ts | ~95 |
| PR Info Panel | lines 2798-2882 | state.ts | ~85 |
| Sync Preview | lines 2884-2906 | state.ts | ~25 |
| Review Preview | lines 2908-3013 | state.ts | ~105 |
| Search Input | lines 3015-3043 | search-handler | ~30 |
| **Navigation** | | | |
| File Tree Panel | lines 3224-3350 | state.ts | ~125 |
| Comments View | lines 3352-3508 | state.ts | ~155 |
| Diff View (Vim) | lines 3511-3610 | vim-diff/* | ~100 |
| **Key Sequences** | | | |
| g/z/]/[ sequences | lines 3118-3222 | various | ~105 |
| **Actions/Handlers** | | | |
| File Navigation | lines 739-1016 | state.ts | ~280 |
| Comment Add/Edit | lines 1112-1244 | editor utils | ~130 |
| Comment Submit | lines 1340-1461 | github provider | ~120 |
| Review Submit | lines 2407-2525 | github provider | ~120 |
| Sync Execute | lines 1854-1954 | github provider | ~100 |
| Thread Resolution | lines 1959-2026 | github provider | ~70 |
| Fold Operations | lines 2028-2402 | state.ts | ~375 |
| External Editor/Diff | lines 1684-1849 | editor utils | ~165 |
| Refresh | lines 1511-1634 | providers | ~125 |
| PR Info Panel Open | lines 1639-1678 | github provider | ~40 |
| **Setup/Render** | | | |
| Initialization | lines 119-325 | - | ~205 |
| Render Function | lines 430-685 | - | ~255 |
| Line Mapping | lines 226-248 | vim-diff | ~25 |
| Vim Handler Setup | lines 309-385 | vim-diff | ~75 |

**Total**: ~3634 lines with significant interleaving of concerns

## Capabilities

### P1 - Extract Modal Overlay Features

Modal overlays capture all input when open - they're the cleanest to extract first.

- **Extract `src/features/action-menu/`**: Menu state, input, filtering, action execution (~75 lines)
- **Extract `src/features/file-picker/`**: File picker state, input, file selection (~95 lines)
- **Extract `src/features/review-preview/`**: Preview state, input, review submission (~225 lines total with submit logic)
- **Extract `src/features/sync-preview/`**: Sync state, input, sync execution (~125 lines)

### P2 - Extract Panel Features

Panel-based features with their own navigation and input handling.

- **Extract `src/features/file-tree/`**: Tree navigation, selection, expansion, viewed status toggle (~125 lines)
- **Extract `src/features/comments-view/`**: Comments list navigation, thread collapse, jump-to-diff (~155 lines)
- **Extract `src/features/pr-info-panel/`**: PR info display, commit navigation (~85 lines)

### P3 - Extract Diff View Features

The diff view is the most complex - vim integration, search, comments, folds.

- **Extract `src/features/diff-view/`**: Vim integration, visual mode, divider expansion (~100 lines input)
- **Extract `src/features/search/`**: Search input handling, match navigation (~30 lines input + search-handler integration)
- **Extract `src/features/folds/`**: File folds, za/zR/zM/zo/zc handlers (~375 lines)

### P4 - Extract Action Handlers

Large handler functions that coordinate multiple concerns.

- **Extract `src/features/comments/`**: Comment add/edit/submit, thread resolution (~320 lines)
- **Extract `src/features/file-navigation/`**: ]f/[f, ]u/[u, ]o/[o navigation (~280 lines)
- **Extract `src/features/external-tools/`**: Editor open, external diff viewers (~165 lines)

### P5 - Slim App Core

- **Slim `app.ts`**: Becomes ~300 line orchestrator that wires features together
- **Extract `src/app/init.ts`**: Data loading, state initialization (~200 lines)
- **Extract `src/app/render.ts`**: Main render coordination (~250 lines)
- **Extract `src/app/global-keys.ts`**: Global key handling (Ctrl+p, Ctrl+b, Tab, q, etc.)

## Technical Notes

### Architecture Overview

```
src/
  app.ts                         # Orchestrator (~300 lines)
  app/
    init.ts                      # Initialization (~200 lines)
    render.ts                    # Render coordination (~250 lines)
    global-keys.ts               # Global key handling
  features/
    # P1 - Modal Overlays
    action-menu/
      index.ts                   # Public API
      input.ts                   # Keyboard handling (~60 lines)
      execute.ts                 # Action execution
    file-picker/
      index.ts
      input.ts                   # (~80 lines)
    review-preview/
      index.ts
      input.ts                   # (~80 lines)
      submit.ts                  # Review submission (~120 lines)
    sync-preview/
      index.ts
      input.ts                   # (~25 lines)
      execute.ts                 # Sync execution (~100 lines)
    
    # P2 - Panel Features
    file-tree/
      index.ts
      input.ts                   # (~100 lines)
      navigation.ts              # Tree traversal logic
    comments-view/
      index.ts
      input.ts                   # (~120 lines)
      navigation.ts              # j/k, Enter to jump
    pr-info-panel/
      index.ts
      input.ts                   # (~70 lines)
    
    # P3 - Diff View
    diff-view/
      index.ts
      input.ts                   # Vim passthrough, V, v, c, Enter (~80 lines)
      dividers.ts                # Expansion logic
    search/
      index.ts
      input.ts                   # Search prompt input
    folds/
      index.ts
      handlers.ts                # za/zR/zM/zo/zc (~300 lines)
    
    # P4 - Action Handlers
    comments/
      index.ts
      input.ts                   # 'c' key, 'S' key in diff
      editor.ts                  # Editor integration (~130 lines)
      submit.ts                  # Single comment submission (~120 lines)
      resolution.ts              # Thread resolution (~70 lines)
    file-navigation/
      index.ts
      handlers.ts                # ]f/[f, ]u/[u, ]o/[o (~280 lines)
    external-tools/
      index.ts
      editor.ts                  # Open in editor (~85 lines)
      diff-viewers.ts            # difftastic, delta, nvim (~80 lines)
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

Each phase is a separate jj change that can be tested independently.

#### Phase 1: Foundation + Action Menu (~1 hour)
1. Create `src/features/types.ts` with `FeatureContext` interface
2. Create `src/features/action-menu/` with:
   - `index.ts` - exports
   - `input.ts` - keyboard handling (extract lines 2625-2699)
   - `execute.ts` - action execution (extract `executeAction` function)
3. Wire into app.ts, test menu functionality
4. Remove old code from app.ts

**Why start here**: Action menu is self-contained, captures all input when open, has no dependencies on other features, and establishes the pattern for all other extractions.

#### Phase 2: File Picker (~30 min)
1. Create `src/features/file-picker/` with:
   - `index.ts` - exports
   - `input.ts` - keyboard handling (extract lines 2701-2796)
2. Wire and test

#### Phase 3: PR Info Panel (~30 min)
1. Create `src/features/pr-info-panel/` with:
   - `index.ts` - exports
   - `input.ts` - keyboard handling (extract lines 2798-2882)
   - `loader.ts` - PR info loading (extract from `handleOpenPRInfoPanel`)
2. Wire and test

#### Phase 4: Sync Preview (~45 min)
1. Create `src/features/sync-preview/` with:
   - `index.ts` - exports
   - `input.ts` - keyboard handling (extract lines 2884-2906)
   - `execute.ts` - sync execution (extract `handleExecuteSync`)
2. Wire and test

#### Phase 5: Review Preview (~1 hour)
1. Create `src/features/review-preview/` with:
   - `index.ts` - exports
   - `input.ts` - keyboard handling (extract lines 2908-3013)
   - `submit.ts` - review submission (extract `handleConfirmReview`)
   - `validate.ts` - comment validation (extract `validateCommentsForSubmit`)
2. Wire and test

#### Phase 6: File Tree (~1 hour)
1. Create `src/features/file-tree/` with:
   - `index.ts` - exports
   - `input.ts` - keyboard handling (extract lines 3224-3350)
   - `navigation.ts` - tree traversal helpers
2. Wire and test

#### Phase 7: Comments View (~1 hour)
1. Create `src/features/comments-view/` with:
   - `index.ts` - exports
   - `input.ts` - keyboard handling (extract lines 3352-3508)
   - `navigation.ts` - comment/thread navigation
2. Wire and test

#### Phase 8: Diff View (~1.5 hours)
1. Create `src/features/diff-view/` with:
   - `index.ts` - exports
   - `input.ts` - keyboard handling (extract lines 3511-3610)
   - `dividers.ts` - divider expansion (extract `handleExpandDivider`)
   - `visual-mode.ts` - V/v mode handling
2. Wire and test

#### Phase 9: Search (~45 min)
1. Create `src/features/search/` with:
   - `index.ts` - exports
   - `input.ts` - search prompt input (extract lines 3015-3043)
2. Wire and test (mostly delegates to SearchHandler)

#### Phase 10: Folds (~1.5 hours)
1. Create `src/features/folds/` with:
   - `index.ts` - exports
   - `handlers.ts` - za/zR/zM/zo/zc (extract lines 2028-2402)
2. Wire and test

#### Phase 11: Comments (~2 hours)
1. Create `src/features/comments/` with:
   - `index.ts` - exports
   - `editor.ts` - editor integration (extract `handleAddComment`)
   - `submit.ts` - single comment submission (extract `handleSubmitSingleComment`)
   - `resolution.ts` - thread resolution (extract `handleToggleThreadResolved`)
2. Wire and test

#### Phase 12: File Navigation (~1 hour)
1. Create `src/features/file-navigation/` with:
   - `index.ts` - exports
   - `handlers.ts` - ]f/[f, ]u/[u, ]o/[o, viewed toggle (extract lines 739-1107)
2. Wire and test

#### Phase 13: External Tools (~45 min)
1. Create `src/features/external-tools/` with:
   - `index.ts` - exports
   - `editor.ts` - open in editor (extract `handleOpenFileInEditor`)
   - `diff-viewers.ts` - external diff viewers (extract `handleOpenExternalDiff`)
2. Wire and test

#### Phase 14: App Core (~2 hours)
1. Extract `src/app/init.ts` - initialization logic (lines 119-325)
2. Extract `src/app/render.ts` - render function (lines 430-685)
3. Extract `src/app/global-keys.ts` - global key handling
4. Slim `app.ts` to orchestrator (~300 lines)

**Total estimated time**: ~14 hours of focused work

### File Structure After Refactor

```
src/
  app.ts                              # ~300 lines, orchestration
  app/
    init.ts                           # ~200 lines, data loading
    render.ts                         # ~250 lines, render function
    global-keys.ts                    # ~80 lines, global key handling
  features/
    types.ts                          # FeatureContext interface (~50 lines)
    action-menu/
      index.ts                        # exports
      input.ts                        # ~60 lines
      execute.ts                      # ~80 lines
    file-picker/
      index.ts
      input.ts                        # ~80 lines
    pr-info-panel/
      index.ts
      input.ts                        # ~70 lines
      loader.ts                       # ~40 lines
    sync-preview/
      index.ts
      input.ts                        # ~25 lines
      execute.ts                      # ~100 lines
    review-preview/
      index.ts
      input.ts                        # ~80 lines
      submit.ts                       # ~120 lines
      validate.ts                     # ~20 lines
    file-tree/
      index.ts
      input.ts                        # ~100 lines
      navigation.ts                   # ~30 lines
    comments-view/
      index.ts
      input.ts                        # ~120 lines
      navigation.ts                   # ~40 lines
    diff-view/
      index.ts
      input.ts                        # ~80 lines
      dividers.ts                     # ~60 lines
      visual-mode.ts                  # ~20 lines
    search/
      index.ts
      input.ts                        # ~30 lines
    folds/
      index.ts
      handlers.ts                     # ~300 lines
    comments/
      index.ts
      editor.ts                       # ~130 lines
      submit.ts                       # ~120 lines
      resolution.ts                   # ~70 lines
    file-navigation/
      index.ts
      handlers.ts                     # ~280 lines
    external-tools/
      index.ts
      editor.ts                       # ~85 lines
      diff-viewers.ts                 # ~80 lines
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
