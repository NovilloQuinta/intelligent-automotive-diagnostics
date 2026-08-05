import { createFileRoute, redirect } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard/DashboardPage";
import { api } from "@/lib/api";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (!api.hasTokens()) {
      throw redirect({ to: "/login" });
    }
  },
  component: DashboardPage,
});
