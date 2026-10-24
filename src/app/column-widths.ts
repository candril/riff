import type { AppState } from "../state"
import { commentPanelWidth } from "../features/inline-comment-overlay/width"
import { chatColumnWidth } from "../features/chat/width"

/**
 * The fewest cells the diff is left with while the screen has them: a
 * gutter of line number and sign still leaves about thirty cells of code,
 * enough to read a line. Below it the side columns give way instead.
 */
export const DIFF_MIN_WIDTH = 40
/** The thread panel and the chat stop giving way here, where a comment or an answer still wraps to a few words a line. */
export const SIDE_COLUMN_MIN_WIDTH = 28
/** The tree stops giving way here, where a file name still shows with its status. */
export const TREE_MIN_WIDTH = 20

const TREE_WIDTH = 35
const TREE_EXPANDED_SHARE = 0.45

/** The width the file tree asks for. */
export function fileTreeWidth(screenWidth: number, expanded: boolean): number {
  return expanded ? Math.floor(screenWidth * TREE_EXPANDED_SHARE) : TREE_WIDTH
}

export interface OpenColumns {
  tree: { visible: boolean; expanded: boolean }
  threads: { open: boolean; expanded: boolean }
  chat: { open: boolean }
}

export interface ColumnWidths {
  tree: number
  threads: number
  chat: number
  diff: number
}

/**
 * Takes `by` cells off `widths`, never below `floors`, from each in
 * proportion to what it has above its floor. Returns the widths and what
 * could not be taken.
 */
function giveWay(widths: number[], floors: number[], by: number): { widths: number[]; left: number } {
  const spare = widths.map((width, i) => Math.max(0, width - floors[i]!))
  const totalSpare = spare.reduce((sum, cells) => sum + cells, 0)
  const take = Math.min(by, totalSpare)
  if (take <= 0) return { widths, left: by }
  const exact = spare.map((cells) => (cells * take) / totalSpare)
  const cuts = exact.map(Math.floor)
  let remainder = take - cuts.reduce((sum, cells) => sum + cells, 0)
  // The rounded-off cells go to the largest fractions, so the cuts add up to `take` exactly.
  const byFraction = exact.map((cells, i) => ({ i, fraction: cells - cuts[i]! })).sort((a, b) => b.fraction - a.fraction)
  for (const { i } of byFraction) {
    if (remainder === 0) break
    cuts[i]! += 1
    remainder -= 1
  }
  return { widths: widths.map((width, i) => width - cuts[i]!), left: by - take }
}

/**
 * How the screen is shared between the tree, the diff, the thread panel
 * and the chat. Each side column asks for its own width; where those leave
 * the diff its floor they get it. Otherwise the chat and the threads give
 * way first, to their floors, then the tree to its floor, and below that
 * every side column shrinks in proportion, as a diff with no room to read
 * is worth less than any of them.
 */
export function columnWidths(screenWidth: number, open: OpenColumns): ColumnWidths {
  const screen = Math.max(0, screenWidth)
  const tree = open.tree.visible ? fileTreeWidth(screen, open.tree.expanded) : 0
  const threads = open.threads.open ? commentPanelWidth(screen, open.threads.expanded) : 0
  const chat = open.chat.open ? chatColumnWidth(screen) : 0
  const room = Math.max(0, screen - DIFF_MIN_WIDTH)
  const over = tree + threads + chat - room
  if (over <= 0) return { tree, threads, chat, diff: screen - tree - threads - chat }

  const sides = giveWay([threads, chat], [SIDE_COLUMN_MIN_WIDTH, SIDE_COLUMN_MIN_WIDTH], over)
  const trees = giveWay([tree], [TREE_MIN_WIDTH], sides.left)
  const all = giveWay([...trees.widths, ...sides.widths], [0, 0, 0], trees.left)
  const [treeWidth, threadsWidth, chatWidth] = all.widths as [number, number, number]
  return { tree: treeWidth, threads: threadsWidth, chat: chatWidth, diff: screen - treeWidth - threadsWidth - chatWidth }
}

/** columnWidths for the columns `state` has open. */
export function columnWidthsOf(
  state: Pick<AppState, "showFilePanel" | "filePanelExpanded"> & {
    inlineCommentOverlay: Pick<AppState["inlineCommentOverlay"], "open" | "expanded">
    chatOpen: boolean
  },
  screenWidth: number
): ColumnWidths {
  return columnWidths(screenWidth, {
    tree: { visible: state.showFilePanel, expanded: state.filePanelExpanded },
    threads: state.inlineCommentOverlay,
    chat: { open: state.chatOpen },
  })
}
