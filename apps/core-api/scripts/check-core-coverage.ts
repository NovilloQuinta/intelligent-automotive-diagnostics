/**
 * CI script: valida que los ficheros Core tengan 100% de cobertura.
 * Lee el JSON generado por vitest --coverage y verifica per-file.
 *
 * Uso: pnpm coverage:core
 * Exit code: 0 si Core >= 100%, 1 en caso contrario.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const COVERAGE_JSON = resolve(ROOT, 'coverage', 'coverage-final.json')

const CORE_FILES = ['src/application/diagnostics/processVehicleDiagnosis.ts']

interface FileCoverage {
  s: Record<string, number>
  b: Record<string, number[]>
  f: Record<string, number>
}

interface CoverageReport {
  [filePath: string]: FileCoverage
}

function pct(total: number, covered: number): number {
  return total === 0 ? 100 : Math.round((covered / total) * 10000) / 100
}

function main(): void {
  if (!existsSync(COVERAGE_JSON)) {
    console.error(`Coverage JSON not found: ${COVERAGE_JSON}`)
    console.error('Run pnpm test:coverage first.')
    process.exit(1)
  }

  const report: CoverageReport = JSON.parse(readFileSync(COVERAGE_JSON, 'utf-8'))

  let errors = 0
  let found = 0

  for (const coreFile of CORE_FILES) {
    const normalized = coreFile.replace(/\\/g, '/')
    const key = Object.keys(report).find((k) => k.replace(/\\/g, '/').endsWith(normalized))

    if (!key || !report[key]) {
      console.error(`  ❌ Core file not found in coverage: ${coreFile}`)
      errors++
      continue
    }

    found++
    const fc = report[key]

    const stmts = pct(Object.keys(fc.s).length, Object.values(fc.s).filter((v) => v > 0).length)
    const branches = pct(
      Object.values(fc.b).reduce((sum, arr) => sum + arr.length, 0),
      Object.values(fc.b).reduce(
        (sum, arr) => sum + arr.filter((v: number) => v > 0).length,
        0,
      ),
    )
    const funcs = pct(Object.keys(fc.f).length, Object.values(fc.f).filter((v) => v > 0).length)
    const lines = stmts // v8 usa statements como lines en JSON

    const all100 = stmts === 100 && branches === 100 && funcs === 100 && lines === 100

    const icon = all100 ? '✅' : '❌'
    console.log(
      `  ${icon} ${coreFile} — S:${stmts}% B:${branches}% F:${funcs}% L:${lines}%`,
    )

    if (!all100) {
      console.error(`     Core file must have 100% coverage.`)
      errors++
    }
  }

  if (found === 0) {
    console.error('  ❌ No Core files found in coverage report.')
    errors++
  }

  if (errors > 0) {
    console.error(`\n❌ Core coverage check failed: ${errors} issue(s).`)
    process.exit(1)
  }

  console.log(`\n✅ Core coverage: ${found}/${found} files at 100%`)
}

main()
