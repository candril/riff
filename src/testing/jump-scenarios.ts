import { KeyEvent, parseKeypress } from "@opentui/core"
import type { AppKeyContext } from "../app/key-context"
import { createJumpRecording } from "../app/jump-recording"
import { routeDiffViewport } from "../app/diff-viewport"
import { mountApp } from "./app-render"
import { keysOn } from "./chat-keys"
import { SearchHandler } from "../vim-diff/search-handler"
import { FlashHandler } from "../vim-diff/flash-handler"
import { buildFileTree } from "../utils/file-tree"
import { parseDiff } from "../utils/diff-parser"
import { clearFileSelection, commitScopeKey, setViewingCommit, type AppState } from "../state"
import { createCursorState } from "../vim-diff/cursor-state"
import type { FoldsContext } from "../features/folds"
import type { Comment } from "../types"
import type { PrCommit } from "../providers/github/types"

/**
 * Eighty lines changed in four places, so every file has four hunks for
 * `]c` to walk and is long enough that `gg`, `G` and `Ctrl-d` move. Each
 * file says `needle` once per hunk, in a line of its own, for search.
 */
function scenarioFile(name: string): string {
  const hunk = (start: number) => {
    const rows: string[] = []
    for (let n = start; n < start + 9; n++) {
      if (n === start + 4) {
        rows.push(`-  const v${n} = "${name} old ${n}"`)
        rows.push(`+  const v${n} = "${name} needle ${n}"`)
      } else {
        rows.push(`   const v${n} = "${name} line ${n}"`)
      }
    }
    return [`@@ -${start},9 +${start},9 @@`, ...rows]
  }
  return [
    `diff --git a/${name} b/${name}`,
    "index 1111111..2222222 100644",
    `--- a/${name}`,
    `+++ b/${name}`,
    ...hunk(1),
    ...hunk(21),
    ...hunk(41),
    ...hunk(61),
    "",
  ].join("\n")
}

export const SCENARIO_FILES = ["src/alpha.ts", "src/beta.ts", "src/gamma.ts"]
export const scenarioDiff = (names: readonly string[]) => names.map(scenarioFile).join("")
export const SCENARIO_DIFF = scenarioDiff(SCENARIO_FILES)

export const COMMITS: PrCommit[] = [
  { sha: "aaa1111", message: "only beta", author: "you", date: "2026-09-11T10:00:00Z" },
]

export const THREADS: Comment[] = [
  thread("t1", "src/alpha.ts", 5),
  thread("t2", "src/alpha.ts", 45),
  thread("t3", "src/gamma.ts", 25),
]

function thread(id: string, filename: string, line: number): Comment {
  return { id, filename, line, side: "RIGHT", body: `note ${id}`, createdAt: "2026-01-01T00:00:00Z", status: "synced", author: "ana" }
}

/** Keys as the terminal sends them; kitty's spelling for the shifted ones riff reads by name. */
export const KEY = {
  ctrlO: "\x0f",
  tab: "\t",
  ctrlD: "\x04",
  ctrlU: "\x15",
  ctrlE: "\x05",
  ctrlY: "\x19",
  ctrlF: "\x06",
  ctrlK: "\x0b",
  ctrlG: "\x07",
  ctrlS: "\x13",
  ctrlT: "\x14",
  ctrlN: "\x0e",
  enter: "\r",
  escape: "\x1b",
  G: "\x1b[71;2u",
  N: "\x1b[110;2u",
  C: "\x1b[67;2u",
} as const

export interface Place {
  file: string | null
  /** The mapping line the cursor is on. */
  line: number
  col: number
  /** What that line reads, which is what an entry has to come back to. */
  text: string | null
  view: { split: boolean; singleFile: boolean; mode: AppState["viewMode"] }
  focus: AppState["focusedPanel"]
}

/**
 * riff on a three-file diff, its keys through the real createAppKeys and
 * the jumplist recorded around them by app.ts's own recording. What the
 * keys reach is wired to the app's state as app.ts wires it; nothing that
 * spawns, opens a browser or reaches GitHub is.
 */
