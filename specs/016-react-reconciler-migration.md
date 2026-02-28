# React Reconciler Migration

**Status**: Ready

## Description

Migrate the entire neoriff codebase from OpenTUI's imperative core API (`@opentui/core`) to the React reconciler (`@opentui/react`). This enables declarative component composition using JSX, React hooks for state management, and familiar React patterns throughout the codebase.

The current architecture uses:
- Factory functions that return renderables (`Box()`, `Text()`, `ScrollBox()`)
- Class-based components with manual `update()` methods (`VimDiffView`, `FileTreePanel`)
- Manual render loops with `renderer.root.add()`/`remove()`
- Imperative state management in `app.ts`

The new architecture will use:
- JSX components (`<box>`, `<text>`, `<scrollbox>`)
- React function components with hooks (`useState`, `useReducer`, `useContext`)
- `createRoot(renderer).render(<App />)` entry point
- `useKeyboard` hook for input handling
- Declarative re-rendering via React's reconciliation

## Out of Scope

- Changing functionality (this is a pure refactor)
- Adding new features
- Modifying the vim-diff module (types, line-mapping, cursor-state, motion-handler remain the same)
- Changing storage, providers, or utility functions

## Capabilities

### P1 - Core Infrastructure

- **Entry point migration**: Convert `createApp()` to a React component with `createRoot().render()`
- **App shell as React**: Convert `Shell`, `Header`, `StatusBar` to JSX components
- **Keyboard handling**: Replace `renderer.keyInput.on("keypress")` with `useKeyboard` hook
- **Basic state with hooks**: Convert app state to `useReducer` (already has action-based pattern)

### P2 - Component Migration

- **DiffView**: Convert to JSX (simpler component, good starting point)
- **FileTree**: Convert functional `FileTree` component to JSX
- **CommentsView**: Convert to JSX component
- **CommentsList**: Convert to JSX component

### P3 - Complex Components

- **VimDiffView**: Convert class-based component to React with refs
- **FileTreePanel**: Convert class-based component to React with refs
- **Cursor positioning**: Use `useEffect` with refs for post-render cursor updates

### P4 - Polish

- **Context for theme**: Create `ThemeContext` for colors/theme
- **Context for app state**: Optional - create `AppStateContext` for deep component access
- **Remove old components**: Delete imperative versions after migration

## Technical Notes

### Entry Point

**Before (src/index.ts + src/app.ts):**
```typescript
import { createCliRenderer } from "@opentui/core"
import { createApp } from "./app"

const app = await createApp({ mode, target, diff, comments, prInfo })
```

**After (src/index.tsx):**
```tsx
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App } from "./App"

const renderer = await createCliRenderer({ exitOnCtrlC: false })
createRoot(renderer).render(
  <App mode={mode} target={target} diff={diff} comments={comments} prInfo={prInfo} />
)
```

### App Component Structure

```tsx
// src/App.tsx
import { useReducer, useCallback } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import { Shell } from "./components/Shell"
import { appReducer, createInitialState, type AppAction } from "./state"
import { VimMotionHandler } from "./vim-diff/motion-handler"
import { DiffLineMapping } from "./vim-diff/line-mapping"

interface AppProps {
  mode: AppMode
  target?: string
  diff?: string
  comments?: Comment[]
  prInfo?: PrInfo | null
}

export function App({ mode, target, diff, comments, prInfo }: AppProps) {
  const renderer = useRenderer()
  
  // App state via reducer (mirrors current state.ts pattern)
  const [state, dispatch] = useReducer(appReducer, {
    mode, target, diff, comments, prInfo
  }, createInitialState)
  
  // Vim cursor state
  const [vimState, setVimState] = useState(createCursorState())
  
  // Line mapping (derived from state)
  const lineMapping = useMemo(
    () => new DiffLineMapping(state.files, ...),
    [state.files, state.selectedFileIndex, state.expandedDividers]
  )
  
  // Vim motion handler
  const vimHandler = useMemo(
    () => new VimMotionHandler({
      getMapping: () => lineMapping,
      getState: () => vimState,
      setState: setVimState,
      getViewportHeight: () => 20, // Get from ref
      onCursorMove: () => {}, // Handled by React re-render
    }),
    [lineMapping]
  )
  
  // Keyboard handling
  useKeyboard((key) => {
    if (key.name === "q") {
      renderer.destroy()
      return
    }
    
    if (vimHandler.handleKey(key)) {
      return
    }
    
    // Dispatch actions for other keys
    switch (key.name) {
      case "tab":
        dispatch({ type: "TOGGLE_VIEW_MODE" })
        break
      case "j":
        dispatch({ type: "MOVE_TREE_HIGHLIGHT", delta: 1 })
        break
      // ... etc
    }
  })
  
  return (
    <Shell>
      <Header
        title="neoriff"
        viewMode={state.viewMode}
        selectedFile={getSelectedFile(state)}
        totalFiles={state.files.length}
        prInfo={state.prInfo}
      />
      <MainContent
        state={state}
        vimState={vimState}
        lineMapping={lineMapping}
        dispatch={dispatch}
      />
      <StatusBar hints={buildHints(state, vimState)} />
    </Shell>
  )
}
```

