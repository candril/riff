import type { Comment } from "../types"

/**
 * Two conversations on one line, both on GitHub, as on isomorph#12103: an
 * older thread with a reply, then a newer thread with its own. The newer
 * thread's reply comes last, which is where a reply that goes by the line
 * ends up.
 */
export function twoThreadsOn(filename: string, line: number): Comment[] {
  const comment = (id: string, day: number, fields: Partial<Comment>): Comment => ({
    id,
    filename,
    line,
    side: "RIGHT",
    body: id,
    createdAt: `2026-01-0${day}T00:00:00Z`,
    status: "synced",
    ...fields,
  })
  return [
    comment("older", 1, { body: "older thread", author: "ana", githubId: 4442935764 }),
    comment("older-reply", 2, { body: "older reply", author: "bo", inReplyTo: "older", githubId: 4442935800 }),
    comment("newer", 3, { body: "newer thread", author: "cy", githubId: 4442940918 }),
    comment("newer-reply", 4, { body: "newer reply", author: "di", inReplyTo: "newer", githubId: 4442941000 }),
  ]
}
