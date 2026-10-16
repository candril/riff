import { afterAll, describe, expect, test } from "bun:test"
import type { RGBA } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { getSyntaxStyle } from "../vim-diff/syntax-style"
import { styleOfCapture } from "./syntax-palette"

const hex = (color: RGBA | undefined) =>
  color && "#" + color.toInts().slice(0, 3).map((c) => c.toString(16).padStart(2, "0")).join("")

const setup = await createTestRenderer({ width: 10, height: 2 })
afterAll(() => setup.renderer.destroy())

describe("styleOfCapture", () => {
  const syntax = getSyntaxStyle(setup.renderer.nativeScene)

  test.each([
    "keyword",
    "keyword.control.import",
    "string.special.key",
    "comment",
    "markup.heading.2",
    "markup.heading.7",
    "markup.link.url",
    "search.current",
    "diff.word.added",
    "constructor",
    "unknown.capture",
  ])("reads %s as the diff view's SyntaxStyle does", (capture) => {
    const drawn = syntax.getStyle(capture)
    const style = styleOfCapture(capture)
    expect(style && { ...style }).toEqual(
      drawn && {
        ...(drawn.fg && { fg: hex(drawn.fg) }),
        ...(drawn.bg && { bg: hex(drawn.bg) }),
        ...(drawn.bold !== undefined && { bold: drawn.bold }),
        ...(drawn.italic !== undefined && { italic: drawn.italic }),
        ...(drawn.underline !== undefined && { underline: drawn.underline }),
      }
    )
  })
})
