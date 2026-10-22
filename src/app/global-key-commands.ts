import type { KeyEvent } from "@opentui/core"
import {
  clearToast,
  clearTreeFilter,
  focusLeft,
  focusRight,
  openActionMenu,
  openCommitPicker,
  switchView,
  toggleFilePanel,
  toggleFilePanelExpanded,
  type AppState,
} from "../state"
import { exitVisualMode, isVisualMode } from "../vim-diff/cursor-state"
import { flashSurface, reservedKeysFor } from "./list-flash"
import type { GlobalLayerKeyDeps } from "./global-layer-keys"
import * as occurrencePicker from "../features/occurrence-picker"
import * as jumplist from "../features/jumplist"
import * as marks from "../features/marks"

/** A key the command declines, which goes on unprevented to the layers behind. */
export type Outcome = false | void

export type Body = (key: KeyEvent, state: AppState) => Outcome

/** `keys`: how the palette spells the key, for the commands an action names. */
export interface GlobalKeyCommand {
  title: string
  keys?: string
  run: Body
}

/** What each global key does, keyed by command name. */
export function globalKeyCommands(deps: GlobalLayerKeyDeps): Record<string, GlobalKeyCommand> {
  const show = (update: (s: AppState) => AppState) => {
    deps.setState(update)
    deps.render()
  }
  return {
    back: {
      title: "Back in the jumplist",
      keys: "Ctrl+o",
      run: (key) => {
        if (!key.ctrl) return false
        // Ctrl-O: back in jumplist (spec 038).
        const result = jumplist.back(deps.getState(), deps.getVimState(), deps.getLineMapping(), deps.getPane())
        if (result) {
          deps.setState(() => result.state)
          jumplist.apply(result.jump, deps.jumpApply)
        }
      },
    },
    palette: {
      title: "Open the command palette",
      run: (key) => {
        if (!key.ctrl) return false
        // The prompt takes focus in this same keypress; without this the
        // key that opened it is typed into it.
        key.preventDefault()
        show(openActionMenu)
      },
    },
    filePicker: {
      title: "Jump to a file",
      keys: "Ctrl+f",
      run: (key, state) => {
        // Ctrl-f is the quick jump to a file, from every view. Narrowing
        // what is on screen is `/`, wherever there is a list to narrow.
        if (!key.ctrl || state.files.length === 0) return false
        key.preventDefault()
        deps.filePicker.show()
        deps.render()
      },
    },
    marksPicker: {
      title: "List the marks",
      keys: "Ctrl+k",
      run: (key) => {
        // From every view, and with no mark set too: the empty list says how to set one.
        if (!key.ctrl) return false
        key.preventDefault()
        show(marks.openMarksPicker)
      },
    },
    commitsOrBottom: {
      title: "Pick a commit, or the tree's last row",
      keys: "Ctrl+g",
      run: (key, state) => {
        // Ctrl-g is the commit picker — `g` is riff's letter for commits
        // (`]g`, `[g`), and the picker was two keystrokes and a search away
        // in the palette. The file-path toast it used to show is still there
        // as Show File Path.
        if (key.ctrl && key.name === "g") {
          if (state.commits.length > 0) {
            key.preventDefault()
            show(openCommitPicker)
          }
          return
        }
        // The diff's own G is its motion handler's; the tree's is here. A
        // terminal reports it as a shifted `g` or as `G`.
        if ((key.name === "G" || key.shift) && state.focusedPanel === "tree") {
          deps.goToBottom()
          return
        }
        return false
      },
    },
    quit: { title: "Quit", keys: "q", run: () => deps.quit() },
    addComment: {
      title: "Comment on the line in $EDITOR",
      run: (key) => {
        // C (shift+c): Add an inline comment via $EDITOR. Falls back
        // silently if the cursor isn't on a commentable line. PR-level
        // conversation comments are command-palette only.
        if (!key.shift) return false
        deps.addComment()
      },
    },
    escape: {
      title: "Clear the toast",
      run: (_key, state) => {
        if (!state.toast.message) return false
        show(clearToast)
      },
    },
    surface: {
      title: "Switch to the overview, the feed or the diff",
      run: (key, state) => switchSurface(deps, key, state),
    },
    occurrencesOrFlash: {
      title: "Grep the change set, or flash the list",
      keys: "Ctrl+s",
      run: (key, state) => occurrencesOrFlash(deps, key, state),
    },
    threads: {
      title: "Open the comments panel",
      run: (key) => {
        // Ctrl-t opens the comments panel on what the diff cursor is
        // pointing at, from every view. Closing it is the panel's own
        // binding, so this only ever opens.
        if (!key.ctrl || key.shift) return false
        if (!deps.openCommentsOverlay("view")) deps.openCommentsPanelForCursor()
      },
    },
    toggleTree: {
      title: "Show or hide the file tree",
      keys: "Ctrl+b",
      run: (key) => {
        if (!key.ctrl) return false
        deps.setState((s) => {
          const toggled = toggleFilePanel(s)
          if (toggled.showFilePanel) return { ...toggled, focusedPanel: "tree" }
          // A hidden tree must not keep focus: keys would keep going to a
          // panel nobody can see, and typing into the void reaches `q`.
          return s.focusedPanel === "tree" ? { ...toggled, focusedPanel: "diff" } : toggled
        })
        deps.render()
        setTimeout(() => {
          deps.render()
        }, 0)
      },
    },
    expandTreeOrEdit: {
      title: "Widen the file tree, or edit the thread in $EDITOR",
      keys: "Ctrl+e",
      run: (key, state) => {
        if (key.ctrl && state.showFilePanel) {
          show(toggleFilePanelExpanded)
          return
        }
        // E (shift+e): Edit the comment thread on the current line via
        // $EDITOR. Same flow as `C` — handleAddComment shows the thread
        // for editing and includes a reply box. No-op when the cursor
        // isn't on a commented/commentable line.
        if (!key.shift) return false
        deps.addComment()
      },
    },
    forward: {
      title: "Forward in the jumplist",
      keys: "Ctrl+i",
      run: () => {
        // Tab and Ctrl-I are indistinguishable in terminal input; both
        // mean forward-jump in the jumplist (spec 038). The previous
        // view-toggle binding moved to bare `i`.
        const result = jumplist.forward(deps.getState())
        if (result) {
          deps.setState(() => result.state)
          jumplist.apply(result.jump, deps.jumpApply)
        }
      },
    },
    backspace: {
      title: "Move focus left, or clear the tree filter",
      keys: "Ctrl+h",
      run: (_key, state) => {
        // Ctrl-h moves focus one panel left: comments → diff → tree.
        // Terminals deliver bare Ctrl-h as backspace, so this key is both
        // things at once — and walking back to the tree has to come first,
        // or returning to look at what the filter left would drop it.
        if (state.mode === "normal" && focusLeft(state) !== state) {
          show(focusLeft)
          return
        }
        // Nowhere left to move: a tree filter is the next thing backspace
        // takes down — it is the state most easily forgotten about, and it
        // silently hides files from everything that reads the tree.
        if (!state.treeFilter || state.treeFilterInput) return false
        deps.setState(clearTreeFilter)
        deps.updateFileTreePanel()
        deps.render()
      },
    },
    right: {
      title: "Move focus right",
      keys: "Ctrl+l",
      run: (key) => {
        if (!key.ctrl) return false
        // Ctrl-l moves focus one panel right: tree → diff → comments → chat.
        show(focusRight)
        setTimeout(() => {
          deps.render()
        }, 0)
      },
    },
  }
}

