import { cellsOf } from "../diff-rows/cells"
import { fitSpans } from "./fit-spans"

export interface HelpSection {
  title: string
  keys: readonly (readonly [string, string])[]
}

export const HELP_SECTIONS: readonly HelpSection[] = [
  {
    title: "Navigation",
    keys: [
      ["j / k", "Move down / up"],
      ["h / l", "Move left / right"],
      ["w / b / e", "By word"],
      ["f / t", "Find / till character"],
      ["Ctrl+d / Ctrl+u", "Half page down / up"],
      ["gg / G", "Go to top / bottom"],
      ["% / gm", "Matching bracket"],
      ["s", "Flash jump — labels rows in a list"],
      ["]c / [c", "Next / previous hunk"],
      ["]f / [f", "Next / previous file"],
      ["]u / [u", "Next / previous unviewed file"],
      ["]o / [o", "Next / previous outdated file"],
      ["]g / [g", "Next / previous commit's diff"],
      ["zl / zh", "Scroll one column right / left"],
      ["zL / zH", "Scroll half a screen right / left"],
      ["zs / ze", "Cursor column to left / right edge"],
      ["zz / zt / zb", "Cursor row to centre / top / bottom"],
      ["gl", "Peek the line, its table, or a diagram"],
      ["gR", "Rendered markdown / back to the diff"],
      ["gB", "Who last changed this line"],
      ["zw", "Toggle soft wrap"],
      ["gb", "Blame column for this file"],
      ["\\", "Toggle side by side (120+ columns)"],
    ],
  },
  {
    title: "Search & Jump",
    keys: [
      ["/ ?", "Search forward / backward"],
      ["n / N", "Next / previous match"],
      ["* / #", "Search word under cursor"],
      ["s", "Flash jump to a visible match"],
      ["Ctrl+o / Ctrl+i", "Jumplist back / forward"],
      ["m{a-z A-Z}", "Set a mark (again on its line: remove)"],
      ["'{letter}", "Jump to a mark from anywhere"],
      ["''", "Back to the mark visited before"],
      ["]m / [m", "Next / previous mark"],
      ["Ctrl-k", "List the marks (Ctrl-x deletes)"],
    ],
  },
  {
    title: "Folds & Context",
    keys: [
      ["za", "Toggle fold (file, hunk, code block, overview row)"],
      ["zA", "Fold every code block in this file"],
      ["zo / zc", "Open / close fold (diff or PR overview)"],
      ["zR / zM", "Open / close every fold or overview section"],
      ["h / l", "Tree & overview: fold or climb / open or descend"],
      ["Enter", "Reveal hidden context lines"],
    ],
  },
  {
    title: "Selection",
    keys: [
      ["v / V", "Select by character / by line"],
      ["o", "Jump to the selection's other end"],
      ['iw aw i" i(', "Word, string, bracket pair"],
      ["ih af i+ i-", "Hunk, file, run of added / deleted"],
    ],
  },
  {
    title: "Chat",
    keys: [
      ["Enter", "Send, or queue while an answer runs"],
      ["Ctrl+j", "Break the line"],
      ["Shift+Enter", "Break the line, where the terminal tells it"],
      ["Ctrl+g", "Edit the question in $EDITOR"],
      ["Ctrl+e", "Widen the chat, or narrow it back"],
      ["@", "Attach @line @selection @file @pr"],
      ["Esc", "Stop an answer, or back to the diff"],
      ["Ctrl+n Ctrl+n", "Start a new conversation"],
    ],
  },
  {
    title: "Panels & Files",
    keys: [
      ["Ctrl+b", "Toggle file tree"],
      ["Ctrl+e", "Expand panel to full width"],
      ["Ctrl+t", "Toggle comments panel"],
      ["Ctrl+r", "Open the chat with riff's agent, or close it from inside"],
      ["Ctrl+h / Ctrl+l", "Focus panel left / right"],
      ["Ctrl+f", "Find files (fuzzy)"],
      ["Ctrl+s", "Find in the diff (word or selection under the cursor); Ctrl+g in it narrows"],
      ["/", "Filter the list that has focus; search in the diff"],
      ["H", "Comments panel: open threads only"],
      ["H", "File panel: unviewed files only"],
      ["Ctrl+g", "Pick a commit to scope the diff to"],
      ["x", "Mark file as viewed"],
    ],
  },
  {
    title: "Comments",
    keys: [
      ["c / C", "Comment inline / via $EDITOR"],
      ["E", "Edit thread via $EDITOR"],
      ["]r / [r", "Next / previous thread"],
      ["]n / [n", "Next / previous unseen comment"],
      ["]R / [R", "Same, skipping resolved"],
      ["gC", "Find a comment (PR-wide)"],
      ["x / r / d", "Resolve / reply / delete"],
      ["+", "React on the focused comment"],
      ["S", "Post the highlighted comment"],
      ["y / Y", "Yank line or selection"],
    ],
  },
  {
    title: "Comment composer",
    keys: [
      ["Enter / Ctrl+s", "Save locally"],
      ["Ctrl+p", "Save & publish (PR)"],
      ["Ctrl+j", "Newline"],
      ["Ctrl+y", "Suggestion block"],
      ["Ctrl+g", "Edit in $EDITOR"],
      ["Esc", "Cancel, keep the draft"],
      ["@ / :", "Mention / emoji picker"],
      ["↑ ↓ / Ctrl+n/p", "Move in a picker"],
      ["Tab / Enter", "Pick in a picker"],
    ],
  },
  {
    title: "GitHub & Other",
    keys: [
      ["gS", "Submit review"],
      ["gs", "Sync edits / replies"],
      ["gr", "Refresh from GitHub"],
      ["i / a / d", "PR state / feed / diff"],
      ["c m r b t p", "Feed: toggle a type · u unseen · Esc all"],
      ["gp", "Previews: open, deploy, follow a build"],
      ["go / gy", "Open PR / copy its URL"],
      ["gY", "Copy permalink"],
      ["gP", "Create / edit PR"],
      ["gc", "Checkout & edit (PR)"],
      ["gf / gF", "Follow the link under the cursor / in tmux"],
      ["gx", "Open the URL under the cursor"],
      ["ge / gE", "Open this file in $EDITOR / tmux"],
      ["gd / gD", "Diff this file in $EDITOR / a tmux pane"],
      ["Ctrl+p", "Action menu"],
      ["q", "Quit"],
    ],
  },
]

