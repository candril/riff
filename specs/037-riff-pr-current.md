## `riff pr` — Open PR for Current Branch/Bookmark

**Status**: Ready

## Description

Add a `pr` target that auto-resolves the GitHub PR associated with the current
branch (git) or bookmark (jj), then opens it as if the user had run
`riff <pr-number>`. Internally uses `gh pr view` for resolution.

## Out of Scope

- Creating a PR when none exists (defer to `gh pr create`)
- `--web` flag (open in browser instead of TUI)
- Picking between multiple PRs from the same branch

## Capabilities

### P1 - MVP

- `riff pr` invocation detects current branch/bookmark and opens its PR in the
  existing PR flow.
- Works in both plain git repos and jj (colocated) repos.
- Clear error message when no PR is associated with the current branch.

## Technical Notes

### CLI parsing (`src/index.ts`)

Add a new target literal `"pr"`. Since the existing `CliArgs` type doesn't
carry state beyond `prNumber`/`owner`/`repo`, resolve eagerly in `main()`
before the normal PR path.

```ts
if (target === "pr") {
  const n = await resolveCurrentPr()
  return { target, type: "pr", prNumber: n }
}
```

### Branch detection (`src/providers/current-pr.ts`)

```ts
import { $ } from "bun"

async function detectCurrentBranch(): Promise<string> {
  // jj: nearest bookmark reachable from @
  try {
    const out = await $`jj bookmark list -r 'heads(::@ & bookmarks())' -T 'name ++ "\n"'`
      .quiet().text()
    const name = out.trim().split("\n").filter(Boolean).pop()
    if (name) return name
  } catch {}

  // git fallback
  const branch = (await $`git branch --show-current`.quiet().text()).trim()
  if (!branch) throw new Error("no current branch or bookmark")
  return branch
}

export async function resolveCurrentPr(): Promise<number> {
  const branch = await detectCurrentBranch()
  try {
    const json = await $`gh pr view ${branch} --json number`.quiet().json()
    return json.number as number
  } catch {
    throw new Error(`no PR associated with '${branch}' — try 'gh pr create'`)
  }
}
```

### Help text

Add to `TARGETS` block in `HELP_TEXT`:

```
pr                        Open PR for current branch/bookmark
```

And an example in `EXAMPLES`.
