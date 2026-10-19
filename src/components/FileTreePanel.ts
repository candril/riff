/**
 * Class-based FileTree panel that updates in place without recreating the ScrollBox.
 * This prevents flickering when navigating with j/k.
 */

import {
  InputRenderable,
  InputRenderableEvents,
  BoxRenderable,
  TextRenderable,
  ScrollBoxRenderable,
  type CliRenderer,
} from "@opentui/core"
import { discard, keepAlive } from "../utils/renderables"
import type { DiffFile } from "../utils/diff-parser"
import type { FileTreeNode } from "../utils/file-tree"
import type { FileReviewStatus } from "../types"
import { colors, theme } from "../theme"
import { fileTreeModel, type FileTreeModel, type FileTreeModelInput, type FileTreeRow } from "./file-tree-model"

export interface FileTreePanelOptions {
  renderer: CliRenderer
  width?: number
}

interface RowRenderables {
  box: BoxRenderable
  markerText: TextRenderable
  statusText: TextRenderable
  text: TextRenderable
}

export class FileTreePanel {
  private renderer: CliRenderer
  private container: BoxRenderable
  private headerText: TextRenderable
  /**
   * The `/` filter box. A real OpenTUI input rather than a hand-rolled
   * prompt, so Ctrl-w, word jumps, paste, undo and selection all behave the
   * way they do in every other text field.
   */
  private header: BoxRenderable
  /** The `/` shown beside the filter box, so typing reads like the label. */
  private filterPrefix: TextRenderable
  private filterInput: InputRenderable
  private filterFocused: boolean = false
  private onFilterChange: ((value: string) => void) | null = null
  private scrollBox: ScrollBoxRenderable
  private content: BoxRenderable
  private itemRenderables: Map<number, RowRenderables> = new Map()
  private hiddenCountRenderable: { box: BoxRenderable; text: TextRenderable } | null = null
  private width: number
  /** What the last update drew from, so a width change can redraw without a new push. */
  private input: Omit<FileTreeModelInput, "width"> | null = null
  private highlightIndex: number = 0

  constructor(options: FileTreePanelOptions) {
    this.renderer = options.renderer
    this.width = options.width ?? 35

    // Create container
    this.container = new BoxRenderable(this.renderer, {
      id: "file-tree-panel",
      width: this.width,
      height: "100%",
      flexDirection: "column",
      backgroundColor: theme.mantle,
      paddingX: 1,
    })
    keepAlive(this.container)

    // Create header
    const header = new BoxRenderable(this.renderer, {
      height: 1,
      width: "100%",
      paddingLeft: 1,
      backgroundColor: theme.mantle,
      // The filter prompt puts a `/` beside the input box; without an
      // explicit direction they stack instead of sitting side by side.
      flexDirection: "row",
    })
    this.headerText = new TextRenderable(this.renderer, {
      id: "file-tree-header-text",
      content: "Files (0)",
      fg: colors.textMuted,
      // The header lays its children out in a row for the filter prompt;
      // a Text with no basis measures as zero wide there.
      flexGrow: 1,
    })
    this.header = header
    header.add(this.headerText)

    this.filterInput = new InputRenderable(this.renderer, {
      id: "file-tree-filter",
      placeholder: "filter by path…",
      placeholderColor: theme.overlay0,
      backgroundColor: theme.surface0,
      textColor: theme.text,
      focusedBackgroundColor: theme.surface0,
      focusedTextColor: theme.text,
      cursorColor: theme.yellow,
      flexGrow: 1,
      visible: false,
    })
    this.filterInput.on(InputRenderableEvents.INPUT, (value: string) => {
      this.onFilterChange?.(value)
    })
    this.filterPrefix = new TextRenderable(this.renderer, {
      id: "file-tree-filter-prefix",
      content: "/",
      fg: colors.secondary,
    })

    this.container.add(header)

    // Create scroll box
    this.scrollBox = new ScrollBoxRenderable(this.renderer, {
      id: "file-tree-scroll",
      flexGrow: 1,
      width: "100%",
      scrollY: true,
      verticalScrollbarOptions: {
        showArrows: false,
        trackOptions: {
          backgroundColor: theme.surface0,
          foregroundColor: theme.surface2,
        },
      },
    })
    this.container.add(this.scrollBox)

    // Create content container inside scroll box
    this.content = new BoxRenderable(this.renderer, {
      id: "file-tree-content",
      flexDirection: "column",
      width: "100%",
    })
    this.scrollBox.add(this.content)
  }

