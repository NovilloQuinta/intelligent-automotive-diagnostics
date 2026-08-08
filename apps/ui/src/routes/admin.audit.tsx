import { createFileRoute } from "@tanstack/react-router";
import { AuditTable } from "@/components/admin/AuditTable";

export const Route = createFileRoute("/admin/audit")({
  component: AdminAudit,
});

function AdminAudit() {
  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-bold">Auditoría HTTP</h1>
      <AuditTable />
    </div>
  );
}
