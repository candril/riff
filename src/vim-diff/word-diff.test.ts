import { test, expect, describe } from "bun:test"
import { pairSpans, tokenize, computeWordDiff } from "./word-diff"
import { DiffLineMapping } from "./line-mapping"
import type { DiffFile } from "../utils/diff-parser"

/** The text a span covers, so an expectation reads as what the reader sees. */
function texts(line: string, spans: { startCol: number; endCol: number }[]): string[] {
  return spans.map((span) => line.slice(span.startCol, span.endCol))
}

function file(lines: string[]): DiffFile {
  return {
    filename: "src/app.ts",
    additions: lines.filter((line) => line.startsWith("+")).length,
    deletions: lines.filter((line) => line.startsWith("-")).length,
    status: "modified",
    content: [
      "diff --git a/src/app.ts b/src/app.ts",
      "--- a/src/app.ts",
      "+++ b/src/app.ts",
      `@@ -1,${lines.length} +1,${lines.length} @@`,
      ...lines,
    ].join("\n"),
  }
}

describe("cutting a line into tokens", () => {
  test("words, whitespace and single characters", () => {
    expect(tokenize("a.b(c, 12)")).toEqual(["a", ".", "b", "(", "c", ",", " ", "12", ")"])
  })

  test("an astral character is one token, not half a surrogate pair each", () => {
    const tokens = tokenize("x 🎉 y")
    expect(tokens).toEqual(["x", " ", "🎉", " ", "y"])
    expect(tokens[2]!.length).toBe(2)
  })
})

describe("the spans two versions of a line do not share", () => {
  test("one renamed identifier is that identifier, not the line", () => {
    const before = "const reply = await api.getContract(id)"
    const after = "const reply = await api.getContracts(id)"

    const spans = pairSpans(before, after)!
    expect(texts(before, spans.before)).toEqual(["getContract"])
    expect(texts(after, spans.after)).toEqual(["getContracts"])
  })

  test("a change in two places is two spans", () => {
    const before = "call(one, keep, two)"
    const after = "call(ONE, keep, TWO)"

    const spans = pairSpans(before, after)!
    expect(texts(before, spans.before)).toEqual(["one", "two"])
    expect(texts(after, spans.after)).toEqual(["ONE", "TWO"])
  })

  test("an addition with nothing removed leaves the other side empty", () => {
    const before = "greet(name)"
    const after = "greet(name, loud)"

    const spans = pairSpans(before, after)!
    expect(spans.before).toEqual([])
    expect(texts(after, spans.after)).toEqual([", loud"])
  })

  test("a pair with nothing in common is left whole", () => {
    expect(pairSpans("const a = readFile(path)", "return")).toBeNull()
  })

  test("a reindent alone paints nothing", () => {
    expect(pairSpans("  return value", "      return value")).toBeNull()
  })

  test("identical lines have nothing to say", () => {
    expect(pairSpans("same", "same")).toBeNull()
  })

  test("the same edit is a span where the line mostly stays, and nothing where it does not", () => {
    expect(pairSpans("value = compute(alpha)", "value = compute(beta)")).not.toBeNull()
    expect(pairSpans("alpha", "beta")).toBeNull()
  })

  test("a short line rewritten into a long one is painted from the long side", () => {
    const after = "wrapInRetry(compute(value))"
    const spans = pairSpans("compute(value)", after)!
    expect(spans.before).toEqual([])
    expect(texts(after, spans.after)).toEqual(["wrapInRetry(", ")"])
  })

  test("indentation is not common ground, however deep the nesting", () => {
    // Four levels of C#: twelve leading columns the two lines share without
    // agreeing about anything, which is a quarter of each line.
    const indent = " ".repeat(12)
    const unrelated: [string, string][] = [
      ["var epochMs = reader.GetInt64();", "if (!reader.TryGetInt64(out var epoch))"],
      ["epochMs /= 1000;", "epoch = System.Convert.ToInt64(reader.GetDouble());"],
      ["return System.DateTimeOffset.UnixEpoch.AddSeconds(epochMs);", "if (epoch > 253402300799)"],
    ]

    for (const [before, after] of unrelated) {
      expect(pairSpans(indent + before, indent + after)).toBeNull()
      // And the same pair unindented was already refused, which is the point.
      expect(pairSpans(before, after)).toBeNull()
    }
  })

  test("a change that is everywhere is in no place worth pointing at", () => {
    // One sentence rewrapped: most of its words survive in a different
    // order, so the alignment finds them and would paint every gap between.
    const before =
      "`gx` lists the links in the highlighted comment and opens the one you pick — `Ctrl+y` copies it"
    const after =
      "`gx` lists the links in every comment the panel is showing — the highlighted one first, each row"
    expect(pairSpans(before, after)).toBeNull()
  })

  test("a span is columns of the line, so an emoji before it counts double", () => {
    const before = "// 🎉 done"
    const after = "// 🎉 DONE"

    const spans = pairSpans(before, after)!
    expect(spans.before).toEqual([{ startCol: 6, endCol: 10 }])
    expect(texts(before, spans.before)).toEqual(["done"])
  })
})

