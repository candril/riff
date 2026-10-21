import { RGBA, SyntaxStyle, type CliRenderer, type NativeResourceOwner } from "@opentui/core"
import { theme } from "../theme"
import { tableRenderer } from "./markdown-tables-in-markdown"
import type { PanelMarkdownStyle } from "./PanelMarkdown"

/** How the thread panel draws a comment body: tables that wrap, and its own syntax colours. */
export function threadPanelMarkdown(renderer: CliRenderer): PanelMarkdownStyle {
  return {
    renderNode: tableRenderer(renderer, () => renderer.width),
    syntaxStyle: getSyntaxStyle(renderer.nativeScene),
  }
}

// Tests run several renderers in one process, and a style dies with the renderer that owns it.
const syntaxStyles = new WeakMap<NativeResourceOwner, SyntaxStyle>()
function getSyntaxStyle(owner: NativeResourceOwner): SyntaxStyle {
  if (!syntaxStyles.has(owner)) {
    syntaxStyles.set(owner, SyntaxStyle.fromStyles({
      "markup.heading": { fg: RGBA.fromHex(theme.blue), bold: true },
      "markup.strong": { bold: true },
      "markup.italic": { italic: true },
      "markup.raw": { fg: RGBA.fromHex(theme.green) },
      "markup.strikethrough": { dim: true },
      "markup.link": { fg: RGBA.fromHex(theme.blue) },
      "markup.link.label": { fg: RGBA.fromHex(theme.blue), underline: true },
      "markup.link.url": { fg: RGBA.fromHex(theme.subtext0) },
      "markup.list": { fg: RGBA.fromHex(theme.yellow) },
      "punctuation.special": { fg: RGBA.fromHex(theme.subtext0), italic: true },
      "keyword": { fg: RGBA.fromHex(theme.mauve) },
      "string": { fg: RGBA.fromHex(theme.green) },
      "number": { fg: RGBA.fromHex(theme.peach) },
      "comment": { fg: RGBA.fromHex(theme.overlay0), italic: true },
      "function": { fg: RGBA.fromHex(theme.blue) },
      "type": { fg: RGBA.fromHex(theme.yellow) },
      "variable": { fg: RGBA.fromHex(theme.text) },
      "operator": { fg: RGBA.fromHex(theme.sky) },
      "punctuation": { fg: RGBA.fromHex(theme.overlay2) },
      "property": { fg: RGBA.fromHex(theme.lavender) },
      "constant": { fg: RGBA.fromHex(theme.peach) },
    }, owner))
  }
  return syntaxStyles.get(owner)!
}
