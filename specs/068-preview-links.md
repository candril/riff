# Preview Links

**Status**: Done

## Description

Deploy bots post preview URLs as a markdown table, and a table of thirty
110-character URLs is unreadable in a terminal however well it is rendered:

```
| App | Preview | Built |
| 🛒 Shop | [🇨🇭 galaxus.ch](https://galaxus-ch-preview-pr10747.preview…) · [🇦🇹 …
```

The links matter, the table does not. riff lifts them out and shows them as
what they are — a list of places you can open.

## Out of Scope

- Triggering deploys. Those bots use task-list checkboxes as buttons; riff
  will not tick them.
- Rendering the source table well. It is still shown if you open it; making
  a thirty-URL table readable is not the goal.
- Deployments from GitHub's own API. A second source can come later; the
  comment is where these live today.

## Capabilities

### P1

- Preview links appear as a section in the info panel (spec 067), one row per
  app, labels only:

```
  ▼ Previews (6)          from @dg-helix-bot · 17:14
      🛒 Shop                galaxus.ch  digitec.ch  galaxus.at  +5
      📱 Shop Mobile App     Desktop  Android  iOS
      🎨 Design System       on demand
      🤖 Shop MCP            building
```

- `Enter` opens in the browser, `y` copies the URL, `Y` copies every URL on
  the row. A row with several links opens a picker for both.
- Italic cells (`*on demand*`, `*building*`) are shown as status, not as
  dead links.
- The source comment is folded away in Conversation when configured.

### P2

- Detection is configured, never compiled in:

```toml
[previews]
table_column    = "Preview"                    # default
match_pr_number = true                         # default
hosts           = ["*.preview.devinite.com"]   # optional
comment_marker  = "preview-links-and-size"     # optional: an HTML comment id
hide_source     = true
```

The two defaults cover most deploy bots — a table with a `Preview` column,
or any link whose host or path carries this PR's number. `hosts` and
`comment_marker` are for the ones they miss.

## Technical Notes

The model is per row: an app label, then either a list of `{ label, url }` or
a status string, plus the build time and its run URL from the last column.
Rows are extracted from the parsed table, so it rides on the markdown table
parsing riff already has (spec 053).

`match_pr_number` is what makes the default work without configuration: these
URLs carry `preview-pr10747`, and so do Vercel's and Netlify's equivalents.
Links in a row that already qualified come along even when they do not match
themselves — that is how the BrowserStack links in the mobile row survive.
