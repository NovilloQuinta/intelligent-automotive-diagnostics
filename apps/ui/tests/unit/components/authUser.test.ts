import { describe, expect, it } from "vitest";
import type { AuthUser } from "../../../src/components/dashboard/types";

/**
 * Verify that AuthUser accepts role and isAdmin fields returned by
 * GET /api/auth/me (backend always includes them since admin panel was added).
 */
describe("AuthUser type", () => {
  it("should accept role and isAdmin fields", () => {
    const user: AuthUser = {
      id: 1,
      username: "admin_user",
      email: "admin@example.com",
      userType: "individual",
      createdAt: "2026-01-01T00:00:00.000Z",
      isWorkshop: false,
      role: "admin",
      isAdmin: true,
    };

    expect(user.role).toBe("admin");
    expect(user.isAdmin).toBe(true);
  });

  it("should accept role 'user' and isAdmin false for non-admin users", () => {
    const user: AuthUser = {
      id: 2,
      username: "regular",
      email: "user@example.com",
      userType: "workshop",
      businessName: "Taller XYZ",
      createdAt: "2026-03-15T00:00:00.000Z",
      isWorkshop: true,
      role: "user",
      isAdmin: false,
    };

    expect(user.role).toBe("user");
    expect(user.isAdmin).toBe(false);
  });
});
