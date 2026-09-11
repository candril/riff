/**
 * Emoji by shortcode in the comment composer (spec 082).
 *
 * `:` and a couple of letters is how everyone writes an emoji on GitHub,
 * and riff's composer is the one place in a review where the habit turns
 * into a literal colon and a word. The list is the shortcodes people
 * actually reach for in a review — approval, alarm, the thing that broke —
 * rather than every emoji there is: a picker you scroll is a picker you
 * stop using.
 */

export interface Emoji {
  /** The shortcode, without its colons. */
  name: string
  char: string
  /** Other words that should find it. */
  keywords?: string[]
}

export const EMOJI: readonly Emoji[] = [
  { name: "+1", char: "👍", keywords: ["thumbsup", "yes", "approve", "lgtm"] },
  { name: "-1", char: "👎", keywords: ["thumbsdown", "no"] },
  { name: "tada", char: "🎉", keywords: ["party", "ship", "celebrate"] },
  { name: "rocket", char: "🚀", keywords: ["ship", "launch", "fast"] },
  { name: "fire", char: "🔥", keywords: ["hot", "burn", "delete"] },
  { name: "sparkles", char: "✨", keywords: ["new", "clean", "feature"] },
  { name: "bug", char: "🐛", keywords: ["broken", "defect"] },
  { name: "boom", char: "💥", keywords: ["crash", "break", "explode"] },
  { name: "warning", char: "⚠️", keywords: ["careful", "caution"] },
  { name: "eyes", char: "👀", keywords: ["look", "review", "watching"] },
  { name: "thinking", char: "🤔", keywords: ["hmm", "unsure", "question"] },
  { name: "thought_balloon", char: "💭", keywords: ["idea", "musing"] },
  { name: "bulb", char: "💡", keywords: ["idea", "suggestion", "tip"] },
  { name: "memo", char: "📝", keywords: ["note", "docs", "write"] },
  { name: "books", char: "📚", keywords: ["docs", "reading"] },
  { name: "mag", char: "🔍", keywords: ["search", "find", "look"] },
  { name: "hammer", char: "🔨", keywords: ["build", "fix", "work"] },
  { name: "wrench", char: "🔧", keywords: ["fix", "config", "tool"] },
  { name: "gear", char: "⚙️", keywords: ["config", "settings", "machinery"] },
  { name: "recycle", char: "♻️", keywords: ["refactor", "reuse"] },
  { name: "broom", char: "🧹", keywords: ["cleanup", "tidy"] },
  { name: "wastebasket", char: "🗑️", keywords: ["delete", "remove", "trash"] },
  { name: "construction", char: "🚧", keywords: ["wip", "progress", "unfinished"] },
  { name: "checkered_flag", char: "🏁", keywords: ["done", "finish"] },
  { name: "white_check_mark", char: "✅", keywords: ["done", "pass", "green", "ok"] },
  { name: "heavy_check_mark", char: "✔️", keywords: ["done", "tick"] },
  { name: "x", char: "❌", keywords: ["no", "fail", "red", "wrong"] },
  { name: "no_entry", char: "⛔", keywords: ["stop", "blocked", "forbidden"] },
  { name: "rotating_light", char: "🚨", keywords: ["alert", "urgent", "siren"] },
  { name: "sos", char: "🆘", keywords: ["help", "urgent"] },
  { name: "question", char: "❓", keywords: ["ask", "unclear"] },
  { name: "exclamation", char: "❗", keywords: ["important", "careful"] },
  { name: "point_up", char: "☝️", keywords: ["note", "above"] },
  { name: "point_right", char: "👉", keywords: ["here", "this"] },
  { name: "pray", char: "🙏", keywords: ["please", "thanks", "hope"] },
  { name: "raised_hands", char: "🙌", keywords: ["yay", "praise", "nice"] },
  { name: "clap", char: "👏", keywords: ["nice", "well done", "applause"] },
  { name: "muscle", char: "💪", keywords: ["strong", "effort"] },
  { name: "ok_hand", char: "👌", keywords: ["fine", "good"] },
  { name: "wave", char: "👋", keywords: ["hi", "hello", "bye"] },
  { name: "handshake", char: "🤝", keywords: ["agreed", "deal"] },
  { name: "heart", char: "❤️", keywords: ["love", "like"] },
  { name: "sparkling_heart", char: "💖", keywords: ["love", "nice"] },
  { name: "smile", char: "😄", keywords: ["happy", "grin"] },
  { name: "smiley", char: "😃", keywords: ["happy"] },
  { name: "grin", char: "😁", keywords: ["happy", "teeth"] },
  { name: "joy", char: "😂", keywords: ["laugh", "lol", "funny"] },
  { name: "rofl", char: "🤣", keywords: ["laugh", "lol", "funny"] },
  { name: "sweat_smile", char: "😅", keywords: ["phew", "nervous", "laugh"] },
  { name: "wink", char: "😉", keywords: ["joke", "kidding"] },
  { name: "blush", char: "😊", keywords: ["happy", "shy"] },
  { name: "slightly_smiling_face", char: "🙂", keywords: ["ok", "fine"] },
  { name: "upside_down_face", char: "🙃", keywords: ["irony", "sarcasm"] },
  { name: "neutral_face", char: "😐", keywords: ["meh", "flat"] },
  { name: "expressionless", char: "😑", keywords: ["meh", "blank"] },
  { name: "grimacing", char: "😬", keywords: ["awkward", "yikes"] },
  { name: "sweat", char: "😓", keywords: ["nervous", "worried"] },
  { name: "cry", char: "😢", keywords: ["sad", "tears"] },
  { name: "sob", char: "😭", keywords: ["sad", "crying", "pain"] },
  { name: "scream", char: "😱", keywords: ["horror", "fear", "yikes"] },
  { name: "dizzy_face", char: "😵", keywords: ["confused", "overwhelmed"] },
  { name: "exploding_head", char: "🤯", keywords: ["mind blown", "wow"] },
  { name: "confused", char: "😕", keywords: ["unsure", "puzzled"] },
  { name: "worried", char: "😟", keywords: ["concern", "unsure"] },
  { name: "cold_sweat", char: "😰", keywords: ["scared", "worried"] },
  { name: "sleeping", char: "😴", keywords: ["tired", "slow", "zzz"] },
  { name: "nerd_face", char: "🤓", keywords: ["nerd", "pedantic", "detail"] },
  { name: "sunglasses", char: "😎", keywords: ["cool", "nice"] },
  { name: "partying_face", char: "🥳", keywords: ["party", "celebrate"] },
  { name: "shrug", char: "🤷", keywords: ["dunno", "whatever"] },
  { name: "facepalm", char: "🤦", keywords: ["oops", "obvious", "doh"] },
  { name: "see_no_evil", char: "🙈", keywords: ["oops", "hide", "monkey"] },
  { name: "robot", char: "🤖", keywords: ["bot", "automation", "ci"] },
  { name: "alien", char: "👽", keywords: ["strange", "weird"] },
  { name: "ghost", char: "👻", keywords: ["spooky", "dead code"] },
  { name: "skull", char: "💀", keywords: ["dead", "broken", "rip"] },
  { name: "poop", char: "💩", keywords: ["bad", "rubbish"] },
  { name: "snail", char: "🐌", keywords: ["slow", "performance"] },
  { name: "turtle", char: "🐢", keywords: ["slow"] },
  { name: "zap", char: "⚡", keywords: ["fast", "performance", "quick"] },
  { name: "racehorse", char: "🐎", keywords: ["fast", "speed"] },
  { name: "hourglass", char: "⏳", keywords: ["slow", "waiting", "time"] },
  { name: "stopwatch", char: "⏱️", keywords: ["timing", "benchmark"] },
  { name: "alarm_clock", char: "⏰", keywords: ["deadline", "reminder"] },
  { name: "calendar", char: "📅", keywords: ["date", "schedule"] },
  { name: "lock", char: "🔒", keywords: ["security", "private", "closed"] },
  { name: "unlock", char: "🔓", keywords: ["security", "open"] },
  { name: "key", char: "🔑", keywords: ["secret", "auth", "credential"] },
  { name: "shield", char: "🛡️", keywords: ["security", "safe", "guard"] },
  { name: "mask", char: "😷", keywords: ["sick", "ill"] },
  { name: "package", char: "📦", keywords: ["release", "dependency", "build"] },
  { name: "label", char: "🏷️", keywords: ["tag", "name"] },
  { name: "link", char: "🔗", keywords: ["url", "reference"] },
  { name: "paperclip", char: "📎", keywords: ["attach", "file"] },
  { name: "pushpin", char: "📌", keywords: ["pin", "important", "note"] },
  { name: "bookmark", char: "🔖", keywords: ["save", "later"] },
  { name: "clipboard", char: "📋", keywords: ["copy", "list"] },
  { name: "page_facing_up", char: "📄", keywords: ["file", "doc"] },
  { name: "file_folder", char: "📁", keywords: ["directory", "folder"] },
  { name: "chart_with_upwards_trend", char: "📈", keywords: ["metrics", "up", "growth"] },
  { name: "chart_with_downwards_trend", char: "📉", keywords: ["metrics", "down", "drop"] },
  { name: "bar_chart", char: "📊", keywords: ["metrics", "stats"] },
  { name: "abacus", char: "🧮", keywords: ["count", "math"] },
  { name: "1234", char: "🔢", keywords: ["numbers", "count"] },
  { name: "scissors", char: "✂️", keywords: ["cut", "remove", "trim"] },
  { name: "pencil2", char: "✏️", keywords: ["edit", "write", "nit"] },
  { name: "art", char: "🎨", keywords: ["style", "format", "design"] },
  { name: "lipstick", char: "💄", keywords: ["cosmetic", "style"] },
  { name: "test_tube", char: "🧪", keywords: ["test", "experiment"] },
  { name: "microscope", char: "🔬", keywords: ["detail", "inspect", "research"] },
  { name: "telescope", char: "🔭", keywords: ["future", "far", "vision"] },
  { name: "satellite", char: "🛰️", keywords: ["network", "remote"] },
  { name: "computer", char: "💻", keywords: ["code", "machine", "laptop"] },
  { name: "desktop_computer", char: "🖥️", keywords: ["machine", "screen"] },
  { name: "keyboard", char: "⌨️", keywords: ["typing", "input"] },
  { name: "iphone", char: "📱", keywords: ["mobile", "phone"] },
  { name: "electric_plug", char: "🔌", keywords: ["connect", "power", "plugin"] },
  { name: "battery", char: "🔋", keywords: ["power", "energy"] },
  { name: "floppy_disk", char: "💾", keywords: ["save", "old", "storage"] },
  { name: "card_file_box", char: "🗃️", keywords: ["database", "storage"] },
  { name: "globe_with_meridians", char: "🌐", keywords: ["web", "network", "i18n"] },
  { name: "earth_americas", char: "🌎", keywords: ["world", "global"] },
  { name: "traffic_light", char: "🚦", keywords: ["ci", "status", "gate"] },
  { name: "vertical_traffic_light", char: "🚥", keywords: ["ci", "status"] },
  { name: "green_circle", char: "🟢", keywords: ["pass", "ok", "good"] },
  { name: "red_circle", char: "🔴", keywords: ["fail", "stop", "bad"] },
  { name: "yellow_circle", char: "🟡", keywords: ["warn", "partial"] },
  { name: "large_blue_circle", char: "🔵", keywords: ["info", "note"] },
  { name: "white_circle", char: "⚪", keywords: ["empty", "neutral"] },
  { name: "black_circle", char: "⚫", keywords: ["off", "disabled"] },
  { name: "star", char: "⭐", keywords: ["favourite", "nice", "good"] },
  { name: "star2", char: "🌟", keywords: ["great", "shine"] },
  { name: "trophy", char: "🏆", keywords: ["win", "best"] },
  { name: "medal_sports", char: "🏅", keywords: ["award", "win"] },
  { name: "dart", char: "🎯", keywords: ["target", "goal", "exact"] },
  { name: "game_die", char: "🎲", keywords: ["random", "flaky", "chance"] },
  { name: "crystal_ball", char: "🔮", keywords: ["guess", "predict", "magic"] },
  { name: "magic_wand", char: "🪄", keywords: ["magic", "clever"] },
  { name: "circus_tent", char: "🎪", keywords: ["mess", "chaos"] },
  { name: "balance_scale", char: "⚖️", keywords: ["tradeoff", "fair", "compare"] },
  { name: "hammer_and_wrench", char: "🛠️", keywords: ["tooling", "build", "fix"] },
  { name: "bricks", char: "🧱", keywords: ["build", "foundation"] },
  { name: "nut_and_bolt", char: "🔩", keywords: ["detail", "internals"] },
  { name: "chains", char: "⛓️", keywords: ["coupling", "dependency"] },
  { name: "thread", char: "🧵", keywords: ["thread", "concurrency"] },
  { name: "spider_web", char: "🕸️", keywords: ["tangled", "complex", "legacy"] },
  { name: "knot", char: "🪢", keywords: ["tangled", "complex"] },
  { name: "compass", char: "🧭", keywords: ["direction", "navigate"] },
  { name: "anchor", char: "⚓", keywords: ["stable", "fixed"] },
  { name: "ship", char: "🚢", keywords: ["ship it", "release", "deploy"] },
  { name: "airplane", char: "✈️", keywords: ["fast", "deploy", "travel"] },
  { name: "truck", char: "🚚", keywords: ["move", "deliver"] },
  { name: "tractor", char: "🚜", keywords: ["chore", "heavy"] },
  { name: "oncoming_police_car", char: "🚔", keywords: ["lint", "rules", "police"] },
  { name: "bell", char: "🔔", keywords: ["notify", "alert"] },
  { name: "no_bell", char: "🔕", keywords: ["mute", "silence"] },
  { name: "loudspeaker", char: "📢", keywords: ["announce", "shout"] },
  { name: "speech_balloon", char: "💬", keywords: ["comment", "discussion"] },
  { name: "left_speech_bubble", char: "🗨️", keywords: ["comment", "reply"] },
  { name: "coffee", char: "☕", keywords: ["break", "monday", "tired"] },
  { name: "beer", char: "🍺", keywords: ["celebrate", "friday"] },
  { name: "cake", char: "🍰", keywords: ["birthday", "celebrate"] },
  { name: "pizza", char: "🍕", keywords: ["food", "friday"] },
  { name: "salt", char: "🧂", keywords: ["salty", "bitter"] },
  { name: "popcorn", char: "🍿", keywords: ["watching", "drama"] },
  { name: "seedling", char: "🌱", keywords: ["new", "growth", "small"] },
  { name: "herb", char: "🌿", keywords: ["green", "fresh"] },
  { name: "evergreen_tree", char: "🌲", keywords: ["tree", "forest"] },
  { name: "cactus", char: "🌵", keywords: ["dry", "prickly"] },
  { name: "snowflake", char: "❄️", keywords: ["freeze", "flaky", "cold"] },
  { name: "sunny", char: "☀️", keywords: ["bright", "clear"] },
  { name: "cloud", char: "☁️", keywords: ["cloud", "remote"] },
  { name: "ocean", char: "🌊", keywords: ["wave", "flood"] },
  { name: "rainbow", char: "🌈", keywords: ["pretty", "colours"] },
  { name: "moon", char: "🌙", keywords: ["night", "late"] },
  { name: "dizzy", char: "💫", keywords: ["spin", "confusing"] },
  { name: "100", char: "💯", keywords: ["perfect", "exactly", "agree"] },
  { name: "ballot_box_with_check", char: "☑️", keywords: ["done", "checked"] },
  { name: "arrow_right", char: "➡️", keywords: ["then", "next"] },
  { name: "arrows_counterclockwise", char: "🔄", keywords: ["retry", "sync", "loop"] },
  { name: "repeat", char: "🔁", keywords: ["loop", "again"] },
  { name: "back", char: "🔙", keywords: ["revert", "previous"] },
  { name: "arrow_up", char: "⬆️", keywords: ["bump", "upgrade"] },
  { name: "arrow_down", char: "⬇️", keywords: ["downgrade", "lower"] },
] as const

