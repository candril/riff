---
title: Configuration
description: Every key riff reads from config.toml, and the environment it looks at.
---

Config lives at `~/.config/riff/config.toml` and is merged over the defaults in
`src/config/defaults.ts`. Everything is optional; riff runs with no config file at all. A
malformed file is ignored in full rather than half-applied — riff falls back to defaults instead
of starting in a state you didn't write.

Keybindings are not configurable yet.

```toml
[ignore]
patterns = ["package-lock.json", "*.generated.*"]

[storage]
basePath = "~/code"

[storage.repos]
"facebook/react" = "~/code/react"

[mentions]
extra = ["my-org/backend-team", "dependabot"]

[poll]
interval = 300
onFocus = true

[diff]
wrap = false
alignMarkdownTables = true
```

## ignore

```toml
[ignore]
patterns = ["package-lock.json", "**/__generated__/**"]
```

Glob patterns for files that shouldn't be part of a review. Matched files are hidden from the
file tree and the diff; **Toggle Hidden Files** in the action menu brings them back when you do
need to look.

Setting `patterns` **replaces** the default list rather than adding to it. Copy the defaults in
if you want to keep them:

```toml
patterns = [
  "package-lock.json",
  "bun.lockb",
  "yarn.lock",
  "pnpm-lock.yaml",
  "operations.lock.js",
  "**/__generated__/**",
  "**/*.generated.*",
  "**/__snapshots__/**",
]
```

## diff

```toml
[diff]
wrap = false
alignMarkdownTables = true
```

`alignMarkdownTables` pads the cells of a markdown table onto a shared grid so its columns line
up in the diff — display only, and on by default. See
[markdown tables](/riff/reference/views/#markdown-tables).

`wrap` soft-wraps long lines instead of scrolling sideways, the same thing `zw` toggles at
runtime. Off by default — see [long lines](/riff/reference/views/#long-lines) for what wrapping
costs.

## storage

Where riff keeps your draft comments, replies and viewed state for a given review.

```toml
[storage]
path = "~/reviews"      # override everything below
basePath = "~/code"     # search here for a repo by name

[storage.repos]
"facebook/react" = "~/code/react"
"my-org/service" = "~/work/service"
```

| Key | What |
| --- | --- |
| `path` | Absolute override. Every review stores here, no detection. |
| `repos` | `"owner/repo"` → local clone. Exact, no confirmation. |
| `basePath` | Directory to look for a clone named after the repo. Confirmed before use. |

Resolution order for a PR: `path`, then a `repos` mapping, then the current directory if it *is*
that repo, then a `basePath` search (which asks: *"Found local clone for owner/repo … Use this
location? [Y/n]"*), then the repo root you're standing in, and finally `~/.riff/` as a global
fallback.

Inside the chosen directory riff writes:

```text
.riff/
├── comments/<source>/*.md      # one Markdown file per comment
├── <source>/viewed.json        # viewed state, with the commit it was viewed at
├── mentionable-users.json      # cached @mention roster, 24h TTL
└── session.json                # the current review session
```

`<source>` is the target with its punctuation flattened: `gh:owner/repo#123` becomes
`gh-owner-repo-123`. Add `.riff/` to your global gitignore if you don't want it in `git status`.

## mentions

```toml
[mentions]
extra = ["my-org/backend-team", "renovate"]
```

Handles to offer in the `@` picker on top of the ones riff finds itself. Repo contributors are
fetched from GitHub and cached for a day; teams (`org/team`) and bots aren't returned by that
API, so this is where they go.

## poll

```toml
[poll]
interval = 300
onFocus = true
```

| Key | Default | What |
| --- | --- | --- |
| `interval` | `300` | Seconds between background checks for new or changed review comments. `0` disables polling; `gr` still works. Negative values clamp to `0`. |
| `onFocus` | `true` | Skip ticks while the terminal is unfocused and refresh on focus-in instead. Needs a terminal that supports focus reporting; harmless where it isn't supported, since riff then simply never hears about a focus change. |

Five minutes is a deliberate default: comment activity moves on the order of minutes, and each
tick spends GraphQL quota. See the [API budget](/riff/reference/github/#api-budget).

## editor

```toml
[editor]
diff = "nvim -d {old} {new}"
```

| Key | Default | What |
| --- | --- | --- |
| `diff` | `"nvim -d {old} {new}"` | The command `gd` and `gD` run to show a file's two versions side by side. `{old}` and `{new}` are each one argument, whatever is in them — the new side is the working copy itself wherever riff can use it, so edits there persist. |

## previews

Deploy bots post where they put a PR as a markdown table, and a table of thirty 110-character
URLs is unreadable in a terminal. riff lifts the links out of it into a **Previews** section in
the PR overview: one row per app, labels only, `Enter` to open and `y` to copy. It never ticks a
deploy checkbox — a row opens and copies, and that is all it does.

```toml
[previews]
table_column    = "Preview"                    # default
match_pr_number = true                         # default
hosts           = ["*.preview.example.com"]    # optional
comment_marker  = "preview-links-and-size"     # optional
hide_source     = true                         # default
```

| Key | Default | What |
| --- | --- | --- |
| `table_column` | `"Preview"` | The column the preview links live in. A table with this column is a preview table, whatever its links look like. |
| `match_pr_number` | `true` | Without such a column, count links whose host or path carries this PR's number — which is what `preview-pr10747` and Vercel's and Netlify's equivalents all do. |
| `hosts` | `[]` | Hosts whose links are previews whatever they carry. `*` wildcards a segment. |
| `comment_marker` | — | An HTML comment id identifying the bot's comment, for the bots the two rules above miss. When set, only comments carrying it are considered. |
| `hide_source` | `true` | Fold the comment they came from away in Conversation, whose header then says `(5 · 1 hidden)`. |

A link in a row that qualified comes along even when it does not qualify itself — that is how
the BrowserStack links in a mobile row survive next to the preview URL. Italic cells
(`*on demand*`, `*building*`) are shown as status rather than as dead links.

## Environment

| Variable | What |
| --- | --- |
| `EDITOR` | Editor for comment drafts, PR bodies and `gf`. Falls back to `VISUAL`, then `nvim`. |
| `VISUAL` | Used when `EDITOR` is unset. |
| `TMUX` | Its presence enables `gF` (open in a new tmux window). Set by tmux itself. |
| `GH_REPO` | `owner/repo` override for repository detection, same as `gh` uses. |

`gh` authentication is `gh`'s business — riff reads no token and stores none.

## Local overrides

There is no per-repo config file. `.riff/` in a repo holds review data only; configuration is
the one `~/.config/riff/config.toml`.
