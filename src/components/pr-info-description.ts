import type { PrInfo } from "../providers/github"
import { extractCommentImages } from "../utils/comment-images"
import { reactionPills, type Segment } from "./pr-info-conversation-parts"

/**
 * What the PR info panel's description shows. `body` is null when the PR
 * says nothing; its text is empty when the body was only pictures, which are
 * named rather than drawn. `cursorLine` is the line under the cursor, when
 * the cursor is in the description and below its header.
 */
export interface DescriptionModel {
  body: { text: string; images: string[] } | null
  reactions: Segment[]
  cursorLine: number | null
}

export function descriptionModel(
  prInfo: Pick<PrInfo, "body" | "bodyReactions">,
  { cursor, active }: { cursor: number; active: boolean }
): DescriptionModel {
  const extracted = prInfo.body?.trim() ? extractCommentImages(prInfo.body) : null
  return {
    body: extracted && { text: extracted.text, images: extracted.images.map((image) => image.label) },
    reactions: reactionPills(prInfo.bodyReactions),
    cursorLine: active && cursor >= 0 ? cursor : null,
  }
}
