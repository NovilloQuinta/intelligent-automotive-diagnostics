import { Loader2, Snowflake } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { useFreezeFrame } from "./useFreezeFrame";

type Props = {
  scenarioId: string;
  /** DTC the user selected, or null before any selection. */
  dtc: string | null;
};

function EmptySelection() {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
      <span>Selecciona un código DTC para ver su freeze frame</span>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center gap-2 px-4 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>Cargando freeze frame…</span>
    </div>
  );
}

function NoFrame() {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
      <span>Sin freeze frame para este código</span>
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

export function FrameTable({ pidValues }: { pidValues: Record<string, number> }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-white/5 hover:bg-transparent">
          <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">
            PID
          </TableHead>
          <TableHead className="text-right text-[10px] uppercase tracking-wider text-muted-foreground">
            Valor
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Object.entries(pidValues).map(([pid, value], i) => (
          <TableRow
            key={pid}
            className="fade-up border-white/5 hover:bg-white/[0.02]"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <TableCell className="mono text-xs font-bold text-foreground/90">
              {pid}
            </TableCell>
            <TableCell className="mono text-right text-sm text-foreground/90">
              {value}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Panel showing the OBD-II freeze frame snapshot for the selected DTC. */
export function FreezeFramePanel({ scenarioId, dtc }: Props) {
  const { loading, frame, error } = useFreezeFrame(scenarioId, dtc);

  return (
    <div className="panel flex min-h-0 flex-col p-4">
      <div className="mb-3 flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <Snowflake className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold uppercase tracking-[0.15em]">
            Freeze Frame
          </h3>
        </div>
        <span className="mono text-[10px] text-muted-foreground">
          {dtc ?? "—"}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {!dtc && <EmptySelection />}
        {dtc && loading && <LoadingState />}
        {dtc && !loading && error && <ErrorState message={error} />}
        {dtc && !loading && !error && !frame && <NoFrame />}
        {dtc && !loading && !error && frame && (
          <FrameTable pidValues={frame.pidValues} />
        )}
      </div>
    </div>
  );
}
