import { RGBA, SyntaxStyle, type CliRenderer, type NativeResourceOwner } from "@opentui/core"
import { theme } from "../../theme"

export const chatColors = {
  background: theme.mantle,
  question: theme.blue,
  dim: theme.overlay0,
  placeholder: theme.overlay1,
  error: theme.red,
  text: theme.text,
  inputFocused: theme.surface0,
  inputIdle: theme.mantle,
}

// Tests run several renderers in one process, and a style dies with the renderer that owns it.
const styles = new WeakMap<NativeResourceOwner, SyntaxStyle>()

export function chatSyntaxStyle(renderer: CliRenderer): SyntaxStyle {
  const owner = renderer.nativeScene
  let style = styles.get(owner)
  if (!style) {
    const fg = (hex: string) => RGBA.fromHex(hex)
    style = SyntaxStyle.fromStyles(
      {
        keyword: { fg: fg(theme.mauve) },
        string: { fg: fg(theme.green) },
        comment: { fg: fg(theme.overlay0), italic: true },
        number: { fg: fg(theme.peach) },
        function: { fg: fg(theme.blue) },
        type: { fg: fg(theme.yellow) },
        "markup.heading": { fg: fg(theme.blue), bold: true },
        "markup.strong": { bold: true },
        "markup.italic": { italic: true },
        "markup.raw": { fg: fg(theme.green) },
        "markup.link": { fg: fg(theme.sapphire), underline: true },
        "markup.list": { fg: fg(theme.yellow) },
      },
      owner,
    )
    styles.set(owner, style)
  }
  return style
}
