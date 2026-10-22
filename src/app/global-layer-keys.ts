/**
 * The keys that work in any mode: the palette, the pickers, the three
 * surfaces, the jumplist, the focus walk, list flash and quitting. They
 * register behind every layer but the tree's, because the chain asked them
 * after its modal branches and before its sequences, the tree and the diff,
 * and stand aside while any capture holds the key, where the chain never
 * reached them.
 */

import type { KeyEvent } from "@opentui/core"
import type { RiffKeymap } from "./keymap"
import { anyModifiers } from "./key-variants"
import type { AppState } from "../state"
import type { VimCursorState } from "../vim-diff/types"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import type { FlashSurface } from "../vim-diff/flash-state"
import type { JumpApplyContext } from "../features/jumplist"
import { globalKeyCommands } from "./global-key-commands"

export interface GlobalLayerKeyDeps {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  getVimState: () => VimCursorState
  setVimState: (s: VimCursorState) => void
  getLineMapping: () => DiffLineMapping
  quit: () => void
  /** `C` and `E`: the comment, or the thread, on the cursor's line in $EDITOR. */
  addComment: () => void
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
  /** The chain these keys sat in, whose pending chord they gave way to. */
  chain: { chordPending(): boolean }
}

export function registerGlobalKeys(riffKeymap: RiffKeymap, deps: GlobalLayerKeyDeps): () => void {
  const commands = globalKeyCommands(deps)
  const bindings = Object.entries(BOUND_NAMES).flatMap(([cmd, names]) =>
    names.flatMap((name) => anyModifiers(name, `global.${cmd}`)),
  )
  return riffKeymap.keymap.registerLayer({
    enabled: () => !riffKeymap.held(),
    commands: Object.entries(commands).map(([cmd, { title, run }]) => ({
      name: `global.${cmd}`,
      title,
      category: "Global",
      palette: false,
      run: ({ event }: { event: KeyEvent }) => {
        // The keymap folds a name to lower case, so the binding on `q` also
        // takes kitty's capitalised "Q", which the chain's cases never named.
        if (!CASE_NAMES[cmd]!.includes(event.name)) return false
        // The chain's switch ran only with no chord pending.
        if (deps.chain.chordPending()) return false
        return run(event, deps.getState())
      },
    })),
    // Each command prevents exactly where the chain did, which a declined key must not be.
    bindings: bindings.map((binding) => ({ ...binding, preventDefault: false })),
  })
}

/** The names each of the chain's cases matched. */
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
