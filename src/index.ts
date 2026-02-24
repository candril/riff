import { createApp } from "./app"

async function main() {
  const args = process.argv.slice(2)
  const target = args[0] // undefined, "branch:main", "HEAD~3", "@-", etc.

  try {
    await createApp({ target })
  } catch (error) {
    console.error("Failed to start neoriff:", error)
    process.exit(1)
  }
}

main()
