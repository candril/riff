import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"
import type { Proposer } from "./proposer"
import type { AgentTool } from "./tool-server"

const asContent = (text: string) => ({ content: [{ type: "text" as const, text }] })

// No readOnlyHint: these open the reviewer's composer, and a call waits until the reviewer decides.
const always = { alwaysLoad: true }

const draft =
  "One or two short sentences of plain technical English in the reviewer's voice: the problem and the fix. Code in a suggestion block or a `path:line` reference. Longer only when the reviewer asked for it."
const grounded = "Draft only from code you have read; if unsure, ask the reviewer instead."

export function proposeToolDefinitions(proposer: Proposer): AgentTool[] {
  return [
    tool(
      "propose_comment",
      `Propose a comment on a line or range of the diff, only when the reviewer asked for comments, and one at a time. riff opens it in the reviewer's comment composer, where they edit, save, publish or drop it; returns what they did. ${grounded}`,
      {
        path: z.string().describe("Path as in the file list"),
        line: z.number().int().describe("Line number on that side; the last line of a range"),
        startLine: z.number().int().optional().describe("First line of a range, in the same hunk"),
        side: z.enum(["new", "old"]).describe("new for added and context lines, old for removed"),
        text: z.string().describe(draft),
      },
      async (proposal) => asContent(await proposer.proposeComment(proposal)),
      always,
    ),
    tool(
      "propose_edit",
      `Propose new wording for one of the reviewer's own comments, by the id list_comments gives, only when the reviewer asked for it. riff opens the comment in edit mode in their composer, with your wording; returns what they did. ${grounded}`,
      {
        id: z.string().describe("Comment id from list_comments"),
        text: z.string().describe(`The whole new wording. ${draft}`),
      },
      async ({ id, text }) => asContent(await proposer.proposeEdit(id, text)),
      always,
    ),
  ] as AgentTool[]
}
