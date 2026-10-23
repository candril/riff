import { describe, expect, test } from "bun:test"
import { createPrInfoFilterState } from "./filter-state"

const shape = (f: ReturnType<typeof createPrInfoFilterState>) => ({ filter: f.filter(), filterInput: f.filterInput() })

describe("createPrInfoFilterState", () => {
  test("starts empty with its prompt closed", () => {
    expect(shape(createPrInfoFilterState())).toEqual({ filter: "", filterInput: false })
  })

  test("start opens the prompt and keeps the text", () => {
    const f = createPrInfoFilterState()
    f.set("greet")
    f.start()
    expect(shape(f)).toEqual({ filter: "greet", filterInput: true })
  })

  test("set changes only the text", () => {
    const f = createPrInfoFilterState()
    f.start()
    f.set("gr")
    expect(shape(f)).toEqual({ filter: "gr", filterInput: true })
  })

  test("commit closes the prompt and keeps the text", () => {
    const f = createPrInfoFilterState()
    f.start()
    f.set("greet")
    f.commit()
    expect(shape(f)).toEqual({ filter: "greet", filterInput: false })
  })

  test("clear empties the text and closes the prompt", () => {
    const f = createPrInfoFilterState()
    f.start()
    f.set("greet")
    f.clear()
    expect(shape(f)).toEqual({ filter: "", filterInput: false })
  })
})
