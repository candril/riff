import { describe, expect, test } from "bun:test"
import { createPromptFollower } from "./prompt-follower"
import { promptOwners, type PromptIsland, type PromptKey, type PromptOwner } from "./prompt-routing"
import { createPromptSession, type PromptField, type PromptSession } from "./prompt-session"

function islands() {
  const sessions: [PromptOwner, PromptSession | null][] = []
  const record = Object.fromEntries(
    promptOwners.map((owner) => [owner, { prompt: (session: PromptSession | null) => void sessions.push([owner, session]) }])
  ) as unknown as Record<PromptOwner, PromptIsland>
  return { record, sessions }
}

describe("the prompt following the frame", () => {
  test("closes the other islands' prompts and hands the owner a session that writes through its key", () => {
    const { record, sessions } = islands()
    const written: [PromptKey, string][] = []
    const follower = createPromptFollower(record, (key, value) => void written.push([key, value]))

    follower.update({ key: "occurrence-picker:narrow", initialValue: "src", placeholder: "Narrow" })

    expect(sessions.slice(0, -1)).toEqual(
      promptOwners.filter((owner) => owner !== "occurrence-picker").map((owner) => [owner, null])
    )
    const [owner, session] = sessions.at(-1)!
    expect(owner).toBe("occurrence-picker")
    expect(session).toMatchObject({ key: "occurrence-picker:narrow", initialValue: "src", placeholder: "Narrow" })
    session!.onChange("src/app")
    expect(written).toEqual([["occurrence-picker:narrow", "src/app"]])
  })

  test("with no prompt open, every island's field is let go", () => {
    const { record, sessions } = islands()
    createPromptFollower(record, () => {}).update(null)
    expect(sessions).toEqual(promptOwners.map((owner) => [owner, null]))
  })

  test("a prompt that closes blurs its field", () => {
    const { record } = islands()
    const calls: string[] = []
    const field: PromptField = {
      value: "",
      placeholder: "",
      focus: () => void calls.push("focus"),
      blur: () => void calls.push("blur"),
    }
    const search = createPromptSession(() => field)
    const follower = createPromptFollower({ ...record, search: { prompt: search.sync } }, () => {})

    follower.update({ key: "search:forward:0:0", initialValue: "" })
    follower.update(null)
    expect(calls).toEqual(["focus", "blur"])
  })
})
