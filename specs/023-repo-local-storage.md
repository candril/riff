# Repo-Local Comment Storage

**Status**: In Progress

## Description

Store comments in the local repository directory instead of a global location. This ensures comments are always associated with the correct codebase, similar to how `gh-dash` stores review data per-repository. Comments live alongside the code they reference, making them portable and git-trackable.

Additionally, allow users to configure repository mappings in their config file to help riff find local clones when reviewing remote PRs.

## Out of Scope

- Syncing comments between machines (use git for that)
- Automatic `.gitignore` management
- Comment migration tools between storage formats

## Capabilities

### P1 - MVP

- **Repo-local storage**: Comments stored in `<repo>/.riff/comments/`
- **Auto-detect repo root**: Find `.git` or `.jj` directory to locate repo root
- **Fallback to cwd**: If not in a repo, use current working directory
- **Config option**: `storage.path` to override default location
- **Repo mapping in config**: Map GitHub remotes to local paths
- **Base path auto-detection**: Configure `storage.basePath` (e.g., `~/code`) and auto-find repos by name
- **User confirmation**: When auto-detecting, show found path and ask user to confirm before using

### P2 - Enhanced

- **Path aliases**: Short names for frequently-used repos
- **XDG fallback**: Global `~/.local/share/riff/` for non-repo contexts
- **Remember confirmed paths**: Auto-save confirmed paths to config for future use

### P3 - Polish

- **Auto-create .gitignore**: Optionally add `.riff/` to repo's `.gitignore`
- **Storage stats**: Show storage location and size in status
- **Cleanup command**: `riff gc` to remove orphaned comments

## Technical Notes

### Configuration Schema

Add storage config to `src/config/schema.ts`:

```typescript
// src/config/schema.ts

export interface StorageConfig {
  /** Override default storage location */
  path?: string
  /** Base path to search for repos (e.g., "~/code") */
  basePath?: string
  /** Map GitHub remotes to local paths */
  repos: Record<string, string>
  /** Short aliases for frequently-used repos */
  aliases: Record<string, string>
}

export interface Config {
  ignore: IgnoreConfig
  storage: StorageConfig  // New
}
```

### Config File Format

```toml
# ~/.config/riff/config.toml

[ignore]
patterns = ["package-lock.json", "bun.lockb"]

[storage]
# Override default storage location (optional)
# path = "/custom/path/.riff"

# Base path to search for repos by name (auto-detection)
# When reviewing "owner/repo", riff will look for ~/code/repo
basePath = "~/code"

# Explicit mappings take precedence over basePath auto-detection
# Format: "owner/repo" = "local/path"
[storage.repos]
"anthropics/claude-code" = "~/code/claude-code"
"facebook/react" = "~/oss/react"
"my-org/work-project" = "~/work/main-project"

# Short aliases for quick access (P2)
[storage.aliases]
cc = "~/code/claude-code"
work = "~/work/main-project"
```

### Default Config

Update `src/config/defaults.ts`:

```typescript
// src/config/defaults.ts

export const defaultConfig: Config = {
  ignore: {
    patterns: defaultIgnorePatterns,
  },
  storage: {
    basePath: undefined,
    repos: {},
    aliases: {},
  },
}
```

### Storage Path Resolution

Update `src/storage.ts` to use the new repo mapping:

