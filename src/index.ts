import { createApp } from "./app"

async function main() {
  try {
    await createApp()
  } catch (error) {
    console.error("Failed to start neoriff:", error)
    process.exit(1)
  }
}

main()
