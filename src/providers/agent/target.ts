import type { AppState } from "../../state"
import type { DiffFile } from "../../utils/diff-parser"

export type AgentTarget =
  | {
      kind: "pr"
      owner: string
      repo: string
      number: number
      title: string
      state: "open" | "closed" | "merged"
      author: string
      description: string
    }
  // label is the branch line riff's header shows, absent where riff found none.
  | { kind: "local"; label: string | null; description: string }

export interface AgentFile {
  path: string
  status: DiffFile["status"]
  additions: number
  deletions: number
}

export function agentTargetOf(state: AppState): AgentTarget {
  const pr = state.prInfo
  if (pr) {
    return {
      kind: "pr",
      owner: pr.owner,
      repo: pr.repo,
      number: pr.number,
      title: pr.title,
      state: pr.state,
      author: pr.author,
      description: pr.body,
    }
  }
  return { kind: "local", label: state.branchInfo, description: state.description }
}

// The prompt lists what the reviewer sees; the files their ignore patterns hide are only counted.
export function agentFilesOf(state: AppState): AgentFile[] {
  return visibleFiles(state).map((file) => ({
    path: file.filename,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
  }))
}

export function hiddenFileCount(state: AppState): number {
  return state.files.length - visibleFiles(state).length
}

const visibleFiles = (state: AppState) => state.files.filter((file) => !state.ignoredFiles.has(file.filename))
