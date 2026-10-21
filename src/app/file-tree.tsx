import { InputRenderable, InputRenderableEvents, type CliRenderer, type ScrollBoxRenderable } from "@opentui/core"
import { batch } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { FileTreeView, type FileTreeViewModel } from "../components/FileTreeView"
import { fileTreeModel, type FileTreeModelInput } from "../components/file-tree-model"
import { overflowHints, type OverflowHints } from "../components/overflow-hints"
import { colors, theme } from "../theme"
import { keepAlive } from "../utils/renderables"
import { mountSolid } from "./solid-island"

type Defaulted =
  | "fileStatuses"
  | "ignoredFiles"
  | "showHiddenFiles"
  | "multiSelectedFilenames"
  | "treeFilter"
  | "treeFilterInput"
  | "flashLabels"
  | "unseenFiles"
  | "changedSinceVisit"
  | "unviewedOnly"

/** What the app pushes into the tree; the island adds the width it is drawn at. */
export type FileTreeInput = Omit<FileTreeModelInput, "width" | Defaulted> &
  Partial<Pick<FileTreeModelInput, Defaulted>>

function withDefaults(input: FileTreeInput): Omit<FileTreeModelInput, "width"> {
  return {
    fileStatuses: new Map(),
    ignoredFiles: new Set(),
    showHiddenFiles: false,
    multiSelectedFilenames: new Set(),
    treeFilter: "",
    treeFilterInput: false,
    flashLabels: new Map(),
    unseenFiles: new Set(),
    changedSinceVisit: new Set(),
    unviewedOnly: null,
    ...input,
  }
}

// A fresh object per island: a store wraps the object it is given, and two
// stores built on one shared constant would write through to each other.
const empty = (): FileTreeViewModel => ({
  header: { text: "Files (0)", fg: colors.textMuted, filtering: false, note: null, noteFg: colors.secondary },
  rows: [],
  hidden: null,
  empty: null,
  overflow: { above: null, below: null },
})

/**
 * The file tree panel as a long-lived island: every push redraws the model
 * from scratch, and the keyed reconcile turns that into restyles of the rows
 * that changed and inserts or removes of the rows a fold or filter touched.
 */
export function createFileTreeIsland(renderer: CliRenderer, { width: initialWidth = 35 }: { width?: number } = {}) {
  let width = initialWidth
  let input: Omit<FileTreeModelInput, "width"> | null = null
  let filtering = false
  let scroll: ScrollBoxRenderable | undefined
  let onFilterChange: ((value: string) => void) | null = null

  // A real OpenTUI input rather than a hand-rolled prompt, so Ctrl-w, word
  // jumps, paste, undo and selection behave as in every other text field.
  const field = keepAlive(
    new InputRenderable(renderer, {
      id: "file-tree-filter",
      placeholder: "filter by path…",
      placeholderColor: theme.overlay0,
      backgroundColor: theme.surface0,
      textColor: theme.text,
      focusedBackgroundColor: theme.surface0,
      focusedTextColor: theme.text,
      cursorColor: theme.yellow,
      flexGrow: 1,
    })
  )
  field.on(InputRenderableEvents.INPUT, (value: string) => onFilterChange?.(value))

  const [state, setState] = createStore({ model: empty() })

  /** Rows the list draws: every tree row, the empty-state line, and the hidden-files line under them. */
  const drawnRows = (model: Pick<FileTreeViewModel, "rows" | "hidden" | "empty">) =>
    model.rows.length + (model.empty ? 1 : 0) + (model.hidden ? 1 : 0)
  const viewportHeight = () => Math.floor(scroll?.height ?? 0)
  const hintsAt = (total: number, top = scroll?.scrollTop ?? 0): OverflowHints =>
    overflowHints(total, top, viewportHeight())

  // A wheel scroll and a resize move the edges with no push from the app, so
  // the hints follow the scroll box itself.
  function refreshOverflow() {
    const { above, below } = hintsAt(drawnRows(state.model))
    if (above === state.model.overflow.above && below === state.model.overflow.below) return
    setState("model", "overflow", { above, below })
  }

  function attachScroll(ref: ScrollBoxRenderable) {
    scroll = ref
    ref.verticalScrollBar.on("change", refreshOverflow)
    ref.onSizeChange = refreshOverflow
  }

  const island = mountSolid(
    renderer,
    () => <FileTreeView model={state.model} field={field} scrollRef={attachScroll} />,
    { id: "file-tree-panel", width, height: "100%", flexDirection: "column" }
  )

  /** The first and last row index the scroll box shows readably, leaving out rows a hint covers. */
  function visibleRows(): { first: number; last: number } {
    const top = Math.floor(scroll?.scrollTop ?? 0)
    const { above, below } = hintsAt(drawnRows(state.model), top)
    return { first: top + (above ? 1 : 0), last: top + viewportHeight() - 1 - (below ? 1 : 0) }
  }

  function draw() {
    if (!input) return
    const { items: _items, ...rest } = fileTreeModel({ ...input, width })
    const model: FileTreeViewModel = { ...rest, overflow: hintsAt(drawnRows(rest)) }
    batch(() => setState("model", reconcile(model, { key: "key" })))
  }

  /**
   * Focus is taken in the keypress that opened the prompt: file-tree/input.ts
   * swallows that `/` and relies on the field already holding focus, which an
   * effect or a microtask would hand over too late. It is taken only on the
   * way in, so a push mid-typing keeps the cursor, and the value is seeded
   * from state, so `/` on an applied filter refines it rather than starting over.
   */
  function syncFilterField(treeFilter: string, treeFilterInput: boolean) {
    if (treeFilterInput === filtering) return
    filtering = treeFilterInput
    if (filtering) {
      field.value = treeFilter
      field.focus()
    } else {
      field.blur()
    }
  }

  return {
    host: island.host,
    update(next: FileTreeInput) {
      input = withDefaults(next)
      draw()
      syncFilterField(input.treeFilter, input.treeFilterInput)
    },
    getWidth: (): number => width,
    setWidth(next: number) {
      if (next === width) return
      width = next
      island.host.width = next
      draw()
    },
    get visible(): boolean {
      return island.host.visible
    },
    set visible(value: boolean) {
      island.host.visible = value
    },
    visibleRows,
    /** The scroll box's rows, the page Ctrl-d and Ctrl-u take half of. */
    viewportRows: viewportHeight,
    /**
     * Brings the highlight into the readable rows. Where rows lie past an
     * edge, a hint covers that edge's row, so the highlight keeps one row off
     * it; the first and last rows can still reach the edge, as no hint is
     * drawn there once they do.
     */
    ensureHighlightVisible() {
      if (!scroll || !input) return
      const highlight = input.highlightIndex
      const height = viewportHeight()
      const total = drawnRows(state.model)
      const { first, last } = visibleRows()
      if (highlight < first) {
        scroll.scrollTop = overflowHints(total, highlight, height).above ? highlight - 1 : highlight
      } else if (highlight > last) {
        const flush = highlight - height + 1
        scroll.scrollTop = overflowHints(total, flush, height).below ? Math.min(flush + 1, total - height) : flush
      }
    },
    /** Where the filter field sends what is typed; app.ts owns the state the tree is filtered from. */
    setOnFilterChange(callback: (value: string) => void) {
      onFilterChange = callback
    },
    dispose() {
      island.dispose()
    },
  }
}

export type FileTreeIsland = ReturnType<typeof createFileTreeIsland>
