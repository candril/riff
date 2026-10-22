import { expect, onTestFinished } from "bun:test"
import type { AppKeys } from "../app/keys"

/**
 * Fails the running test on any error the keymap swallowed. The keymap
 * catches a throwing `enabled` or command and only logs it, so a key
 * context that throws on fields it does not list would quietly switch a
 * whole layer off and the test would go on passing against a keymap riff
 * never runs. Call it inside a test.
 */
export function failOnKeymapErrors(keys: AppKeys): AppKeys {
  const errors: string[] = []
  keys.keymap.on("error", ({ code, error }) => {
    errors.push(`${code}: ${error instanceof Error ? error.message : String(error)}`)
  })
  onTestFinished(() => expect(errors).toEqual([]))
  return keys
}
