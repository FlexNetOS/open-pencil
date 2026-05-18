import { importNodeChanges } from '#core/kiwi/fig/import'
import { deduplicateNodeChangePluginData } from '#core/kiwi/fig/parse/core'
import type { SceneGraph } from '#core/scene-graph'

import { parseFigMakeBuffer } from './parse'

export interface ParseFigMakeFileOptions {
  populate?: 'all' | 'first-page'
}

function parseFigMakeFileSync(buffer: ArrayBuffer, options: ParseFigMakeFileOptions = {}): SceneGraph {
  const { nodeChanges, blobs, images: imageEntries, figKiwiVersion } = parseFigMakeBuffer(buffer)
  deduplicateNodeChangePluginData(nodeChanges)
  const graph = importNodeChanges(nodeChanges, blobs, new Map(imageEntries), options)
  graph.figKiwiVersion = figKiwiVersion
  return graph
}

export async function parseFigMakeFile(
  buffer: ArrayBuffer,
  options: ParseFigMakeFileOptions = {}
): Promise<SceneGraph> {
  return parseFigMakeFileSync(buffer, options)
}

export async function readFigMakeFile(
  file: File,
  options: ParseFigMakeFileOptions = {}
): Promise<SceneGraph> {
  return parseFigMakeFile(await file.arrayBuffer(), options)
}
