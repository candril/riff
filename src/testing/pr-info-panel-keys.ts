import type { PRInfoPanelClass } from "../components"
import { registerPrInfoPanelKeys, type PRInfoPanelKeyDeps } from "../features/pr-info-panel/keys"
import { createInitialState, type AppState, type PRInfoPanelSection } from "../state"
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

export function withPanelState(state: AppState, patch: Partial<AppState["prInfoPanel"]>): AppState {
  return { ...state, prInfoPanel: { ...state.prInfoPanel, ...patch } }
}

export interface StubPanelOptions {
  section?: PRInfoPanelSection
  onHeader?: boolean
  /** Whether the files section has a row under the cursor. */
  file?: boolean
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
    toggleSection: record("toggleSection"),
    collapseSection: record("collapseSection"),
    expandSection: record("expandSection"),
    collapseAllSections: record("collapseAllSections"),
    expandAllSections: record("expandAllSections"),
    toggleSelectedThread: record("toggleSelectedThread"),
    expandSelectedThread: record("expandSelectedThread"),
    collapseSelectedThread: record("collapseSelectedThread"),
    expandSelectedCheck: record("expandSelectedCheck"),
    collapseSelectedCheck: record("collapseSelectedCheck"),
    toggleCheckExpansion: record("toggleCheckExpansion"),
    getSelectedCheck: () => undefined,
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
 * The PR overview's layers on a real keymap in front of a recording chain,
 * with every hand-off to the app and every call on the panel controller in
 * `calls`. Call it inside a test.
 */
export async function prInfoPanelKeys(initial: AppState, options: StubPanelOptions = {}) {
  const harness = await keymapHarness()
  let state = initial
  const calls: string[] = []
  const { panel, controller } = stubPanel(calls, options)
  const record = (entry: string) => (...args: unknown[]) => void calls.push([entry, ...args].join(" "))
  const deps: PRInfoPanelKeyDeps = {
    getState: () => state,
    setState: (update) => {
      state = update(state)
    },
    render() {},
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
    state: () => state,
    set: (next: AppState) => {
      state = next
    },
  }
}
