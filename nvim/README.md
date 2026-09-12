# riff.nvim

Write riff comments without leaving the editor, and see which lines carry
one.

nvim already has the navigation — LSP, treesitter, marks, whatever you run.
What it has no way to say is "this bit, here", in a form an agent will pick
up. That is all this does.

```lua
{
  dir = "~/path/to/riff/nvim",
  config = function() require("riff").setup() end,
}
```

| | |
|---|---|
| `<leader>rc` | comment on this line, or change the comment already on it |
| `<leader>rt` | preview the comments beside the code, or not |
| `:RiffRefresh` | redraw the marks |

One key, not three. On a line that already carries a comment it opens that
comment on what it says; on a line that carries several it asks which. The
composer is a markdown buffer: `Ctrl-s` saves from either mode, `Esc` or `q`
abandons, and `:w`, `:x` and `ZZ` work the way they do anywhere else.

A commented line shows a sign in the gutter and, beside the code, either the
start of the comment or a dot. `:RiffToggle` switches between the two; set
`display` to pick which one you start in.

## Options

```lua
require("riff").setup({
  cmd = "riff",              -- the executable, a path or a name on the PATH
  display = "preview",       -- or "dot", which is what :RiffToggle flips
  preview_width = 40,        -- where the preview text is cut
  sign = "▌ ",               -- before the preview text
  dot = "●",                 -- the whole of it in "dot"
  gutter = "▌",              -- in the sign column; at most two cells
  gutter_highlight = "Comment",
  highlight = "Comment",
  cache_ms = 2000,           -- how long riff's answer is reused for
  default_mappings = true,
})
```

## What it writes

`riff comments add`, which is riff writing the comment — same `.riff/`
directory, same format, same anchoring as one written in riff itself.
`riff comments --json` hands it to Claude and `riff comments resolve`
retires it, exactly as it would a comment typed into riff.

Comments written here are **notes**: they belong to a line of the working
copy, not to a line of a diff, and GitHub cannot anchor one. riff refuses to
publish them rather than losing them at the API.
