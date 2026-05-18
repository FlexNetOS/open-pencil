import { BUILTIN_IO_FORMATS, IORegistry, type ReadDocumentResult } from '@open-pencil/core/io'
import { parseFigFile } from '@open-pencil/core/io/formats/fig'
import { parseFigMakeFile } from '@open-pencil/core/io/formats/figmake'

const io = new IORegistry(BUILTIN_IO_FORMATS)
const FIG_MAKE_MAGIC = new TextEncoder().encode('fig-makej')

function isFigFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.fig')
}

function isFigMakeData(data: Uint8Array): boolean {
  if (data.length < FIG_MAKE_MAGIC.length) return false
  return FIG_MAKE_MAGIC.every((byte, index) => data[index] === byte)
}

function copyToArrayBuffer(data: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(data.byteLength)
  copy.set(data)
  return copy.buffer
}

export async function readDesignFile(file: File): Promise<ReadDocumentResult> {
  const data = new Uint8Array(await file.arrayBuffer())

  if (isFigFile(file.name)) {
    const buffer = copyToArrayBuffer(data)
    if (isFigMakeData(data)) {
      return {
        graph: await parseFigMakeFile(buffer, { populate: 'first-page' }),
        sourceFormat: 'figmake'
      }
    }
    return { graph: await parseFigFile(buffer, { populate: 'first-page' }), sourceFormat: 'fig' }
  }

  return io.readDocument({
    name: file.name,
    mimeType: file.type || undefined,
    data
  })
}
