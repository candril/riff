import { test, expect, describe } from "bun:test"
import {
  createComposerSession,
  PLACEHOLDER_COMPOSE,
  PLACEHOLDER_EDIT,
  type ComposerSessionController,
  type ComposerTextarea,
} from "./composer-session"

/** A textarea that reports its edits as activity, as OpenTUI's does. */
function stubTextarea() {
  let session: ComposerSessionController | null = null
  let text = ""
  let cursor = 0
  const textarea = {
    focused: 0,
    blurred: 0,
    seeded: 0,
    placeholder: "" as string | null,
    get plainText() {
      return text
    },
    get cursorOffset() {
      return cursor
    },
    set cursorOffset(next: number) {
      cursor = next
      session?.activity()
    },
    setText(next: string) {
      textarea.seeded++
      text = next
      cursor = 0
      session?.activity()
    },
    replaceText(next: string) {
      text = next
      session?.activity()
    },
    focus() {
      textarea.focused++
    },
    blur() {
      textarea.blurred++
    },
  } satisfies ComposerTextarea & { focused: number; blurred: number; seeded: number }
  session = createComposerSession(() => textarea)
  const type = (typed: string) => {
    text = text.slice(0, cursor) + typed + text.slice(cursor)
    cursor += typed.length
    session!.activity()
  }
  return { textarea, session, type }
}

describe("a composer session", () => {
  test("a new key seeds the textarea once and focuses it", () => {
    const { textarea, session } = stubTextarea()
    session.sync({ key: "a:compose", initialValue: "draft", mode: "compose" })
    session.sync({ key: "a:compose", initialValue: "draft", mode: "compose" })
    expect(textarea.seeded).toBe(1)
    expect(textarea.focused).toBe(1)
    expect(session.value()).toBe("draft")
  })

  test("the same key synced again keeps what was typed", () => {
    const { session, type } = stubTextarea()
    session.sync({ key: "a:compose", initialValue: "", mode: "compose" })
    type("hello")
    session.sync({ key: "a:compose", initialValue: "", mode: "compose" })
    expect(session.value()).toBe("hello")
    expect(session.cursorOffset()).toBe(5)
  })

  test("the placeholder follows the mode, and a new key re-seeds", () => {
    const { textarea, session } = stubTextarea()
    session.sync({ key: "a:compose", initialValue: "", mode: "compose" })
    expect(textarea.placeholder).toBe(PLACEHOLDER_COMPOSE)
    session.sync({ key: "a:edit:7", initialValue: "old body", mode: "edit" })
    expect(textarea.placeholder).toBe(PLACEHOLDER_EDIT)
    expect(session.value()).toBe("old body")
    expect(textarea.seeded).toBe(2)
  })

  test("closing blurs once, and closing again does nothing", () => {
    const { textarea, session } = stubTextarea()
    session.sync(null)
    expect(textarea.blurred).toBe(0)
    session.sync({ key: "a:compose", initialValue: "", mode: "compose" })
    session.sync(null)
    session.sync(null)
    expect(textarea.blurred).toBe(1)
  })

  test("setValue puts the cursor at the end and keeps the key, so the next sync does not re-seed", () => {
    const { textarea, session } = stubTextarea()
    session.sync({ key: "a:compose", initialValue: "", mode: "compose" })
    session.setValue("from the editor")
    session.sync({ key: "a:compose", initialValue: "", mode: "compose" })
    expect(session.value()).toBe("from the editor")
    expect(session.cursorOffset()).toBe("from the editor".length)
    expect(textarea.seeded).toBe(2)
    expect(textarea.focused).toBe(2)
  })

  test("replaceRange clamps the range to the text and leaves the cursor after the replacement", () => {
    const { session } = stubTextarea()
    session.sync({ key: "a:compose", initialValue: "hi @ali there", mode: "compose" })
    session.replaceRange(3, 7, "@alice ")
    expect(session.value()).toBe("hi @alice  there")
    expect(session.cursorOffset()).toBe(10)

    session.replaceRange(-5, 2, "Oh")
    expect(session.value()).toBe("Oh @alice  there")
    expect(session.cursorOffset()).toBe(2)

    session.replaceRange(100, 200, "!")
    expect(session.value()).toBe("Oh @alice  there!")
    expect(session.cursorOffset()).toBe(17)

    session.replaceRange(5, 2, "X")
    expect(session.value()).toBe("Oh @aXlice  there!")
  })

  test("activity reaches the latest handler, and none once the session closed", () => {
    const { session, type } = stubTextarea()
    const first: string[] = []
    const second: Array<[string, number]> = []
    session.sync({ key: "a:compose", initialValue: "", mode: "compose", onActivity: (text) => first.push(text) })
    session.sync({
      key: "a:compose",
      initialValue: "",
      mode: "compose",
      onActivity: (text, cursor) => second.push([text, cursor]),
    })
    const heardBeforeRefresh = [...first]
    type("@b")
    expect(first).toEqual(heardBeforeRefresh)
    expect(first).not.toContain("@b")
    expect(second.at(-1)).toEqual(["@b", 2])

    const count = second.length
    session.sync(null)
    type("x")
    expect(second.length).toBe(count)
  })
})
