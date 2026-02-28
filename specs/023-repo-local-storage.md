# Repo-Local Comment Storage

**Status**: Draft

## Description

Store comments in the local repository directory instead of a global location. This ensures comments are always associated with the correct codebase, similar to how `gh-dash` stores review data per-repository. Comments live alongside the code they reference, making them portable and git-trackable.

## Out of Scope

- Syncing comments between machines (use git for that)
- Automatic `.gitignore` management
- Comment migration tools between storage formats

## Capabilities

### P1 - MVP

- **Repo-local storage**: Comments stored in `<repo>/.neoriff/comments/`
- **Auto-detect repo root**: Find `.git` or `.jj` directory to locate repo root
- **Fallback to cwd**: If not in a repo, use current working directory
- **Config option**: `storage.path` to override default location

### P2 - Enhanced

- **Multiple repo paths**: Config maps remote URLs to local paths
- **Path aliases**: Short names for frequently-used repos
- **XDG fallback**: Global `~/.local/share/neoriff/` for non-repo contexts

### P3 - Polish

- **Auto-create .gitignore**: Optionally add `.neoriff/` to repo's `.gitignore`
- **Storage stats**: Show storage location and size in status
- **Cleanup command**: `neoriff gc` to remove orphaned comments

## Technical Notes

### Storage Location Resolution

```typescript
// src/storage/paths.ts

import { join, dirname } from "path"

/**
 * Find the repository root by looking for .git or .jj directory
 */
export async function findRepoRoot(startPath: string = process.cwd()): Promise<string | null> {
  let current = startPath
  
  while (current !== "/") {
    // Check for git
    const gitPath = join(current, ".git")
    const gitFile = Bun.file(gitPath)
    if (await gitFile.exists()) {
      return current
    }
    
    // Check for jj
    const jjPath = join(current, ".jj")
    const jjFile = Bun.file(jjPath)
    if (await jjFile.exists()) {
      return current
    }
    
    current = dirname(current)
  }
  
  return null
}

/**
 * Get the storage directory for comments
 * Priority:
 * 1. Explicit config path
 * 2. Repository root (.neoriff/)
 * 3. Current working directory (.neoriff/)
 */
export async function getStorageDir(config?: StorageConfig): Promise<string> {
  // 1. Explicit config override
  if (config?.path) {
    return config.path
  }
  
  // 2. Find repo root
  const repoRoot = await findRepoRoot()
  if (repoRoot) {
    return join(repoRoot, ".neoriff")
  }
  
  // 3. Fallback to cwd
  return join(process.cwd(), ".neoriff")
}

/**
 * Get paths for comments and session data
 */
export async function getStoragePaths(config?: StorageConfig): Promise<StoragePaths> {
  const baseDir = await getStorageDir(config)
  
  return {
    base: baseDir,
    comments: join(baseDir, "comments"),
    session: join(baseDir, "session.json"),
    images: join(baseDir, "images"),
  }
}

export interface StoragePaths {
  base: string
  comments: string
  session: string
  images: string
}
```

### Configuration

```toml
# ~/.config/neoriff/config.toml

[storage]
# Override default storage location (optional)
# path = "/custom/path/.neoriff"

# Map remote URLs to local repo paths
# This helps when reviewing PRs from repos you have cloned
[storage.repos]
"github.com/owner/repo" = "~/code/repo"
"github.com/org/project" = "~/work/project"

# Short aliases for quick access
[storage.aliases]
myrepo = "~/code/my-repo"
work = "~/work/main-project"
```

### Repo Mapping for GitHub PRs

When reviewing a GitHub PR, neoriff needs to find the local clone:

```typescript
// src/storage/repo-map.ts

export interface RepoMapConfig {
  repos: Record<string, string>  // "github.com/owner/repo" -> local path
  aliases: Record<string, string>  // short name -> local path
}

/**
 * Find local repo path for a GitHub PR
 */
export async function findLocalRepo(
  owner: string,
  repo: string,
  config: RepoMapConfig
): Promise<string | null> {
  // 1. Check explicit mapping
  const key = `github.com/${owner}/${repo}`
  if (config.repos[key]) {
    const expanded = expandPath(config.repos[key])
    if (await isValidRepo(expanded)) {
      return expanded
    }
  }
  
  // 2. Check if current directory is the repo
  const cwd = process.cwd()
  const remoteUrl = await getGitRemoteUrl(cwd)
  if (remoteUrl?.includes(`${owner}/${repo}`)) {
    return cwd
  }
  
  // 3. Check common locations
  const commonPaths = [
    `~/code/${repo}`,
    `~/projects/${repo}`,
    `~/src/${repo}`,
    `~/${repo}`,
    `~/work/${repo}`,
  ]
  
  for (const p of commonPaths) {
    const expanded = expandPath(p)
    if (await isRepoWithRemote(expanded, owner, repo)) {
      return expanded
    }
  }
  
  return null
}

async function getGitRemoteUrl(path: string): Promise<string | null> {
  try {
    const result = await $`git -C ${path} remote get-url origin`.text()
    return result.trim()
  } catch {
    return null
  }
}

async function isRepoWithRemote(path: string, owner: string, repo: string): Promise<boolean> {
  const remote = await getGitRemoteUrl(path)
  if (!remote) return false
  return remote.includes(`${owner}/${repo}`)
}

function expandPath(p: string): string {
  if (p.startsWith("~/")) {
    return join(homedir(), p.slice(2))
  }
  return p
}

async function isValidRepo(path: string): Promise<boolean> {
  const gitPath = join(path, ".git")
  const jjPath = join(path, ".jj")
  return await Bun.file(gitPath).exists() || await Bun.file(jjPath).exists()
}
```

