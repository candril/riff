import { describe, expect, test } from "bun:test"
import { getFiletypeFromFence } from "./filetype"

describe("getFiletypeFromFence", () => {
  test("a filetype, an extension or a common alias names a parser", () => {
    expect(getFiletypeFromFence("ts")).toBe("typescript")
    expect(getFiletypeFromFence("typescript")).toBe("typescript")
    expect(getFiletypeFromFence("TSX")).toBe("tsx")
    expect(getFiletypeFromFence("py")).toBe("python")
    expect(getFiletypeFromFence("sh")).toBe("bash")
    expect(getFiletypeFromFence("shell")).toBe("bash")
    expect(getFiletypeFromFence("console")).toBe("bash")
    expect(getFiletypeFromFence("c#")).toBe("csharp")
    expect(getFiletypeFromFence("golang")).toBe("go")
  })

  test("only the first word of the info string counts", () => {
    expect(getFiletypeFromFence("ts {title=x}")).toBe("typescript")
  })

  test("mermaid, an empty string and an unknown word name none", () => {
    expect(getFiletypeFromFence("mermaid")).toBeUndefined()
    expect(getFiletypeFromFence("")).toBeUndefined()
    expect(getFiletypeFromFence("nonsense")).toBeUndefined()
  })
})
