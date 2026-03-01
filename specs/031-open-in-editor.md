# Open in Editor

**Status**: Draft

## Description

Open the currently focused file in an external editor (nvim by default). The file opens at the current line position, allowing seamless transitions between reviewing and editing.

## Out of Scope

- Watching for file changes and auto-refreshing the diff
- Multiple editor support in MVP (just nvim)
- Opening files in a split/floating terminal pane

## Capabilities

### P1 - MVP

- **Open current file**: `<leader>e` opens the file in nvim at the current line
- **Suspend/resume**: neoriff suspends while nvim runs, resumes when nvim exits
- **Line position**: Opens at the exact line you're viewing in the diff
- **File resolution**: Resolves the actual file path from the diff (handles renames)

### P2 - Enhanced

- **Configurable editor**: Set editor via `$EDITOR` env var or config
- **Editor arguments**: Configure custom arguments per editor
- **Column position**: Pass column position for supported editors
- **Side selection**: For modified files, option to open old vs new version

### P3 - Polish

- **Quick edit flow**: After editor closes, optionally refresh diff to see changes
- **Multiple editors**: Choose from configured editors via submenu
- **Remote files**: Handle files in GitHub PRs (checkout if needed)

## Technical Notes

### Implementation Approach

The key is properly suspending the TUI and resuming after the editor exits:

```typescript
// src/actions/open-editor.ts

import { $ } from "bun"

export interface OpenEditorOptions {
  filePath: string
  line?: number
  column?: number
  editor?: string  // defaults to nvim
}

export async function openInEditor(
  opts: OpenEditorOptions,
  renderer: CliRenderer
): Promise<void> {
  const { filePath, line = 1, column = 1, editor = "nvim" } = opts
  
  // Build editor command with line/column args
  const args = buildEditorArgs(editor, filePath, line, column)
  
  // Suspend the TUI
  renderer.suspend()
  
  try {
    // Run editor in foreground (inherits stdio)
    await $`${editor} ${args}`.quiet()
  } finally {
    // Resume the TUI
    renderer.resume()
  }
}

function buildEditorArgs(
  editor: string,
  filePath: string,
  line: number,
  column: number
): string[] {
  // nvim/vim: +line file
  if (editor === "nvim" || editor === "vim") {
    return [`+${line}`, filePath]
  }
  
  // VS Code: --goto file:line:column
  if (editor === "code") {
    return ["--goto", `${filePath}:${line}:${column}`, "--wait"]
  }
  
  // Emacs: +line:column file
  if (editor === "emacs" || editor === "emacsclient") {
    return [`+${line}:${column}`, filePath]
  }
  
  // Fallback: just the file
  return [filePath]
}
```

### Key Binding

```typescript
// In leader key handler or keymap.ts

// <leader>e - Open in editor
if (leaderSequence === "e") {
  const currentFile = state.files[state.currentFileIndex]
  if (currentFile) {
    const filePath = resolveFilePath(currentFile)
    const line = getCurrentDiffLine(state)
    
    await openInEditor({ filePath, line }, renderer)
    
    // Optionally refresh diff after editing
    // await refreshDiff(state)
  }
}
```

### Resolving File Path

```typescript
// src/utils/resolve-file-path.ts

import { existsSync } from "fs"
import { join } from "path"

export function resolveFilePath(
  file: DiffFile,
  cwd: string = process.cwd()
): string {
  // For renamed files, prefer the new path
  const relativePath = file.newPath ?? file.oldPath ?? file.path
  
  const absolutePath = join(cwd, relativePath)
  
  // Verify file exists (might be deleted in diff)
  if (!existsSync(absolutePath)) {
    throw new Error(`File not found: ${relativePath}`)
  }
  
  return absolutePath
}
```

### Mapping Diff Line to File Line

The diff view shows a mix of added, removed, and context lines. We need to map the visual cursor position to the actual file line number:

```typescript
// src/utils/diff-line-mapping.ts

export function getFileLineFromDiffLine(
  hunks: DiffHunk[],
  visualLine: number
): { line: number; side: "old" | "new" | "context" } {
  let currentVisual = 0
  
  for (const hunk of hunks) {
    // Skip hunk header
    currentVisual++
    if (currentVisual > visualLine) {
      // On hunk header, return first line of hunk
      return { line: hunk.newStart, side: "new" }
    }
    
    for (const line of hunk.lines) {
      currentVisual++
      if (currentVisual > visualLine) {
        if (line.type === "add" || line.type === "context") {
          return { line: line.newLineNumber!, side: line.type === "add" ? "new" : "context" }
        } else {
          // Removed line - return closest new line
          return { line: line.oldLineNumber!, side: "old" }
        }
      }
    }
  }
  
  // Fallback
  return { line: 1, side: "new" }
}
```

### Configuration

```toml
# config.toml

[editor]
# Command to open files (default: nvim)
command = "nvim"

# Additional arguments to pass
args = []

# Whether to refresh diff after editor closes
refresh_on_close = false
```

### Environment Variable Support

```typescript
function getEditorCommand(config: Config): string {
  // Priority: config > $EDITOR > $VISUAL > nvim
  if (config.editor?.command) {
    return config.editor.command
  }
  
  return process.env.EDITOR ?? process.env.VISUAL ?? "nvim"
}
```

### Error Handling

```typescript
export async function openInEditor(
  opts: OpenEditorOptions,
  renderer: CliRenderer
): Promise<{ success: boolean; error?: string }> {
  const { filePath, line = 1, editor = getEditorCommand(config) } = opts
  
  // Check file exists
  if (!existsSync(filePath)) {
    return { success: false, error: `File not found: ${filePath}` }
  }
  
  // Check editor is available
  try {
    await $`which ${editor}`.quiet()
  } catch {
    return { success: false, error: `Editor not found: ${editor}` }
  }
  
  renderer.suspend()
  
  try {
    const args = buildEditorArgs(editor, filePath, line, 1)
    await $`${editor} ${args}`
    return { success: true }
  } catch (e) {
    return { success: false, error: `Editor exited with error: ${e}` }
  } finally {
    renderer.resume()
  }
}
```

### File Structure

```
src/
  actions/
    open-editor.ts        # openInEditor function
  utils/
    resolve-file-path.ts  # File path resolution
    diff-line-mapping.ts  # Map visual line to file line (may already exist)
```

### Status Bar Hint

When on a file, show the keybinding hint:

```
<leader>e: Edit  |  j/k: Navigate  |  c: Comment
```

## Visual Flow

1. User is viewing a diff, cursor on line 42
2. User presses `<leader>e` (Space + e)
3. Screen clears, nvim opens with the file at line 42
4. User makes edits, saves, quits nvim (`:wq`)
5. neoriff reappears, diff view restored
6. (Optional) Diff refreshes to show new changes
