# Security Model — Intelligent Automotive Diagnostics

## Scope

API REST (Express 5) + SPA (React 19 / TanStack Start). Autenticación JWT + bcrypt. SQLite via Drizzle ORM. Despliegue single-container Docker.

## Threat Model (OWASP Top 10 2021)

| Threat | Mitigation |
|--------|-----------|
| **A01 Broken Access Control** | JWT Bearer auth middleware, refresh token rotation, account lockout (5 fails → 15 min), `userType` stored for future RBAC |
| **A02 Cryptographic Failures** | bcrypt 12 rounds, JWT with `jti` UUID, separate secrets for access/refresh, production secret assertion at boot |
| **A03 Injection** | Drizzle ORM (parameterized queries), Zod validation on all inputs, JSON body limit 10 KB |
| **A04 Insecure Design** | Clean Architecture, Zod DTOs in application layer, rate limiting on auth endpoints |
| **A05 Security Misconfiguration** | Helmet 8 (CSP `default-src 'none'`, HSTS 1yr, `X-Frame-Options: DENY`), CORS allowlist, `trust proxy` |
| **A06 Vulnerable Components** | `pnpm audit` in CI, up-to-date dependencies |
| **A07 Auth Failures** | bcrypt + JWT, password complexity (uppercase+number+special), account lockout, 5 req/min login rate limit |
| **A08 Data Integrity** | Zod validation on all DTOs, `pnpm-lock.yaml` for reproducible installs |
| **A09 Logging & Monitoring** | Pino structured logs + SQLite persistence, audit log with IP/UA/duration/userId, security event logging (login success/fail, refresh, register, logout, lockout) |
| **A10 SSRF** | LLM URLs from env config only, 30s HTTP timeout on external calls |

## API-Specific (OWASP API Top 10 2023)

| Threat | Mitigation |
|--------|-----------|
| **API1 Broken Object Level Auth** | JWT `sub` → `userId` extraction; per-resource ownership to be enforced in future |
| **API3 Mass Assignment** | Zod schemas act as property allowlists |
| **API4 Unrestricted Consumption** | Rate limits: login 5/min, refresh 10/min, diagnosis 20/min, cognitive 5/min, global 100/15min |
| **API5 Broken Function Level Auth** | All `/api/*` behind auth middleware; `userType` ready for future RBAC |

## Frontend-Specific

- React 19 auto-escapes XSS vectors
- Tokens in `localStorage` (conscious decision: Bearer header + CORS no-credentials = CSRF-resistant; trade-off: XSS-exposable)
- `react-hook-form` + `zodResolver` for client-side validation
- CSP: `default-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com data:`

## Residual Risks

1. **Tokens in localStorage** — XSS → token theft. Mitigation: React's automatic escaping, no `dangerouslySetInnerHTML` on user data.
2. **No MFA** — out of TFM scope; documented for future work.
3. **SQLite at-rest encryption** — not implemented; acceptable for TFM scope.
4. **Rate limits in memory** — lost on restart; acceptable for single-instance TFM.
5. **No HSTS in practice** — effective only under HTTPS; docker-compose exposes plain HTTP.

## Security Contacts

See `/.well-known/security.txt`
