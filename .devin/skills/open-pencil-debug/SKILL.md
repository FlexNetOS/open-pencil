---
name: open-pencil-debug
description: Debug OpenPencil crashes, cycles, and layout issues. Use when .pen round-trips fail, resolveComputedLayoutDirection overflows, or SceneGraph parent/child cycles are suspected.
---

# OpenPencil Debug Skill

Diagnostic checklist for crashes related to `.pen` file round-tripping, layout computation, and scene graph integrity.

## 1. Reproduce the crash

- Convert a `.fig` to `.pen` and read it back:
  ```bash
  openpencil convert canvas.fig out.pen -f pen && openpencil info out.pen
  ```
- If the CLI crashes with `Maximum call stack size exceeded` in `resolveComputedLayoutDirection`, a parent cycle exists in the parsed `SceneGraph`.

## 2. Detect cycles programmatically

Use `SceneGraph.detectCycles()`:

```typescript
import { parsePenFile } from '@open-pencil/core'

const graph = parsePenFile(penJson)
const cycle = graph.detectCycles()
if (cycle) {
  console.error('Cycle detected:', cycle.join(' -> '))
}
```

This follows `parentId` pointers from every node and reports the first cycle found.

## 3. Validate round-trip integrity in tests

```typescript
import { parsePenFile, computeAllLayouts } from '@open-pencil/core'
import { exportPenFile } from '@open-pencil/core/io/formats/pen'

const data = exportPenFile(graph)
const restored = parsePenFile(new TextDecoder().decode(data))

expect(restored.detectCycles()).toBeNull()
expect(() => computeAllLayouts(restored)).not.toThrow()
```

## 4. Common root causes

### Cause A: Duplicate node IDs during `.pen` deserialization

The `.pen` reader used to pass `id: pen.id` directly to `SceneGraph.createNode`. If a pen node's explicit `id` collided with an already-generated ID (e.g., the Document or Page ID), the new node silently overwrote the existing node, corrupting parent/child links and creating cycles.

**Fix**: `SceneGraph.createNode` now drops a conflicting `overrides.id` before calling `createDefaultNode`, so a fresh auto-generated ID is used instead of silently overwriting the existing node. The `.pen` reader's `componentIds` map already tracks the mapping from pen IDs to actual node IDs for reusable components and refs.

### Cause B: Fig-make vs fig-kiwi fallback bug

The `.fig` format adapter in `packages/core/src/io/formats.ts` used to re-throw `Invalid fig-make header` errors instead of falling back to standard fig parsing, because the error message contains `fig-make`.

**Fix**: The fallback condition now only throws for genuinely corrupted fig-make files (`Corrupted fig-make` or `No nodes found`), and falls back to `parseFigFile` for invalid headers.

### Cause C: `resolveComputedLayoutDirection` infinite recursion

`resolveComputedLayoutDirection` traverses `parentId` without a visited guard. A cycle in `parentId` causes a stack overflow.

**Fix**: Use `SceneGraph.detectCycles()` to find the cycle before layout computation. The cycle must be fixed in the graph structure (usually by fixing the reader/serializer that introduced it).

## 5. Tracing `resolveComputedLayoutDirection`

- Located at `packages/core/src/layout.ts:54-61`
- Recursive: `resolveComputedLayoutDirection(graph, node)` → `resolveComputedLayoutDirection(graph, parent)`
- If a node is its own ancestor (directly or transitively), this overflows.

## 6. MCP / gitnexus tools for investigation

- Use `mcp0_query` with `"resolveComputedLayoutDirection pen round-trip"` to find related execution flows.
- Use `mcp0_impact` on `SceneGraph.createNode` to see what depends on it.
- Use `mcp0_detect_changes` before committing to verify your fix doesn't break unrelated flows.

## 7. Running regression tests

```bash
bun test ./tests/engine/pen/repro.test.ts
bun test ./tests/engine/io/pen-roundtrip.test.ts
```

These verify:
- `.pen` round-trip produces an acyclic graph
- `computeAllLayouts` does not throw after round-trip
- `SceneGraph.detectCycles()` correctly finds and rejects cyclic graphs
- Explicit pen IDs that collide with internal page IDs are safely remapped
