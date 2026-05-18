import type { EditorStore } from '@/app/editor/active-store'
import { openFileFromPath } from '@/app/shell/menu/use'
import { createTab, openFileInNewTab } from '@/app/tabs'
import { isTauri } from '@/app/tauri/env'

function optionalPath(args: unknown): string | undefined {
  const path = (args as { path?: unknown } | null)?.path
  return typeof path === 'string' && path.trim() ? path : undefined
}

export async function handleSaveFile(store: EditorStore, args?: unknown): Promise<unknown> {
  const path = optionalPath(args)
  if (path) {
    if (!isTauri()) throw new Error('Saving to a path requires the desktop app')
    store.setPlannedFilePath(path)
    await ensureTauriParentDirectory(path)
  }
  await store.saveFigFile()
  if (path) store.startWatchingCurrentFile()
  return { ok: true }
}

export async function ensureTauriParentDirectory(path: string): Promise<void> {
  if (!isTauri()) return
  const { mkdir } = await import('@tauri-apps/plugin-fs')
  const dir = path.replace(/[\\/][^\\/]+$/, '')
  await mkdir(dir, { recursive: true })
}

export async function handleNewDocument(_store: EditorStore, args: unknown): Promise<unknown> {
  const path = (args as { path?: string }).path
  const tab = createTab()
  if (path) {
    tab.store.setPlannedFilePath(path)
    await ensureTauriParentDirectory(path)
    await tab.store.saveFigFile()
    tab.store.startWatchingCurrentFile()
  }
  return { ok: true }
}

export async function handleOpenFile(_store: EditorStore, args: unknown): Promise<unknown> {
  const path = (args as { path?: string }).path
  if (!path) throw new Error('Missing "path" in args')
  if (isTauri()) {
    await openFileFromPath(path)
  } else {
    const response = await fetch(path)
    if (!response.ok) throw new Error(`Failed to fetch file: ${response.statusText}`)
    const name = path.split(/[\\/]/).pop() ?? 'file.fig'
    const file = new File([await response.blob()], name)
    await openFileInNewTab(file, undefined, path)
  }
  return { ok: true }
}