```typescript
// src/storage.ts

import { loadConfig } from "./config"

/**
 * Find the repository root by looking for .git or .jj directory
 */
async function findRepoRoot(startPath: string = process.cwd()): Promise<string | null> {
  let current = startPath
  
  while (current !== "/") {
    const gitPath = join(current, ".git")
    const jjPath = join(current, ".jj")
    
    if (await Bun.file(gitPath).exists() || await Bun.file(jjPath).exists()) {
      return current
    }
    
    current = dirname(current)
  }
  
  return null
}

/**
 * Expand ~ to home directory
 */
function expandPath(p: string): string {
  if (p.startsWith("~/")) {
    return join(homedir(), p.slice(2))
  }
  return p
}

/**
 * Find local repo path for a GitHub PR using config mapping
 */
async function findLocalRepoFromConfig(
  owner: string,
  repo: string
): Promise<string | null> {
  const config = await loadConfig()
  
  // Check explicit mapping: "owner/repo" -> local path
  const key = `${owner}/${repo}`
  const mappedPath = config.storage.repos[key]
  
  if (mappedPath) {
    const expanded = expandPath(mappedPath)
    if (await isValidRepo(expanded)) {
      return expanded
    }
  }
  
  return null
}

/**
 * Auto-detect repo in basePath by repo name.
 * Returns the path if found, null otherwise.
 */
async function autoDetectRepoInBasePath(
  repo: string,
  basePath: string
): Promise<string | null> {
  const expanded = expandPath(basePath)
  const candidatePath = join(expanded, repo)
  
  if (await isValidRepo(candidatePath)) {
    // Verify it's the right repo by checking git remote
    const remote = await getGitRemoteUrl(candidatePath)
    if (remote?.includes(repo)) {
      return candidatePath
    }
  }
  
  return null
}

async function getGitRemoteUrl(path: string): Promise<string | null> {
  try {
    const result = await Bun.$`git -C ${path} remote get-url origin`.text()
    return result.trim()
  } catch {
    return null
  }
}

/**
 * Check if path is a valid git/jj repo
 */
async function isValidRepo(path: string): Promise<boolean> {
  const gitPath = join(path, ".git")
  const jjPath = join(path, ".jj")
  return await Bun.file(gitPath).exists() || await Bun.file(jjPath).exists()
}

export interface RepoResolution {
  path: string
  source: "config" | "basePath" | "cwd" | "repoRoot" | "global"
  needsConfirmation: boolean
}

/**
 * Resolve storage directory for a source.
 * 
 * Resolution order:
 * 1. Config storage.path override
 * 2. Config storage.repos explicit mapping (for GitHub PRs)
 * 3. Current directory if it matches the PR's repo
 * 4. Config storage.basePath auto-detection (needs confirmation)
 * 5. Repo root (find .git/.jj)
 * 6. Global ~/.riff/ as fallback
 */
async function resolveStorageDir(source: string): Promise<RepoResolution> {
  const config = await loadConfig()
  
  // 1. Explicit config override
  if (config.storage.path) {
    return {
      path: expandPath(config.storage.path),
      source: "config",
      needsConfirmation: false,
    }
  }
  
  // For GitHub PRs, try various resolution strategies
  if (source.startsWith("gh:")) {
    const match = source.match(/^gh:([^/]+)\/([^#]+)#/)
    if (match) {
      const [, owner, repo] = match
      
      // 2. Explicit mapping in config
      const mappedRepo = await findLocalRepoFromConfig(owner!, repo!)
      if (mappedRepo) {
        return {
          path: join(mappedRepo, LOCAL_STORAGE_DIR),
          source: "config",
          needsConfirmation: false,
        }
      }
      
      // 3. Check if cwd matches
      const isLocal = await isCurrentRepo(source)
      if (isLocal) {
        return {
          path: LOCAL_STORAGE_DIR,
          source: "cwd",
          needsConfirmation: false,
        }
      }
      
      // 4. Try basePath auto-detection (needs confirmation)
      if (config.storage.basePath) {
        const autoDetected = await autoDetectRepoInBasePath(repo!, config.storage.basePath)
        if (autoDetected) {
          return {
            path: join(autoDetected, LOCAL_STORAGE_DIR),
            source: "basePath",
            needsConfirmation: true,  // User should confirm
          }
        }
      }
    }
  }
  
  // 5. Check if cwd matches (for non-PR sources)
  const isLocal = await isCurrentRepo(source)
  if (isLocal) {
    return {
      path: LOCAL_STORAGE_DIR,
      source: "cwd",
      needsConfirmation: false,
    }
  }
  
  // 6. Try to find repo root
  const repoRoot = await findRepoRoot()
  if (repoRoot) {
    return {
      path: join(repoRoot, LOCAL_STORAGE_DIR),
      source: "repoRoot",
      needsConfirmation: false,
    }
  }
  
  // 7. Global fallback
  return {
    path: GLOBAL_STORAGE_DIR,
    source: "global",
    needsConfirmation: false,
  }
}

/**
 * Get storage dir (legacy wrapper, auto-confirms)
 */
async function getStorageDir(source: string): Promise<string> {
  const resolution = await resolveStorageDir(source)
  return resolution.path
}
```

### User Confirmation Flow

When a repo is auto-detected via `basePath`, riff prompts the user before using it:

```typescript
// src/storage.ts

/**
 * Resolve storage with user confirmation for auto-detected paths.
 * Called during app initialization.
 */
export async function resolveStorageWithConfirmation(
  source: string,
  confirm: (path: string, repo: string) => Promise<boolean>
): Promise<string> {
  const resolution = await resolveStorageDir(source)
  
  if (resolution.needsConfirmation) {
    // Extract repo name from path for display
    const repoPath = resolution.path.replace(/\/.riff$/, "")
    const match = source.match(/^gh:([^/]+)\/([^#]+)#/)
    const repoName = match ? `${match[1]}/${match[2]}` : source
    
    const confirmed = await confirm(repoPath, repoName)
    
    if (confirmed) {
      // Optionally save to config for future use (P2)
      return resolution.path
    } else {
      // Fall back to global storage
      return GLOBAL_STORAGE_DIR
    }
  }
  
  return resolution.path
}
```

### App Initialization Integration

The confirmation happens in `src/app/init.ts` before the TUI starts:

```typescript
// src/app/init.ts

import { resolveStorageWithConfirmation } from "../storage"

export async function initializeApp(options: AppOptions) {
  // ... parse source from options
  
  // Resolve storage location with confirmation prompt
  const storagePath = await resolveStorageWithConfirmation(
    source,
    async (path, repo) => {
      // Simple CLI prompt before TUI starts
      console.log(`\nFound local clone for ${repo}:`)
      console.log(`  ${path}`)
      const answer = await prompt("Use this location? [Y/n] ")
      return answer.toLowerCase() !== "n"
    }
  )
  
  // ... continue with initialization
}
```