### JSX Components

**Shell.tsx:**
```tsx
import type { ReactNode } from "react"

interface ShellProps {
  children: ReactNode
}

export function Shell({ children }: ShellProps) {
  return (
    <box width="100%" height="100%" flexDirection="column">
      {children}
    </box>
  )
}
```

**Header.tsx:**
```tsx
import { colors, theme } from "../theme"
import type { DiffFile } from "../utils/diff-parser"
import type { PrInfo } from "../providers/github"
import type { ViewMode } from "../state"

interface HeaderProps {
  title?: string
  viewMode?: ViewMode
  selectedFile?: DiffFile | null
  totalFiles?: number
  prInfo?: PrInfo | null
}

export function Header({
  title = "neoriff",
  viewMode = "diff",
  selectedFile,
  totalFiles,
  prInfo,
}: HeaderProps) {
  const viewBadge = viewMode === "diff" ? "Diff" : "Comments"
  const viewBadgeColor = viewMode === "diff" ? theme.blue : theme.mauve
  
  const scopeText = selectedFile 
    ? selectedFile.filename 
    : totalFiles 
      ? `All files (${totalFiles})`
      : "All files"

  return (
    <box
      height={1}
      width="100%"
      backgroundColor={colors.headerBg}
      paddingLeft={1}
      paddingRight={1}
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
    >
      {/* Left side */}
      <box flexDirection="row" gap={2} flexShrink={1} overflow="hidden">
        <text fg={viewBadgeColor}>[{viewBadge}]</text>
        {prInfo && <text fg={theme.sapphire}>#{prInfo.number}</text>}
        <text fg={colors.text}>{scopeText}</text>
      </box>
      
      {/* Right side - stats */}
      {selectedFile && (
        <box flexDirection="row" flexShrink={0}>
          <text fg={theme.green}>+{selectedFile.additions}</text>
          <text fg={colors.text}> </text>
          <text fg={theme.red}>-{selectedFile.deletions}</text>
        </box>
      )}
    </box>
  )
}
```

**StatusBar.tsx:**
```tsx
import { colors } from "../theme"

interface StatusBarProps {
  hints?: string[]
  lineInfo?: string
}

export function StatusBar({ hints = [], lineInfo }: StatusBarProps) {
  return (
    <box
      height={1}
      width="100%"
      backgroundColor={colors.headerBg}
      paddingLeft={1}
      paddingRight={1}
      flexDirection="row"
      justifyContent="space-between"
    >
      <text fg={colors.textDim}>{hints.join("  ")}</text>
      {lineInfo && <text fg={colors.textMuted}>{lineInfo}</text>}
    </box>
  )
}
```

### State Management

Convert the existing reducer pattern in `state.ts` to work with React's `useReducer`:

```tsx
// src/state.ts - existing actions work as-is

// src/hooks/useAppState.ts
import { useReducer, useCallback, useMemo } from "react"
import { appReducer, createInitialState, type AppState, type AppAction } from "../state"

export function useAppState(initialProps: AppInitialProps) {
  const [state, dispatch] = useReducer(appReducer, initialProps, createInitialState)
  
  // Memoized action creators (optional convenience)
  const actions = useMemo(() => ({
    selectFile: (index: number) => dispatch({ type: "SELECT_FILE", index }),
    toggleViewMode: () => dispatch({ type: "TOGGLE_VIEW_MODE" }),
    // ... etc
  }), [])
  
  return { state, dispatch, actions }
}
```

### VimDiffView Migration

The class-based `VimDiffView` needs special handling for refs and post-render effects:

