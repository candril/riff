import { expect, test } from "bun:test"
import { Inbox } from "./inbox"

const settle = () => new Promise((r) => setTimeout(r, 5))

test("questions arrive in order, the iterator waits between them and ends on close", async () => {
  const inbox = new Inbox()
  const seen: string[] = []
  const done = (async () => {
    for await (const message of inbox) {
      seen.push(message.message.content as string)
    }
    seen.push("end")
  })()
  inbox.push("one")
  inbox.push("two")
  await settle()
  expect(seen).toEqual(["one", "two"])
  inbox.push("three")
  await settle()
  expect(seen).toEqual(["one", "two", "three"])
  inbox.close()
  await done
  expect(seen).toEqual(["one", "two", "three", "end"])
})
