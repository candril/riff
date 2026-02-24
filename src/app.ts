import { createCliRenderer, Text, type KeyEvent, type ScrollBoxRenderable } from "@opentui/core"
import { Shell, DiffView, getScrollBox } from "./components"
import { getLocalDiff, getDiffDescription } from "./providers/local"
import { colors } from "./theme"

export interface AppOptions {
  target?: string
}

export async function createApp(options: AppOptions = {}) {
  const { target } = options

  // Get diff content
  let diff: string
  let description: string
  let error: string | null = null

  try {
    diff = await getLocalDiff(target)
    description = await getDiffDescription(target)
  } catch (err) {
    diff = ""
    description = "Error"
    error = err instanceof Error ? err.message : "Unknown error"
  }

  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
  })

  // Build status hints based on whether we have content
  const hints = diff.trim()
    ? ["j/k: scroll", "Ctrl+d/u: page", "q: quit"]
    : ["q: quit"]

  // Initial render
  renderer.root.add(
    Shell({
      header: {
        title: "neoriff",
        subtitle: description,
      },
      statusBar: { hints },
      children: error
        ? Text({ content: `Error: ${error}`, fg: colors.error })
        : DiffView({ diff }),
    })
  )

  // Get scroll box reference for keyboard navigation
  let scrollBox: ScrollBoxRenderable | null = null

  // Need to wait a tick for the DOM to be built
  setTimeout(() => {
    scrollBox = getScrollBox(renderer)
  }, 0)

  function quit() {
    renderer.destroy()
    process.exit(0)
  }

  // Keyboard handling
  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    switch (key.name) {
      case "q":
        quit()
        break
      case "j":
      case "down":
        scrollBox?.scrollBy(1)
        break
      case "k":
      case "up":
        scrollBox?.scrollBy(-1)
        break
      case "d":
        if (key.ctrl) {
          // Half page down - use renderer height as approximation
          const height = renderer.height ?? 20
          scrollBox?.scrollBy(Math.floor(height / 2))
        }
        break
      case "u":
        if (key.ctrl) {
          // Half page up
          const height = renderer.height ?? 20
          scrollBox?.scrollBy(-Math.floor(height / 2))
        }
        break
      case "g":
        // Go to top (simplified - full implementation would need sequence support)
        scrollBox?.scrollTo(0)
        break
      case "G":
        // Go to bottom
        if (key.shift) {
          const scrollHeight = scrollBox?.scrollHeight ?? 0
          scrollBox?.scrollTo(scrollHeight)
        }
        break
    }
  })

  return {
    renderer,
    quit,
  }
}
