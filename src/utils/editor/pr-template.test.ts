import { test, expect, describe } from "bun:test"
import {
  buildPrCreateContent,
  buildPrEditContent,
  parsePrCreateOutput,
  parsePrEditOutput,
} from "./pr-template"

const diff = ["diff --git a/src/a.ts b/src/a.ts", "@@ -1 +1 @@", "-old", "+new"].join("\n")

describe("the PR edit buffer", () => {
  const options = { title: "Fix the thing", body: "Why it broke.\n\nHow it is fixed.", diff, fileSummary: ["M src/a.ts"] }

  test("title and body come back as they went in", () => {
    expect(parsePrEditOutput(buildPrEditContent(options))).toEqual({
      title: "Fix the thing",
      body: "Why it broke.\n\nHow it is fixed.",
    })
  })

  test("everything below the scissors line is ignored", () => {
    const edited = buildPrEditContent(options) + "\nNot a title\n\nNot a body either"

    expect(parsePrEditOutput(edited)).toEqual({
      title: "Fix the thing",
      body: "Why it broke.\n\nHow it is fixed.",
    })
  })

  test("an empty title cancels", () => {
    expect(parsePrEditOutput(buildPrEditContent({ ...options, title: "" }))).toBeNull()
  })
})

describe("the PR create buffer", () => {
  const options = { diff, fileSummary: ["M src/a.ts"], branchInfo: "feature → main" }

  test("a title and body typed at the top come back, as a ready PR", () => {
    const edited = "Add the thing\n\nWhy it is needed." + buildPrCreateContent(options)

    expect(parsePrCreateOutput(edited)).toEqual({
      title: "Add the thing",
      body: "Why it is needed.",
      draft: false,
    })
  })

  test("everything below the scissors line is ignored", () => {
    const edited = "Add the thing" + buildPrCreateContent(options) + "\nNot a body\n# Draft: yes"

    expect(parsePrCreateOutput(edited)).toEqual({ title: "Add the thing", body: "", draft: false })
  })

  test("an empty title cancels", () => {
    expect(parsePrCreateOutput(buildPrCreateContent(options))).toBeNull()
  })
})
