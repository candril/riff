# 043 - Inline Check Annotations

**Status**: Draft

## Description

When a CI check fails on a PR, riff today shows the name and status
(`✗ build (failure)`) but nothing about *why* it failed. The user has
to press `o`, land in the GitHub Actions UI, hunt for the failed step,
and scan a wall of log output. For a tool whose pitch is "review and
iterate on PRs without leaving the terminal," that's a glaring gap.

This spec adds inline expansion of failed checks in the PR info panel.
Pressing `Space` on a failed check fetches its GitHub Check Run
**annotations** and shows them as child rows under the check. Pressing
Enter on an annotation jumps to the corresponding `file:line` in the
diff view, reusing the existing `onJumpToLocation` plumbing.

Annotations are the structured source of truth for "what went wrong":
GitHub Actions auto-converts `::error file=…::` workflow commands into
annotations, and third-party tools (ESLint, tsc, dotnet-format, etc.)
push them via the Checks API. That makes a single API endpoint cover
most well-configured pipelines across CI providers.

## Out of Scope

- **Raw log fetching.** Only Actions exposes logs via the API — a
  generic "download logs and regex for errors" solution is a separate,
  much larger problem. Follow-up spec territory.
- **Cross-check aggregation.** No "all failures across all checks"
  view. Each failed check expands independently.
- **Fixing errors.** Jump-to-file lands the user at the location;
  editing/fixing stays with nvim and existing flows.
- **Persisting expanded state.** Expanded checks reset on panel close.
- **Annotations on passing checks.** Success checks have no disclosure
  affordance and can't be expanded, even if they carry `notice`-level
  annotations. (Rare in practice; noisy if shown.)

## Capabilities

### P1 — MVP

- **Fetch annotations on demand** via
  `gh api repos/{o}/{r}/check-runs/{id}/annotations --paginate`.
  Lazy — no fetch happens until the user expands a check.
- **Inline expansion** in `PRInfoPanel.buildChecksContent`. A failed
  check gets a disclosure indicator and expands to show annotations
  below it. Cursor navigation walks flattened rows (check +
  visible annotations), same pattern as `buildConversationContent`.
- **Jump to file** on Enter over an annotation, using the existing
  `onJumpToLocation(path, line)` callback that conversation comments
  already use.
- **Keys** (checks section only) — mirror the conversation section's
  expand/collapse vocabulary so there's one set of muscle-memory keys
  for "drill into a row with children":

  | Key | On check row | On annotation row |
  |---|---|---|
  | `l` | Expand (if failing) | (no-op) |
  | `h` | Collapse | Collapse parent, cursor returns to check |
  | `a` | Toggle expand | Toggle parent |
  | `Enter` | Toggle expand if failing, else open `detailsUrl` | Jump to `file:line` |
  | `o` | Open `detailsUrl` (unchanged) | Open `rawDetailsUrl` |
  | `y` | Copy check URL (unchanged) | Copy `path:line` |

  Disclosure chevron `▶` / `▼` matches the one on section headers.

- **States** per expanded check:
  - `loading` — one dim row `Loading annotations…`
  - `loaded` with items — render annotations
  - `loaded` empty — one dim row `No annotations — press o to open log`
  - `error` — one dim row `Could not fetch annotations`

### P2 — Polish

- **Truncation** to 10 annotations initially with `… N more` row;
  pressing Enter on that row expands fully. Big .NET/TS builds can
  produce hundreds.
- **Level coloring**: `failure` annotations in `theme.red`, `warning`
  in `theme.yellow`, `notice` in `theme.subtext0`.
- **Aggregate count** in the check row: `✗ build (failure) [3]`.

### P3 — Later

- Fetch raw Actions logs for checks without annotations.
- "Jump to next failure" global shortcut across all expanded checks.
- AI root-cause summarizer.

## Technical Notes

### Types (`src/providers/github.ts`)

```ts
export interface PrCheckAnnotation {
  path: string
  startLine: number
  endLine: number
  startColumn?: number
  endColumn?: number
  level: "notice" | "warning" | "failure"
  message: string
  title?: string
  rawDetailsUrl?: string // jumps to log line on github.com
}

export interface PrCheck {
  // ...existing fields
  annotations?: PrCheckAnnotation[]
  annotationsStatus?: "idle" | "loading" | "loaded" | "error"
}
```

### Fetch

```ts
export async function getPrCheckAnnotations(
  owner: string,
  repo: string,
  checkRunId: number
): Promise<PrCheckAnnotation[]>
```

Wraps `gh api repos/{o}/{r}/check-runs/{id}/annotations --paginate`.
Maps snake_case response to camelCase. Filters out annotations missing
`path` (rare but legal per schema).

### Panel rendering

`PRInfoPanel` tracks `expandedCheckIds: Set<number>`. In
`buildChecksContent`, each check produces one row; if expanded,
additional rows for each annotation (or status placeholder).

The panel already flattens conversation items for cursor navigation —
checks get the same treatment. Introduce
`flatCheckItems: Array<{ kind: "check" | "annotation"; checkId: number;
annotationIndex?: number }>` and rebuild on expansion change.

`getSelectedCheck()` stays, plus a new `getSelectedAnnotation()`
returning `{ check, annotation } | null`.

### Input (`src/features/pr-info-panel/input.ts`)

- Add `case "space"` / `case " "` in the checks section → dispatch
  `toggleCheckExpansion(checkId)`. If check has no annotations and is
  failed, kick off `fetchCheckAnnotations` reducer which sets
  `annotationsStatus: "loading"`, awaits fetch, writes results.
- Extend existing Enter/`o`/`y` cases to branch on
  `panel.getSelectedAnnotation()` vs `panel.getSelectedCheck()`.

### Edge cases

- **Path not in working tree.** `onJumpToLocation` already handles
  "file not found" gracefully (toast). Reuse that.
- **Check is in_progress.** Disclosure affordance hidden; no expand.
- **Re-run of a check.** Session cache keys on the `check.id` which
  changes on re-run, so a fresh check gets a fresh fetch.
- **Huge annotation set.** Hard-cap at 100 annotations post-fetch.
  P2 truncation handles the UI side.

### Testing

Manual: open a PR with a known-failing build (the .NET PR in the
screenshot that motivated this spec is a good test fixture). Expand
the failing check, verify annotations appear, press Enter, verify
editor jumps to the right `file:line`. Test the loading, empty, and
error states by stubbing the fetch function.
