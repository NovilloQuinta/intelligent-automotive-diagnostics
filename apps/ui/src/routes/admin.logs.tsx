import { createFileRoute } from "@tanstack/react-router";
import { LogsTable } from "@/components/admin/LogsTable";

export const Route = createFileRoute("/admin/logs")({
  component: AdminLogs,
});

function AdminLogs() {
  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-bold">Logs del sistema</h1>
      <LogsTable />
    </div>
  );
}
