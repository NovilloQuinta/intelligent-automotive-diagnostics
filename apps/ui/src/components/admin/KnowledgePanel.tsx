import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { ApiHttpError } from '@/lib/api-errors'
import type {
  AdminKnowledgeStats,
  KnowledgeIndexName,
  KnowledgeSearchInput,
  KnowledgeSearchResponse,
} from '@/components/admin/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

const HTTP_SERVICE_UNAVAILABLE = 503

const INDEX_OPTIONS: { value: KnowledgeIndexName; label: string }[] = [
  { value: 'pids', label: 'PIDs' },
  { value: 'dtcs', label: 'DTCs' },
  { value: 'diagnoses', label: 'Diagnoses' },
]

const INDEX_LABELS: Record<KnowledgeIndexName, string> = {
  pids: 'PIDs',
  dtcs: 'DTCs',
  diagnoses: 'Diagnoses',
}

/** Panel admin de la base de conocimiento (PIDs/DTCs/diagnosis): stats + busqueda semantica por indice. */
export function KnowledgePanel() {
  const [searchText, setSearchText] = useState('')
  const [searchIndex, setSearchIndex] = useState<KnowledgeIndexName>('pids')

  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
  } = useQuery<AdminKnowledgeStats>({
    queryKey: ['admin', 'knowledge'],
    queryFn: () => api.admin.knowledgeStats(),
  })

  const {
    mutate,
    data: searchResult,
    isPending: searchPending,
    isError: searchError,
    error: searchErrorObj,
    reset: resetSearch,
  } = useMutation<KnowledgeSearchResponse, Error, KnowledgeSearchInput>({
    mutationFn: (input) => api.admin.knowledgeSearch(input),
  })

  const is503 =
    searchError &&
    searchErrorObj instanceof ApiHttpError &&
    searchErrorObj.status === HTTP_SERVICE_UNAVAILABLE

  function handleSearch() {
    if (!searchText.trim()) return
    mutate({ text: searchText.trim(), index: searchIndex, limit: 10 })
  }

  return (
    <div className="space-y-6">
      {/* ---- Stats ---- */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Estadísticas del catálogo</h2>
        {statsLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-4 w-20 animate-pulse" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16 animate-pulse" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : statsError ? (
          <div className="rounded-md border border-destructive p-4 text-destructive">
            Error al cargar estadísticas
          </div>
        ) : stats ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {(Object.entries(stats) as [KnowledgeIndexName, { count: number }][]).map(
              ([key, value]) => (
                <Card key={key}>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">{INDEX_LABELS[key]}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{value.count}</p>
                  </CardContent>
                </Card>
              ),
            )}
          </div>
        ) : null}
      </div>

      {/* ---- Search ---- */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Búsqueda semántica</h2>
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Texto a buscar..."
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value)
                resetSearch()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch()
              }}
            />
          </div>
          <Select
            value={searchIndex}
            onValueChange={(v) => setSearchIndex(v as KnowledgeIndexName)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INDEX_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleSearch} disabled={searchPending || !searchText.trim()}>
            Buscar
          </Button>
        </div>

        {/* Results */}
        {is503 ? (
          <div className="rounded-md border border-amber-500 bg-amber-50 p-4 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            Catálogo vectorial no disponible
          </div>
        ) : searchError && !is503 ? (
          <div className="rounded-md border border-destructive p-4 text-destructive">
            Error en la búsqueda: {searchErrorObj?.message ?? 'Desconocido'}
          </div>
        ) : searchPending ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full animate-pulse" />
            ))}
          </div>
        ) : searchResult ? (
          searchResult.results.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin resultados</p>
          ) : (
            <div className="space-y-2">
              {searchResult.results.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <code className="text-xs">{JSON.stringify(r.entry)}</code>
                  <Badge variant="outline" className="ml-2 font-mono">
                    {r.distance}
                  </Badge>
                </div>
              ))}
            </div>
          )
        ) : null}
      </div>
    </div>
  )
}
