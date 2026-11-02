import { test, expect, describe } from "bun:test"
import type { SimpleHighlight } from "@opentui/core"
import { withoutInjectionContainers } from "./injection-containers"

const ts = { isInjection: true, injectionLang: "typescript" }
const fence = { conceal: "", concealLines: "" }

// Modelled on the markdown parser's answer for a ```ts block holding `{ AccountHolder: id // why }`.
const fencedTs: SimpleHighlight[] = [
  [0, 52, "markup.raw.block", { containsInjection: true }],
  [0, 3, "markup.raw.block", fence],
  [3, 5, "label"],
  [8, 21, "label", ts],
  [23, 25, "variable", ts],
  [26, 44, "comment", ts],
  [49, 52, "markup.raw.block", fence],
]

describe("a fenced block's highlights", () => {
  test("lose the block's own colour where an injected language colours it", () => {
    expect(withoutInjectionContainers(fencedTs)).toEqual(fencedTs.slice(1))
  })

  test("keep the block's colour when no language was injected into it", () => {
    const plain: SimpleHighlight[] = [
      [0, 20, "markup.raw.block"],
      [0, 3, "markup.raw.block", fence],
      [17, 20, "markup.raw.block", fence],
    ]

    expect(withoutInjectionContainers(plain)).toEqual(plain)
  })

  test("keep a container of another kind, and an injected raw block", () => {
    const others: SimpleHighlight[] = [
      [0, 45, "markup.heading.4", { containsInjection: true }],
      [0, 10, "markup.raw.block", { containsInjection: true, isInjection: true }],
    ]

    expect(withoutInjectionContainers(others)).toEqual(others)
  })
})