const TRIGGER = /(?:^|\s):([a-z0-9_+-]+)$/

/**
 * Whether the text before the cursor is an open `:shortcode` — a colon that
 * starts a word, with a letter or two typed since.
 *
 * A bare `:` is not a trigger: prose is full of them, and a list of two
 * hundred emoji over every colon typed is a list nobody wants.
 */
export function detectEmojiTrigger(
  text: string,
  cursorOffset: number,
): { query: string; colonOffset: number } | null {
  if (cursorOffset < 2 || cursorOffset > text.length) return null
  const match = text.slice(0, cursorOffset).match(TRIGGER)
  if (!match) return null
  const query = match[1] ?? ""
  return { query, colonOffset: cursorOffset - query.length - 1 }
}

/**
 * The emoji a query finds, best first: the shortcode it starts, then the
 * one it appears in, then what its keywords say it means.
 */
export function filterEmoji(query: string, limit = 8): Emoji[] {
  const needle = query.toLowerCase()
  if (!needle) return []

  const starts: Emoji[] = []
  const contains: Emoji[] = []
  const meaning: Emoji[] = []

  for (const emoji of EMOJI) {
    if (emoji.name.startsWith(needle)) starts.push(emoji)
    else if (emoji.name.includes(needle)) contains.push(emoji)
    else if (emoji.keywords?.some((word) => word.includes(needle))) meaning.push(emoji)
  }

  return [...starts, ...contains, ...meaning].slice(0, limit)
}
