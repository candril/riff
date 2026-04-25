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
      ["w / b", "Next / previous word"],
      ["gg / G", "Go to top / bottom"],
      ["Ctrl+d / Ctrl+u", "Page down / up"],
      ["]c / [c", "Next / previous hunk"],
      ["]f / [f", "Next / previous file"],
    ],
  },
  {
    title: "Views & Panels",
    keys: [
      ["i", "Toggle PR overview / diff (PR mode)"],
      ["Ctrl+o / Ctrl+i", "Jumplist back / forward (Tab = forward)"],
      ["Ctrl+b", "Toggle file tree panel"],
      ["Ctrl+e", "Expand file tree (full width)"],
      ["Ctrl+f", "Find files (fuzzy)"],
      ["Ctrl+g", "Show current file path"],
      ["Ctrl+p", "Open action menu"],
    ],
  },
  {
    title: "Diff Actions",
    keys: [
      ["c", "Add comment on line"],
      ["C", "Add comment via $EDITOR"],
      ["E", "Edit comment thread via $EDITOR"],
      ["V", "Visual line select"],
      ["v", "Mark file as viewed"],
      ["za", "Toggle file/hunk fold"],
      ["zR / zM", "Expand / collapse all"],
      ["/", "Search in diff"],
      ["n / N", "Next / prev search match"],
    ],
  },
  {
    title: "GitHub (PR mode)",
    keys: [
      ["gS", "Submit review"],
      ["gs", "Sync edits/replies"],
      ["gi", "Show PR info"],
      ["go", "Open PR in browser"],
      ["gy", "Copy PR URL"],
      ["gP", "Edit PR title/body"],
      ["gr", "Refresh from GitHub"],
    ],
  },
  {
    title: "Comment Threads",
    keys: [
      ["]r / [r", "Next / previous thread (opens overlay)"],
      ["]R / [R", "Same, skipping resolved threads"],
      ["gC", "Find a comment (PR-wide picker)"],
      ["Enter", "Open inline comment overlay on this line"],
      ["x", "Toggle thread resolved (in overlay)"],
      ["r", "Reply (in overlay)"],
      ["d", "Delete comment (in overlay)"],
    ],
  },
  {
    title: "Other",
    keys: [
      ["gf", "Open file in $EDITOR"],
      ["gc", "Checkout & edit (PR)"],
      ["g?", "Toggle this help"],
      ["q", "Quit"],
    ],
  },
]

/**
 * Help overlay showing all keybindings
 * Uses dimmed background without border (like presto but without the box border)
 */
export function HelpOverlay({ onClose }: HelpOverlayProps = {}) {
  // Calculate total rows needed
  let totalRows = 0
  for (const section of HELP_SECTIONS) {
    totalRows += 1 // title
    totalRows += section.keys.length
    totalRows += 1 // spacing
  }

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
        minWidth: 70,
        maxWidth: 90,
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
