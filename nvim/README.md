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
| `<leader>rl` | every open comment — yours and the review's — and jump to one |
| `<leader>rx` | mark the comment on this line done |
| `<leader>rp` | fetch and show the pull request's comments on this file |
| `<leader>rP` | hide them again |
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

`<leader>rl` answers the other question — not "what is on this line" but
"where are they at all". Your notes and the comments on the pull request for
your branch, in one list, in [snacks](https://github.com/folke/snacks.nvim)'
picker when you have it and the quickfix list when you do not, jumping to the
line each one is on now. Each row is tagged with who said it, or `note` when
it was you.

`<leader>rx` marks one done. riff keeps the note and marks the thread
resolved rather than deleting it — a resolved local thread is never
published, and the record of what was asked for survives.

## The review

`<leader>rp` asks riff for the pull request on your current bookmark or
branch, fetches its comments and draws them in their own gutter sign, with
who said what. `<leader>rP` puts them away. Nothing happens until you ask:
the editor makes no network calls of its own and none behind your back.

A comment is drawn where its line is *now* — riff finds it from the hunk
GitHub sent, so a line that has moved is still marked. One whose code has
since changed is not drawn at all, and you are told how many there were.

## What it writes

`riff comments add`, which is riff writing the comment — same `.riff/`
directory, same format, same anchoring as one written in riff itself.
`riff comments --json` hands it to Claude and `riff comments resolve`
retires it, exactly as it would a comment typed into riff.

Comments written here are **notes**: they belong to a line of the working
copy, not to a line of a diff, and GitHub cannot anchor one. riff refuses to
publish them rather than losing them at the API.
