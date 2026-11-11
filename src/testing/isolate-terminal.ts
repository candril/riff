// OpenTUI's test renderer reads the terminal's capabilities from these, so a run inside
// tmux or Ghostty measures widths and draws links differently from CI. Every test sees
// the terminal CI has: none.
const TERMINAL_ENV = /^(FORCE_HYPERLINK|TERM|TERM_PROGRAM|TERM_PROGRAM_VERSION|COLORTERM|TERMINFO|TERMINFO_DIRS|TMUX|TMUX_PANE|STY|LC_TERMINAL|LC_TERMINAL_VERSION|VTE_VERSION|ITERM_SESSION_ID|WT_SESSION|ALACRITTY_.*|GHOSTTY_.*|KITTY_.*|WEZTERM_.*|KONSOLE_.*)$/

for (const name of Object.keys(process.env)) {
  if (TERMINAL_ENV.test(name)) delete process.env[name]
}
