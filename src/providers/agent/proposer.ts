export interface CommentProposal {
  path: string
  line: number
  startLine?: number
  side: "new" | "old"
  text: string
}

// What the propose tools hand riff; each promise settles with what the reviewer did, for the agent.
export interface Proposer {
  proposeComment(proposal: CommentProposal): Promise<string>
}
