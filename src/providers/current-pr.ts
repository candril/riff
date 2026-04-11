import { $ } from "bun"

async function detectCurrentBranch(): Promise<string> {
  try {
    const out = await $`jj bookmark list -r 'heads(::@ & bookmarks())' -T 'name ++ "\n"'`
      .quiet()
      .text()
    const name = out.trim().split("\n").filter(Boolean).pop()
    if (name) return name
  } catch {}

  const branch = (await $`git branch --show-current`.quiet().text()).trim()
  if (!branch) {
    throw new Error("no current branch or bookmark found")
  }
  return branch
}

export async function resolveCurrentPr(): Promise<number> {
  const branch = await detectCurrentBranch()
  try {
    const json = (await $`gh pr view ${branch} --json number`.quiet().json()) as {
      number: number
    }
    return json.number
  } catch {
    throw new Error(`no PR associated with '${branch}' — try 'gh pr create'`)
  }
}
