import { test, expect, describe } from "bun:test"
import { findReferences, annotateReferences, type ResolvedReference } from "./references"

const repo = { owner: "candril", repo: "riff" }

const resolved = new Map<string, ResolvedReference>([
  ["candril/riff#412", { title: "Draw mermaid blocks", state: "merged", pull: true }],
  ["candril/riff#7", { title: "Long lines scroll badly", state: "open", pull: false }],
  ["other/tool#3", { title: "Add a flag", state: "closed", pull: true }],
])

describe("finding references", () => {
  test("takes a bare number, a cross-repo one and a URL", () => {
    const body = "see #412, other/tool#3 and https://github.com/candril/riff/pull/7"
    expect(findReferences(body).map((r) => [r.owner, r.repo, r.number, r.url])).toEqual([
      [null, null, 412, false],
      ["other", "tool", 3, false],
      ["candril", "riff", 7, true],
    ])
  })

  test("reads past an anchor on the URL", () => {
    const body = "https://github.com/candril/riff/issues/7#issuecomment-1234"
    expect(findReferences(body)[0]!.number).toBe(7)
    expect(findReferences(body)).toHaveLength(1)
  })

  test("leaves code alone", () => {
    expect(findReferences("`#412` is the syntax")).toEqual([])
    expect(findReferences("```\n#412\n```")).toEqual([])
  })

  test("leaves a link's own text alone", () => {
    expect(findReferences("[the fix](https://github.com/candril/riff/pull/412)")).toEqual([])
  })

  test("is not fooled by a colour or an id", () => {
    expect(findReferences("colour #ff00ff")).toEqual([])
    expect(findReferences("issue&#412;")).toEqual([])
  })
})

describe("annotating them", () => {
  test("a bare reference gains the title and the state", () => {
    expect(annotateReferences("fixed in #412", resolved, repo)).toBe(
      "fixed in #412 Draw mermaid blocks (merged)",
    )
  })

  test("a cross-repo reference keeps its repo", () => {
    expect(annotateReferences("blocked by other/tool#3", resolved, repo)).toBe(
      "blocked by other/tool#3 Add a flag (closed)",
    )
  })

  test("a pasted URL becomes the link it stood for", () => {
    expect(annotateReferences("see https://github.com/candril/riff/pull/7", resolved, repo)).toBe(
      "see [#7 Long lines scroll badly (open)](https://github.com/candril/riff/pull/7)",
    )
  })

  test("an unresolved reference is left as it was written", () => {
    expect(annotateReferences("what about #999?", resolved, repo)).toBe("what about #999?")
  })

  test("several in one line all get their answer", () => {
    expect(annotateReferences("#412 and #7", resolved, repo)).toBe(
      "#412 Draw mermaid blocks (merged) and #7 Long lines scroll badly (open)",
    )
  })

  test("without a repo to resolve against, a bare number stays bare", () => {
    expect(annotateReferences("see #412", resolved, null)).toBe("see #412")
  })
})