  /**
   * Where the filter box sends what the user types. Set from app.ts, which
   * owns the state the tree is filtered from.
   */
  setOnFilterChange(callback: (value: string) => void): void {
    this.onFilterChange = callback
  }

  /**
   * Swap the header row between its label and the `/` input. They share one
   * row, so mounting both leaves them fighting for the width and neither
   * reads. Focus is taken only on the way in, so a re-render mid-typing
   * doesn't reset the cursor, and the value is seeded from state — `/` on an
   * applied filter refines it rather than starting over.
   */
  private syncFilterInput(treeFilter: string, treeFilterInput: boolean): void {
    if (treeFilterInput === this.filterFocused) return
    this.filterFocused = treeFilterInput

    if (treeFilterInput) {
      this.header.backgroundColor = theme.surface0
      this.header.remove(this.headerText)
      this.filterPrefix.visible = true
      this.filterInput.visible = true
      this.header.add(this.filterPrefix)
      this.header.add(this.filterInput)
      this.filterInput.value = treeFilter
      this.filterInput.focus()
    } else {
      this.filterInput.blur()
      this.header.remove(this.filterPrefix)
      this.header.remove(this.filterInput)
      this.filterPrefix.visible = false
      this.filterInput.visible = false
      this.header.backgroundColor = theme.mantle
      this.header.add(this.headerText)
    }
  }

  getContainer(): BoxRenderable {
    return this.container
  }

  getScrollBox(): ScrollBoxRenderable {
    return this.scrollBox
  }

  /**
   * Update the file tree with new state. Rows are recreated only when the
   * tree's structure changed; otherwise the existing ones are restyled, which
   * keeps j/k from flickering.
   *
   * @param selectedFileIndex - Which file is selected (scopes views), null = all files
   * @param multiSelectedFilenames - Filenames currently inside the V-mode
   *                                 tree multi-select range. Empty = no
   *                                 multi-select active.
   */
  update(
    files: DiffFile[],
    fileTree: FileTreeNode[],
    highlightIndex: number,
    selectedFileIndex: number | null,
    focused: boolean,
    fileStatuses?: Map<string, FileReviewStatus>,
    // Kept for the call sites; nothing the tree draws depends on it.
    _collapsedFiles?: Set<string>,
    ignoredFiles?: Set<string>,
    showHiddenFiles?: boolean,
    multiSelectedFilenames?: Set<string>,
    treeFilter = "",
    treeFilterInput = false,
    flashLabels: ReadonlyMap<string, string> = new Map(),
    unseenFiles: ReadonlySet<string> = new Set(),
    changedSinceVisit: ReadonlySet<string> = new Set()
  ): void {
    const previous = this.input
    const input: Omit<FileTreeModelInput, "width"> = {
      files,
      fileTree,
      highlightIndex,
      selectedFileIndex,
      focused,
      fileStatuses: fileStatuses ?? new Map(),
      ignoredFiles: ignoredFiles ?? new Set(),
      showHiddenFiles: showHiddenFiles ?? false,
      multiSelectedFilenames: multiSelectedFilenames ?? new Set(),
      treeFilter,
      treeFilterInput,
      flashLabels,
      unseenFiles,
      changedSinceVisit,
    }
    this.input = input
    this.highlightIndex = highlightIndex

    const structureChanged =
      previous === null ||
      files !== previous.files ||
      fileTree !== previous.fileTree ||
      input.ignoredFiles !== previous.ignoredFiles ||
      input.showHiddenFiles !== previous.showHiddenFiles ||
      treeFilter !== previous.treeFilter

    const model = fileTreeModel({ ...input, width: this.width })
    this.headerText.content = model.header.text
    this.headerText.fg = model.header.fg
    this.syncFilterInput(treeFilter, model.header.filtering)

    if (structureChanged) this.rebuildItems(model)
    else this.updateItemStyles(model)
    this.updateHiddenCount(model.hidden)
  }

