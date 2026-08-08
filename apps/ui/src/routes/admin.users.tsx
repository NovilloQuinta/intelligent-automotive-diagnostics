import { createFileRoute } from "@tanstack/react-router";
import { UsersTable } from "@/components/admin/UsersTable";

export const Route = createFileRoute("/admin/users")({
  component: AdminUsers,
});

function AdminUsers() {
  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-bold">Usuarios</h1>
      <UsersTable />
    </div>
  );
}
