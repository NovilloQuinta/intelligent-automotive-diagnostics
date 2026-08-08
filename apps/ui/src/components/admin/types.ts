// ---------------------------------------------------------------------------
// API contracts for /api/admin/* — keep in sync with
// openspec/changes/add-admin-management-panel/api-contract.md
// ---------------------------------------------------------------------------

export type LogLevel = "debug" | "info" | "warn" | "error";

/** Row of the `logs` table, as returned by GET /api/admin/logs. */
export type AdminLog = {
  id: number;
  level: LogLevel;
  message: string;
  /** JSON serialized as a string by the backend (`JSON.stringify`), or null. */
  context: string | null;
  createdAt: string;
};

/** Row of the `audit_logs` table, as returned by GET /api/admin/audit-logs. */
export type AdminAuditLog = {
  id: number;
  method: string;
  path: string;
  statusCode: number;
  ip: string | null;
  userAgent: string | null;
  durationMs: number | null;
  userId: number | null;
  createdAt: string;
};

export type AdminUserRole = "user" | "admin";
export type AdminUserType = "individual" | "workshop";

/** Row of the `users` table, as returned by GET /api/admin/users (never includes passwordHash). */
export type AdminUser = {
  id: number;
  username: string;
  email: string;
  userType: AdminUserType;
  role: AdminUserRole;
  businessName: string | null;
  taxId: string | null;
  address: string | null;
  createdAt: string;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  isWorkshop: boolean;
  isAdmin: boolean;
};

/** Uniform pagination envelope shared by /logs, /audit-logs and /users. */
export type Paginated<T> = { items: T[]; total: number };

/**
 * Response of GET /api/admin/overview. `httpRequestsByPathApprox` is an
 * approximation derived from `audit_logs` (GROUP BY path), NOT a count of
 * real diagnoses/LLM calls — see api-contract.md.
 */
export type AdminOverview = {
  userStats: {
    byUserType: Record<string, number>;
    byRole: Record<string, number>;
  };
  recentErrorCount: number;
  httpRequestsByPathApprox: Record<string, number>;
};

export type KnowledgeIndexName = "pids" | "dtcs" | "diagnoses";

export type KnowledgeIndexSummary = {
  count: number;
  /** Up to 5 raw metadata rows per index — shape varies by index. */
  sample: Record<string, unknown>[];
};

/** Response of GET /api/admin/knowledge. */
export type AdminKnowledgeStats = Record<
  KnowledgeIndexName,
  KnowledgeIndexSummary
>;

export type KnowledgeSearchInput = {
  text: string;
  index: KnowledgeIndexName;
  limit?: number;
};

export type KnowledgeSearchResult = {
  entry: Record<string, unknown>;
  distance: number;
};

/** Response of POST /api/admin/knowledge/search. */
export type KnowledgeSearchResponse = {
  results: KnowledgeSearchResult[];
};

// ---------------------------------------------------------------------------
// Filters — query params sent to the server (never filtered client-side)
// ---------------------------------------------------------------------------

export type DateRangeFilter = {
  from?: string;
  to?: string;
};

export type PageFilter = {
  page?: number;
  pageSize?: number;
};

export type AdminLogsFilter = DateRangeFilter &
  PageFilter & {
    level?: LogLevel;
    q?: string;
  };

export type AdminAuditFilter = DateRangeFilter &
  PageFilter & {
    statusCode?: number;
    path?: string;
    userId?: number;
    q?: string;
  };

export type AdminUsersFilter = DateRangeFilter &
  PageFilter & {
    q?: string;
  };
