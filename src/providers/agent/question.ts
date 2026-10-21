import { formatForAgent, type Position } from "./position"

// The position and the attachments go first, so the question is the last thing the model reads.
export function questionText(question: string, position: Position | null, attachments: readonly string[]): string {
  return [...(position ? [formatForAgent(position)] : []), ...attachments, question].join("\n\n")
}
