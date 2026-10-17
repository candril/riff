/** What the help overlay shows beyond its fixed sections: the build, when there is one. */
export interface HelpOverlayModel {
  version?: string
}

export function helpOverlayModel(version: string | undefined): HelpOverlayModel {
  // Left out rather than undefined, so reconcile sees the same keys every pass.
  return version !== undefined ? { version } : {}
}
