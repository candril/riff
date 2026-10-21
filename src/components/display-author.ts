/**
 * Comments written offline are stored with the placeholder author `@you`,
 * already `@`-prefixed, while GitHub logins are bare. Prefixing blindly
 * rendered the local ones as `@@you`.
 */
export function displayAuthor(author: string): string {
  return author.startsWith("@") ? author : `@${author}`
}
