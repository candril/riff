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
| `<leader>ro` | open riff on this file |
| `:RiffRefresh` | redraw the marks |

A comment opens a markdown scratch buffer; `:w` saves it, `q` abandons it.
Lines that carry one show the start of it beside the code.

## What it writes

`riff comments add`, which is riff writing the comment — same `.riff/`
directory, same format, same anchoring as one written in riff itself.
`riff comments --json` hands it to Claude and `riff comments resolve`
retires it, exactly as it would a comment typed into riff.

Comments written here are **notes**: they belong to a line of the working
copy, not to a line of a diff, and GitHub cannot anchor one. riff refuses to
publish them rather than losing them at the API.
