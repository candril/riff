import type { BlameSource, LineBlame } from "../../providers/blame/source"

export const DEMO_BLAME: LineBlame = {
  line: {
    kind: "commit",
    commit: {
      sha: "0000000000000000000000000000000000dead01",
      shortSha: "0000dead",
      author: "riff demo",
      date: "2026-01-01T00:00:00Z",
      subject: "The demo blames every line on one commit",
    },
  },
  pr: { number: 1, url: "https://github.com/riff-demo/demo/pull/1" },
}

/** The blame `--demo` runs on. The demo promises no network, so it never asks jj, git or GitHub. */
export function demoBlameSource(): BlameSource {
  return { lineBlame: async () => DEMO_BLAME }
}
