import { expect, test } from "bun:test"
import { createSignal } from "solid-js"
import type { Position } from "../../providers/agent/position"
import { fakeAgent } from "./fake-agent"
import { createChatState, NEW_CONVERSATION_PROMPT, type ChatState } from "./state"

const kinds = (state: ChatState) =>
  state.entries.map((e) =>
    e.kind === "question"
      ? `Q:${e.text}${e.waiting ? ":waiting" : ""}`
      : e.kind === "answer"
        ? `A:${e.text}${e.interrupted ? ":interrupted" : ""}`
        : `N:${e.tone}:${e.text}`,
  )

test("no session opens until the first question; the answer streams in", () => {
  const fake = fakeAgent()
  const chat = createChatState(fake.agent)
  expect([fake.starts(), chat.entries.length]).toEqual([0, 0])
  chat.send("what?")
  expect([fake.starts(), chat.status()]).toEqual([1, "answering"])
  fake.events().text("Short ")
  fake.events().text("answer.")
  expect(kinds(chat)).toEqual(["Q:what?", "A:Short answer."])
  fake.events().answerDone({ interrupted: false, usage: { input: 10, output: 2 } })
  expect([chat.status(), chat.usage()]).toEqual(["idle", { input: 10, output: 2 }])
  chat.send("and?")
  expect(fake.starts()).toBe(1)
})

test("an empty or blank question is not sent", () => {
  const fake = fakeAgent()
  const chat = createChatState(fake.agent)
  chat.send("   \n ")
  expect([fake.starts(), chat.entries.length]).toEqual([0, 0])
  chat.send("  trimmed \n")
  expect(fake.asked).toEqual(["trimmed"])
})

test("questions asked while an answer streams queue and go out in order", () => {
  const fake = fakeAgent()
  const chat = createChatState(fake.agent)
  chat.send("one")
  chat.send("two")
  chat.send("three")
  expect(fake.asked).toEqual(["one"])
  expect(kinds(chat)).toEqual(["Q:one", "A:", "Q:two:waiting", "Q:three:waiting"])
  expect(chat.activity()).toMatchObject({ phase: "thinking", waiting: 2 })
  fake.answer("1")
  expect(fake.asked).toEqual(["one", "two"])
  fake.answer("2")
  expect(kinds(chat)).toEqual(["Q:one", "A:1", "Q:two", "A:2", "Q:three", "A:"])
})

test("interrupting keeps the partial answer, marks it, and the next question goes out", () => {
  const fake = fakeAgent()
  const chat = createChatState(fake.agent)
  chat.send("one")
  chat.send("two")
  fake.events().text("par")
  chat.interrupt()
  expect(fake.interrupts()).toBe(1)
  fake.events().answerDone({ interrupted: true })
  expect(kinds(chat).slice(0, 2)).toEqual(["Q:one", "A:par:interrupted"])
  expect(fake.asked).toEqual(["one", "two"])
})

test("interrupting while idle reaches nothing", () => {
  const fake = fakeAgent()
  const chat = createChatState(fake.agent)
  chat.interrupt()
  chat.send("one")
  fake.answer("1")
  chat.interrupt()
  expect(fake.interrupts()).toBe(0)
})

test("a new conversation takes a second press; any other action in between cancels the first", () => {
  const fake = fakeAgent()
  const chat = createChatState(fake.agent)
  chat.send("one")
  chat.newConversation()
  expect(chat.clearPrompt()).toBe(NEW_CONVERSATION_PROMPT)
  chat.interrupt()
  expect(chat.clearPrompt()).toBeNull()
  chat.newConversation()
  chat.cancelNewConversation()
  expect(chat.clearPrompt()).toBeNull()
  chat.newConversation()
  chat.newConversation()
  expect([chat.entries.length, fake.closes(), chat.status(), chat.clearPrompt()]).toEqual([0, 1, "idle", null])
  chat.send("fresh")
  expect(fake.starts()).toBe(2)
})

