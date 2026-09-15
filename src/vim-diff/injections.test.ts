import { test, expect, describe } from "bun:test"
import { injectedRegions, injectedHighlights } from "./injections"
import type { SimpleHighlight } from "@opentui/core"

const file = [
  'import { graphql } from "@segments/relay";',
  "",
  "const plan = useFragment(",
  "  graphql`",
  "    fragment tvPlanSection on TvProduct {",
  "      id",
  "    }",
  "  `,",
  "  key,",
  ");",
  "",
  'const label = `plain ${name} template`;',
].join("\n")

describe("the documents written inside a file", () => {
  test("are the tagged templates, not every template", () => {
    const regions = injectedRegions(file, "tsx")

    expect(regions).toHaveLength(1)
    expect(file.slice(regions[0]!.start, regions[0]!.end)).toContain("fragment tvPlanSection")
    expect(regions[0]!.filetype).toBe("graphql")
  })

  test("are only looked for where a template can hold one", () => {
    expect(injectedRegions(file, "csharp")).toEqual([])
    expect(injectedRegions("query = gql`{ id }`", "typescript")).toHaveLength(1)
  })

  test("do not start at a name that merely ends in the tag", () => {
    expect(injectedRegions("notgql`{ id }`", "typescript")).toEqual([])
  })

  test("end at the backtick that closes them, escapes aside", () => {
    const escaped = "gql`a \\` b` + `after`"
    const [region] = injectedRegions(escaped, "typescript")

    expect(escaped.slice(region!.start, region!.end)).toBe("a \\` b")
  })

  test("an unterminated one takes nothing with it", () => {
    expect(injectedRegions("gql`{ id }", "typescript")).toEqual([])
  })
})

describe("the highlights of an embedded document", () => {
  test("land where the text sits in the file", async () => {
    const region = injectedRegions(file, "tsx")[0]!
    const inner: SimpleHighlight[] = [[5, 13, "keyword"]]

    const moved = await injectedHighlights(file, "tsx", async () => inner)

    expect(moved).toEqual([[region.start + 5, region.start + 13, "keyword", undefined]])
    expect(file.slice(moved[0]![0], moved[0]![1])).toBe("fragment")
  })

  test("a document the parser cannot read leaves the rows alone", async () => {
    expect(await injectedHighlights(file, "tsx", async () => null)).toEqual([])
  })
})

describe("the CSS a component carries", () => {
  const component = [
    'const Dot = styled.span`',
    "  display: flex;",
    "  width: ${spacing[16]};",
    "`;",
    "",
    "const Link = styled(ButtonLink)`",
    "  ${actionStyle};",
    "`;",
    "",
    "const rule = css`",
    "  color: red;",
    "`;",
  ].join("\n")

  test("is found behind every form the builders take", () => {
    const regions = injectedRegions(component, "tsx")

    expect(regions.map((region) => region.filetype)).toEqual(["css", "css", "css"])
    expect(component.slice(regions[0]!.start, regions[0]!.end)).toContain("display: flex")
    expect(component.slice(regions[1]!.start, regions[1]!.end)).toContain("actionStyle")
  })

  test("leaves the host's expressions to the host", async () => {
    const region = injectedRegions(component, "tsx")[0]!
    const property = component.indexOf("display") - region.start
    const hole = component.indexOf("spacing") - region.start

    const moved = await injectedHighlights(component, "tsx", async (text) =>
      text.includes("display")
        ? [
            [property, property + 7, "property"],
            [hole, hole + 7, "tag"],
          ]
        : null
    )

    expect(moved).toHaveLength(1)
    expect(component.slice(moved[0]![0], moved[0]![1])).toBe("display")
  })
})
