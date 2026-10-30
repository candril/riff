const EXTENSION_FILETYPES: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  scala: "scala",
  md: "markdown",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  html: "html",
  css: "css",
  scss: "scss",
  sql: "sql",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  tf: "terraform",
  tfvars: "terraform",
  hcl: "terraform",
  tfstate: "json",
  graphql: "graphql",
  gql: "graphql",
  // Avro has no tree-sitter parser: .avdl is close enough to Java to
  // borrow its highlighting, and .avsc/.avpr are literally JSON.
  avdl: "java",
  avsc: "json",
  avpr: "json",
}

const FILETYPES = new Set(Object.values(EXTENSION_FILETYPES))

// Names people write after a fence that are neither a filetype nor an extension.
const FENCE_ALIASES: Record<string, string> = {
  shell: "bash",
  console: "bash",
  shellsession: "bash",
  golang: "go",
  "c#": "csharp",
}

/**
 * Get filetype for syntax highlighting from filename
 */
export function getFiletypeFromPath(path: string): string | undefined {
  const ext = path.split(".").pop()?.toLowerCase()
  if (!ext) return undefined
  return EXTENSION_FILETYPES[ext]
}

/** The filetype a fenced code block's info string names, e.g. `ts {title=x}`. */
export function getFiletypeFromFence(info: string): string | undefined {
  const word = info.trim().split(/\s+/)[0]?.toLowerCase()
  if (!word) return undefined
  if (FILETYPES.has(word)) return word
  return getFiletypeFromPath(word) ?? FENCE_ALIASES[word]
}
