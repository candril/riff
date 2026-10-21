import type { PromptModel } from "./open-prompt"
import { routePrompt, type PromptIsland, type PromptKey, type PromptOwner } from "./prompt-routing"

/**
 * Hands each frame's prompt to the island that draws it. What is typed goes
 * through `write`, given once here, so a frame carries no closures.
 */
export function createPromptFollower(
  islands: Record<PromptOwner, PromptIsland>,
  write: (key: PromptKey, value: string) => void
) {
  return {
    update(model: PromptModel | null): void {
      routePrompt(islands, model && { ...model, onChange: (value) => write(model.key, value) })
    },
  }
}
