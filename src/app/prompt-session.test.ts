import { test, expect, describe } from "bun:test"
import { createPromptSession, type PromptField } from "./prompt-session"

/** A field that reports a set `value` as input, as OpenTUI's does. */
function stubField() {
  let session: ReturnType<typeof createPromptSession> | null = null
  let value = ""
  const field = {
    focused: 0,
    blurred: 0,
    placeholder: "",
    get value() {
      return value
    },
    set value(next: string) {
      value = next
      session?.input(next)
    },
    focus() {
      field.focused++
    },
    blur() {
      field.blurred++
    },
  } satisfies PromptField & { focused: number; blurred: number }
  session = createPromptSession(() => field)
  const type = (text: string) => {
    value += text
    session!.input(value)
  }
  return { field, session, type }
}

describe("a prompt session", () => {
  test("a new key seeds the field, sets its placeholder and focuses it", () => {
    const { field, session } = stubField()
    session.sync({ key: "file-picker", initialValue: "src", placeholder: "Type to search…", onChange: () => {} })
    expect(field.value).toBe("src")
    expect(field.placeholder).toBe("Type to search…")
    expect(field.focused).toBe(1)
    expect(session.value()).toBe("src")
  })

  test("the same key synced again keeps what was typed and does not refocus", () => {
    const { field, session, type } = stubField()
    session.sync({ key: "file-picker", initialValue: "", onChange: () => {} })
    type("ab")
    session.sync({ key: "file-picker", initialValue: "", onChange: () => {} })
    expect(field.value).toBe("ab")
    expect(field.focused).toBe(1)
    expect(field.blurred).toBe(0)
  })

  test("another key of the same field blurs it before seeding and focusing it again", () => {
    const { field, session } = stubField()
    session.sync({ key: "occurrence-picker:search", initialValue: "foo", onChange: () => {} })
    session.sync({ key: "occurrence-picker:narrow", initialValue: "", placeholder: "Narrow", onChange: () => {} })
    expect(field.blurred).toBe(1)
    expect(field.focused).toBe(2)
    expect(field.value).toBe("")
    expect(field.placeholder).toBe("Narrow")
  })

  test("seeding never reports a change", () => {
    const { session } = stubField()
    const changes: string[] = []
    session.sync({ key: "search:forward:0:0", initialValue: "", onChange: (v) => changes.push(v) })
    session.sync({ key: "search:forward:1:0", initialValue: "ba", onChange: (v) => changes.push(v) })
    session.sync(null)
    session.sync({ key: "search:forward:1:0", initialValue: "bar", onChange: (v) => changes.push(v) })
    expect(changes).toEqual([])
  })

  test("typing reports to the latest onChange", () => {
    const { session, type } = stubField()
    const first: string[] = []
    const latest: string[] = []
    session.sync({ key: "feed-filter", initialValue: "", onChange: (v) => first.push(v) })
    type("a")
    session.sync({ key: "feed-filter", initialValue: "", onChange: (v) => latest.push(v) })
    type("b")
    expect(first).toEqual(["a"])
    expect(latest).toEqual(["ab"])
  })

  test("Enter goes to onSubmit only while the session has one", () => {
    const { session } = stubField()
    let submits = 0
    session.sync({ key: "action-menu:", initialValue: "", onChange: () => {}, onSubmit: () => submits++ })
    session.submit()
    session.sync({ key: "action-menu:", initialValue: "", onChange: () => {} })
    session.submit()
    expect(submits).toBe(1)
  })

  test("null blurs the field and lets go of its handlers", () => {
    const { field, session, type } = stubField()
    const changes: string[] = []
    let submits = 0
    session.sync({ key: "comments-filter", initialValue: "", onChange: (v) => changes.push(v), onSubmit: () => submits++ })
    session.sync(null)
    expect(field.blurred).toBe(1)
    type("x")
    session.submit()
    expect(changes).toEqual([])
    expect(submits).toBe(0)
    session.sync(null)
    expect(field.blurred).toBe(1)
  })

  test("closing and reopening on the same key seeds the field again", () => {
    const { field, session, type } = stubField()
    session.sync({ key: "file-picker", initialValue: "", onChange: () => {} })
    type("abc")
    session.sync(null)
    session.sync({ key: "file-picker", initialValue: "", onChange: () => {} })
    expect(field.value).toBe("")
    expect(field.focused).toBe(2)
  })
})
