import { test, expect, describe } from "bun:test"
import { annotationsOf, behindByOf } from "./lookups"

const raw = (over: Record<string, unknown>) => ({
  path: "src/a.ts",
  start_line: 4,
  end_line: 6,
  start_column: 2,
  end_column: 9,
  annotation_level: "warning",
  message: "unused variable",
  title: "lint",
  raw_details_url: null,
  ...over,
})

describe("annotationsOf", () => {
  test("maps GitHub's fields onto riff's annotation", () => {
    expect(annotationsOf([raw({})])).toEqual([
      {
        path: "src/a.ts",
        startLine: 4,
        endLine: 6,
        startColumn: 2,
        endColumn: 9,
        level: "warning",
        message: "unused variable",
        title: "lint",
        rawDetailsUrl: undefined,
      },
    ])
  })

  test("drops workflow-level .github entries and entries without a path", () => {
    expect(annotationsOf([raw({ path: ".github" }), raw({ path: undefined }), null, raw({ path: "" })])).toEqual([])
  })

  test("collapses an exact duplicate but keeps a different level or column", () => {
    const kept = annotationsOf([
      raw({}),
      raw({}),
      raw({ annotation_level: "failure" }),
      raw({ start_column: 5 }),
    ])
    expect(kept.map((a) => [a.level, a.startColumn])).toEqual([
      ["warning", 2],
      ["failure", 2],
      ["warning", 5],
    ])
  })

  test("stops at 100 annotations", () => {
    const many = Array.from({ length: 150 }, (_, i) => raw({ start_line: i + 1 }))
    expect(annotationsOf(many)).toHaveLength(100)
  })

  test("a missing level is a failure", () => {
    expect(annotationsOf([raw({ annotation_level: undefined })])[0]!.level).toBe("failure")
  })

  test("a missing end line falls back to the start line", () => {
    expect(annotationsOf([raw({ end_line: undefined })])[0]!.endLine).toBe(4)
    expect(annotationsOf([raw({ start_line: undefined, end_line: undefined })])[0]).toMatchObject({
      startLine: 0,
      endLine: 0,
    })
  })
})

describe("behindByOf", () => {
  test("reads the compare's behind count", () => {
    expect(behindByOf({ behind_by: 3, ahead_by: 1 })).toBe(3)
    expect(behindByOf({ behind_by: 0 })).toBe(0)
  })

  test("anything else is not known", () => {
    for (const compare of [null, undefined, {}, { behind_by: "3" }, { behind_by: -1 }, { message: "Not Found" }]) {
      expect(behindByOf(compare)).toBeNull()
    }
  })
})
