import { createSdkMcpServer, type SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk"

export const SERVER = "riff"

// Each definition is built with `alwaysLoad: true`: without it the model spends a round trip on
// ToolSearch before its first read.
export type AgentTool = SdkMcpToolDefinition<any>

export function createToolServer(tools: readonly AgentTool[]) {
  return createSdkMcpServer({ name: SERVER, tools: [...tools] })
}

export function allowedToolsOf(tools: readonly AgentTool[]): string[] {
  return tools.map((tool) => `mcp__${SERVER}__${tool.name}`)
}
