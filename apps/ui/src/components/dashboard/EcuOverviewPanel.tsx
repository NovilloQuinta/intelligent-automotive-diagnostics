import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { EcuInfoPanel } from './EcuInfoPanel'
import { TopologyMapPanel } from './TopologyMapPanel'
import type { DtcCode, EcuInfo } from './types'

interface Props {
  readonly ecus: EcuInfo[]
  readonly loading: boolean
  readonly error: string | null
  readonly selectedId: string | null
  readonly dtcs?: readonly DtcCode[]
}

/**
 * Une la tabla de ECUs y el mapa de topologia bajo una sola entrada del menu:
 * antes vivian en dos secciones distintas del sidebar sin motivo, ya que
 * ambas pintan los mismos datos de {@link EcuInfo}.
 */
export function EcuOverviewPanel({ ecus, loading, error, selectedId, dtcs }: Props) {
  return (
    <Tabs defaultValue="table" className="flex min-h-0 flex-1 flex-col">
      <TabsList className="mb-3 self-start">
        <TabsTrigger value="table">Tabla</TabsTrigger>
        <TabsTrigger value="map">Mapa</TabsTrigger>
      </TabsList>
      <TabsContent value="table" className="mt-0 flex min-h-0 flex-1 flex-col">
        <EcuInfoPanel ecus={ecus} loading={loading} error={error} selectedId={selectedId} />
      </TabsContent>
      <TabsContent value="map" className="mt-0 flex min-h-0 flex-1 flex-col">
        <TopologyMapPanel
          ecus={ecus}
          loading={loading}
          error={error}
          selectedId={selectedId}
          dtcs={dtcs}
        />
      </TabsContent>
    </Tabs>
  )
}
