import { $ } from "bun"
import { extractShellError, getCurrentUser } from "./exec"
import type { SubmitResult } from "./mutations"
import type { PendingReview } from "./types"
import type { Comment } from "../../types"

type ReviewEvent = "COMMENT" | "APPROVE" | "REQUEST_CHANGES"

/**
 * The current user's pending (draft) review on a PR, or null.
 */
export async function getPendingReview(
  owner: string,
  repo: string,
  prNumber: number
): Promise<PendingReview | null> {
  try {
    const currentUser = await getCurrentUser()
    if (currentUser === "@you") {
      return null
    }

    const reviews = await $`gh api --paginate repos/${owner}/${repo}/pulls/${prNumber}/reviews`.json() as any[]

    const pendingReview = reviews.find(
      (r: any) => r.state === "PENDING" && r.user?.login === currentUser
    )

    if (!pendingReview) {
      return null
    }

    const reviewComments = await $`gh api --paginate repos/${owner}/${repo}/pulls/${prNumber}/reviews/${pendingReview.id}/comments`.json() as any[]

    return {
      id: pendingReview.id,
      user: currentUser,
      body: pendingReview.body || "",
      comments: reviewComments.map((c: any) => ({
        id: c.id,
        body: c.body,
        path: c.path,
        // GitHub returns line/original_line for absolute line numbers,
        // or position/original_position for diff hunk position
        line: c.line || c.original_line || c.position || c.original_position || 0,
        side: (c.side || "RIGHT") as "LEFT" | "RIGHT",
        inReplyToId: c.in_reply_to_id,
      })),
    }
  } catch {
    // Silently fail - pending review detection is not critical
    return null
  }
}

async function submitExistingReview(
  owner: string,
  repo: string,
  prNumber: number,
  reviewId: number,
  event: ReviewEvent,
  body: string = ""
): Promise<SubmitResult> {
  try {
    const result = await $`gh api -X POST repos/${owner}/${repo}/pulls/${prNumber}/reviews/${reviewId}/events \
      -f event=${event} \
      -f body=${body}`.json() as { id: number; html_url: string }

    return {
      success: true,
      githubId: result.id,
      githubUrl: result.html_url,
    }
  } catch (err) {
    return {
      success: false,
      error: extractShellError(err),
    }
  }
}

/**
 * One comment as GitHub's review API wants it. A comment that spans lines
 * carries `start_line`, which is what makes a suggestion replace the block
 * it was written against rather than its last line (spec 076).
 */
function reviewComment(comment: Comment): Record<string, unknown> {
  const range = commentRange(comment)
  return {
    path: comment.filename,
    line: comment.line,
    side: comment.side,
    body: comment.body,
    ...(range ? { start_line: range.startLine, start_side: range.startSide } : {}),
  }
}

/**
 * The range a comment spans, or nothing when it is a single line. GitHub
 * rejects a range whose start is its end, so an equal pair is no range.
 */
export function commentRange(
  comment: Comment,
): { startLine: number; startSide: "LEFT" | "RIGHT" } | undefined {
  if (!comment.startLine || comment.startLine >= comment.line) return undefined
  return { startLine: comment.startLine, startSide: comment.side }
}

export function reviewPayload(
  commitSha: string,
  event: ReviewEvent,
  body: string,
  comments: Comment[],
): string {
  return JSON.stringify({
    commit_id: commitSha,
    event,
    body,
    comments: comments.map(reviewComment),
  })
}

/**
 * Submit the local comments as one review.
 *
 * GitHub allows a user a single pending review per PR, so one started on
 * github.com has to be submitted, carrying the chosen verdict and body,
 * before riff can create its own. The local comments then follow as a
 * second review that is always COMMENT: the verdict already landed on the
 * pending review, and repeating it would approve or request changes twice.
 */
export async function submitReview(
  owner: string,
  repo: string,
  prNumber: number,
  comments: Comment[],
  commitSha: string,
  event: ReviewEvent = "COMMENT",
  body: string = "",
  pendingReviewId?: number
): Promise<SubmitResult> {
  try {
    if (pendingReviewId) {
      const pendingResult = await submitExistingReview(
        owner, repo, prNumber, pendingReviewId, event, body
      )
      if (!pendingResult.success) {
        return pendingResult
      }

      if (comments.length > 0) {
        const payload = reviewPayload(commitSha, "COMMENT", "", comments)

        const result = await $`echo ${payload} | gh api repos/${owner}/${repo}/pulls/${prNumber}/reviews --method POST --input -`.json() as { id: number; html_url: string }

        return {
          success: true,
          githubId: result.id,
          githubUrl: result.html_url,
        }
      }

      return pendingResult
    }

    const payload = reviewPayload(commitSha, event, body, comments)

    const result = await $`echo ${payload} | gh api repos/${owner}/${repo}/pulls/${prNumber}/reviews --method POST --input -`.json() as { id: number; html_url: string }

    return {
      success: true,
      githubId: result.id,
      githubUrl: result.html_url,
    }
  } catch (err) {
    return {
      success: false,
      error: extractShellError(err),
    }
  }
}
