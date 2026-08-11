/**
 * Mentions Feature
 *
 * Background fetch of the repo's @mention pool. The picker itself lives in
 * the inline comment overlay; `utils/mentions.ts` assembles the candidates.
 */

export { startMentionPrefetch, type MentionPrefetchContext } from "./prefetch"
export { requestMentionSearch, type MentionSearchContext } from "./search"
