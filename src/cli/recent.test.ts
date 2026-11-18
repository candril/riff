import { expect, test } from "bun:test"
import { homedir } from "os"
import type { RecentReview } from "../storage/recent"
import { RECENT_USAGE, runRecentCli } from "./recent"

const reviews: RecentReview[] = [
  {
    kind: "pr", url: "https://github.com/acme/app/pull/7", owner: "acme", repo: "app", number: 7, title: "Fix it",
    directory: "/src/app", openedAt: "2026-11-18T09:30:00.000Z",
  },
  {
    kind: "local", target: null, directory: `${homedir()}/src/app`,
    openedAt: "2026-11-15T10:00:00.000Z", closedAt: "2026-11-15T11:00:00.000Z",
  },
]

function run(args: string[], load = () => reviews) {
  const out: string[] = []
  const errors: string[] = []
  const code = runRecentCli(args, {
    load,
    now: () => new Date("2026-11-18T10:00:00.000Z"),
    out: (text) => void out.push(text),
    error: (line) => void errors.push(line),
  })
  return { code, out, errors }
}

test("lists reviews newest first, marking the ones still open", () => {
  expect(run([]).out[0]).toBe("30m * acme/app#7  Fix it\n3d    ~/src/app  (working copy)")
})

test("--json prints the entries for a script to read", () => {
  const { code, out } = run(["--json"])
  expect([code, JSON.parse(out[0]!)]).toEqual([0, reviews])
})

test("says so when there is nothing yet", () => {
  expect(run([], () => []).out[0]).toBe("No reviews yet.")
})

test("anything else it does not know is a usage error", () => {
  expect(run(["--yaml"])).toMatchObject({ code: 1, errors: [RECENT_USAGE] })
})
