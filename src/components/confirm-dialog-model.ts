/** What the confirm dialog shows; its callbacks stay in its factory, where the keys read them. */
export interface ConfirmDialogModel {
  title: string
  message: string
  details?: string
  alternative?: ConfirmAlternativeModel
}

export interface ConfirmAlternativeModel {
  key: string
  label: string
  details?: string
}

export function confirmDialogModel({
  title,
  message,
  details,
  alternative,
}: ConfirmDialogModel): ConfirmDialogModel {
  // Left out rather than undefined, so reconcile sees the same keys every pass.
  return {
    title,
    message,
    ...(details !== undefined ? { details } : {}),
    ...(alternative ? { alternative: alternativeModel(alternative) } : {}),
  }
}

function alternativeModel({ key, label, details }: ConfirmAlternativeModel): ConfirmAlternativeModel {
  return details !== undefined ? { key, label, details } : { key, label }
}
