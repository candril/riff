import { createSdkMcpServer, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk"

export const SERVER = "riff"

export type AgentTool = SdkMcpToolDefinition<any>

// One per session, so the read budget lasts the session and startAnswer refills it per question.
export interface AgentToolset {
  definitions: readonly AgentTool[]
  startAnswer(): void
}

export function createToolServer(tools: readonly AgentTool[]) {
  return createSdkMcpServer({ name: SERVER, tools: [...tools] })
}

export function allowedToolsOf(tools: readonly AgentTool[]): string[] {
  return tools.map((tool) => `mcp__${SERVER}__${tool.name}`)
}
