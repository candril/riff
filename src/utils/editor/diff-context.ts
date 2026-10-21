/** Diff rows around an anchor, for the comment buffer's context section. */

/**
 * Extract context hunk around target line (+/- contextLines).
 * Returns visible diff lines centered on the target.
 */
export function extractContextHunk(diffContent: string, targetLine: number, contextLines: number = 5): string {
  const lines = diffContent.split("\n")
  
  // Build list of visible lines with their raw indices
  const visibleLines: { raw: number; content: string }[] = []
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ""
    
    // Skip header lines - these aren't visible in diff view
    if (line.startsWith("diff ")) continue
    if (line.startsWith("index ")) continue
    if (line.startsWith("---") && line.includes("/")) continue
    if (line.startsWith("+++") && line.includes("/")) continue
    if (line.startsWith("new file")) continue
    if (line.startsWith("deleted file")) continue
    if (line.startsWith("old mode")) continue
    if (line.startsWith("new mode")) continue
    if (line.startsWith("similarity index")) continue
    if (line.startsWith("rename from")) continue
    if (line.startsWith("rename to")) continue
    if (line.startsWith("Binary files")) continue
    
    visibleLines.push({ raw: i, content: line })
  }
  
  // targetLine is 1-indexed, convert to 0-indexed in visibleLines
  const targetIdx = targetLine - 1
  
  // Get range centered on target
  const start = Math.max(0, targetIdx - contextLines)
  const end = Math.min(visibleLines.length, targetIdx + contextLines + 1)
  
  return visibleLines.slice(start, end).map(v => v.content).join("\n")
}