  private rebuildItems(model: FileTreeModel): void {
    for (const [, item] of this.itemRenderables) {
      discard(item.box)
    }
    this.itemRenderables.clear()

    for (const row of model.rows) {
      // Ids go by index rather than path, which can hold characters an id shouldn't.
      const box = new BoxRenderable(this.renderer, {
        id: `tree-item-${row.index}`,
        height: 1,
        width: "100%",
        flexDirection: "row",
      })
      const renderables: RowRenderables = {
        box,
        markerText: new TextRenderable(this.renderer, { id: `tree-item-marker-${row.index}`, content: "" }),
        statusText: new TextRenderable(this.renderer, { id: `tree-item-status-${row.index}`, content: "" }),
        text: new TextRenderable(this.renderer, { id: `tree-item-text-${row.index}`, content: "" }),
      }
      styleRow(renderables, row)
      box.add(renderables.markerText)
      box.add(renderables.statusText)
      box.add(renderables.text)
      this.content.add(box)
      this.itemRenderables.set(row.index, renderables)
    }
  }

  private updateItemStyles(model: FileTreeModel): void {
    for (const row of model.rows) {
      const renderables = this.itemRenderables.get(row.index)
      if (renderables) styleRow(renderables, row)
    }
  }

  private updateHiddenCount(hidden: string | null): void {
    if (this.hiddenCountRenderable) {
      discard(this.hiddenCountRenderable.box)
      this.hiddenCountRenderable = null
    }
    if (hidden === null) return

    const box = new BoxRenderable(this.renderer, {
      id: "tree-hidden-count",
      height: 1,
      width: "100%",
      paddingLeft: 1,
    })
    const text = new TextRenderable(this.renderer, {
      id: "tree-hidden-count-text",
      content: hidden,
      fg: colors.textMuted,
    })
    box.add(text)
    this.content.add(box)
    this.hiddenCountRenderable = { box, text }
  }

  /** The first and last row index the scroll box is showing. */
  visibleRows(): { first: number; last: number } {
    const first = Math.floor(this.scrollBox.scrollTop)
    return { first, last: first + Math.floor(this.scrollBox.height) - 1 }
  }

  /**
   * Ensure the highlighted item is visible in the scroll box
   */
  ensureHighlightVisible(): void {
    const viewportHeight = Math.floor(this.scrollBox.height)
    const scrollTop = this.scrollBox.scrollTop
    
    if (this.highlightIndex < scrollTop) {
      this.scrollBox.scrollTop = this.highlightIndex
    } else if (this.highlightIndex >= scrollTop + viewportHeight) {
      this.scrollBox.scrollTop = this.highlightIndex - viewportHeight + 1
    }
  }

  show(): void {
    this.container.visible = true
  }

  hide(): void {
    this.container.visible = false
  }

  get visible(): boolean {
    return this.container.visible
  }

  set visible(value: boolean) {
    this.container.visible = value
  }

  /**
   * Get current width
   */
  getWidth(): number {
    return this.width
  }

  setWidth(width: number): void {
    if (this.width === width) return
    this.width = width
    this.container.width = width
    // Rebuild so the new width can re-truncate every label.
    if (this.input) this.rebuildItems(fileTreeModel({ ...this.input, width }))
  }
}

function styleRow(renderables: RowRenderables, row: FileTreeRow): void {
  renderables.box.backgroundColor = row.bg ?? undefined
  renderables.markerText.content = row.marker.text
  renderables.markerText.fg = row.marker.fg
  renderables.statusText.content = row.status.text
  renderables.statusText.fg = row.status.fg
  renderables.text.content = row.name.text
  renderables.text.fg = row.name.fg
}