export const HELP_KEY_CELLS = 18

export function helpColumns(): [readonly HelpSection[], readonly HelpSection[]] {
  return [HELP_SECTIONS.slice(0, 5), HELP_SECTIONS.slice(5)]
}

export type HelpRow =
  | { id: string; kind: "title"; text: string }
  | { id: string; kind: "key"; key: string; desc: string }
  | { id: string; kind: "gap" }

/**
 * A column as the rows it draws. Each row carries an id of its own so a
 * scrolled window keeps the rows it shares with the last one.
 */
export function helpRows(sections: readonly HelpSection[]): HelpRow[] {
  return sections.flatMap((section, s) => [
    ...(s > 0 ? [{ id: `${section.title}:gap`, kind: "gap" as const }] : []),
    { id: `${section.title}:title`, kind: "title" as const, text: section.title },
    ...section.keys.map(([key, desc], i) => ({ id: `${section.title}:${i}`, kind: "key" as const, key, desc })),
  ])
}

/**
 * How wide a column is when all of it is drawn. Sizing the column from this
 * rather than from the rows in view keeps both columns where they are while
 * the window scrolls.
 */
export function helpColumnCells(rows: readonly HelpRow[]): number {
  return Math.max(
    ...rows.map((row) =>
      row.kind === "title" ? cellsOf(row.text) : row.kind === "key" ? HELP_KEY_CELLS + cellsOf(row.desc) : 0
    )
  )
}

export const HELP_COLUMN_ROWS: readonly [readonly HelpRow[], readonly HelpRow[]] = [
  helpRows(helpColumns()[0]),
  helpRows(helpColumns()[1]),
]

export const HELP_BODY_ROWS = Math.max(...HELP_COLUMN_ROWS.map((rows) => rows.length))

/** Cells between the overlay's edge and its rows, on each side. */
export const HELP_PADDING = 2
/** Cells between the two columns. */
export const HELP_GAP = 4
/** Cells the overlay leaves of the screen on each side, so the dimmed screen still frames it. */
export const HELP_MARGIN = 2

// Padding above and below (2 + 2), the title row and the blank under it,
// and the footer row and the blank above it.
export const HELP_CHROME_ROWS = 8

export interface HelpColumn {
  id: string
  cells: number
  rows: readonly HelpRow[]
}

/** What the overlay draws on a screen: its outer width and the columns inside it. */
export interface HelpLayout {
  width: number
  columns: readonly HelpColumn[]
}

const [LEFT_ROWS, RIGHT_ROWS] = HELP_COLUMN_ROWS
const LEFT_CELLS = helpColumnCells(LEFT_ROWS)
const RIGHT_CELLS = helpColumnCells(RIGHT_ROWS)
const TWO_COLUMNS: HelpLayout = {
  width: LEFT_CELLS + HELP_GAP + RIGHT_CELLS + 2 * HELP_PADDING,
  columns: [
    { id: "left", cells: LEFT_CELLS, rows: LEFT_ROWS },
    { id: "right", cells: RIGHT_CELLS, rows: RIGHT_ROWS },
  ],
}
const ONE_COLUMN_ROWS = helpRows(HELP_SECTIONS)
const ONE_COLUMN_CELLS = helpColumnCells(ONE_COLUMN_ROWS)

const fit = (text: string, cells: number) => fitSpans([{ text, fg: "" }], cells).map((span) => span.text).join("")

/** The rows cut to `cells`, so a row narrower than its text ends in `…` rather than running past the overlay. */
function fitRows(rows: readonly HelpRow[], cells: number): HelpRow[] {
  return rows.map((row) => {
    if (row.kind === "title") return { ...row, text: fit(row.text, cells) }
    if (row.kind === "key") return { ...row, desc: fit(row.desc, Math.max(0, cells - HELP_KEY_CELLS)) }
    return row
  })
}

/**
 * The columns for a screen `screenWidth` wide. Both side by side where
 * they fit whole; otherwise every section in one column, which scrolls
 * further but cuts nothing while the screen has room for its widest row,
 * and below that cuts the descriptions at the overlay's edge.
 */
export function helpLayout(screenWidth: number): HelpLayout {
  const room = Math.max(0, screenWidth - 2 * HELP_MARGIN)
  if (TWO_COLUMNS.width <= room) return TWO_COLUMNS
  const cells = Math.max(0, Math.min(ONE_COLUMN_CELLS, room - 2 * HELP_PADDING))
  const rows = cells < ONE_COLUMN_CELLS ? fitRows(ONE_COLUMN_ROWS, cells) : ONE_COLUMN_ROWS
  return { width: cells + 2 * HELP_PADDING, columns: [{ id: "all", cells, rows }] }
}

export function helpViewport(height: number, width: number): { rows: number; maxScroll: number } {
  const body = Math.max(...helpLayout(width).columns.map((column) => column.rows.length))
  const rows = Math.min(body, Math.max(1, height - HELP_CHROME_ROWS))
  return { rows, maxScroll: body - rows }
}
