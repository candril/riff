import { createCliRenderer, Text, type KeyEvent } from "@opentui/core"
import { Shell } from "./components"

export async function createApp() {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
  })

  // Initial render
  renderer.root.add(
    Shell({
      header: { title: "neoriff" },
      statusBar: { hints: ["q: quit", "?: help"] },
      children: Text({
        content: "Welcome to neoriff - a code review companion",
        fg: "#a9b1d6",
      }),
    })
  )

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
    }
  })

  return {
    renderer,
    quit,
  }
}
