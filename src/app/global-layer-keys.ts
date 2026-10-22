/**
 * The keys that work in any mode: the palette, the pickers, the three
 * surfaces, the jumplist, the focus walk, list flash and quitting. They
 * register behind every modal layer and ahead of the tree, the sequences
 * and the diff, and stand aside while any capture holds the key, so none
 * acts under a modal.
 */

import type { KeyEvent } from "@opentui/core"
import type { RiffKeymap } from "./keymap"
import { anyModifiers } from "./key-variants"
import type { AppState } from "../state"
import type { VimCursorState } from "../vim-diff/types"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import type { FlashSurface } from "../vim-diff/flash-state"
import type { JumpApplyContext } from "../features/jumplist"
import type { JumpListState } from "../features/jumplist/state"
import { globalKeyCommands } from "./global-key-commands"
import type { FilePickerState } from "../features/file-picker/state"
import type { OccurrencePickerState } from "../features/occurrence-picker/state"
import type { MarksPickerState } from "../features/marks/picker-state"
import type { CommitPickerState } from "../features/commit-picker/state"
import type { ActionMenuState } from "../features/action-menu/state"

export interface GlobalLayerKeyDeps {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  filePicker: Pick<FilePickerState, "show">
  occurrencePicker: Pick<OccurrencePickerState, "show">
  marksPicker: Pick<MarksPickerState, "show">
  commitPicker: Pick<CommitPickerState, "show">
  actionMenu: Pick<ActionMenuState, "show">
  getVimState: () => VimCursorState
  setVimState: (s: VimCursorState) => void
  getLineMapping: () => DiffLineMapping
  getPane: () => "left" | "right" | null
  quit: () => void
  /** `C` and `E`: the comment, or the thread, on the cursor's line in $EDITOR. */
  addComment: () => void
  jumpList: Pick<JumpListState, "back" | "forward">
  jumpApply: JumpApplyContext
  /** The tree's `G`; the diff's is its motion handler's. */
  goToBottom: () => void
  openBranchPr: (view: "state" | "feed") => void
  loadFeed: () => void
  updateFileTreePanel: () => void
  startListFlash: (surface: FlashSurface, ids: string[], reserved: string) => void
  flashTargets: (state: AppState) => string[]
  openCommentsOverlay: (mode: "view") => boolean
  openCommentsPanelForCursor: () => void
  /** Whether a chord is pending, under which every global key declines. */
  chord: { chordPending(): boolean }
}

export function registerGlobalKeys(riffKeymap: RiffKeymap, deps: GlobalLayerKeyDeps): () => void {
  const commands = globalKeyCommands(deps)
  const bindings = Object.entries(BOUND_NAMES).flatMap(([cmd, names]) =>
    names.flatMap((name) => anyModifiers(name, `global.${cmd}`)),
  )
  return riffKeymap.keymap.registerLayer({
    enabled: () => !riffKeymap.held(),
    commands: Object.entries(commands).map(([cmd, { title, keys, run }]) => ({
      name: `global.${cmd}`,
      title,
      keys,
      category: "Global",
      palette: false,
      run: ({ event }: { event: KeyEvent }) => {
        // The keymap folds a name to lower case, so the binding on `q` also
        // takes kitty's capitalised "Q", which CASE_NAMES leaves out.
        if (!CASE_NAMES[cmd]!.includes(event.name)) return false
        // A pending chord's second key belongs to the layers behind.
        if (deps.chord.chordPending()) return false
        return run(event, deps.getState())
      },
    })),
    // Each command prevents the keys it acts on itself, which a declined key must not be.
    bindings: bindings.map((binding) => ({ ...binding, preventDefault: false })),
  })
}

/** The names each command takes; it declines any other its binding matches. */
const CASE_NAMES: Record<string, readonly string[]> = {
  back: ["o"],
  palette: ["p"],
  filePicker: ["f"],
  marksPicker: ["k"],
  commitsOrBottom: ["g", "G"],
  quit: ["q"],
  addComment: ["c"],
  escape: ["escape"],
  surface: ["i", "a", "d"],
  occurrencesOrFlash: ["s"],
  threads: ["t"],
  toggleTree: ["b"],
  expandTreeOrEdit: ["e"],
  forward: ["tab"],
  backspace: ["backspace"],
  right: ["l"],
}

/** "G" needs no binding of its own: the keymap matches it on `g`. */
const BOUND_NAMES: Record<string, readonly string[]> = {
  ...CASE_NAMES,
  commitsOrBottom: ["g"],
}