```tsx
// src/components/VimDiffView.tsx
import { useRef, useEffect, useMemo } from "react"
import { useRenderer } from "@opentui/react"
import type { DiffFile } from "../utils/diff-parser"
import type { Comment } from "../types"
import type { VimCursorState } from "../vim-diff/types"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { getSelectionRange } from "../vim-diff/cursor-state"
import { colors, theme } from "../theme"

interface VimDiffViewProps {
  files: DiffFile[]
  selectedFileIndex: number | null
  lineMapping: DiffLineMapping
  cursorState: VimCursorState
  comments: Comment[]
  onScrollBoxRef?: (scrollBox: any) => void
}

export function VimDiffView({
  files,
  selectedFileIndex,
  lineMapping,
  cursorState,
  comments,
  onScrollBoxRef,
}: VimDiffViewProps) {
  const renderer = useRenderer()
  const scrollBoxRef = useRef<any>(null)
  
  // Build content and styling
  const content = useMemo(() => buildDiffContent(lineMapping), [lineMapping])
  const filetype = useMemo(() => getFiletype(files, selectedFileIndex), [files, selectedFileIndex])
  const lineColors = useMemo(
    () => buildLineColors(cursorState, lineMapping),
    [cursorState, lineMapping]
  )
  const lineSigns = useMemo(
    () => buildLineSigns(lineMapping, comments),
    [lineMapping, comments]
  )
  const { lineNumbers, hideLineNumbers } = useMemo(
    () => buildLineNumbers(lineMapping),
    [lineMapping]
  )
  
  // Expose scroll box ref to parent
  useEffect(() => {
    if (scrollBoxRef.current && onScrollBoxRef) {
      onScrollBoxRef(scrollBoxRef.current)
    }
  }, [onScrollBoxRef])
  
  // Position terminal cursor after render
  useEffect(() => {
    positionTerminalCursor(renderer, scrollBoxRef.current, cursorState, lineMapping)
  }, [cursorState.line, cursorState.col])
  
  if (files.length === 0 || lineMapping.lineCount === 0) {
    return (
      <box width="100%" height="100%" justifyContent="center" alignItems="center">
        <text fg={colors.textDim}>No changes to display</text>
      </box>
    )
  }
  
  return (
    <scrollbox
      ref={scrollBoxRef}
      id="diff-scroll"
      width="100%"
      height="100%"
      scrollY
      scrollX
      style={{
        verticalScrollbarOptions: {
          showArrows: false,
          trackOptions: {
            backgroundColor: theme.surface0,
            foregroundColor: theme.surface2,
          },
        },
      }}
    >
      <line-number
        id="diff-line-numbers"
        fg={theme.overlay0}
        bg={theme.mantle}
        showLineNumbers
        lineColors={lineColors}
        lineSigns={lineSigns}
        lineNumbers={lineNumbers}
        hideLineNumbers={hideLineNumbers}
        minWidth={4}
        paddingRight={1}
      >
        <code
          id="diff-code"
          content={content}
          filetype={filetype}
          drawUnstyledText
          conceal={false}
        />
      </line-number>
    </scrollbox>
  )
}

// Helper functions (same logic as current VimDiffView class)
function buildDiffContent(mapping: DiffLineMapping): string { /* ... */ }
function buildLineColors(cursorState: VimCursorState, mapping: DiffLineMapping): Map<number, any> { /* ... */ }
function buildLineSigns(mapping: DiffLineMapping, comments: Comment[]): Map<number, any> { /* ... */ }
function buildLineNumbers(mapping: DiffLineMapping): { lineNumbers: Map<number, number>; hideLineNumbers: Set<number> } { /* ... */ }
function positionTerminalCursor(renderer: any, scrollBox: any, cursorState: VimCursorState, mapping: DiffLineMapping): void { /* ... */ }
```

### FileTreePanel Migration

