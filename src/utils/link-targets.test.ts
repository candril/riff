import { test, expect, describe } from "bun:test"
import { collectFromSources, collectLinks } from "./link-targets"
import type { ResolvedReference } from "./references"

const repo = { owner: "DigitecGalaxus", repo: "Dg.GalaxusAbos" }
const resolved = new Map<string, ResolvedReference>([
  [
    "DigitecGalaxus/Dg.GalaxusAbos#1213",
    { title: "Fix contract renewal", state: "merged", pull: true },
  ],
])

function links(text: string) {
  return collectLinks(text, { repo, resolved })
}

describe("the links in a comment", () => {
  test("a reference is listed as what it points at", () => {
    expect(links("follows #1213, see there")).toEqual([
      {
        label: "#1213",
        url: "https://github.com/DigitecGalaxus/Dg.GalaxusAbos/pull/1213",
        detail: "Fix contract renewal (merged)",
      },
    ])
  })

  test("one riff never looked up is still somewhere to go", () => {
    expect(links("also #99")).toEqual([
      {
        label: "#99",
        url: "https://github.com/DigitecGalaxus/Dg.GalaxusAbos/pull/99",
        detail: undefined,
      },
    ])
  })

  test("another repo's reference keeps its full name", () => {
    expect(links("see other/repo#7")[0]?.label).toBe("other/repo#7")
  })

  test("a markdown link is its text, with the URL beside it", () => {
    expect(links("the [build log](https://ci.example.com/8812) says no")).toEqual([
      { label: "build log", url: "https://ci.example.com/8812", detail: "https://ci.example.com/8812" },
    ])
  })

  test("a bare URL is itself", () => {
    expect(links("https://ci.example.com/8812 failed")[0]).toEqual({
      label: "ci.example.com/8812",
      url: "https://ci.example.com/8812",
      detail: undefined,
    })
  })

  test("a reference pasted as a URL is one link, said the better way", () => {
    const found = links("see https://github.com/DigitecGalaxus/Dg.GalaxusAbos/pull/1213 for why")

    expect(found).toHaveLength(1)
    expect(found[0]?.detail).toBe("Fix contract renewal (merged)")
  })

  test("in the order they are written", () => {
    expect(links("first https://a.example.com then #1213").map((link) => link.label)).toEqual([
      "a.example.com",
      "#1213",
    ])
  })

  test("a link inside a code fence is not one — nobody meant to go there", () => {
    expect(links("run this:\n\n```\ncurl #1213\n```\n")).toEqual([])
  })

  test("a repo named without its owner is read against this one", () => {
    const known = new Map([
      ["DigitecGalaxus/Dg.GalaxusAbos#1213", { title: "Fix renewal", state: "merged", pull: true }],
    ])

    expect(collectLinks("blocked by Dg.GalaxusAbos#1213", { repo, resolved: known })).toEqual([
      {
        label: "Dg.GalaxusAbos#1213",
        url: "https://github.com/DigitecGalaxus/Dg.GalaxusAbos/pull/1213",
        detail: "Fix renewal (merged)",
      },
    ])
  })

  test("but not before riff knows it is one — `C#5` is prose", () => {
    expect(links("written in C#5 and shipped")).toEqual([])
  })

  test("nothing in, nothing out", () => {
    expect(links("no links at all")).toEqual([])
  })
})

describe("every link in the view", () => {
  test("the focused source first, each row saying where it came from", () => {
    const found = collectFromSources(
      [
        { title: "Shop", links: [{ label: "galaxus.ch", url: "https://galaxus.ch" }] },
        { title: "Description", text: "see #1213" },
      ],
      { repo, resolved },
    )

    expect(found.map((link) => link.label)).toEqual(["Shop · galaxus.ch", "Description · #1213"])
  })

  test("a link in two places is listed where you are standing", () => {
    const found = collectFromSources(
      [
        { title: "@alice", text: "https://ci.example.com/8812" },
        { title: "Description", text: "https://ci.example.com/8812" },
      ],
      { repo, resolved },
    )

    expect(found.map((link) => link.label)).toEqual(["@alice · ci.example.com/8812"])
  })

  test("one source says nothing extra — the picker's title already did", () => {
    const found = collectFromSources([{ title: "Shop", links: [{ label: "ch", url: "https://a" }] }], {
      repo,
      resolved,
    })

    expect(found[0]?.label).toBe("ch")
  })
})
