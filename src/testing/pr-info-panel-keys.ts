import type { PRInfoPanelClass } from "../components"
import type { RowNode } from "../components/pr-info-tree"
import { registerPrInfoPanelKeys, type PRInfoPanelKeyDeps } from "../features/pr-info-panel/keys"
import { createInitialState, type AppState, type PRInfoPanelSection } from "../state"
import { createToastState } from "../features/toast/state"
import { createPrCommentInputState } from "../features/pr-info-panel/comment-input-state"
import { createPrInfoFilterState } from "../features/pr-info-panel/filter-state"
import type { ReactionTarget } from "../types"
import { keymapHarness } from "./keymap-keys"
import { prInfo } from "./pr-info"

/** The PR overview as the view, nothing open over it. */
export function overviewState(patch: Partial<AppState> = {}): AppState {
  return {
    ...createInitialState([], [], "test", ""),
    appMode: "pr",
    prInfo: prInfo("A body"),
    viewMode: "state",
    focusedPanel: "diff",
    ...patch,
  }
}

export interface StubPanelOptions {
  section?: PRInfoPanelSection
  onHeader?: boolean
  /** Whether the files section has a row under the cursor. */
  file?: boolean
  /** A real panel in place of the recording stub, for keys whose effect is the panel's own. */
  controller?: PRInfoPanelClass
}

/**
 * A panel controller that records what it is asked to do: where the cursor
 * is comes from the options, and every move, fold and scroll lands in
 * `calls`. The reaction target is a review comment in the conversation and
 * the PR anywhere else.
 */
export function stubPanel(calls: string[], options: StubPanelOptions = {}) {
  const panel = { section: options.section ?? "description", onHeader: options.onHeader ?? false, file: options.file ?? true }
  const record = (name: string, result?: unknown) => (...args: unknown[]) => {
    calls.push(args.length ? `${name} ${args.join(" ")}` : name)
    return result
  }
  const scrollBox = { scrollTo: record("scrollTo"), scrollBy: record("scrollBy"), scrollHeight: 120 }
  const controller = {
    getActiveSection: () => panel.section,
    isOnSectionHeader: () => panel.onHeader,
    isSectionExpanded: () => true,
    moveCursor: record("moveCursor", true),
    cycleSection: record("cycleSection"),
    cycleSectionToEnd: record("cycleSectionToEnd"),
    getCursorIndex: () => (panel.onHeader ? -1 : 0),
    // One folded row, so every fold key has something to act on.
    rowNodes: (): RowNode[] => [{ level: 0, foldable: true, open: false }],
    collapseSection: record("collapseSection"),
    expandSection: record("expandSection"),
    collapseAllSections: record("collapseAllSections"),
    expandAllSections: record("expandAllSections"),
    openRow: record("openRow"),
    closeRow: record("closeRow"),
    moveCursorTo: record("moveCursorTo", true),
    toggleSelectedThread: record("toggleSelectedThread"),
    toggleCheckExpansion: record("toggleCheckExpansion"),
    toggleSelectedPoint: () => false,
    getSelectedCheck: () => undefined,
    getSelectedMergeThread: () => undefined,
    getSelectedAnnotation: () => null,
    getSelectedPreview: () => ({ app: "vercel", links: [{ label: "a", url: "https://a" }, { label: "b", url: "https://b" }] }),
    getSelectedFile: () => (panel.file ? { filename: "src/greet.ts" } : undefined),
    getSelectedCommit: () => ({ sha: "abc123" }),
    getSelectedFlatItem: () => ({ type: "review-thread", data: { id: "t1" } }),
    getSelectedConversationItem: () => undefined,
    getReactionTarget: (): ReactionTarget =>
      panel.section === "conversation" ? { kind: "review-comment", githubId: 7 } : { kind: "issue", prNumber: 1259 },
    getScrollBox: () => scrollBox,
  }
  return { panel, controller: controller as unknown as PRInfoPanelClass }
}

/**
 * The PR overview's layers on a real keymap in front of a recording
 * leftover, with every hand-off to the app and every call on the panel
 * controller in `calls`. Call it inside a test.
 */
export async function prInfoPanelKeys(initial: AppState, options: StubPanelOptions = {}) {
  const harness = await keymapHarness()
  let state = initial
  const calls: string[] = []
  const stub = stubPanel(calls, options)
  const panel = stub.panel
  const controller = options.controller ?? stub.controller
  const record = (entry: string) => (...args: unknown[]) => void calls.push([entry, ...args].join(" "))
  const toast = createToastState()
  const commentInput = createPrCommentInputState()
  const prInfoFilter = createPrInfoFilterState()
  const deps: PRInfoPanelKeyDeps = {
    getState: () => state,
    setState: (update) => {
      state = update(state)
    },
    render() {},
    toast,
    commentInput,
    prInfoFilter,
    getPanel: () => controller,
    onJumpToFile: record("jumpToFile"),
    onOpenFileAtLine: record("openFileAtLine"),
    onActivateCommit: record("activateCommit"),
    onPreviewRow: (action, row) => void calls.push(`previewRow ${action} ${row.app}`),
    onToggleThreadResolved: record("resolve"),
    onOpenThread: record("openThread"),
    executeAction: record("action"),
    onOpenLinks: record("links"),
    onToggleHelp: record("help"),
    onReact: record("react"),
  }
  const unregister = registerPrInfoPanelKeys(harness.riffKeymap, deps)
  return {
    ...harness,
    calls,
    panel,
    unregister,
    toast,
    commentInput,
    prInfoFilter,
    state: () => state,
    set: (next: AppState) => {
      state = next
    },
  }
}
