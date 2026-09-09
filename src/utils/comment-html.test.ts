import { test, expect, describe } from "bun:test"
import { softenCommentHtml } from "./comment-html"

describe("softenCommentHtml", () => {
  test("leaves a body with no HTML alone", () => {
    const body = "Just **markdown** and a `code span`."
    expect(softenCommentHtml(body)).toBe(body)
  })

  test("turns a break into a line break", () => {
    expect(softenCommentHtml("one<br>two<br />three")).toBe("one\ntwo\nthree")
  })

  test("keeps a table row on one line", () => {
    expect(softenCommentHtml("| a | one<br>two |")).toBe("| a | one · two |")
  })

  test("translates the inline tags people actually use", () => {
    expect(softenCommentHtml("<b>bold</b> and <em>soft</em> and <code>x</code>")).toBe(
      "**bold** and *soft* and `x`"
    )
  })

  test("unfolds details, keeping the summary as a heading", () => {
    expect(
      softenCommentHtml("<details><summary>Test output</summary>\n\nit failed\n</details>")
    ).toBe("**Test output**\n\n\nit failed\n")
  })

  test("rewrites an anchor as a markdown link", () => {
    expect(softenCommentHtml('see <a href="https://x.test/a">the docs</a>')).toBe(
      "see [the docs](https://x.test/a)"
    )
  })

  test("leaves HTML inside an inline code span", () => {
    expect(softenCommentHtml("use `<br>` for a break")).toBe("use `<br>` for a break")
  })

  test("leaves HTML inside a fenced block", () => {
    const body = "before\n\n```html\n<b>kept</b>\n```\n\n<b>changed</b>"
    expect(softenCommentHtml(body)).toBe("before\n\n```html\n<b>kept</b>\n```\n\n**changed**")
  })

  test("leaves a tag it has no meaning for", () => {
    expect(softenCommentHtml("<figure>x</figure>")).toBe("<figure>x</figure>")
  })
})
