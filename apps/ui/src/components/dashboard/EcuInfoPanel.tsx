import { Cpu, Loader2 } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import type { EcuInfo } from "./types";

type Props = {
  ecus: EcuInfo[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
};

function EmptySelection() {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
      <span>Selecciona un vehículo para ver sus ECUs</span>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center gap-2 px-4 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>Cargando ECUs…</span>
    </div>
  );
}

function EmptyEcus() {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
      <span>Sin ECUs descubiertas</span>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center px-4 text-center text-sm text-destructive">
      <span>{message}</span>
    </div>
  );
}

export function EcuTable({ ecus }: { ecus: EcuInfo[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-white/5 hover:bg-transparent">
          <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Nombre
          </TableHead>
          <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Tipo
          </TableHead>
          <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Req → Res
          </TableHead>
          <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground">
            Protocolo
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ecus.map((ecu, i) => (
          <TableRow
            key={ecu.id !== 0 ? ecu.id : i}
            className="fade-up border-white/5 hover:bg-white/[0.02]"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <TableCell className="text-xs font-bold text-foreground/90">
              {ecu.name}
            </TableCell>
            <TableCell className="text-xs text-foreground/70">{ecu.type}</TableCell>
            <TableCell className="mono text-xs text-foreground/80">
              {ecu.requestAddr} → {ecu.responseAddr}
            </TableCell>
            <TableCell className="text-right text-[10px] text-muted-foreground">
              {ecu.protocol}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function EcuInfoPanel({ ecus, loading, error, selectedId }: Props) {
  return (
    <div className="panel flex min-h-0 flex-col p-4">
      <div className="mb-3 flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold uppercase tracking-[0.15em]">
            ECU Info
          </h3>
        </div>
        <span className="mono text-[10px] text-muted-foreground">
          {selectedId ?? "—"}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {!selectedId && <EmptySelection />}
        {selectedId && loading && <LoadingState />}
        {selectedId && !loading && error && <ErrorState message={error} />}
        {selectedId && !loading && !error && ecus.length === 0 && <EmptyEcus />}
        {selectedId && !loading && !error && ecus.length > 0 && (
          <EcuTable ecus={ecus} />
        )}
      </div>
    </div>
  );
}