### Confirmation UI

Before the TUI renders, show a simple prompt:

```
Found local clone for anthropics/claude-code:
  /Users/stefan/code/claude-code

Use this location? [Y/n] 
```

User presses Enter (or Y) to confirm, N to use global storage instead.

### Integration with FeatureContext

The storage functions already receive `source` from `FeatureContext.source`, so no changes needed to feature modules. The resolution happens transparently in the storage layer.

```typescript
// Example usage in src/features/comments/editor.ts (unchanged)
import { saveComment } from "../../storage"

export async function handleAddComment(ctx: FeatureContext): Promise<void> {
  // ...
  await saveComment(comment, ctx.source)  // source determines storage location
}
```

### Directory Structure

Per-repository storage (unchanged from current):

```
my-project/
├── .git/
├── .riff/                           # Repo-local storage
│   ├── session.json                 # Current session metadata
│   ├── gh-owner-repo-123/           # PR-specific data
│   │   ├── comments/
│   │   │   ├── a1b2c3d4.md         # Comment files
│   │   │   └── e5f6g7h8.md
│   │   └── viewed.json             # Viewed file status
│   └── local/                       # Local diff data
│       └── comments/
├── src/
└── ...
```

### Migration

No migration needed - the storage format remains the same. Only the directory resolution logic changes to:
1. Respect config mappings
2. Find repo root more reliably

### Saving Confirmed Paths (P2)

When user confirms an auto-detected path, optionally save it to config:

```typescript
// src/config/writer.ts

import { join } from "path"
import { homedir } from "os"

const CONFIG_PATH = join(homedir(), ".config", "riff", "config.toml")

/**
 * Add a repo mapping to the config file
 */
export async function addRepoMapping(ownerRepo: string, localPath: string): Promise<void> {
  const file = Bun.file(CONFIG_PATH)
  let content = ""
  
  if (await file.exists()) {
    content = await file.text()
  }
  
  // Check if [storage.repos] section exists
  if (content.includes("[storage.repos]")) {
    // Add to existing section
    const lines = content.split("\n")
    const idx = lines.findIndex(l => l.trim() === "[storage.repos]")
    lines.splice(idx + 1, 0, `"${ownerRepo}" = "${localPath}"`)
    content = lines.join("\n")
  } else {
    // Create section
    content += `\n[storage.repos]\n"${ownerRepo}" = "${localPath}"\n`
  }
  
  await Bun.write(CONFIG_PATH, content)
}
```

Enhanced confirmation prompt (P2):

```
Found local clone for anthropics/claude-code:
  /Users/stefan/code/claude-code

[Y] Use this location
[S] Use and save to config (won't ask again)
[N] Use global storage instead

Choice [Y/s/n]: 
```

### File Structure

Changes to:

```
src/
├── config/
│   ├── schema.ts         # Add StorageConfig type
│   ├── defaults.ts       # Add storage defaults
│   └── writer.ts         # (P2) Write config updates
├── storage.ts            # Update resolution logic
└── app/
    └── init.ts           # Add confirmation prompt
```

### Benefits

1. **Explicit mapping**: Users control exactly where comments are stored per-repo
2. **Review foreign PRs locally**: Map any GitHub repo to a local clone
3. **Portable config**: Same config works across machines (with consistent paths)
4. **Backwards compatible**: Existing storage continues to work
5. **Simple mental model**: "owner/repo" -> local path

### Example Workflows

#### Workflow 1: Explicit Config Mapping

User wants to review PRs from `anthropics/claude-code` which they have cloned at `~/code/claude-code`:

1. Add to config:
   ```toml
   [storage.repos]
   "anthropics/claude-code" = "~/code/claude-code"
   ```

2. Run riff from anywhere:
   ```bash
   riff gh anthropics/claude-code#1234
   ```

3. Comments are stored in:
   ```
   ~/code/claude-code/.riff/gh-anthropics-claude-code-1234/comments/
   ```

#### Workflow 2: Auto-Detection with basePath

User has repos cloned in `~/code/` and wants riff to find them automatically:

1. Add to config:
   ```toml
   [storage]
   basePath = "~/code"
   ```

2. Run riff for any repo:
   ```bash
   riff gh facebook/react#5678
   ```

3. riff finds `~/code/react`, prompts:
   ```
   Found local clone for facebook/react:
     /Users/stefan/code/react
   
   Use this location? [Y/n] 
   ```

4. User confirms, comments are stored in:
   ```
   ~/code/react/.riff/gh-facebook-react-5678/comments/
   ```

5. (P2) If user chooses "Save", mapping is added to config automatically.

#### Workflow 3: No Local Clone

User reviews a PR for a repo they don't have cloned:

1. Run riff:
   ```bash
   riff gh some-org/some-repo#999
   ```

2. No local clone found, comments stored globally:
   ```
   ~/.riff/gh-some-org-some-repo-999/comments/
   ```
