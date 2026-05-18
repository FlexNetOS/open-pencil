import { describe, expect, test } from 'bun:test'
import { SceneGraph, parsePenFile, parseFigFile, computeLayout } from '@open-pencil/core'
import { exportPenFile } from '@open-pencil/core/io/formats/pen'
import { readFileSync } from 'fs'
import { repoPath } from '#tests/helpers/paths'

describe('pen round-trip crash repro', () => {
  test('pencil_button round-trip should not crash layout', async () => {
    const text = await Bun.file(repoPath('tests/fixtures/pencil_button.pen')).text()
    const graph = parsePenFile(text)
    const data = exportPenFile(graph)
    const graph2 = parsePenFile(new TextDecoder().decode(data))

    expect(graph2.detectCycles()).toBeNull()

    for (const node of graph2.getAllNodes()) {
      if (node.layoutMode !== 'NONE') {
        expect(() => computeLayout(graph2, node.id)).not.toThrow()
      }
    }
  })

  test('canvas.fig -> pen round-trip should not crash layout', async () => {
    const bytes = readFileSync(repoPath('canvas.fig'))
    const graph = await parseFigFile(bytes.buffer as ArrayBuffer)
    const originalCount = [...graph.getAllNodes()].length

    const data = exportPenFile(graph)
    const graph2 = parsePenFile(new TextDecoder().decode(data))
    const roundTripCount = [...graph2.getAllNodes()].length

    expect(graph2.detectCycles()).toBeNull()
    expect(roundTripCount).toBeGreaterThanOrEqual(originalCount * 0.9)

    for (const node of graph2.getAllNodes()) {
      if (node.layoutMode !== 'NONE') {
        expect(() => computeLayout(graph2, node.id)).not.toThrow()
      }
    }
  })

  test('.pen reader guards against cyclic parent references on ID collision', () => {
    const graph = new SceneGraph()
    const page = graph.addPage('Page')
    // Create a frame that will get an auto-generated ID
    const frame = graph.createNode('FRAME', page.id, { name: 'Frame' })
    // Export the graph to .pen
    const data = exportPenFile(graph)
    const json = new TextDecoder().decode(data)
    // Parse it back into a fresh graph
    const graph2 = parsePenFile(json)
    expect(graph2.detectCycles()).toBeNull()
  })
})

describe('SceneGraph cycle detection', () => {
  test('detectCycles returns null for acyclic graph', () => {
    const graph = new SceneGraph()
    const page = graph.addPage('Page')
    const frame = graph.createNode('FRAME', page.id, { name: 'Frame' })
    const rect = graph.createNode('RECTANGLE', frame.id, { name: 'Rect' })

    expect(graph.detectCycles()).toBeNull()
  })

  test('detectCycles finds a 2-node parent cycle', () => {
    const graph = new SceneGraph()
    const page = graph.addPage('Page')
    const a = graph.createNode('FRAME', page.id, { name: 'A' })
    const b = graph.createNode('FRAME', page.id, { name: 'B' })

    // Manually create a cycle
    a.parentId = b.id
    b.parentId = a.id

    const cycle = graph.detectCycles()
    expect(cycle).not.toBeNull()
    expect(cycle!.length).toBeGreaterThanOrEqual(2)
  })
})
