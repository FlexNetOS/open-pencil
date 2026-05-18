import { describe, test, expect } from 'bun:test'

import { SceneGraph, computeAllLayouts } from '@open-pencil/core'
import { exportPenFile, parsePenFile } from '@open-pencil/core/io/formats/pen'

function hasParentCycle(graph: SceneGraph): string[] | null {
  for (const node of graph.getAllNodes()) {
    const visited = new Set<string>()
    const path: string[] = []
    let current: string | null = node.id
    while (current) {
      if (visited.has(current)) {
        return [...path, current]
      }
      visited.add(current)
      path.push(current)
      const n = graph.getNode(current)
      current = n?.parentId ?? null
    }
  }
  return null
}

describe('.pen round-trip', () => {
  test('simple frame tree survives export and re-import', () => {
    const graph = new SceneGraph()
    for (const page of graph.getPages(true)) {
      graph.deleteNode(page.id)
    }
    const page = graph.addPage('Test Page')
    const frame = graph.createNode('FRAME', page.id, { name: 'Container', width: 400, height: 300 })
    const rect = graph.createNode('RECTANGLE', frame.id, { name: 'Box', width: 100, height: 100 })

    const penBytes = exportPenFile(graph)
    const penJson = new TextDecoder().decode(penBytes)
    const restored = parsePenFile(penJson)

    const cycle = hasParentCycle(restored)
    expect(cycle).toBeNull()

    computeAllLayouts(restored)

    const restoredPage = restored.getPages()[0]
    expect(restoredPage).toBeDefined()
    expect(restoredPage.childIds.length).toBe(1)

    const restoredFrame = restored.getNode(restoredPage.childIds[0])
    expect(restoredFrame?.type).toBe('FRAME')
    expect(restoredFrame?.name).toBe('Container')
    expect(restoredFrame?.childIds.length).toBe(1)

    const restoredRect = restored.getNode(restoredFrame.childIds[0])
    expect(restoredRect?.type).toBe('RECTANGLE')
    expect(restoredRect?.name).toBe('Box')
  })

  test('IDs do not collide with graph-internal page ID', () => {
    const graph = new SceneGraph()
    for (const page of graph.getPages(true)) {
      graph.deleteNode(page.id)
    }

    const page = graph.addPage('Page')
    const pageId = page.id

    const penBytes = exportPenFile(graph)
    const penJson = new TextDecoder().decode(penBytes)

    const doc = JSON.parse(penJson)
    doc.children.push({
      id: pageId,
      type: 'frame',
      name: 'Evil Twin',
      width: 100,
      height: 100
    })

    const restored = parsePenFile(JSON.stringify(doc))
    const cycle = hasParentCycle(restored)
    expect(cycle).toBeNull()

    const pages = restored.getPages()
    expect(pages.length).toBe(1)
    expect(pages[0].childIds.length).toBe(1)

    const child = restored.getNode(pages[0].childIds[0])
    expect(child?.name).toBe('Evil Twin')
  })
})
