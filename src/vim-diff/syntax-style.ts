import { RGBA, SyntaxStyle, type NativeResourceOwner } from "@opentui/core"
import { SYNTAX_PALETTE } from "../diff-rows/syntax-palette"

// Tests run several renderers in one process, and a style dies with the renderer that owns it.
const syntaxStyles = new WeakMap<NativeResourceOwner, SyntaxStyle>()

export function getSyntaxStyle(owner: NativeResourceOwner): SyntaxStyle {
  if (!syntaxStyles.has(owner)) {
    const styles = Object.fromEntries(
      Object.entries(SYNTAX_PALETTE).map(([capture, { fg, bg, ...attributes }]) => [
        capture,
        { ...attributes, fg: fg && RGBA.fromHex(fg), bg: bg && RGBA.fromHex(bg) },
      ])
    )
    syntaxStyles.set(owner, SyntaxStyle.fromStyles(styles, owner))
  }
  return syntaxStyles.get(owner)!
}