function switchSurface(deps: GlobalLayerKeyDeps, key: KeyEvent, state: AppState): Outcome {
  // The three surfaces are one key apart, from any of them, and the
  // key of the view you are in takes you back where you came from
  // (spec 064). Ctrl-I arrives as `tab` and means jumplist-forward,
  // and inside a selection `i`/`a` open a text object (spec 055), so
  // both are left to their owners.
  if (key.ctrl || key.shift) return false
  if (state.focusedPanel === "diff" && isVisualMode(deps.getVimState())) return false

  const target = key.name === "i" ? "state" : key.name === "a" ? "feed" : "diff"
  const switched = switchView(state, target)
  if (switched === state) {
    // The overview and the feed are the pull request's, and a local
    // review on a branch that has one is a keypress away from being
    // able to show them. riff already named it in the header; asking
    // for it is what fetches it (spec 095).
    if (target !== "diff" && state.appMode === "local" && state.branchPr) {
      deps.openBranchPr(target)
      return
    }
    return false
  }
  deps.setState(() => switched)
  deps.render()
  // The feed's timeline is fetched the first time it is asked for: a
  // PR nobody opens the feed on costs nothing (spec 070).
  if (switched.viewMode === "feed" && switched.feed.events.length === 0 && !switched.feed.loading) {
    deps.loadFeed()
  }
}

function occurrencesOrFlash(deps: GlobalLayerKeyDeps, key: KeyEvent, state: AppState): Outcome {
  // Ctrl-s greps the change set (spec 088). The composer keeps its own
  // Ctrl-s: its layer takes the key before this one sees it.
  if (key.ctrl) {
    if (state.files.length > 0) {
      key.preventDefault()
      const vim = deps.getVimState()
      const seed =
        state.viewMode === "diff" && state.focusedPanel === "diff"
          ? occurrencePicker.seedQuery(vim, deps.getLineMapping())
          : ""
      if (isVisualMode(vim)) deps.setVimState(exitVisualMode(vim))
      deps.setState((s) => occurrencePicker.openOccurrencePicker(s, seed))
      deps.render()
    }
    return
  }
  // `s` labels the rows of whatever list has focus and the next key
  // jumps (spec 066). The diff keeps its own flavour — type first,
  // then pick — and is handled where the diff's keys are.
  if (!key.ctrl && !key.shift && !isVisualMode(deps.getVimState())) {
    const surface = flashSurface(state)
    if (surface) {
      key.preventDefault()
      deps.startListFlash(surface, deps.flashTargets(state), reservedKeysFor(surface))
      deps.render()
      return
    }
  }
  return false
}
