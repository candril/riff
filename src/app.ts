import { createCliRenderer, Box, Text, type KeyEvent, type ScrollBoxRenderable } from "@opentui/core"
import { Header, StatusBar, DiffView, getScrollBox, FileTree, getFlatTreeItems } from "./components"
import { getLocalDiff, getDiffDescription } from "./providers/local"
import { parseDiff, getFiletype } from "./utils/diff-parser"
import { buildFileTree, toggleNodeExpansion, type FileTreeNode } from "./utils/file-tree"
import {
  createInitialState,
  nextFile,
  prevFile,
  goToFile,
  toggleFilePanel,
  toggleFocus,
  updateFileTree,
  type AppState,
} from "./state"
import { colors, theme } from "./theme"

export interface AppOptions {
  target?: string
}

export async function createApp(options: AppOptions = {}) {
  const { target } = options

  // Get diff content
  let rawDiff = ""
  let description = ""
  let error: string | null = null

  try {
    rawDiff = await getLocalDiff(target)
    description = await getDiffDescription(target)
  } catch (err) {
    error = err instanceof Error ? err.message : "Unknown error"
  }

  // Parse diff into files
  const files = parseDiff(rawDiff)
  const fileTree = buildFileTree(files)

  // Initialize state
  let state = createInitialState(files, fileTree, target ?? "local", description, error)

  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
  })

  // Render function
  function render() {
    const currentFile = state.files[state.currentFileIndex]
    const flatItems = getFlatTreeItems(state.fileTree, state.files)

    // Build hints based on context
    const hints: string[] = []
    if (state.files.length > 1) {
      hints.push("]f/[f: file")
    }
    if (state.files.length > 0) {
      hints.push("Ctrl+b: panel")
    }
    hints.push("j/k: scroll", "q: quit")

    // Main content
    const content = state.error
      ? Text({ content: `Error: ${state.error}`, fg: colors.error })
      : state.files.length === 0
        ? Text({ content: "No changes to display", fg: colors.textDim })
        : Box(
            {
              width: "100%",
              height: "100%",
              flexDirection: "row",
            },
            // File tree panel (conditional)
            state.showFilePanel
              ? FileTree({
                  fileTree: state.fileTree,
                  files: state.files,
                  currentFileIndex: state.currentFileIndex,
                  selectedIndex: state.selectedTreeIndex,
                  focused: state.focusedPanel === "tree",
                  width: 35,
                })
              : null,
            // Diff view
            Box(
              {
                flexGrow: 1,
                height: "100%",
                flexDirection: "column",
              },
              DiffView({
                diff: currentFile?.content ?? "",
                filetype: currentFile ? getFiletype(currentFile.filename) : undefined,
              })
            )
          )

    // Clear and re-render
    const children = renderer.root.getChildren()
    for (const child of children) {
      renderer.root.remove(child.id)
    }

    renderer.root.add(
      Box(
        {
          width: "100%",
          height: "100%",
          flexDirection: "column",
        },
        // Header with file info
        Header({
          title: "neoriff",
          subtitle: state.description,
          currentFile,
          fileIndex: state.currentFileIndex,
          totalFiles: state.files.length,
        }),
        // Main content area
        Box(
          {
            flexGrow: 1,
            width: "100%",
          },
          content
        ),
        // Status bar
        StatusBar({ hints })
      )
    )
  }

  // Get scroll box reference
  let scrollBox: ScrollBoxRenderable | null = null
  function updateScrollBox() {
    scrollBox = getScrollBox(renderer)
  }

  function quit() {
    renderer.destroy()
    process.exit(0)
  }

  // Key sequence tracking for ]f, [f
  let pendingKey: string | null = null
  let pendingTimeout: ReturnType<typeof setTimeout> | null = null

  function clearPendingKey() {
    pendingKey = null
    if (pendingTimeout) {
      clearTimeout(pendingTimeout)
      pendingTimeout = null
    }
  }

  // Keyboard handling
  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    // Handle key sequences
    if (pendingKey) {
      const sequence = `${pendingKey}${key.name}`
      clearPendingKey()

      if (sequence === "]f") {
        state = nextFile(state)
        render()
        setTimeout(updateScrollBox, 0)
        return
      } else if (sequence === "[f") {
        state = prevFile(state)
        render()
        setTimeout(updateScrollBox, 0)
        return
      }
    }

    // Start sequence
    if (key.name === "]" || key.name === "[") {
      pendingKey = key.name
      pendingTimeout = setTimeout(clearPendingKey, 500)
      return
    }

    // Handle tree panel focus
    if (state.showFilePanel && state.focusedPanel === "tree") {
      const flatItems = getFlatTreeItems(state.fileTree, state.files)

      switch (key.name) {
        case "j":
        case "down":
          state = {
            ...state,
            selectedTreeIndex: Math.min(state.selectedTreeIndex + 1, flatItems.length - 1),
          }
          render()
          return

        case "k":
        case "up":
          state = {
            ...state,
            selectedTreeIndex: Math.max(state.selectedTreeIndex - 1, 0),
          }
          render()
          return

        case "return":
        case "enter":
          const selectedItem = flatItems[state.selectedTreeIndex]
          if (selectedItem) {
            if (selectedItem.node.isDirectory) {
              // Toggle folder expansion
              const newTree = toggleNodeExpansion(state.fileTree, selectedItem.node.path)
              state = updateFileTree(state, newTree)
            } else if (typeof selectedItem.fileIndex === "number") {
              // Go to file
              state = goToFile(state, selectedItem.fileIndex)
              state = { ...state, focusedPanel: "diff" }
              setTimeout(updateScrollBox, 0)
            }
          }
          render()
          return

        case "l":
        case "right":
          // Expand folder
          const expandItem = flatItems[state.selectedTreeIndex]
          if (expandItem?.node.isDirectory && !expandItem.node.expanded) {
            const newTree = toggleNodeExpansion(state.fileTree, expandItem.node.path)
            state = updateFileTree(state, newTree)
            render()
          }
          return

        case "h":
        case "left":
          // Collapse folder
          const collapseItem = flatItems[state.selectedTreeIndex]
          if (collapseItem?.node.isDirectory && collapseItem.node.expanded) {
            const newTree = toggleNodeExpansion(state.fileTree, collapseItem.node.path)
            state = updateFileTree(state, newTree)
            render()
          }
          return

        case "escape":
          // Return focus to diff
          state = { ...state, focusedPanel: "diff" }
          render()
          return
      }
    }

    // Global keybindings
    switch (key.name) {
      case "q":
        quit()
        break

      case "b":
        if (key.ctrl) {
          state = toggleFilePanel(state)
          // Focus the panel when opening it
          if (state.showFilePanel) {
            state = { ...state, focusedPanel: "tree" }
          }
          render()
        }
        break

      case "tab":
        state = toggleFocus(state)
        render()
        break

      case "j":
      case "down":
        if (state.focusedPanel === "diff") {
          scrollBox?.scrollBy(1)
        }
        break

      case "k":
      case "up":
        if (state.focusedPanel === "diff") {
          scrollBox?.scrollBy(-1)
        }
        break

      case "d":
        if (key.ctrl && state.focusedPanel === "diff") {
          const height = renderer.height ?? 20
          scrollBox?.scrollBy(Math.floor(height / 2))
        }
        break

      case "u":
        if (key.ctrl && state.focusedPanel === "diff") {
          const height = renderer.height ?? 20
          scrollBox?.scrollBy(-Math.floor(height / 2))
        }
        break

      case "g":
        if (state.focusedPanel === "diff") {
          scrollBox?.scrollTo(0)
        }
        break

      case "G":
        if (key.shift && state.focusedPanel === "diff") {
          const scrollHeight = scrollBox?.scrollHeight ?? 0
          scrollBox?.scrollTo(scrollHeight)
        }
        break
    }
  })

  // Initial render
  render()
  setTimeout(updateScrollBox, 0)

  return {
    renderer,
    quit,
    getState: () => state,
  }
}
