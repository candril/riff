import { describe, expect, test } from "bun:test"
import { extractCommentImages } from "./comment-images"

describe("extractCommentImages", () => {
  test("lifts a pasted GitHub screenshot out of the body", () => {
    const body =
      '<img width="1035" height="270" alt="Screenshot 2026-09-08 at 16 32 51" ' +
      'src="https://github.com/user-attachments/assets/c0d9674a" />\r\n\r\nC is is correct'

    const { text, images } = extractCommentImages(body)

    expect(text).toBe("C is is correct")
    expect(images).toEqual([
      {
        label: "Screenshot 2026-09-08 at 16 32 51",
        url: "https://github.com/user-attachments/assets/c0d9674a",
      },
    ])
  })

  test("takes the anchor with the image it wraps", () => {
    const body =
      '<a href="https://example.com/full.png"><img src="https://example.com/thumb.png" alt="chart"></a>'

    const { text, images } = extractCommentImages(body)

    expect(text).toBe("")
    expect(images).toEqual([{ label: "chart", url: "https://example.com/thumb.png" }])
  })

  test("handles markdown images and keeps document order", () => {
    const body = "before\n\n![one](https://example.com/1.png)\n\nmiddle\n\n<img src=\"https://example.com/2.png\">\n\nafter"

    const { text, images } = extractCommentImages(body)

    expect(text).toBe("before\n\nmiddle\n\nafter")
    expect(images.map((i) => i.url)).toEqual([
      "https://example.com/1.png",
      "https://example.com/2.png",
    ])
  })

  test("falls back to the file name, then to a generic label", () => {
    const body = "![](https://example.com/diagram.png)\n![](https://github.com/user-attachments/assets/c0d9674a)"

    const { images } = extractCommentImages(body)

    expect(images.map((i) => i.label)).toEqual(["diagram.png", "image"])
  })

  test("leaves image syntax inside fenced code alone", () => {
    const body = "```html\n<img src=\"https://example.com/1.png\">\n```"

    const { text, images } = extractCommentImages(body)

    expect(text).toBe(body)
    expect(images).toEqual([])
  })

  test("strips an image tag that carries no src", () => {
    const { text, images } = extractCommentImages("<img alt=\"broken\">\n\ntext")

    expect(text).toBe("text")
    expect(images).toEqual([])
  })

  test("reads single-quoted and unquoted attributes", () => {
    const { images } = extractCommentImages(
      "<img src='https://example.com/a.png' alt='quoted'><img src=https://example.com/b.png>"
    )

    expect(images).toEqual([
      { label: "quoted", url: "https://example.com/a.png" },
      { label: "b.png", url: "https://example.com/b.png" },
    ])
  })

  test("leaves a plain body untouched", () => {
    const { text, images } = extractCommentImages("just prose\n\nwith a [link](https://x.dev)")

    expect(text).toBe("just prose\n\nwith a [link](https://x.dev)")
    expect(images).toEqual([])
  })
})
