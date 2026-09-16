import { test, expect, describe } from "bun:test"
import { applyQueryPredicates } from "./query-predicates"
import type { SimpleHighlight } from "@opentui/core"

const css = "  display: flex;\n  --brand: red;\n"
const display: [number, number] = [2, 9]
const brand: [number, number] = [19, 26]

describe("the captures a predicate was meant to guard", () => {
  test("leave a property reading as a property", () => {
    const parsed: SimpleHighlight[] = [
      [...display, "property"],
      [...display, "variable"],
    ]

    expect(applyQueryPredicates(css, "css", parsed)).toEqual([[...display, "property"]])
  })

  test("keep the custom property the predicate was written for", () => {
    const parsed: SimpleHighlight[] = [
      [...brand, "property"],
      [...brand, "variable"],
    ]

    expect(applyQueryPredicates(css, "css", parsed)).toEqual(parsed)
  })

  test("keep a name no other capture covers, like a keyframes one", () => {
    const parsed: SimpleHighlight[] = [[...display, "variable"]]

    expect(applyQueryPredicates(css, "css", parsed)).toEqual(parsed)
  })

  test("are another language's business, not riff's", () => {
    const parsed: SimpleHighlight[] = [
      [...display, "property"],
      [...display, "variable"],
    ]

    expect(applyQueryPredicates(css, "typescript", parsed)).toEqual(parsed)
  })
})
