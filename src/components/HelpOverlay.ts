import { Box, Text } from "@opentui/core"
import { theme, colors } from "../theme"

export interface HelpOverlayProps {
  onClose?: () => void
}

const HELP_SECTIONS = [
  {
    title: "Navigation",
    keys: [
      ["j / k", "Move down / up"],
      ["h / l", "Move left / right"],
      ["w / b / e", "By word"],
      ["f / t", "Find / till character"],
      ["Ctrl+d / Ctrl+u", "Half page down / up"],
      ["gg / G", "Go to top / bottom"],
      ["]c / [c", "Next / previous hunk"],
      ["]f / [f", "Next / previous file"],
      ["]u / [u", "Next / previous unviewed file"],
      ["]o / [o", "Next / previous outdated file"],
      ["]g / [g", "Next / previous commit's diff"],
      ["zl / zh", "Scroll one column right / left"],
      ["zL / zH", "Scroll half a screen right / left"],
      ["zs / ze", "Cursor column to left / right edge"],
      ["gl", "Peek the whole line, wrapped"],
      ["zw", "Toggle soft wrap"],
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
    ],
  },
  {
    title: "Folds & Context",
    keys: [
      ["za", "Toggle fold at cursor"],
      ["zo / zc", "Open / close fold"],
      ["zR / zM", "Open / close every fold"],
      ["Enter", "Reveal hidden context lines"],
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
      ["Ctrl+g", "Show current file path"],
      ["v", "Mark file as viewed"],
      ["V", "Visual line select"],
    ],
  },
  {
    title: "Comments",
    keys: [
      ["c / C", "Comment inline / via $EDITOR"],
      ["E", "Edit thread via $EDITOR"],
      ["]r / [r", "Next / previous thread"],
      ["]R / [R", "Same, skipping resolved"],
      ["gC", "Find a comment (PR-wide)"],
      ["x / r / d", "Resolve / reply / delete"],
      ["S", "Post the highlighted comment"],
      ["y / Y", "Yank line or selection"],
      ["gd / gD", "Copy / dismiss Claude's draft"],
    ],
  },
  {
    title: "GitHub & Other",
    keys: [
      ["gS", "Submit review"],
      ["gs", "Sync edits / replies"],
      ["gr", "Refresh from GitHub"],
      ["i / gi", "PR overview"],
      ["go / gy", "Open PR / copy its URL"],
      ["gY", "Copy permalink"],
      ["gP", "Create / edit PR"],
      ["gc", "Checkout & edit (PR)"],
      ["gf / gF", "Open file in $EDITOR / tmux"],
      ["Ctrl+p", "Action menu"],
      ["q", "Quit"],
    ],
  },
]

/**
 * The keymap overlay behind `g?`. A cheat sheet, not an inventory — the action
 * menu (Ctrl+p) is the exhaustive, state-aware list.
 */
export function HelpOverlay(_props: HelpOverlayProps = {}) {
  return Box(
    {
      id: "help-overlay",
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: "center",
      alignItems: "center",
    },
    // Dimmed backdrop (same as action menu)
    Box({
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "#00000080",
    }),
    // Help content (no border, just centered content)
    Box(
      {
        flexDirection: "column",
        backgroundColor: theme.base,
        padding: 2,
        minWidth: 80,
        maxWidth: 104,
      },
      // Title
      Box(
        { height: 1, marginBottom: 1 },
        Text({ content: "Keyboard Shortcuts", fg: colors.primary })
      ),
      // Two-column layout for sections
      Box(
        {
          flexDirection: "row",
          gap: 4,
        },
        // Left column
        Box(
          { flexDirection: "column", flexGrow: 1 },
          ...HELP_SECTIONS.slice(0, 3).map((section) =>
            Box(
              { flexDirection: "column", marginBottom: 1 },
              Text({ content: section.title, fg: theme.lavender }),
              ...section.keys.map(([key, desc]) =>
                Box(
                  { height: 1, flexDirection: "row" },
                  Box({ width: 18 }, Text({ content: key!, fg: theme.yellow })),
                  Text({ content: desc!, fg: colors.text })
                )
              )
            )
          )
        ),
        // Right column
        Box(
          { flexDirection: "column", flexGrow: 1 },
          ...HELP_SECTIONS.slice(3).map((section) =>
            Box(
              { flexDirection: "column", marginBottom: 1 },
              Text({ content: section.title, fg: theme.lavender }),
              ...section.keys.map(([key, desc]) =>
                Box(
                  { height: 1, flexDirection: "row" },
                  Box({ width: 18 }, Text({ content: key!, fg: theme.yellow })),
                  Text({ content: desc!, fg: colors.text })
                )
              )
            )
          )
        )
      ),
      // Footer
      Box(
        { height: 1, marginTop: 1 },
        Text({ content: "Press g? or Esc to close", fg: colors.textDim })
      )
    )
  )
}
