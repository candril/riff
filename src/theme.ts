/**
 * Catppuccin Mocha theme colors
 * https://github.com/catppuccin/catppuccin
 */
export const theme = {
  // Accent colors
  rosewater: "#f5e0dc",
  flamingo: "#f2cdcd",
  pink: "#f5c2e7",
  mauve: "#cba6f7",
  red: "#f38ba8",
  maroon: "#eba0ac",
  peach: "#fab387",
  yellow: "#f9e2af",
  green: "#a6e3a1",
  teal: "#94e2d5",
  sky: "#89dceb",
  sapphire: "#74c7ec",
  blue: "#89b4fa",
  lavender: "#b4befe",

  // Text colors
  text: "#cdd6f4",
  subtext1: "#bac2de",
  subtext0: "#a6adc8",

  // Overlay colors
  overlay2: "#9399b2",
  overlay1: "#7f849c",
  overlay0: "#6c7086",

  // Surface colors
  surface2: "#585b70",
  surface1: "#45475a",
  surface0: "#313244",

  // Base colors
  base: "#1e1e2e",
  mantle: "#181825",
  crust: "#11111b",
} as const

/**
 * Semantic color mappings for the app
 */
export const colors = {
  // UI
  headerBg: theme.mantle,
  headerFg: theme.blue,
  statusBarBg: theme.mantle,
  statusBarFg: theme.overlay1,
  border: theme.surface1,
  selection: theme.surface2,

  // Text
  text: theme.text,
  textMuted: theme.subtext0,
  textDim: theme.overlay0,

  // Diff
  addedBg: "#1e3a2f", // Slightly tinted base with green
  addedFg: theme.green,
  removedBg: "#3a1e2f", // Slightly tinted base with red
  removedFg: theme.red,
  contextBg: "transparent",

  // Accents
  primary: theme.blue,
  secondary: theme.mauve,
  success: theme.green,
  warning: theme.yellow,
  error: theme.red,
  info: theme.sapphire,

  // Comments
  commentMarker: theme.mauve,
  commentLocal: theme.blue,
  commentPending: theme.yellow,
  commentSynced: theme.green,
  commentResolved: theme.overlay1,

  // File status
  fileAdded: theme.green,
  fileModified: theme.yellow,
  fileDeleted: theme.red,
  fileRenamed: theme.peach,
  fileViewed: theme.overlay0,
  
  // Viewed status indicators
  viewedOk: theme.green,       // Viewed, unchanged
  viewedStale: theme.peach,    // Viewed, but modified since
  viewedNone: theme.overlay0,  // Not viewed (dim)
} as const
