import { createCliRenderer, type CliRenderer, type InputRenderable, type KeyEvent } from "@opentui/core"
import { render, useTerminalDimensions } from "@opentui/solid"
import { createEffect } from "solid-js"
import { openPrModel } from "../components/open-pr-model"
import { OPEN_PR_WIDTH, OpenPrScreen } from "../components/OpenPrScreen"
import { createOpenPrState, type OpenPrChoice, type OpenPrDeps } from "../features/open-pr/state"
import { version } from "../version"

export type OpenPrOutcome = { kind: "pr"; choice: OpenPrChoice } | { kind: "local" } | { kind: "quit" }

export interface OpenPrScreenDeps extends Omit<OpenPrDeps, "onChoose"> {
  hasLocalReview: boolean
  /** Why the screen is showing, when that is news: `--open` needs no explaining. */
  nothingHere: string | null
}

/** The whole screen as a tree, with its keys, for a renderer someone else owns and destroys. */
export function openPrTree(renderer: CliRenderer, deps: OpenPrScreenDeps, settle: (outcome: OpenPrOutcome) => void) {
  const state = createOpenPrState({ ...deps, onChoose: (choice) => settle({ kind: "pr", choice }) })
  let field: InputRenderable | undefined

  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    if (key.name === "escape") {
      if (!state.back()) settle({ kind: deps.hasLocalReview ? "local" : "quit" })
      return
    }
    if (!state.pick()) return
    if (key.name === "return") state.choose()
    else if (key.name === "j" || key.name === "down" || (key.ctrl && key.name === "n")) state.move(1)
    else if (key.name === "k" || key.name === "up" || (key.ctrl && key.name === "p")) state.move(-1)
  })

  return () => {
    const dimensions = useTerminalDimensions()
    const width = () => Math.min(OPEN_PR_WIDTH, Math.max(dimensions().width - 4, 20))

    // Blurred under the list, whose j and k would otherwise land in it.
    createEffect(() => {
      if (state.pick()) field?.blur()
      else field?.focus()
    })

    return (
      <OpenPrScreen
        width={width()}
        version={version}
        nothingHere={deps.nothingHere}
        model={openPrModel({
          current: deps.current,
          hasLocalReview: deps.hasLocalReview,
          error: state.error(),
          checking: state.checking(),
          pick: state.pick(),
          highlight: state.highlight(),
          width: width(),
        })}
        inputRef={(node) => {
          field = node
          node.focus()
        }}
        onInput={state.edited}
        onSubmit={() => state.submit(field?.value ?? "")}
      />
    )
  }
}

export async function runOpenPrScreen(deps: OpenPrScreenDeps): Promise<OpenPrOutcome> {
  const renderer = await createCliRenderer({ exitOnCtrlC: true })
  return new Promise((resolve) => {
    // Ctrl-c destroys the renderer on its own, and so does settling, which by then has answered.
    renderer.once("destroy", () => resolve({ kind: "quit" }))
    const settle = (outcome: OpenPrOutcome) => {
      resolve(outcome)
      renderer.destroy()
    }
    void render(openPrTree(renderer, deps, settle), renderer)
  })
}