test("a failure is an error note, holds the queue, and the next question opens a new session", () => {
  const fake = fakeAgent()
  const chat = createChatState(fake.agent)
  chat.send("one")
  chat.send("two")
  fake.events().failed({ kind: "not-logged-in" })
  expect([chat.status(), chat.paused(), fake.closes()]).toEqual(["failed", true, 1])
  expect(kinds(chat).at(-1)).toBe("N:error:Not logged in to Claude. Run `claude login`, then ask again.")
  expect(chat.activity()).toBeNull()
  chat.send("three")
  expect(fake.starts()).toBe(2)
  expect(fake.asked).toEqual(["one", "two"])
  expect(kinds(chat).filter((k) => k.endsWith(":waiting"))).toEqual(["Q:three:waiting"])
})

test("a read that failed is said as an info note", () => {
  const fake = fakeAgent()
  const chat = createChatState(fake.agent)
  chat.send("one")
  fake.events().readFailed("src/a.ts at head")
  expect(kinds(chat).at(-1)).toBe("N:info:Read failed: src/a.ts at head")
})

test("activity: thinking until the first words, then answering; none when idle", () => {
  const fake = fakeAgent()
  const chat = createChatState(fake.agent)
  expect(chat.activity()).toBeNull()
  chat.send("one")
  expect(chat.activity()).toMatchObject({ phase: "thinking", waiting: 0 })
  fake.events().text("Sh")
  expect(chat.activity()).toMatchObject({ phase: "answering", waiting: 0 })
  fake.answer("ort")
  expect(chat.activity()).toBeNull()
})

test("a question carries the position read when it is asked; none by default", () => {
  const plain = fakeAgent()
  createChatState(plain.agent).send("q")
  expect(plain.positions).toEqual([null])

  const fake = fakeAgent()
  const at = (label: string): Position => ({ path: label, excerpt: [], label })
  const [position, setPosition] = createSignal<Position | null>(at("a.ts:1"))
  const chat = createChatState(fake.agent, position)
  chat.send("one")
  setPosition(at("b.ts:2"))
  chat.send("two")
  setPosition(at("c.ts:3"))
  fake.answer("1")
  expect(fake.positions.map((p) => p?.label)).toEqual(["a.ts:1", "b.ts:2"])
})

test("dispose closes the session it opened", () => {
  const fake = fakeAgent()
  const chat = createChatState(fake.agent)
  chat.dispose()
  expect(fake.closes()).toBe(0)
  chat.send("one")
  chat.dispose()
  expect(fake.closes()).toBe(1)
})

test("@ tokens expand against the question's own position; the agent gets the attachments, the entry the labels", () => {
  const fake = fakeAgent()
  const where: Position = { path: "a.ts", excerpt: [], label: "a.ts:1" }
  const seen: Array<Position | null> = []
  const chat = createChatState(fake.agent, () => where, (text, position) => {
    seen.push(position)
    return { attachments: [`[${text}]`], labels: ["@file a.ts"] }
  })
  expect(chat.send("@file why")).toBe(true)
  expect(seen).toEqual([where])
  expect(fake.attachments).toEqual([["[@file why]"]])
  const question = chat.entries[0] as Extract<(typeof chat.entries)[number], { kind: "question" }>
  expect([question.text, [...question.labels]]).toEqual(["@file why", ["@file a.ts"]])
})

test("a token that names nothing sends nothing and leaves an error note", () => {
  const fake = fakeAgent()
  const chat = createChatState(fake.agent, () => null, () => ({ error: "@x.ts is not a file of this change." }))
  expect(chat.send("@x.ts why")).toBe(false)
  expect([fake.starts(), kinds(chat)]).toEqual([0, ["N:error:@x.ts is not a file of this change."]])
})

test("closing a session, by a new conversation or on the way out, is told to whoever listens; none open, nothing is", () => {
  const fake = fakeAgent()
  const chat = createChatState(fake.agent)
  let closed = 0
  chat.onSessionClosed(() => closed++)
  chat.dispose()
  expect(closed).toBe(0)
  chat.send("what?")
  chat.newConversation()
  chat.newConversation()
  expect([fake.closes(), closed]).toEqual([1, 1])
  chat.send("again?")
  chat.dispose()
  expect([fake.closes(), closed]).toEqual([2, 2])
})

test("a note riff writes for the agent's tools is an info note", () => {
  const chat = createChatState(fakeAgent().agent)
  chat.note("Proposed a comment on src/a.ts:2 — it is open in the thread panel.")
  expect(kinds(chat)).toEqual(["N:info:Proposed a comment on src/a.ts:2 — it is open in the thread panel."])
})
