/**
 * `riff goto <url>` (spec 115): hand a PR link to the riff already showing
 * that PR. Never starts the TUI and never asks GitHub anything, so a caller
 * deciding whether to open a new riff gets its answer at once.
 */

import { parsePrLink } from "../features/deep-link/parse"
import { sendLink, socketPath, type SendOutcome } from "../features/deep-link/socket"

export const GOTO_USAGE = "usage: riff goto <github-pr-url>"

export interface GotoDeps {
  send: (path: string, url: string) => Promise<SendOutcome>
  socketFor: (source: string) => string
  error: (line: string) => void
}

const liveDeps: GotoDeps = {
  send: (path, url) => sendLink(path, url),
  socketFor: (source) => socketPath(source),
  error: (line) => console.error(line),
}

/** 0 delivered, 1 no riff has the PR open (or the URL is no PR link), 2 the riff that has it refused the link. */
export async function runGotoCli(args: string[], deps: GotoDeps = liveDeps): Promise<number> {
  const url = args[0]
  if (!url || args.length > 1) {
    deps.error(GOTO_USAGE)
    return 1
  }
  const link = parsePrLink(url)
  if (!link) {
    deps.error(`riff goto: not a GitHub pull request link: ${url}`)
    return 1
  }

  const source = `gh:${link.owner}/${link.repo}#${link.number}`
  const outcome = await deps.send(deps.socketFor(source), url)
  switch (outcome.kind) {
    case "ok":
      return 0
    case "no-instance":
      deps.error(`riff goto: no running riff has ${source} open`)
      return 1
    case "refused":
      deps.error(`riff goto: ${outcome.message}`)
      return 2
  }
}
