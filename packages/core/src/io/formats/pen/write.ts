import type { Color, SceneGraph, SceneNode, Stroke, Effect } from '#core/scene-graph'
import type { PenDocument, PenNode } from './convert'

const REVERSE_NODE_TYPE: Record<string, string> = {
  FRAME: 'frame',
  RECTANGLE: 'rectangle',
  ELLIPSE: 'ellipse',
  TEXT: 'text',
  VECTOR: 'vector',
  COMPONENT: 'frame',
  INSTANCE: 'frame',
  LINE: 'line',
  STAR: 'star',
  POLYGON: 'polygon',
  SECTION: 'section',
  GROUP: 'frame',
  CANVAS: 'frame'
}

function colorToHex(color: Color, opacity?: number): string | undefined {
  if (!color) return undefined
  const { r, g, b, a = 1 } = color
  const rr = Math.round(r * 255)
  const gg = Math.round(g * 255)
  const bb = Math.round(b * 255)
  const aa = (opacity !== undefined ? opacity : a) < 1
    ? Math.round((opacity !== undefined ? opacity : a) * 255).toString(16).padStart(2, '0')
    : ''
  return `#${rr.toString(16).padStart(2, '0')}${gg.toString(16).padStart(2, '0')}${bb.toString(16).padStart(2, '0')}${aa}`
}

function serializeStrokes(strokes: Stroke[]): { align: 'inside' | 'center' | 'outside'; thickness: number; fill?: string; join?: string; cap?: string } | undefined {
  if (!strokes || strokes.length === 0) return undefined
  const stroke = strokes[0]
  return {
    align: stroke.align.toLowerCase() as 'inside' | 'center' | 'outside',
    thickness: stroke.weight ?? 1,
    fill: colorToHex(stroke.color, stroke.opacity),
    join: stroke.join?.toLowerCase(),
    cap: stroke.cap?.toLowerCase()
  }
}

function serializeEffects(effects: Effect[]): { type: string; shadowType?: string; color?: string; offset?: { x: number; y: number }; blur?: number; spread?: number }[] | undefined {
  if (!effects || effects.length === 0) return undefined
  return effects.map((e) => ({
    type: e.type.toLowerCase(),
    shadowType: e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW' ? e.type.toLowerCase().replace('_', '-') : undefined,
    color: colorToHex(e.color),
    offset: e.offset,
    blur: e.radius,
    spread: e.spread
  }))
}

function serializeNode(node: SceneNode, graph: SceneGraph): PenNode {
  const pen: PenNode = {
    id: node.id,
    type: REVERSE_NODE_TYPE[node.type] ?? 'frame',
    name: node.name
  }

  if (node.x !== undefined && node.x !== 0) pen.x = node.x
  if (node.y !== undefined && node.y !== 0) pen.y = node.y
  if (node.width !== undefined) pen.width = node.width
  if (node.height !== undefined) pen.height = node.height

  if (node.fills && node.fills.length > 0) {
    const fill = node.fills[0]
    if (fill.type === 'SOLID' && fill.color) {
      pen.fill = colorToHex(fill.color, fill.opacity)
    }
  }

  if (node.strokes && node.strokes.length > 0) {
    pen.stroke = serializeStrokes(node.strokes)
  }

  if (node.effects && node.effects.length > 0) {
    pen.effect = serializeEffects(node.effects)
  }

  if (node.opacity !== undefined && node.opacity !== 1) pen.opacity = node.opacity
  if (node.visible === false) pen.enabled = false
  if (node.rotation !== 0) pen.rotation = node.rotation
  if (node.cornerRadius !== 0) pen.cornerRadius = node.cornerRadius

  if (node.layoutMode && node.layoutMode !== 'NONE') {
    pen.layout = node.layoutMode === 'HORIZONTAL' ? 'row' : 'column'
    pen.gap = node.itemSpacing || undefined
    if (node.paddingTop !== 0 || node.paddingRight !== 0 || node.paddingBottom !== 0 || node.paddingLeft !== 0) {
      pen.padding = [node.paddingTop, node.paddingRight, node.paddingBottom, node.paddingLeft]
    }
    pen.justifyContent = node.primaryAxisAlign === 'MIN' ? 'start' : node.primaryAxisAlign === 'CENTER' ? 'center' : node.primaryAxisAlign === 'MAX' ? 'end' : node.primaryAxisAlign === 'SPACE_BETWEEN' ? 'space-between' : undefined
    pen.alignItems = node.counterAxisAlign === 'MIN' ? 'start' : node.counterAxisAlign === 'CENTER' ? 'center' : node.counterAxisAlign === 'MAX' ? 'end' : node.counterAxisAlign === 'STRETCH' ? 'stretch' : undefined
  }

  if (node.type === 'TEXT') {
    if (node.text) pen.content = node.text
    if (node.fontFamily) pen.fontFamily = node.fontFamily
    if (node.fontSize) pen.fontSize = node.fontSize
    if (node.fontWeight && node.fontWeight !== 400) pen.fontWeight = node.fontWeight
    if (node.lineHeight) pen.lineHeight = node.lineHeight
    if (node.letterSpacing !== 0) pen.letterSpacing = node.letterSpacing
    if (node.textAlignHorizontal !== 'LEFT') pen.textAlign = node.textAlignHorizontal.toLowerCase()
    if (node.textAlignVertical && node.textAlignVertical !== 'TOP') pen.textAlignVertical = node.textAlignVertical.toLowerCase()
  }

  if (node.childIds && node.childIds.length > 0) {
    pen.children = node.childIds
      .map((id) => graph.getNode(id))
      .filter((n): n is SceneNode => n !== undefined)
      .map((n) => serializeNode(n, graph))
  }

  return pen
}

export function exportPenFile(graph: SceneGraph): Uint8Array {
  const pages = graph.getPages(true)
  const children: PenNode[] = []

  for (const page of pages) {
    for (const childId of page.childIds) {
      const child = graph.getNode(childId)
      if (child) {
        children.push(serializeNode(child, graph))
      }
    }
  }

  const doc: PenDocument = {
    version: '1.0.0',
    children
  }

  const json = JSON.stringify(doc, null, 2)
  return new TextEncoder().encode(json)
}
