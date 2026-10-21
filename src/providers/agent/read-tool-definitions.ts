import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"
import type { AgentEvents } from "./agent"
import { createReadTools, type ReadTools, type ToolResult } from "./read-tools"
import type { ReviewSource } from "./review-source"
import type { AgentTool, AgentToolset } from "./tool-server"

const asContent = (result: ToolResult) => ({
  content: [{ type: "text" as const, text: result.text }],
  isError: result.isError,
})

const offset = z.number().int().min(0).optional().describe("Line to start from when paging")
const path = z.string().describe("Path as in the file list")

// alwaysLoad: without it the model spends a round trip on ToolSearch before its first read.
const always = { alwaysLoad: true, annotations: { readOnlyHint: true } }

export function readToolDefinitions(tools: ReadTools): AgentTool[] {
  // Each handler is typed by its own schema, which the server's one tool type cannot express.
  return [
    tool(
      "list_files",
      "List the changed files with status and +/- counts, optionally under one directory.",
      { dir: z.string().optional().describe("Directory path, without trailing slash") },
      async ({ dir }) => asContent(await tools.listFiles(dir)),
      always,
    ),
    tool(
      "list_hunks",
      "List the hunks of one changed file: index and @@ header.",
      { path },
      async ({ path }) => asContent(await tools.listHunks(path)),
      always,
    ),
    tool(
      "read_diff",
      "Read the diff of one changed file, or one hunk of it. Lines carry old and new numbers.",
      {
        path,
        hunk: z.number().int().min(0).optional().describe("Hunk index from list_hunks"),
        offset,
      },
      async ({ path, hunk, offset }) => asContent(await tools.readDiff(path, hunk, offset)),
      always,
    ),
    tool(
      "read_file",
      "Read any file of the repository, changed or not, at the review's head or base.",
      {
        path: z.string().describe("Repository path"),
        side: z.enum(["head", "base"]).describe("head: after the change; base: before it"),
        offset,
      },
      async ({ path, side, offset }) => asContent(await tools.readFile(path, side, offset)),
      always,
    ),
    tool(
      "list_tree",
      "List the repository's paths at head, optionally under one directory, to find a file.",
      { dir: z.string().optional().describe("Directory path, without trailing slash"), offset },
      async ({ dir, offset }) => asContent(await tools.listTree(dir, offset)),
      always,
    ),
    tool(
      "list_threads",
      "List the review's threads: id, place, open or resolved, first author and first line.",
      { offset },
      async ({ offset }) => asContent(await tools.listThreads(offset)),
      always,
    ),
    tool(
      "read_thread",
      "Read every comment of one review thread, by the id list_threads gives.",
      { id: z.string().describe("Thread id from list_threads"), offset },
      async ({ id, offset }) => asContent(await tools.readThread(id, offset)),
      always,
    ),
    tool(
      "list_comments",
      "List the reviewer's own comments that are not on GitHub as written: id, place, text.",
      { offset },
      async ({ offset }) => asContent(await tools.listComments(offset)),
      always,
    ),
  ] as AgentTool[]
}

export function readToolset(source: ReviewSource, events: Pick<AgentEvents, "readFailed">): AgentToolset {
  const tools = createReadTools(source, (what) => events.readFailed(what))
  return { definitions: readToolDefinitions(tools), startAnswer: tools.startAnswer }
}
