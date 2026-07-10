/**
 * Linter de documentación.
 * Verifica que los archivos esenciales de documentación existen
 * y que los archivos .ts en src/ tienen TSDoc en sus exports públicos.
 *
 * Uso: `pnpm lint:docs`
 * Exit code: 0 si todo OK, 1 si hay errores.
 */

import { existsSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { resolve, relative } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const DOCS_DIR = resolve(ROOT, '../../docs')
const SRC_DIR = resolve(ROOT, 'src')

const REQUIRED_DOCS = [
  ['README.md (raíz)', resolve(ROOT, '../../README.md')],
  ['ADR 001: Arquitectura', resolve(DOCS_DIR, 'adr/001-arquitectura-del-sistema.md')],
  ['ADR 002: Persistencia', resolve(DOCS_DIR, 'adr/002-persistencia-de-datos.md')],
  ['ADR 003: Diagnóstico MCP', resolve(DOCS_DIR, 'adr/003-diagnostico-cognitivo-mcp.md')],
  ['docs/README.md', resolve(DOCS_DIR, 'README.md')],
]

const TSDOC_REGEX = /\/\*\*[\s\S]*?\*\//

let errors = 0

function fail(msg: string): void {
  console.error(`  ❌ ${msg}`)
  errors++
}

function ok(msg: string): void {
  console.log(`  ✅ ${msg}`)
}

function checkRequiredDocs(): void {
  console.log('\n📋 Documentos requeridos:')
  for (const [name, path] of REQUIRED_DOCS) {
    if (existsSync(path)) {
      ok(`${name} — ${relative(ROOT, path)}`)
    } else {
      fail(`${name} — NO ENCONTRADO en ${path}`)
    }
  }
}

async function collectTsFiles(dir: string): Promise<string[]> {
  const files: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      files.push(...await collectTsFiles(full))
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(full)
    }
  }
  return files
}

async function checkTsdocInSourceFiles(): Promise<void> {
  console.log('\n📝 TSDoc en archivos fuente:')
  if (!existsSync(SRC_DIR)) {
    ok('(src/ no existe aún — sin archivos que verificar)')
    return
  }

  const tsFiles = await collectTsFiles(SRC_DIR)
  if (tsFiles.length === 0) {
    ok('(src/ está vacío — sin archivos que verificar)')
    return
  }

  for (const file of tsFiles) {
    const content = await readFile(file, 'utf-8')
    const relPath = relative(ROOT, file)

    const lines = content.split('\n')
    const exportLines = lines
      .map((line, i) => ({ line, idx: i }))
      .filter(({ line }) => /^export\s+(interface|type|class|const|function|enum|default\s+class)/.test(line.trim()))

    if (exportLines.length === 0) {
      ok(`${relPath} — sin exports públicos (interno o test)`)
      continue
    }

    const hasTsdoc = TSDOC_REGEX.test(content)
    if (hasTsdoc) {
      ok(`${relPath} — contiene TSDoc`)
    } else {
      fail(`${relPath} — TIENE EXPORTS PÚBLICOS pero ningún bloque TSDoc`)
    }
  }
}

async function main(): Promise<void> {
  console.log('🔍 Verificación de documentación')

  checkRequiredDocs()
  await checkTsdocInSourceFiles()

  console.log(`\n${errors === 0 ? '✅ Todo correcto.' : `❌ ${errors} error(es) encontrado(s).`}`)
  process.exit(errors > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('Error en lint-docs:', err)
  process.exit(1)
})
