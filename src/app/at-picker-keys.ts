import type { RiffKeymap } from "./keymap"
import { anyModifiers } from "./key-variants"

/** A picker an input opens, as its keys see it. */
export interface InputPicker {
  open(): boolean
  matches(): number
  close(): void
  move(delta: 1 | -1): void
  accept(): void
}

export interface AtPickerLayer {
  /** Commands are named `<prefix>.close`, `.up`, `.down` and `.accept`. */
  prefix: string
  category: string
  /** Whether the input that opened the picker holds the keys; the layer is live only while it does and the picker is up. */
  holds: () => boolean
  picker: InputPicker
  /** Runs before each of the picker's keys, for what the input's own keys also do on every press. */
  onKey?: () => void
}

/**
 * The keys of every picker an input opens (specs 082, 102): two pickers
 * that behave differently would be two things to remember. Registered
 * after the input's own layer, so it outranks it while the picker is up.
 */
export function registerAtPickerLayer(riffKeymap: RiffKeymap, layer: AtPickerLayer): () => void {
  const { prefix, picker } = layer
  const command = (name: string, title: string, run: () => void) => ({
    name: `${prefix}.${name}`,
    title,
    category: layer.category,
    palette: false as const,
    run: () => {
      layer.onKey?.()
      run()
    },
  })
  const move = (delta: 1 | -1) => () => {
    if (picker.matches() > 0) picker.move(delta)
  }
  return riffKeymap.keymap.registerLayer({
    enabled: () => layer.holds() && picker.open(),
    commands: [
      command("close", "Close the picker, keeping the draft", () => picker.close()),
      command("up", "Select the previous match", move(-1)),
      command("down", "Select the next match", move(1)),
      // Only with something to accept: with no match the key is the
      // input's, so Enter saves or sends and Tab types.
      { ...command("accept", "Accept the match", () => picker.accept()), enabled: () => picker.matches() > 0 },
    ],
    bindings: [
      ...anyModifiers("escape", `${prefix}.close`),
      ...anyModifiers("up", `${prefix}.up`),
      ...anyModifiers("ctrl+p", `${prefix}.up`),
      ...anyModifiers("down", `${prefix}.down`),
      ...anyModifiers("ctrl+n", `${prefix}.down`),
      ...anyModifiers("tab", `${prefix}.accept`),
      ...anyModifiers("ctrl+y", `${prefix}.accept`),
      ...anyModifiers("return", `${prefix}.accept`),
      ...anyModifiers("enter", `${prefix}.accept`),
    ],
  })
}
