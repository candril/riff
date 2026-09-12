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
| `<leader>rc` | comment on this line, or on the selection |
| `<leader>rs` | read the comments on this line |
| `<leader>rt` | preview the comments beside the code, or not |
| `<leader>ro` | open riff on this file |
| `:RiffRefresh` | redraw the marks |

A comment opens a markdown scratch buffer; `:w` saves it, `q` abandons it.
If the line already carries comments they sit above the input as context —
they are virtual lines, so `:w` still sends only what you typed.

Commented lines get a sign in the gutter, and beside the code either the
start of the comment or a dot. `:RiffToggle` switches between the two: the
preview is what you want while reviewing and in the way while writing code.
`:RiffShow` opens the comments on the line in full, replies included, `q` to
close.

## Options

Everything `setup` takes, with its default:

```lua
require("riff").setup({
  cmd = "riff",              -- the executable, a path or a name on the PATH
  display = "preview",       -- or "dot", what :RiffToggle flips
  preview_width = 40,        -- how much of the comment fits beside the line
  sign = "▌ ",               -- drawn before the preview
  dot = "●",                 -- the whole of the virtual text in "dot"
  highlight = "Comment",     -- highlight group for the virtual text
  gutter = "▌",              -- the gutter sign, at most two display cells
  gutter_highlight = "Comment",
  cache_ms = 2000,           -- how long riff's answer is reused for
  default_mappings = true,   -- false to keep your own only
})
```

`cache_ms` is there because opening a directory is one burst of buffer
reads, and each would otherwise be its own `riff comments`.

## What it writes

`riff comments add`, which is riff writing the comment — same `.riff/`
directory, same format, same anchoring as one written in riff itself.
`riff comments --json` hands it to Claude and `riff comments resolve`
retires it, exactly as it would a comment typed into riff.

Comments written here are **notes**: they belong to a line of the working
copy, not to a line of a diff, and GitHub cannot anchor one. riff refuses to
publish them rather than losing them at the API.