export async function jumpScenario({
  width = 160,
  height = 30,
  more = {},
}: { width?: number; height?: number; more?: Partial<AppKeyContext> } = {}) {
  const mounted = await mountApp(SCENARIO_DIFF, { width, height })
  const allFiles = parseDiff(SCENARIO_DIFF)
  const onlyBeta = allFiles.filter((file) => file.filename === "src/beta.ts")
  mounted.show({
    focusedPanel: "diff",
    showFilePanel: true,
    treeHighlightIndex: 0,
    comments: THREADS,
    commits: COMMITS,
    commitDiffCache: new Map([[commitScopeKey("aaa1111"), { files: onlyBeta, fileTree: buildFileTree(onlyBeta) }]]),
  })
  const { ctx: render } = mounted
  const cursorView = routeDiffViewport(render.unified, {
    shown: render.split.shown,
    island: render.split.island,
    rowAtLine: render.split.rowAtLine,
    refreshCursor: () => {},
  })
  let keys!: ReturnType<typeof keysOn>
  const vim = () => keys.vimState()
  const setVimState: AppKeyContext["setVimState"] = (next) => keys.setVim(next)
  const rebuildLineMapping = () => mounted.show({ files: render.getState().files })
  const foldsContext: FoldsContext = {
    getState: render.getState,
    setState: render.setState,
    getVimState: vim,
    setVimState,
    getLineMapping: render.getLineMapping,
    rebuildLineMapping,
    getFileTreePanel: () => mounted.fileTreePanel,
    getCursorView: () => cursorView,
    updateFileTreePanel: render.updateFileTreePanel,
    ensureCursorVisible: () => {},
    render: mounted.render,
  }
  const fileNavContext = {
    getState: render.getState,
    setState: render.setState,
    getVimState: vim,
    setVimState,
    getLineMapping: render.getLineMapping,
    createLineMapping: () => {
      rebuildLineMapping()
      return render.getLineMapping()
    },
    getCursorView: () => cursorView,
    ensureCursorVisible: () => {},
    render: mounted.render,
    getHeadSha: () => "abc1234",
    setHeadSha: () => {},
    source: "test",
    mode: "local",
    prInfo: null,
  } as unknown as AppKeyContext["fileNavContext"]
  const threadMotionContext = {
    getState: render.getState,
    setState: render.setState,
    getVimState: vim,
    setVimState,
    getLineMapping: render.getLineMapping,
    ensureCursorVisible: () => {},
    render: mounted.render,
    fileNavContext,
  }
  const searchHandler = new SearchHandler({
    getMapping: render.getLineMapping,
    getSearchState: render.getSearchState,
    setSearchState: mounted.setSearchState,
    getCursor: vim,
    setCursor: (line, col) => setVimState({ ...vim(), line, col }),
    getFileContent: () => null,
    loadFileContent: async () => {},
    expandDividerForLine: () => {},
    getCollapsedFiles: () => [],
    expandFiles: () => {},
    onUpdate: mounted.render,
  })
  mounted.onSearchPattern((value) => searchHandler.updatePattern(value))
  const flashHandler = new FlashHandler({
    getMapping: render.getLineMapping,
    getFlashState: render.getFlashState,
    setFlashState: mounted.setFlashState,
    getCursor: vim,
    setCursor: (line, col) => setVimState({ ...vim(), line, col, desiredCol: null }),
    getVisibleRegion: () => render.unified.visibleRegion(),
    jumpToRow: () => {},
    onUpdate: mounted.render,
  })
  const onCommitSelected = (sha: string | null) => {
    // app.ts's handleCommitSelected without the fetch: the commit's files are cached.
    render.setState((s) => setViewingCommit(s, sha, sha ? [sha] : null))
    setVimState(createCursorState())
    rebuildLineMapping()
  }
  // app.ts's marks context, which its keys and its recording share.
  const getPane = () => render.split.commentScope().pane ?? null
  const setPane = (pane: "left" | "right") => {
    if (render.split.shown()) render.split.source().setSide(pane)
  }
  const recording = createJumpRecording({
    getState: render.getState,
    setState: render.setState,
    getVimState: vim,
    getLineMapping: render.getLineMapping,
    getPane,
    searchActive: () => render.getSearchState().active,
    flashActive: () => render.getFlashState().active,
    chordPending: () => keys.chordPending(),
  })
  keys = keysOn(
    mounted,
    {
      cursorView,
      foldsContext,
      fileNavContext,
      threadMotionContext,
      rebuildLineMapping,
      getPane,
      setPane,
      fileTreePanel: mounted.fileTreePanel,
      updateFileTreePanel: render.updateFileTreePanel,
      getCommentScope: () => render.split.commentScope(),
      getSearchState: render.getSearchState,
      getFlashState: render.getFlashState,
      searchHandler,
      flashHandler,
      onCommitSelected,
      executeAction: (id) => {
        // app.ts's Show All Files, which Esc in a single file runs; no other action is reached.
        if (id !== "show-all-files") throw new Error(`the scenario reached action ${id}`)
        render.setState((s) => ({ ...clearFileSelection(s), focusedPanel: "diff" }))
        setVimState(createCursorState())
        rebuildLineMapping()
        mounted.render()
      },
      threadPanelLayout: () => null,
      marksContext: {
        ...threadMotionContext,
        getPane,
        setPane,
        save: () => {},
        getHead: () => undefined,
      },
      ...more,
    },
    (key, dispatch) => recording.around(key, dispatch),
  )
  render.updateFileTreePanel()
  await mounted.frame()

  const emit = (sequence: string) =>
    mounted.setup.renderer.keyInput.emit("keypress", new KeyEvent(parseKeypress(sequence, { useKittyKeyboard: true })!))
  const state = () => render.getState()

  return {
    mounted,
    keys,
    state,
    /** Each argument is one key; a chord goes in as one call. */
    press(...sequences: string[]) {
      sequences.forEach(emit)
    },
    /** Where the reader is, as an entry would have to restore it. */
    where(): Place {
      const s = state()
      const line = vim().line
      const row = render.getLineMapping().getLine(line)
      return {
        file: row?.filename ?? null,
        line,
        col: vim().col,
        text: row?.content ?? null,
        view: { split: s.splitView, singleFile: s.selectedFileIndex !== null, mode: s.viewMode },
        focus: s.focusedPanel,
      }
    },
    list() {
      const { entries, index } = state().jumpList
      return { entries, index }
    },
    /** The mapping line of `file` that reads `text`. */
    lineOf(file: string, text: string) {
      return render.getLineMapping().allLines.findIndex((row) => row.filename === file && row.content.includes(text))
    },
    /** Puts the cursor somewhere without a key, so nothing is recorded. */
    moveTo(line: number, col = 0) {
      keys.setVim({ line, col })
    },
    /** The label flash put on `line`, once a pattern has been typed. */
    flashLabel(line: number) {
      return render.getFlashState().matches.find((match) => match.line === line)?.label ?? null
    },
    dispose: () => mounted.dispose(),
  }
}

export type JumpScenario = Awaited<ReturnType<typeof jumpScenario>>
