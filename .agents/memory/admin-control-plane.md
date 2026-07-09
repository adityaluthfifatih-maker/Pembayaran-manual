---
name: Admin control-plane persistence
description: Why admin sessions and the login throttle live in Postgres, and the async guard contract. Also covers the DB-backed credential system and recovery flow.
---

# Admin control-plane persistence

Admin ("Tilu Company") auth is separate from user accounts: its own httpOnly
cookie (`rekhastha_admin`), Postgres-backed session store and per-IP throttle.

## Credential storage (new: DB-backed)

Admin passwords are now stored in the `admin_users` table (bcrypt hash, salt
rounds 10) — not compared directly against env secrets. The `ADMIN_TOKEN` env
secret is kept **only as a recovery key**, not for everyday login.

On first startup `bootstrapAdminUser()` seeds one row from `ADMIN_ID`/`ADMIN_TOKEN`
env (dev fallbacks in non-production). After that, credentials are self-managed
via the portal.

**Why:** previously the operator couldn't change their own credentials without
editing Replit Secrets + redeploying. DB-backed passwords let the admin portal
handle rotation without touching the Secrets panel.

**How to apply:**
- `verifyAdminPassword(adminId, password)` is **async** (bcrypt.compare).
- `changeAdminPassword(adminId, oldPw, newPw)` — requires active session; returns
  `{ok:true}` or `{error:string}`.
- `resetAdminPassword(adminId, newPw, recoveryToken)` — public endpoint; checks
  `recoveryToken === ADMIN_TOKEN` env secret (or dev fallback). Use this when
  locked out.
- `bootstrapAdminUser()` is called in `index.ts` after server listen; it's a
  no-op if `admin_users` already has rows.

## Session + throttle persistence

Both the **session store** and the **per-IP brute-force throttle** are
Postgres-backed (`admin_sessions`, `admin_login_attempts`), not in-memory.

**Why:** in-memory state logged every admin out on each API restart and reset
the throttle counters, so a restart silently cleared brute-force lockouts on a
control plane that can suspend users and force-release escrow.

**How to apply:**
- All session/throttle helpers are **async**. `requireAdmin(req)` returns
  `Promise<boolean>` — every route guard must `await` it.
- DB-backed (not stateless token) is deliberate so logout still revokes
  server-side.
- `pruneAdminState()` opportunistically clears expired sessions and stale
  lockout rows; it runs on the login path, not on the hot read path.

## Frontend

- Login page: `/admin` — field label is "Kata Sandi" (was "Kode Token/Passkey").
  "Lupa kata sandi? Gunakan token pemulihan" link toggles to a reset form that
  takes `adminId + ADMIN_TOKEN + newPassword`.
- Inside CommandCenter: "🔑 Pengaturan Akun" tab → `ChangePasswordTab` — lets
  logged-in admin change their password (old → new, min 8 chars).