```tsx
// src/components/FileTreePanel.tsx
import { useRef, useEffect } from "react"
import type { DiffFile } from "../utils/diff-parser"
import type { FileTreeNode, FlatTreeItem } from "../utils/file-tree"
import { flattenTree } from "../utils/file-tree"
import { colors, theme } from "../theme"

interface FileTreePanelProps {
  files: DiffFile[]
  fileTree: FileTreeNode[]
  highlightIndex: number
  selectedFileIndex: number | null
  focused: boolean
  visible: boolean
  width?: number
}

export function FileTreePanel({
  files,
  fileTree,
  highlightIndex,
  selectedFileIndex,
  focused,
  visible,
  width = 35,
}: FileTreePanelProps) {
  const scrollBoxRef = useRef<any>(null)
  
  // Flatten tree for rendering
  const flatItems = flattenTree(fileTree, files)
  
  // Ensure highlighted item is visible
  useEffect(() => {
    if (scrollBoxRef.current) {
      const viewportHeight = Math.floor(scrollBoxRef.current.height)
      const scrollTop = scrollBoxRef.current.scrollTop
      
      if (highlightIndex < scrollTop) {
        scrollBoxRef.current.scrollTop = highlightIndex
      } else if (highlightIndex >= scrollTop + viewportHeight) {
        scrollBoxRef.current.scrollTop = highlightIndex - viewportHeight + 1
      }
    }
  }, [highlightIndex])
  
  if (!visible) return null
  
  const scopeText = selectedFileIndex === null ? "All files" : `Files (${files.length})`
  
  return (
    <box
      id="file-tree-panel"
      width={width}
      height="100%"
      flexDirection="column"
      borderStyle="single"
      borderColor={focused ? colors.primary : colors.border}
    >
      {/* Header */}
      <box height={1} width="100%" paddingLeft={1} backgroundColor={theme.mantle}>
        <text fg={focused ? colors.primary : colors.textMuted}>
          {scopeText}
        </text>
      </box>
      
      {/* Scrollable tree content */}
      <scrollbox
        ref={scrollBoxRef}
        id="file-tree-scroll"
        flexGrow={1}
        width="100%"
        scrollY
        style={{
          verticalScrollbarOptions: {
            showArrows: false,
            trackOptions: {
              backgroundColor: theme.surface0,
              foregroundColor: theme.surface2,
            },
          },
        }}
      >
        <box id="file-tree-content" flexDirection="column" width="100%">
          {flatItems.map((item, index) => (
            <FileTreeItem
              key={item.node.path}
              item={item}
              index={index}
              isHighlighted={index === highlightIndex && focused}
              isSelected={item.fileIndex === selectedFileIndex}
            />
          ))}
        </box>
      </scrollbox>
    </box>
  )
}

interface FileTreeItemProps {
  item: FlatTreeItem
  index: number
  isHighlighted: boolean
  isSelected: boolean
}

function FileTreeItem({ item, isHighlighted, isSelected }: FileTreeItemProps) {
  const { node, depth } = item
  
  const indent = "  ".repeat(depth)
  const icon = node.isDirectory
    ? node.expanded ? "▼ " : "▶ "
    : "  "
  
  const nameFg = isSelected
    ? colors.primary
    : node.isDirectory
      ? theme.subtext0
      : node.file
        ? getStatusColor(node.file.status)
        : colors.text
  
  const marker = isSelected ? "●" : " "
  
  return (
    <box
      height={1}
      width="100%"
      backgroundColor={isHighlighted ? colors.selection : undefined}
    >
      <text fg={nameFg}>
        {marker}{indent}{icon}{node.name}
      </text>
    </box>
  )
}

function getStatusColor(status: DiffFile["status"]): string {
  switch (status) {
    case "added": return colors.fileAdded
    case "modified": return colors.fileModified
    case "deleted": return colors.fileDeleted
    case "renamed": return colors.fileRenamed
  }
}
```

### Keyboard Handling Pattern

```tsx
// src/hooks/useAppKeyboard.ts
import { useCallback } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import type { AppState, AppAction } from "../state"
import type { VimCursorState } from "../vim-diff/types"
import { VimMotionHandler } from "../vim-diff/motion-handler"

interface UseAppKeyboardOptions {
  state: AppState
  vimState: VimCursorState
  vimHandler: VimMotionHandler
  dispatch: (action: AppAction) => void
  setVimState: (state: VimCursorState) => void
  onComment: () => void
  onExpandDivider: () => void
}

export function useAppKeyboard({
  state,
  vimState,
  vimHandler,
  dispatch,
  setVimState,
  onComment,
  onExpandDivider,
}: UseAppKeyboardOptions) {
  const renderer = useRenderer()
  
  useKeyboard((key) => {
    // Global: quit
    if (key.name === "q") {
      renderer.destroy()
      return
    }
    
    // Global: toggle file panel
    if (key.name === "b" && key.ctrl) {
      dispatch({ type: "TOGGLE_FILE_PANEL" })
      return
    }
    
    // Global: toggle view mode
    if (key.name === "tab") {
      dispatch({ type: "TOGGLE_VIEW_MODE" })
      return
    }
    
    // Tree panel focused
    if (state.showFilePanel && state.focusedPanel === "tree") {
      handleTreeKeys(key, state, dispatch)
      return
    }
    
    // Comments view focused
    if (state.viewMode === "comments" && state.focusedPanel === "comments") {
      handleCommentsKeys(key, state, dispatch)
      return
    }
    
    // Diff view focused
    if (state.viewMode === "diff" && state.focusedPanel === "diff") {
      // Let vim handler try first
      if (vimHandler.handleKey(key)) {
        return
      }
      
      // Comment
      if (key.name === "c" && !key.ctrl) {
        onComment()
        return
      }
      
      // Expand divider
      if (key.name === "return" || key.name === "enter") {
        onExpandDivider()
        return
      }
    }
  })
}
```

