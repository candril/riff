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

  test("its text is one or two short sentences: problem and fix, code as a suggestion or path:line", () => {
    const text: string = definition.inputSchema.text.description
    expect(text).toContain("One or two short sentences")
    expect(text).toContain("the problem and the fix")
    expect(text).toContain("Code in a suggestion block or a `path:line` reference")
  })
})
