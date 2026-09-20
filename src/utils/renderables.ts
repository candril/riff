/**
 * Dropping renderables riff is done with.
 *
 * OpenTUI's `remove(id)` only unlinks a child from its parent. What the
 * renderable holds stays alive until `destroy()` runs: native text buffers,
 * a yoga node, and — for a ScrollBox — a `selection` listener on the
 * renderer, which is what put a MaxListenersExceededWarning on screen once
 * eleven of them had piled up.
 */

import type { Renderable } from "@opentui/core"

const KEEP_ALIVE = Symbol.for("riff.keepAlive")

/**
 * Mark a renderable that outlives the render pass mounting it — the prompt
 * fields, the composers, the panels that keep their own state. `discard`
 * unmounts these rather than destroying them, so the next pass can mount
 * them again.
 */
export function keepAlive<T extends Renderable>(renderable: T): T {
  ;(renderable as unknown as Record<symbol, boolean>)[KEEP_ALIVE] = true
  return renderable
}

/**
 * Drop a renderable and everything under it. Kept-alive descendants are
 * unmounted on the way down and survive with their own subtrees intact.
 *
 * The subtree goes through OpenTUI's own `destroyRecursively`: renderables
 * that own children they refuse to have removed (a LineNumberRenderable and
 * its gutter) only allow it from there.
 */
export function discard(node: Renderable): void {
  if (isKeptAlive(node)) {
    node.parent?.remove(node)
    return
  }
  unmountKeptAlive(node)
  node.destroyRecursively()
}

/** Drop every child of a container, leaving the container itself. */
export function discardChildren(node: Renderable): void {
  for (const child of node.getChildren()) {
    discard(child)
  }
}

function isKeptAlive(node: Renderable): boolean {
  return (node as unknown as Record<symbol, boolean>)[KEEP_ALIVE] === true
}

function unmountKeptAlive(node: Renderable): void {
  for (const child of node.getChildren()) {
    if (isKeptAlive(child)) node.remove(child)
    else unmountKeptAlive(child)
  }
}
