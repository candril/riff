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

test("a commit GitHub does not know is no PR, and is not asked about again", async () => {
  let calls = 0
  const prForCommit = createPrLookup(async () => {
    calls++
    throw new Error("gh: No commit found for SHA: abc (HTTP 422)")
  })
  expect(await prForCommit("o", "r", "abc")).toBeNull()
  expect(await prForCommit("o", "r", "abc")).toBeNull()
  expect(calls).toBe(1)
})

test("any other failure rejects and is asked again", async () => {
  let calls = 0
  const prForCommit = createPrLookup(async () => {
    calls++
    throw new Error("error connecting to api.github.com")
  })
  await expect(prForCommit("o", "r", "abc")).rejects.toThrow("error connecting")
  await expect(prForCommit("o", "r", "abc")).rejects.toThrow("error connecting")
  expect(calls).toBe(2)
})
