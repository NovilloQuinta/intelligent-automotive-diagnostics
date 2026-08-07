import { Gauge, Loader2, Sparkles } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import type { DiagnosisResponse } from "./types";
import {
  buildPidRows,
  mergePidRows,
  pidStatusMeta,
  type PidRow,
} from "./pidCatalog";

type Props = {
  parsedValues: DiagnosisResponse["parsedValues"] | null;
  empty: boolean;
  /** PIDs discovered by the cognitive diagnosis, or null while unavailable. */
  aiRows?: PidRow[] | null;
  /** True while the cognitive response (up to 60 s) is still in flight. */
  aiLoading?: boolean;
};

/** Discreet badge marking a row as discovered by the AI rather than read by the fixed diagnosis. */
function AiOriginBadge() {
  return (
    <span
      className="mono ml-2 inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary"
      title="PID descubierto por el diagnóstico cognitivo"
    >
      <Sparkles className="h-2.5 w-2.5" />
      IA
    </span>
  );
}

/** Secondary, non-blocking loading row shown while the cognitive diagnosis resolves. */
function AiLoadingRow() {
  return (
    <TableRow className="border-white/5 hover:bg-transparent">
      <TableCell
        colSpan={4}
        className="text-xs italic text-muted-foreground"
      >
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          Buscando PIDs adicionales…
        </span>
      </TableCell>
    </TableRow>
  );
}

function EmptyPrompt() {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
      <span>Selecciona un vehículo y pulsa INICIAR DIAGNÓSTICO</span>
    </div>
  );
}

function PidRowsTable({
  rows,
  aiLoading,
}: {
  rows: PidRow[];
  aiLoading: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-white/5 hover:bg-transparent">
          <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Código
          </TableHead>
          <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Descripción
          </TableHead>
          <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Valor
          </TableHead>
          <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground">
            Estado
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => {
          const meta = pidStatusMeta(row.status);
          return (
            <TableRow
              key={row.code}
              data-testid="pid-row"
              data-code={row.code}
              className="fade-up border-white/5 hover:bg-white/[0.02]"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <TableCell className="mono text-xs font-bold text-foreground/90">
                {row.code}
                {row.source === "ai" ? <AiOriginBadge /> : null}
              </TableCell>
              <TableCell className="text-sm text-foreground/90">
                {row.description}
              </TableCell>
              <TableCell className="mono text-sm text-foreground/90">
                {row.value}
              </TableCell>
              <TableCell className="text-right">
                <span
                  className="mono inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  style={{
                    color: meta.color,
                    borderColor: meta.border,
                    background: meta.bg,
                  }}
                >
                  <meta.icon
                    className="h-3 w-3"
                    style={{ color: meta.color }}
                  />
                  {meta.label}
                </span>
              </TableCell>
            </TableRow>
          );
        })}
        {aiLoading ? <AiLoadingRow /> : null}
      </TableBody>
    </Table>
  );
}

/** Panel listing every OBD-II PID read during the current diagnosis session with an OK/Revisar verdict per PID. */
export function PidsTable({
  parsedValues,
  empty,
  aiRows = null,
  aiLoading = false,
}: Props) {
  const fixedRows = parsedValues ? buildPidRows(parsedValues) : null;
  const rows = fixedRows ? mergePidRows(fixedRows, aiRows) : null;
  return (
    <div className="panel flex min-h-0 flex-col p-4">
      <div className="mb-3 flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold uppercase tracking-[0.15em]">
            PIDs Leídos
          </h3>
        </div>
        <span className="mono text-[10px] text-muted-foreground">
          {rows ? `${rows.length} registrados` : "—"}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {empty && <EmptyPrompt />}
        {!empty && rows && <PidRowsTable rows={rows} aiLoading={aiLoading} />}
      </div>
    </div>
  );
}
