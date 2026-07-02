---
name: Admin control-plane persistence
description: Why admin sessions and the login throttle live in Postgres, and the async guard contract.
---

# Admin control-plane persistence

Admin ("Tilu Company") auth is separate from user accounts: its own httpOnly
cookie (`rekhastha_admin`), credentials from env (`ADMIN_ID`/`ADMIN_TOKEN`) with
documented dev fallbacks.

Both the admin **session store** and the **per-IP brute-force throttle** are
Postgres-backed (`admin_sessions`, `admin_login_attempts`), not in-memory.

**Why:** in-memory state logged every admin out on each API restart and reset
the throttle counters, so a restart silently cleared brute-force lockouts on a
control plane that can suspend users and force-release escrow.

**How to apply:**
- The session helpers (`createAdminSession`, `isAdminSession`,
  `deleteAdminSession`) and the throttle helpers (`lockoutRemaining`,
  `recordFailedAttempt`, `resetAttempts`, `pruneAdminState`) are all **async**.
  `requireAdmin(req)` returns a `Promise<boolean>` — every route guard must
  `await` it. Adding a new admin route means `if (!(await requireAdmin(req)))`.
- DB-backed (not stateless token) is deliberate so logout still revokes
  server-side.
- `pruneAdminState()` opportunistically clears expired sessions and stale
  lockout rows; it runs on the login path, not on the hot read path.