describe("the spans of a diff, by visual line", () => {
  test("a run pairs its nth deletion with its nth addition", () => {
    const mapping = new DiffLineMapping(
      [file([" keep", "-first = alpha(x)", "-second = alpha(y)", "+first = beta(x)", "+second = beta(y)", " tail"])],
      "all"
    )

    const spans = computeWordDiff(mapping)
    const rows = [...spans.keys()].sort((a, b) => a - b)
    expect(rows.length).toBe(4)

    for (const row of rows) {
      const line = mapping.getLine(row)!
      expect(texts(line.content, spans.get(row)!)).toEqual([
        line.type === "deletion" ? "alpha" : "beta",
      ])
    }
  })

  test("an uneven run leaves its tail whole", () => {
    const mapping = new DiffLineMapping(
      [file([" keep", "-first = alpha(x)", "+first = beta(x)", "+wholly = new(line, here)", " tail"])],
      "all"
    )

    const spans = computeWordDiff(mapping)
    const rows = [...spans.keys()]
    expect(rows.length).toBe(2)
    for (const row of rows) {
      expect(mapping.getLine(row)!.content).not.toContain("wholly")
    }
  })

  test("a deletion with no addition after it is not a pair", () => {
    const mapping = new DiffLineMapping([file([" keep", "-first = alpha(x)", " tail"])], "all")
    expect(computeWordDiff(mapping).size).toBe(0)
  })

  test("a missing trailing newline sits between the runs without ending the change", () => {
    const mapping = new DiffLineMapping(
      [
        file([
          " keep",
          "-const value = alpha(x)",
          "\\ No newline at end of file",
          "+const value = beta(x)",
        ]),
      ],
      "all"
    )

    const spans = computeWordDiff(mapping)
    expect(spans.size).toBe(2)
    for (const [row, found] of spans) {
      const line = mapping.getLine(row)!
      expect(texts(line.content, found)).toEqual([line.type === "deletion" ? "alpha" : "beta"])
    }
  })

  test("an aligned table's rows are padded onto a grid, so they are left alone", () => {
    const table: DiffFile = {
      filename: "t.md",
      additions: 1,
      deletions: 1,
      status: "modified",
      content: [
        "diff --git a/t.md b/t.md",
        "--- a/t.md",
        "+++ b/t.md",
        "@@ -1,4 +1,4 @@",
        " | a | bbbbbb |",
        " |---|--------|",
        "-| 1 | 22 |",
        "+| 1 | 33 |",
      ].join("\n"),
    }
    const mapping = new DiffLineMapping([table], "all")

    expect(mapping.getLine(3)!.sourceContent).toBe("| 1 | 22 |")
    expect(computeWordDiff(mapping).size).toBe(0)
  })

  test("context lines never carry spans", () => {
    const mapping = new DiffLineMapping(
      [file([" const a = 1", "-const b = 2", "+const b = 3", " const c = 4"])],
      "all"
    )

    for (const [row] of computeWordDiff(mapping)) {
      expect(mapping.getLine(row)!.type).not.toBe("context")
    }
  })
})
