import { expect, test } from "bun:test"
import { createPrLookup } from "./pr-lookup"

test("the first PR is taken and remembered per commit; a failure is asked again", async () => {
  let calls = 0
  const prForCommit = createPrLookup(async (_owner, _repo, sha) => {
    calls++
    if (sha === "bad" && calls === 1) throw new Error("rate limited")
    return sha === "none" ? [] : [{ number: 7, html_url: "https://github.com/o/r/pull/7" }]
  })
  await expect(prForCommit("o", "r", "bad")).rejects.toThrow("rate limited")
  expect(await prForCommit("o", "r", "bad")).toEqual({ number: 7, url: "https://github.com/o/r/pull/7" })
  expect(await prForCommit("o", "r", "bad")).toEqual({ number: 7, url: "https://github.com/o/r/pull/7" })
  expect(await prForCommit("o", "r", "none")).toBeNull()
  expect(calls).toBe(3)
})
