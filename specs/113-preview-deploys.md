# Preview Deploys

**Status**: Done

**Not built**: P3

## Description

The Previews section ([068](./068-preview-links.md)) lists where a PR is
deployed. Some apps are not deployed until someone asks: the bot's table
says `*on demand*` and a task list under it is the button:

```
| 🎨 Design System | *on demand* | [10:16<br><sub>03.11.26</sub>](…/actions/runs/41609222736/attempts/1) |
| 🤖 Shop MCP      | *building*  | [⏳](…/actions/runs/41609222736/attempts/1) |

- [ ] Deploy 🎨 Design System preview
- [ ] Deploy 🤖 Shop MCP preview
```

Ticking the box in GitHub's UI rewrites that line of the bot's comment to
`- [x]`; the bot sees the edit and deploys. riff presses the same button,
and then follows what the bot does with it, so the round trip to the
browser for a preview is gone: every app, its state, and the one thing to
do about it.

## Out of Scope

- The bot's hidden `<!-- meta = {…} -->` block. It names each row's
  `deployState` more precisely than the table does, but it is one bot's
  format; riff reads what every reader of the comment reads.
- Unticking. The bot leaves a deployed app's box ticked, and an untick
  tears nothing down.
- Live job logs. The jobs of a build are listed; their output is on GitHub.

## Capabilities

### P1

- Each row has one state, read off its cells and its task item:

| State | When | Drawn | `Enter` |
|---|---|---|---|
| live | it has links | links, `rebuilding` in yellow when an hourglass stands in the build cell | open, or the links picker (068) |
| deployable | no links, an unticked item names it | `on demand`, `↵ deploy` on the cursor's row | deploy, after a yes |
| requested | no links, its item is ticked | `deploy requested` in yellow | says it is queued |
| building | `*building*`, or an hourglass in the build cell | `building` in yellow, `↵ jobs` on the cursor's row | the run's jobs in the links picker |

- A task item belongs to the row whose app label it contains, the longest
  label winning, so `Shop` does not take `Shop MCP`'s item. Labels are
  compared with whitespace collapsed (the bot holds a cell together with
  non-breaking spaces) and without emoji variation selectors.
- Deploying reads the comment fresh, changes the one line, and writes it
  back. The bot rewrites the comment as it works, so a copy read earlier
  would undo its edits. When the line is gone or already ticked, nothing is
  written and riff shows the comment as it now is.
- While any row is requested or building, riff re-reads that one comment
  every 15 seconds and stops when none is. It is REST, so it spends none
  of the GraphQL points the comment poll budgets.
- A building row's jobs: running first, then queued, then failed, then the
  rest, each with a mark (`●` `○` `✗` `✓`) and its state.
- `gp` opens the overview on the Previews section, the cursor on the first
  row, from the diff or from inside the overview. The palette has it as
  Previews.
- The section header counts `N building` in yellow beside live and on
  demand.
- A build cell's `10:16<br><sub>03.11.26</sub>` reads `10:16 03.11.26`.

### P2

- `o` on a row with no links opens its run in the browser.

### P3

- Filter a building row's jobs to the ones that build its app. The run is
  the whole PR's; which jobs belong to which app is the bot's knowledge.

## Technical Notes

- `src/utils/previews.ts`: `deploy` on `PreviewRow`, `previewState`,
  `isBuilding`, `isPending`, `runIdOf`, `tickDeployTask`.
- `src/features/preview-deploys/`: the confirm, the tick, the watch and the
  jobs picker, over an injected API (`fetchIssueComment`,
  `updateIssueComment`, `fetchRunJobs` in `src/providers/github/`).
- Editing another user's comment takes write access to the repo, which is
  also what GitHub's own checkbox takes; a refusal is shown as the API
  phrased it.
- The body is sent as JSON on stdin (`gh api --input -`): `-f body=…`
  would read a body starting with `@` as a file name.
