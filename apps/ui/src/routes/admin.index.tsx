import { createFileRoute } from "@tanstack/react-router";
import { OverviewCards } from "@/components/admin/OverviewCards";

export const Route = createFileRoute("/admin/")({
  component: AdminIndex,
});

function AdminIndex() {
  return (
    <div className="p-6">
      <OverviewCards />
    </div>
  );
}
