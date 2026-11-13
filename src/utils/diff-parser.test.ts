import { expect, test } from "bun:test"
import { parseDiff } from "./diff-parser"

test("inside a hunk, lines starting +++ and --- are an addition and a removal, not the header", () => {
  const [file] = parseDiff(
    [
      "diff --git a/x.sql.diff b/x.sql.diff",
      "--- a/x.sql.diff",
      "+++ b/x.sql.diff",
      "@@ -1,2 +1,2 @@",
      "--- old comment",
      "+++ new comment",
      " kept",
    ].join("\n"),
  )
  expect(file).toMatchObject({ additions: 1, deletions: 1 })
})
