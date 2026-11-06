import type { PrSummary } from "../providers/github/lookups"
import type { PickRow } from "../features/open-pr/state"
import type { RepoName } from "../features/open-pr/known-repos"
import { truncate } from "./pr-info-format"

export const FIELD_PLACEHOLDER = "Paste a link, or 123, repo#123, owner/repo#123"

export interface OpenPrRowModel {
  repo: string
  detail: string
  selected: boolean
}

export interface OpenPrModel {
  heading: string
  message: { text: string; tone: "error" | "dim" } | null
  rows: readonly OpenPrRowModel[] | null
  hint: string
}

export interface OpenPrModelInput {
  /** The checkout, where there is one to read, to say what an id means here. */
  current: RepoName | null
  /** Whether Esc has a review to go to rather than quitting. */
  hasLocalReview: boolean
  error: string | null
  checking: string | null
  fromClipboard: boolean
  pick: { number: number; rows: readonly PickRow[]; looking: boolean; note?: string } | null
  highlight: number
  width: number
}

function stateWord(pr: PrSummary): string {
  if (pr.state === "MERGED") return "merged"
  if (pr.state === "CLOSED") return "closed"
  return pr.isDraft ? "draft" : ""
}

function detailOf(row: PickRow, looking: boolean): string {
  if (!row.pr) return looking ? "…" : ""
  const notes = [row.pr.author && `@${row.pr.author}`, stateWord(row.pr)].filter(Boolean).join(" · ")
  return notes ? `${row.pr.title} · ${notes}` : row.pr.title
}

export function openPrModel(input: OpenPrModelInput): OpenPrModel {
  const { pick } = input
  if (pick) {
    const repoWidth = Math.max(...pick.rows.map((row) => `${row.repo.owner}/${row.repo.repo}`.length))
    const room = input.width - Math.min(repoWidth, Math.floor(input.width / 2)) - 4
    return {
      heading: `Which repo is #${pick.number} in?`,
      message: pick.note ? { text: truncate(pick.note, input.width), tone: "dim" } : null,
      rows: pick.rows.map((row, i) => ({
        repo: truncate(`${row.repo.owner}/${row.repo.repo}`, Math.floor(input.width / 2)).padEnd(Math.min(repoWidth, Math.floor(input.width / 2))),
        detail: truncate(detailOf(row, pick.looking), Math.max(room, 0)),
        selected: i === input.highlight,
      })),
      hint: "Enter open   j/k move   Esc back",
    }
  }
  return {
    heading: input.current ? `Open a PR in ${input.current.owner}/${input.current.repo}, or any other` : "Open a PR",
    message: input.error
      ? { text: truncate(input.error, input.width), tone: "error" }
      : input.checking
        ? { text: truncate(input.checking, input.width), tone: "dim" }
        : input.fromClipboard
          ? { text: "From the clipboard. Typing replaces it", tone: "dim" }
          : null,
    rows: null,
    hint: `Enter open   Esc ${input.hasLocalReview ? "review this checkout" : "quit"}`,
  }
}
