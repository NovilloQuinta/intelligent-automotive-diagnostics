/**
 * TSDoc linter for CI pipelines.
 * Scans every .ts file under src/ and verifies that each public export
 * is preceded by a `/** ... *​/` TSDoc block.
 *
 * Usage: `pnpm lint:docs`
 * Exit code: 0 if all exports are documented, 1 otherwise.
 */

import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { resolve, relative } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const SRC_DIR = resolve(ROOT, 'src')

const TSDOC_REGEX = /\/\*\*[\s\S]*?\*\//
const EXPORT_REGEX = /^export\s+(default\s+)?(async\s+)?(interface|type|class|const|function|enum)\s/

let errors = 0

function fail(msg: string): void {
  console.error(`  ❌ ${msg}`)
  errors++
}

function ok(msg: string): void {
  console.log(`  ✅ ${msg}`)
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

function getExportedNames(content: string): { name: string; line: number }[] {
  const names: { name: string; line: number }[] = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    const match = line.match(EXPORT_REGEX)
    if (!match) continue

    const afterKeyword = line.slice(match[0].length).trim()
    const name = afterKeyword.split(/\s|\(|<|:/)[0]
    if (name) {
      names.push({ name, line: i + 1 })
    }
  }

  return names
}

function hasTsdocBeforeLine(content: string, lineNumber: number): boolean {
  const lines = content.split('\n')
  let j = lineNumber - 2

  if (j < 0) return false

  const trimmed = lines[j].trim()
  if (trimmed === '' || /^\*/.test(trimmed)) {
    for (let k = j; k >= 0; k--) {
      const t = lines[k].trim()
      if (/^\/\*\*/.test(t)) return true
      if (t === '' || /^\*/.test(t)) continue
      return false
    }
    return false
  }

  return /^\/\*\*/.test(trimmed)
}

async function checkTsdocInSourceFiles(): Promise<void> {
  console.log('\n📝 TSDoc verification:')
  if (!existsSync(SRC_DIR)) {
    ok('(src/ does not exist yet)')
    return
  }

  const tsFiles = await collectTsFiles(SRC_DIR)
  if (tsFiles.length === 0) {
    ok('(src/ is empty)')
    return
  }

  const exported = 0
  const checked = 0

  for (const file of tsFiles) {
    const content = await readFile(file, 'utf-8')
    const relPath = relative(ROOT, file)

    const exports = getExportedNames(content)

    if (exports.length === 0) {
      ok(`${relPath} — no public exports`)
      continue
    }

    for (const exp of exports) {
      if (hasTsdocBeforeLine(content, exp.line)) {
        ok(`${relPath}:${exp.line} — ${exp.name}`)
      } else {
        fail(`${relPath}:${exp.line} — export "${exp.name}" is missing TSDoc`)
      }
    }
  }
}

async function main(): Promise<void> {
  console.log('🔍 TSDoc lint')

  await checkTsdocInSourceFiles()

  console.log(`\n${errors === 0 ? '✅ All exports documented.' : `❌ ${errors} undocumented export(s).`}`)
  process.exit(errors > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('TSDoc lint failed:', err)
  process.exit(1)
})
