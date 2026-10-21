import { $ } from "bun"
import { safeJson } from "./exec"

const MENTIONABLE_PAGES = 3

/**
 * Fetch the users GitHub would accept as @mentions in this repo — the same
 * pool its own comment box autocompletes from (contributors + collaborators).
 *
 * Best-effort: returns an empty list when the call fails (offline, no access),
 * because the caller falls back to the participants it derived from the PR.
 *
 * Capped at MENTIONABLE_PAGES pages: the pool is a convenience list that gets
 * fuzzy-filtered down to a handful of visible rows, so exhausting a repo with
 * thousands of contributors would cost round-trips nobody benefits from.
 */
export async function getMentionableUsers(
  owner: string,
  repo: string,
): Promise<string[]> {
  const query = `query($owner:String!,$repo:String!,$cursor:String){
    repository(owner:$owner,name:$repo){
      mentionableUsers(first:100,after:$cursor){
        nodes{login}
        pageInfo{hasNextPage endCursor}
      }
    }
  }`

  const logins: string[] = []
  let cursor: string | null = null

  for (let page = 0; page < MENTIONABLE_PAGES; page++) {
    const cursorArgs = cursor ? ["-F", `cursor=${cursor}`] : []
    const result = await $`gh api graphql -f query=${query} -F owner=${owner} -F repo=${repo} ${cursorArgs}`
      .quiet()
      .nothrow()
    if (result.exitCode !== 0) break

    const parsed = safeJson(result.stdout.toString()) as {
      data?: { repository?: { mentionableUsers?: {
        nodes?: { login?: string }[]
        pageInfo?: { hasNextPage?: boolean; endCursor?: string }
      } } }
    } | null

    const page_ = parsed?.data?.repository?.mentionableUsers
    if (!page_) break

    for (const node of page_.nodes ?? []) {
      if (node.login) logins.push(node.login)
    }

    if (!page_.pageInfo?.hasNextPage || !page_.pageInfo.endCursor) break
    cursor = page_.pageInfo.endCursor
  }

  return logins
}

/**
 * Ask GitHub for mentionable users matching `query`. This is the escape hatch
 * for orgs bigger than the prefetch cap: the roster riff caches is a prefix of
 * the repo's mentionable users, so someone who has never touched this repo
 * won't be in it, but they will be here.
 *
 * GitHub matches the fragment against both login and display name, so
 * "koeck" finds `hkoeck` as well as a user named "Koeck".
 */
export async function searchMentionableUsers(
  owner: string,
  repo: string,
  query: string,
): Promise<string[]> {
  // The variable is `q`, not `query`: `gh api graphql` uses `query` for the
  // document itself, so a variable of that name silently replaces it.
  const gql = `query($owner:String!,$repo:String!,$q:String!){
    repository(owner:$owner,name:$repo){
      mentionableUsers(first:20,query:$q){
        nodes{login}
      }
    }
  }`

  const result = await $`gh api graphql -f query=${gql} -F owner=${owner} -F repo=${repo} -F q=${query}`
    .quiet()
    .nothrow()
  if (result.exitCode !== 0) return []

  const parsed = safeJson(result.stdout.toString()) as {
    data?: { repository?: { mentionableUsers?: { nodes?: { login?: string }[] } } }
  } | null

  return (parsed?.data?.repository?.mentionableUsers?.nodes ?? [])
    .map((n) => n.login)
    .filter((login): login is string => Boolean(login))
}
