import { theme } from "../theme"

// Just under what a comment, the dimmest syntax colour, has on the plain diff: dim text
// reads the same on any background, and nothing on the plain diff changes.
const MIN_CONTRAST = 3.3
const LIFT_STEP = 0.05

const channels = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16))

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((channel) => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

/** The WCAG contrast ratio of two `#rrggbb` colours. */
export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light! + 0.05) / (dark! + 0.05)
}

function towardsText(fg: string, amount: number): string {
  const to = channels(theme.text)
  const mixed = channels(fg).map((from, i) => Math.round(from + (to[i]! - from) * amount))
  return "#" + mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")
}

const legible = new Map<string, string>()

/** `fg` as is where it reads on `bg`, otherwise moved towards the text colour only as far as it takes. */
export function legibleOn(fg: string, bg: string): string {
  const key = fg + bg
  const cached = legible.get(key)
  if (cached) return cached
  let lifted = fg
  for (let amount = LIFT_STEP; contrast(lifted, bg) < MIN_CONTRAST && amount <= 1; amount += LIFT_STEP) {
    lifted = towardsText(fg, amount)
  }
  legible.set(key, lifted)
  return lifted
}