### Updated Storage Module

```typescript
// src/storage.ts - Updated to use repo-local paths

import { getStoragePaths } from "./storage/paths"
import { loadConfig } from "./config/loader"

let cachedPaths: StoragePaths | null = null

async function getPaths(): Promise<StoragePaths> {
  if (cachedPaths) return cachedPaths
  
  const config = await loadConfig()
  cachedPaths = await getStoragePaths(config.storage)
  return cachedPaths
}

/**
 * Load all comments from the repo-local storage
 */
export async function loadComments(): Promise<Comment[]> {
  const paths = await getPaths()
  
  try {
    const files = await readdir(paths.comments)
    const comments: Comment[] = []
    
    for (const file of files) {
      if (!file.endsWith(".md")) continue
      
      const content = await Bun.file(join(paths.comments, file)).text()
      const { meta, body } = parseFrontmatter(content)
      comments.push(commentFromMeta(meta, body))
    }
    
    return comments
  } catch {
    return []
  }
}

/**
 * Save a comment to repo-local storage
 */
export async function saveComment(comment: Comment): Promise<void> {
  const paths = await getPaths()
  await mkdir(paths.comments, { recursive: true })
  
  const filename = `${comment.id.slice(0, 8)}.md`
  await Bun.write(join(paths.comments, filename), toMarkdown(comment))
}

/**
 * Load session metadata
 */
export async function loadSession(): Promise<ReviewSession | null> {
  const paths = await getPaths()
  
  try {
    const content = await Bun.file(paths.session).json()
    return content as ReviewSession
  } catch {
    return null
  }
}

/**
 * Save session metadata
 */
export async function saveSession(session: ReviewSession): Promise<void> {
  const paths = await getPaths()
  await mkdir(paths.base, { recursive: true })
  
  await Bun.write(paths.session, JSON.stringify(session, null, 2))
}
```

### CLI Integration

```typescript
// src/index.ts - Show storage location on startup

import { getStoragePaths } from "./storage/paths"

async function main() {
  const paths = await getStoragePaths()
  
  // Debug: show where comments are stored
  if (process.env.DEBUG) {
    console.log(`Storage: ${paths.base}`)
  }
  
  // ... rest of app
}
```

### Directory Structure

Per-repository storage:

```
my-project/
├── .git/
├── .neoriff/                    # Repo-local storage
│   ├── session.json             # Current session metadata
│   ├── comments/
│   │   ├── a1b2c3d4.md         # Comment files
│   │   └── e5f6g7h8.md
│   └── images/                  # Uploaded images (if any)
│       └── abc123/
│           └── screenshot.png
├── src/
└── ...
```

### Git Integration

Users can choose to:

1. **Ignore** - Add `.neoriff/` to `.gitignore` (default recommendation)
2. **Track** - Commit `.neoriff/` to share comments with team
3. **Partial** - Track session but ignore comments

```gitignore
# .gitignore - recommended default
.neoriff/
```

Or for team sharing:

```gitignore
# .gitignore - track comments
.neoriff/images/
```

### Migration from Global Storage

If users have existing comments in a global location:

```typescript
// src/storage/migrate.ts

export async function migrateToRepoLocal(
  globalPath: string,
  repoPath: string
): Promise<{ migrated: number; skipped: number }> {
  const globalComments = join(globalPath, "comments")
  const repoComments = join(repoPath, ".neoriff", "comments")
  
  await mkdir(repoComments, { recursive: true })
  
  let migrated = 0
  let skipped = 0
  
  for (const file of await readdir(globalComments)) {
    if (!file.endsWith(".md")) continue
    
    const src = join(globalComments, file)
    const dst = join(repoComments, file)
    
    if (await Bun.file(dst).exists()) {
      skipped++
      continue
    }
    
    await copyFile(src, dst)
    migrated++
  }
  
  return { migrated, skipped }
}
```

### Benefits

1. **Portability**: Comments travel with the repo (if committed)
2. **Isolation**: Different repos have separate comment stores
3. **Line accuracy**: Comments reference commits in the same repo
4. **Team sharing**: Optionally commit comments for team review
5. **Cleaner global**: No accumulation of old comments globally

### File Structure

```
src/
├── storage/
│   ├── paths.ts          # Storage location resolution
│   ├── repo-map.ts       # GitHub remote -> local path mapping
│   ├── migrate.ts        # Migration utilities
│   └── index.ts          # Main storage API
├── config/
│   └── schema.ts         # Add StorageConfig type
└── ...
```

### Config Schema Addition

```typescript
// src/config/schema.ts

export interface Config {
  view: ViewConfig
  colors: ColorConfig
  keys: KeyConfig
  storage: StorageConfig  // New
}

export interface StorageConfig {
  path?: string                        // Override storage location
  repos: Record<string, string>        // Remote URL -> local path
  aliases: Record<string, string>      // Short name -> local path
}
```
