---
name: KYC verification flow
description: Worker identity document upload + admin moderation queue — audit pattern and status semantics.
---

Workers submit KTP photo and/or selfie-with-KTP independently (either field alone is
a valid multipart submission); any resubmission resets `verificationStatus` back to
`"pending"` so a previously-rejected worker automatically re-enters the admin queue.

**Why:** `verificationStatus` defaults to `"pending"` at signup (not `"unverified"`),
so the admin KYC queue is filtered by *document presence* (`ktpPhotoUrl` or
`selfieWithKtpUrl` set), not by status — otherwise every brand-new signup would
show up before ever uploading anything.

**How to apply:** Follow the existing `logAdminAction`-style audit trail for any new
admin moderation action — KYC verify/reject writes to `adminLogsTable` with
action `KYC_VERIFIED` / `KYC_REJECTED` and `targetId` = the worker's user id.
Uploaded files are served statically from `UPLOAD_ROOT` mounted at `/api/uploads`
(shared with chat attachments) — reuse `kycUpload`/`chatUpload` multer instances
in `lib/upload.ts` rather than adding new storage config.
