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
  /** New wording for one of the reviewer's own comments, by the id list_comments gives. */
  proposeEdit(id: string, text: string): Promise<string>
}
