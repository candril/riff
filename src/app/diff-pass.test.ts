import { test, expect } from "bun:test"
import { parsesOf } from "./diff-pass"

test("only files whose new text riff has read are handed over for parsing", () => {
  const parses = parsesOf({
    "a.ts": { newContent: "new a", oldContent: "old a", loading: false },
    "added.ts": { newContent: "added", oldContent: null, loading: false },
    "loading.ts": { newContent: null, oldContent: null, loading: true },
    "deleted.ts": { newContent: null, oldContent: "gone", loading: false },
  })
  expect([...parses]).toEqual([
    ["a.ts", { new: "new a", old: "old a" }],
    ["added.ts", { new: "added", old: null }],
  ])
})
