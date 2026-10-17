import type { PrInfo } from "../providers/github"

export function prInfo(body: string): PrInfo {
  return {
    number: 1259,
    title: "Add the update-tv-channels skill",
    body,
    author: "someone",
    state: "open",
    headRef: "a-branch",
    baseRef: "master",
    owner: "owner",
    repo: "repo",
    url: "https://github.com/owner/repo/pull/1259",
    additions: 98,
    deletions: 0,
    changedFiles: 1,
  }
}
