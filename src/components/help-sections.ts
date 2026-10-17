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
      ["zw", "Toggle soft wrap"],
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
      ["za", "Toggle fold at cursor (file, hunk, code block)"],
      ["zA", "Fold every code block in this file"],
      ["zo / zc", "Open / close fold"],
      ["zR / zM", "Open / close every fold"],
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
    title: "Panels & Files",
    keys: [
      ["Ctrl+b", "Toggle file tree"],
      ["Ctrl+e", "Expand panel to full width"],
      ["Ctrl+t", "Toggle comments panel"],
      ["Ctrl+h / Ctrl+l", "Focus panel left / right"],
      ["Ctrl+f", "Find files (fuzzy)"],
      ["Ctrl+s", "Find in the diff (word or selection under the cursor); Ctrl+g in it narrows"],
      ["/", "Filter the list that has focus; search in the diff"],
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
      ["Ctrl+n / Ctrl+p", "Move in a picker; Tab picks"],
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
  return [HELP_SECTIONS.slice(0, 4), HELP_SECTIONS.slice(4)]
}
