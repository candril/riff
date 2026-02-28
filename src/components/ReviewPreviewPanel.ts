/**
 * Review preview panel - modal dialog for submitting reviews
 */

import { 
  BoxRenderable,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core"
import { theme } from "../theme"
import type { Comment } from "../types"
import type { ReviewPreviewState } from "../state"

export type ReviewEvent = "COMMENT" | "APPROVE" | "REQUEST_CHANGES"

export interface ReviewPreviewPanelOptions {
  renderer: CliRenderer
}

export class ReviewPreviewPanel {
  private renderer: CliRenderer
  private container: BoxRenderable
  private titleText: TextRenderable
  private _visible: boolean = false

  constructor(options: ReviewPreviewPanelOptions) {
    this.renderer = options.renderer

    // Overlay container (covers entire screen)
    this.container = new BoxRenderable(this.renderer, {
      id: "review-preview-overlay",
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      zIndex: 50,
      justifyContent: "center",
      alignItems: "center",
    })
    this.container.visible = false

    // Dim background
    const dimBg = new BoxRenderable(this.renderer, {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      backgroundColor: "#00000080",
    })
    this.container.add(dimBg)

    // Modal box
    const modal = new BoxRenderable(this.renderer, {
      width: 50,
      height: 10,
      backgroundColor: theme.mantle,
      flexDirection: "column",
      paddingX: 2,
      paddingY: 1,
    })

    this.titleText = new TextRenderable(this.renderer, {
      content: "Submit Review",
      fg: theme.text,
    })
    modal.add(this.titleText)

    const hint = new TextRenderable(this.renderer, {
      content: "Press Esc to close",
      fg: theme.overlay0,
    })
    modal.add(hint)

    this.container.add(modal)

    // Add to renderer root
    this.renderer.root.add(this.container)
  }

  get visible(): boolean {
    return this._visible
  }

  set visible(value: boolean) {
    this._visible = value
    this.container.visible = value
  }

  update(comments: Comment[], state: ReviewPreviewState): void {
    this.titleText.content = `Submit Review (${comments.length} comments)`
  }

  getContainer(): BoxRenderable {
    return this.container
  }
}
