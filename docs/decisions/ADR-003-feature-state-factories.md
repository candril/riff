# ADR-003: Feature state lives in factories, read into the frame

## Status
Proposed

## Context
riff keeps its state in one plain-value `AppState`, rebuilt by updaters and published to the islands as a whole each render pass ([spec 100](../../specs/100-solid-migration.md), M6). tenor keeps each feature's state in a `createXState()` factory of Solid signals with actions beside them, and riff's chat already follows it. Moving every slice at once would touch every feature in one change; the islands still follow the one frame the pass publishes, and nothing re-renders when a signal changes.

## Decision
Feature state moves out of `AppState` into `createXState()` factories of tenor's shape, one feature per step; the help overlay is the first. Until each island reads its factory itself:
- The frame pass reads each factory's accessors into the published `Frame`, and the focus rules in `src/app/diff-focus.ts` read them through `OutsideOverlays`, so every island keeps following one frame.
- Actions do not render. Callers call `render()` after them, as they do after `setState`, until the frame pass follows the factories itself.

## Consequences
- `createInitialState` does not reach a factory, so a reload that used to reset a slice by rebuilding `AppState` must reset that factory explicitly.
