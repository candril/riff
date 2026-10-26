import { describe, expect, test } from "bun:test"
import { proposeToolDefinitions } from "./propose-tool-definitions"
import type { Proposer } from "./proposer"

const proposer: Proposer = { proposeComment: async () => "", proposeEdit: async () => "" }
const tools = proposeToolDefinitions(proposer)

describe.each(["propose_comment", "propose_edit"])("%s", (name) => {
  const definition = tools.find((t) => t.name === name)!

  test("drafts only from code it has read, and asks when unsure", () => {
    expect(definition.description).toContain("Draft only from code you have read")
    expect(definition.description).toContain("if unsure, ask the reviewer instead")
  })

  test("its text is one direct sentence in the reviewer's voice, code as a suggestion or path:line", () => {
    const text: string = definition.inputSchema.text.description
    expect(text).toContain("One direct sentence in the reviewer's voice, two at most")
    expect(text).toContain("an imperative or a plain statement, never a request")
    expect(text).toContain('no "Could you", "Would you mind" or "Maybe"')
    expect(text).toContain("no please or thanks")
    expect(text).toContain("no justification or background unless the reviewer asked for it")
    expect(text).toContain("Code in a suggestion block or a `path:line` reference")
  })
})
