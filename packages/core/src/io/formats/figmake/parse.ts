import { inflateSync } from 'fflate'
import { decompress as zstdDecompress } from 'fzstd'

import type { NodeChange } from '#core/kiwi/binary/codec'
import { ByteBuffer, decodeBinarySchema, compileSchema } from '#core/kiwi/kiwi-schema'

export interface FigMakeParseResult {
  nodeChanges: NodeChange[]
  blobs: Uint8Array[]
  images: Array<[string, Uint8Array]>
  figKiwiVersion: number
}

const FIG_MAKE_MAGIC = 'fig-makej'
const SCHEMA_CHUNK_VERSION = 0

/**
 * Parse a fig-make format buffer.
 *
 * fig-make is Figma's code-export bundle format. It consists of:
 * - 9 bytes: "fig-makej" magic
 * - 3 bytes: padding
 * - 4 bytes LE: chunk 0 compressed length (raw deflate compressed binary kiwi schema)
 * - N bytes: raw deflate compressed schema
 * - 4 bytes LE: chunk 1 compressed length (Zstd compressed scene data)
 * - M bytes: Zstd compressed scene data
 *
 * The scene data is a kiwi-encoded Message containing nodeChanges and blobs.
 */
export function parseFigMakeBuffer(buffer: ArrayBuffer): FigMakeParseResult {
  const data = new Uint8Array(buffer)

  // Validate header
  const header = new TextDecoder().decode(data.slice(0, 9))
  if (header !== FIG_MAKE_MAGIC) {
    throw new Error(`Invalid fig-make header: expected "${FIG_MAKE_MAGIC}", got "${header}"`)
  }

  // Read chunk 0 length (raw deflate schema)
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const schemaCompressedLen = view.getUint32(12, true)
  const schemaOffset = 16
  const schemaEnd = schemaOffset + schemaCompressedLen

  if (schemaEnd > data.length) {
    throw new Error(
      `Corrupted fig-make file: schema chunk declares length ${schemaCompressedLen} but only ${data.length - schemaOffset} bytes remain`
    )
  }

  const schemaCompressed = data.slice(schemaOffset, schemaEnd)

  // Decompress schema with raw deflate (no zlib header)
  let schemaDecompressed: Uint8Array
  try {
    schemaDecompressed = inflateSync(schemaCompressed)
  } catch {
    // Try raw deflate by prepending a dummy zlib header
    const dummyHeader = new Uint8Array([0x78, 0x9c])
    const withHeader = new Uint8Array(dummyHeader.length + schemaCompressed.length)
    withHeader.set(dummyHeader)
    withHeader.set(schemaCompressed, dummyHeader.length)
    schemaDecompressed = inflateSync(withHeader)
  }

  // Parse binary schema
  const schemaBB = new ByteBuffer(schemaDecompressed)
  const schema = decodeBinarySchema(schemaBB)
  const compiled = compileSchema(schema) as {
    decodeMessage(data: Uint8Array): { nodeChanges?: NodeChange[]; blobs?: Array<{ bytes: Uint8Array }> }
  }

  // Read chunk 1 length (Zstd compressed scene data)
  const dataOffset = schemaEnd + 4
  if (schemaEnd + 4 > data.length) {
    throw new Error(`Corrupted fig-make file: no data chunk length field`)
  }
  const dataCompressedLen = view.getUint32(schemaEnd, true)
  const dataEnd = dataOffset + dataCompressedLen

  if (dataEnd > data.length) {
    throw new Error(
      `Corrupted fig-make file: data chunk declares length ${dataCompressedLen} but only ${data.length - dataOffset} bytes remain`
    )
  }

  const dataCompressed = data.slice(dataOffset, dataEnd)

  // Decompress scene data with Zstd
  const dataDecompressed = zstdDecompress(dataCompressed)

  // Decode the kiwi message
  const message = compiled.decodeMessage(dataDecompressed)

  const nodeChanges = message.nodeChanges ?? []
  if (nodeChanges.length === 0) {
    throw new Error('No nodes found in fig-make file')
  }

  const blobs: Uint8Array[] = (message.blobs ?? []).map((b) =>
    b.bytes instanceof Uint8Array ? b.bytes : new Uint8Array(Object.values(b.bytes))
  )

  return { nodeChanges, blobs, images: [], figKiwiVersion: SCHEMA_CHUNK_VERSION }
}
