# Specs

This directory contains feature specifications for riff.

`just specs` lists every spec with its status; `just specs Partial` narrows it
to one status. The `**Status**:` line in each spec is the only record of its
state — there is no index to keep in step.

## Format

Each spec follows a consistent structure:

- **Status**: see below
- **Not built** (optional): the capabilities still missing from a spec whose
  status is `Done` or `Partial`
- **Description**: What this feature does
- **Out of Scope**: What this feature explicitly does NOT do
- **Capabilities**: Prioritized list (P1 = MVP, P2 = Important, P3 = Nice to have)
- **Technical Notes**: Implementation details, code examples, file structure

## Status

| Status | Meaning |
|---|---|
| `Draft` | Still being written |
| `Ready` | Ready for implementation |
| `In Progress` | Being implemented |
| `Partial` | Some P1 capability is still missing; **Not built** says which |
| `Done` | Every P1 capability exists, possibly in another form than specced |
| `Superseded by NNN` | A later spec replaced the design |
| `Dropped` | Will not be built |

`Done`, `Superseded` and `Dropped` may carry a short reason after a dash, e.g.
`Done — the key is ge`. Where the code went a different way than the spec, the
reason says so; the body of the spec is not rewritten.

## Naming

Specs are numbered sequentially: `NNN-feature-name.md`

## Workflow

1. Create spec as `Draft`
2. Review and refine → `Ready`
3. Begin implementation → `In Progress`
4. Set `Done` in the same change that completes it
