import { test, expect, describe } from "bun:test"
import { safeGhCommand } from "./exec"

function failing(error: unknown): () => Promise<never> {
  return () => Promise.reject(error)
}

describe("a failed gh call, as safeGhCommand reports it", () => {
  test("a logged-out gh says how to log in", async () => {
    const error = new Error("To get started with GitHub CLI, please run:  gh auth login")
    await expect(safeGhCommand(failing(error))).rejects.toThrow("Not logged in to GitHub. Run: gh auth login")
  })

  test("an unknown PR says to check the number", async () => {
    const error = new Error("GraphQL: Could not resolve to a PullRequest with the number of 99999.")
    await expect(safeGhCommand(failing(error))).rejects.toThrow("PR not found. Check the PR number and repository.")
  })

  test("outside a repository it says how to name one", async () => {
    const error = new Error("fatal: not a git repository (or any of the parent directories): .git")
    await expect(safeGhCommand(failing(error))).rejects.toThrow(
      "Not in a git repository. Specify full repo: riff gh:owner/repo#123",
    )
  })

  test("anything else carries the API's own words from stdout, with the streams and the cause", async () => {
    const stdout = Buffer.from(
      '{"message":"Validation Failed","errors":[{"message":"pull_request_review_thread.line could not be resolved"}]}',
    )
    const stderr = Buffer.from("gh: Validation Failed (HTTP 422)")
    const shellError = { message: "Failed with exit code 1", stdout, stderr }

    const thrown = await safeGhCommand(failing(shellError)).catch((e: unknown) => e)

    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).toBe("GitHub can't anchor a comment there — the line is outside the diff")
    expect((thrown as Error).cause).toBe(shellError)
    expect(thrown).toMatchObject({ stdout, stderr })
  })
})
