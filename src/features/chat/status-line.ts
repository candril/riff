import type { Activity } from "./state"

const seconds = (startedAt: number, now: number) => Math.max(0, Math.floor((now - startedAt) / 1000))

export function activityText(activity: Activity, now: number): string {
  const waiting = activity.waiting > 0 ? ` · ${activity.waiting} waiting` : ""
  return `${activity.phase} ${seconds(activity.startedAt, now)}s${waiting}`
}

/** The one line above the input: what the agent is doing, else a pending confirmation, else nothing. */
export function statusLineText(activity: Activity | null, clearPrompt: string | null, now: number): string {
  if (clearPrompt !== null) return clearPrompt
  return activity ? activityText(activity, now) : ""
}
