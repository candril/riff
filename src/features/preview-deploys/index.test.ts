import { test, expect, describe, beforeEach } from "bun:test"
import { createPreviewDeploys, jobLinks, type PreviewDeploysDeps } from "./index"
import { detectPreviews, type PreviewSet } from "../../utils/previews"
import { defaultConfig } from "../../config/defaults"
import type { ConfirmDialogState } from "../confirm/state"

const body = (designTask: " " | "x", designCell = "*on demand*") => `<!-- id = preview-links-and-size -->
| App | Preview | Built |
| :--- | :--- | :---: |
| 🛒 Shop | [galaxus.ch](https://galaxus-ch-preview-pr7.preview.example.com) | [10:15](https://github.com/o/r/actions/runs/99/attempts/1) |
| 🎨 Design System | ${designCell} | [10:16](https://github.com/o/r/actions/runs/99/attempts/1) |

- [${designTask}] Deploy 🎨 Design System preview
`

let remote: string
let previews: PreviewSet | null
let patched: string[]
let dialog: ConfirmDialogState | null
let toasts: string[]
let ticks: (() => void)[]
let cleared: number
let opened: { source: unknown; title: string }[]
let deps: PreviewDeploysDeps

function read(text: string): PreviewSet | null {
  return detectPreviews([{ id: 42, body: text, author: "bot", createdAt: "" }], defaultConfig.previews, 7)
}

const design = () => previews!.rows.find((row) => row.app.includes("Design"))!

beforeEach(() => {
  remote = body(" ")
  previews = read(remote)
  patched = []
  dialog = null
  toasts = []
  ticks = []
  cleared = 0
  opened = []
  deps = {
    target: () => ({ owner: "o", repo: "r", previews }),
    confirm: { show: (next) => { dialog = next }, close: () => { dialog = null } },
    toast: { show: (message) => toasts.push(message), clear: () => {} },
    render: () => {},
    applyComment: (_id, text) => { previews = read(text) },
    openUrl: () => {},
    api: {
      fetchComment: async () => ({ body: remote, updatedAt: "" }),
      updateComment: async (_o, _r, id, text) => {
        expect(id).toBe(42)
        patched.push(text)
        remote = text
        return { success: true }
      },
      fetchRunJobs: async () => [],
    },
    setInterval: (run) => { ticks.push(run); return ticks.length },
    clearInterval: () => { cleared++ },
  }
})

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

describe("deploying on demand", () => {
  test("asks first, then ticks the row's item in the comment", async () => {
    const deploys = createPreviewDeploys(deps)
    deploys.deploy(design())

    expect(dialog?.message).toBe("Deploy 🎨 Design System?")
    expect(patched).toEqual([])

    dialog!.onConfirm()
    await settle()

    expect(patched).toEqual([body("x")])
    expect(toasts).toContain("Deploy of 🎨 Design System requested")
  })

  test("a no leaves the comment alone", async () => {
    createPreviewDeploys(deps).deploy(design())
    dialog!.onCancel()
    await settle()

    expect(patched).toEqual([])
    expect(dialog).toBeNull()
  })

  test("writes back the bot's latest edit, not the copy riff drew from", async () => {
    const deploys = createPreviewDeploys(deps)
    deploys.deploy(design())
    remote = body(" ").replace("10:15", "10:31")
    dialog!.onConfirm()
    await settle()

    expect(patched).toEqual([body("x").replace("10:15", "10:31")])
  })

  test("someone else ticked it first: nothing written, and riff shows what is there", async () => {
    const deploys = createPreviewDeploys(deps)
    deploys.deploy(design())
    remote = body("x")
    dialog!.onConfirm()
    await settle()

    expect(patched).toEqual([])
    expect(design().deploy?.checked).toBe(true)
  })

  test("an edit GitHub refuses says why", async () => {
    deps.api.updateComment = async () => ({ success: false, error: "Must have admin rights" })
    const deploys = createPreviewDeploys(deps)
    deploys.deploy(design())
    dialog!.onConfirm()
    await settle()

    expect(toasts).toContain("Deploy failed: Must have admin rights")
  })

  test("a row that is not waiting to be deployed asks nothing", () => {
    createPreviewDeploys(deps).deploy(previews!.rows[0]!)

    expect(dialog).toBeNull()
  })
})

describe("watching the comment", () => {
  test("a requested deploy is watched until the bot puts a link in", async () => {
    const deploys = createPreviewDeploys(deps)
    deploys.deploy(design())
    dialog!.onConfirm()
    await settle()

    expect(ticks.length).toBe(1)

    remote = body("x", "[Preview](https://pr7-design.preview.example.com)")
    ticks[0]!()
    await settle()

    expect(design().links.length).toBe(1)
    expect(cleared).toBe(1)
  })

  test("nothing pending, nothing watched", () => {
    previews = read(body("x", "[Preview](https://pr7-design.preview.example.com)"))
    createPreviewDeploys(deps).watch()

    expect(ticks).toEqual([])
  })

  test("watching twice is one watch", () => {
    previews = read(body("x"))
    const deploys = createPreviewDeploys(deps)
    deploys.watch()
    deploys.watch()

    expect(ticks.length).toBe(1)
  })
})

describe("a build's jobs", () => {
  test("the running and the broken first, the green last", () => {
    const links = jobLinks([
      { name: "lint", status: "completed", conclusion: "success", url: "u1" },
      { name: "test", status: "completed", conclusion: "failure", url: "u2" },
      { name: "deploy", status: "queued", conclusion: null, url: "u3" },
      { name: "build", status: "in_progress", conclusion: null, url: "u4" },
    ])

    expect(links.map((link) => [link.label, link.detail])).toEqual([
      ["● build", "in progress"],
      ["○ deploy", "queued"],
      ["✗ test", "failure"],
      ["✓ lint", "success"],
    ])
  })

  test("showBuild lists the run's jobs under the app", async () => {
    deps.api.fetchRunJobs = async (_o, _r, runId) => {
      expect(runId).toBe("99")
      return [{ name: "build", status: "in_progress", conclusion: null, url: "u" }]
    }
    await createPreviewDeploys(deps).showBuild(design(), (source, title) => opened.push({ source, title }))

    expect(opened).toEqual([
      { source: { title: "🎨 Design System", links: [{ label: "● build", url: "u", detail: "in progress" }] }, title: "Build — 🎨 Design System" },
    ])
  })
})