### Configuration

**tsconfig.json updates:**
```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@opentui/react"
  }
}
```

**package.json updates:**
```json
{
  "dependencies": {
    "@opentui/core": "...",
    "@opentui/react": "...",
    "react": "^18.2.0"
  }
}
```

### File Structure

```
src/
├── index.tsx             # Entry point with createRoot
├── App.tsx               # Main app component
├── state.ts              # Reducer and initial state (mostly unchanged)
├── types.ts              # Type definitions (unchanged)
├── theme.ts              # Theme constants (unchanged)
├── hooks/
│   ├── useAppState.ts    # App state hook
│   └── useAppKeyboard.ts # Keyboard handling hook
├── components/
│   ├── Shell.tsx         # Root layout
│   ├── Header.tsx        # Title bar
│   ├── StatusBar.tsx     # Bottom hints
│   ├── DiffView.tsx      # Simple diff (deprecated)
│   ├── VimDiffView.tsx   # Vim-style diff view
│   ├── FileTree.tsx      # File tree item
│   ├── FileTreePanel.tsx # File tree panel
│   ├── CommentsView.tsx  # Comments list view
│   ├── CommentsList.tsx  # Comment rendering
│   └── index.ts          # Exports
├── vim-diff/             # (unchanged)
│   ├── types.ts
│   ├── line-mapping.ts
│   ├── cursor-state.ts
│   └── motion-handler.ts
├── providers/            # (unchanged)
│   ├── local.ts
│   └── github.ts
├── utils/                # (unchanged)
│   ├── diff-parser.ts
│   ├── file-tree.ts
│   ├── editor.ts
│   ├── keyboard.ts
│   └── threads.ts
└── storage.ts            # (unchanged)
```

### Migration Path

1. **Phase 1 - Setup**
   - Add `@opentui/react` and `react` dependencies
   - Update tsconfig.json for JSX
   - Create new `index.tsx` entry point alongside existing `index.ts`

2. **Phase 2 - Simple Components**
   - Convert `Shell`, `Header`, `StatusBar` to JSX
   - Test with static content

3. **Phase 3 - State Integration**
   - Create `App.tsx` with `useReducer`
   - Integrate keyboard handling with `useKeyboard`
   - Verify state management works

4. **Phase 4 - Complex Components**
   - Convert `FileTreePanel` to React (test tree navigation)
   - Convert `VimDiffView` to React (test cursor positioning)
   - Convert `CommentsView` to React

5. **Phase 5 - Cleanup**
   - Remove old `app.ts` and imperative components
   - Rename `index.tsx` to `index.ts` 
   - Update all imports

### Key Considerations

1. **Refs for imperative operations**: Terminal cursor positioning and scroll control need refs to access the underlying renderables.

2. **Post-process functions**: The current `VimDiffView` uses `renderer.addPostProcessFn()` for cursor positioning. In React, use `useEffect` with layout-time scheduling.

3. **Avoiding flicker**: The current class-based components update in place to avoid flicker. React's reconciliation should handle this, but monitor for issues.

4. **Performance**: React reconciliation adds overhead. Profile to ensure smooth navigation. Consider `useMemo` for expensive computations.

5. **Suspend/resume**: The comment editor uses `renderer.suspend()`/`resume()`. This still works - just call from an event handler.

### Why React Reconciler

1. **Familiar patterns**: React's component model is well-understood
2. **Declarative rendering**: No manual DOM/renderable manipulation
3. **State management**: Hooks provide clean state patterns
4. **Composition**: Easy to build complex UIs from simple components
5. **Future-proof**: Opens door to React ecosystem (testing, devtools)
