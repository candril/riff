# 021 - Image Support in Comments

Status: Draft

## Overview

Support images in comments via drag-and-drop in the external editor. When a user drops an image file into nvim, it inserts a path. riff detects image paths and:

1. **Local reviews**: Copies images to `.riff/images/` and rewrites to relative markdown refs
2. **GitHub PRs**: Uploads to GitHub's CDN and replaces with the permanent URL

## Capabilities

### P1 - Core Image Detection

- Detect bare image paths in comment text (e.g., `/tmp/screenshot.png`)
- Detect markdown image syntax (e.g., `![alt](/path/to/image.png)`)
- Support common image extensions: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`

### P1 - Local Image Storage

- Copy detected images to `.riff/images/{comment-id}/` 
- Rename to content-hash for deduplication (e.g., `a1b2c3d4.png`)
- Rewrite comment body with relative path: `![](images/{comment-id}/a1b2c3d4.png)`
- Handle missing files gracefully (warn, don't fail)

### P2 - GitHub CDN Upload

- For GitHub PR mode, upload images to GitHub's user-content CDN
- Replace local paths with permanent CDN URLs
- Use `gh` CLI for authentication

### P3 - Image Preview in Comments View

- Show `[image]` placeholder in comments view for images
- Could potentially render inline in terminals that support it (iTerm2, kitty)

## Out of Scope

- In-app image capture/screenshot
- Image editing/cropping
- Video support
- Clipboard paste (handled by the editor, not riff)

## Detection Patterns

```typescript
// Bare paths (common drag-drop result in nvim)
const BARE_PATH_PATTERN = /(?:^|\s)(\/[^\s]+\.(?:png|jpe?g|gif|webp|svg))(?:\s|$)/gi

// Markdown image syntax
const MD_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)]+\.(?:png|jpe?g|gif|webp|svg))\)/gi

// Supported extensions
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']
```

## File Structure

```
src/utils/
├── images.ts           # New - image processing utilities
│   ├── detectImagePaths(text: string): ImageRef[]
│   ├── copyToStorage(imagePath: string, commentId: string, source: string): string
│   ├── uploadToGitHub(imagePath: string, owner: string, repo: string): string
│   └── processCommentImages(body: string, commentId: string, opts: ImageOpts): string
```

## Storage Structure

```
.riff/
├── images/
│   └── {comment-id}/
│       ├── a1b2c3d4.png
│       └── e5f6g7h8.jpg
├── comments/
│   └── ...
```

## GitHub CDN Upload

GitHub accepts image uploads through their user-content system. The approach:

1. Use `gh api` to create a temporary issue comment with the image
2. GitHub processes the image and returns a CDN URL
3. Extract the URL (format: `https://user-images.githubusercontent.com/...`)
4. Delete the temporary comment
5. Use the permanent CDN URL in the actual comment

```bash
# Create temp comment with image to get CDN URL
RESPONSE=$(gh api repos/{owner}/{repo}/issues/1/comments \
  --field body="![image](data:image/png;base64,$(base64 -i image.png))")

# Extract URL from response
CDN_URL=$(echo $RESPONSE | jq -r '.body' | grep -oE 'https://user-images[^)]+')

# Delete temp comment
gh api repos/{owner}/{repo}/issues/comments/{id} -X DELETE
```

Alternative: Use GitHub's graphql mutation for file uploads (cleaner but more complex).

## Processing Flow

```
User presses 'c' to comment
         │
         ▼
   Editor opens (nvim)
         │
   User drags image → path inserted
         │
   User saves and quits
         │
         ▼
   parseEditorOutput() returns raw text
         │
         ▼
   processCommentImages() ◄─────────────────┐
         │                                   │
         ├── Detect image paths              │
         │                                   │
         ├── For each image:                 │
         │     ├── Local mode: copy to storage
         │     └── GitHub mode: upload to CDN
         │                                   │
         └── Rewrite body with new paths ────┘
         │
         ▼
   createComment() with processed body
         │
         ▼
   saveComment()
```

## Edge Cases

- **Image not found**: Warn in status bar, keep original path
- **Upload fails**: Fall back to base64 inline (with size warning if > 1MB)
- **Duplicate images**: Content-hash prevents duplication in storage
- **Large images**: Warn but proceed (GitHub has ~10MB limit)
- **Same image in multiple comments**: Each comment gets its own copy (simpler, avoids orphan tracking)

## Implementation Notes

### Detecting Paths from Drag-Drop

When you drag a file into nvim, it typically inserts the absolute path:
```
/Users/stefan/Desktop/screenshot.png
```

Or with some configurations:
```
file:///Users/stefan/Desktop/screenshot.png
```

We detect both patterns.

### Content Hashing

Use first 8 chars of SHA-256 for filename:
```typescript
import { createHash } from "crypto"

function contentHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex').slice(0, 8)
}
```

### Markdown Output

After processing:
```markdown
This is broken, see:

![](images/9e8aa9af/a1b2c3d4.png)

Should look like the design.
```

For GitHub:
```markdown
This is broken, see:

![screenshot](https://user-images.githubusercontent.com/12345/abc123.png)

Should look like the design.
```

## Testing

```typescript
// Detection tests
detectImagePaths("Check /tmp/shot.png here")
// → [{ path: "/tmp/shot.png", type: "bare" }]

detectImagePaths("See ![alt](/path/to/img.jpg)")  
// → [{ path: "/path/to/img.jpg", type: "markdown", alt: "alt" }]

// Processing tests  
processCommentImages("Look at /tmp/x.png", "abc123", { mode: "local" })
// → "Look at ![](images/abc123/d4e5f6a7.png)"
// Side effect: copies file to .riff/images/abc123/d4e5f6a7.png
```
