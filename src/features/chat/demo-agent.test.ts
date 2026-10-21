import { expect, test } from "bun:test"
import { createChatState } from "./state"
import { DEMO_REPLY, demoAgent } from "./demo-agent"

const until = async (done: () => boolean) => {
  for (let i = 0; i < 200 && !done(); i++) await Bun.sleep(1)
}

test("streams its fixed reply to every question", async () => {
  const chat = createChatState(demoAgent(DEMO_REPLY, 0))
  chat.send("hi there")
  expect(chat.status()).toBe("answering")
  await until(() => chat.status() === "idle")
  chat.send("again")
  await until(() => chat.status() === "idle")
  const answers = chat.entries.filter((e) => e.kind === "answer").map((e) => e.text)
  expect(answers).toEqual([DEMO_REPLY, DEMO_REPLY])
})

test("an interrupt ends the reply where it was", async () => {
  const chat = createChatState(demoAgent("one two three four", 5))
  chat.send("q")
  await until(() => chat.activity()?.phase === "answering")
  chat.interrupt()
  const answer = chat.entries[1]!
  expect(answer.kind === "answer" && answer.interrupted).toBe(true)
  expect(answer.kind === "answer" && answer.text.length).toBeLessThan("one two three four".length)
  expect(chat.status()).toBe("idle")
})
