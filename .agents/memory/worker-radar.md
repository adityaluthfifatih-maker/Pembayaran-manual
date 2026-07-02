---
name: Worker radar & instant-gig classification
description: How the worker "Status Radar" gates alarms/pins and why locked scheduled (lama) jobs stay silent.
---

# Worker radar & instant-gig classification

`isInstantGig(job)` is **`hiringMode === "cepat"` only** — it must NOT also key on
`broadcastActive`.

**Why:** Locking escrow on a scheduled ("lama") posting broadcasts it live over the
WebSocket with `broadcastActive: true` (see `handleLockEscrow`). If `isInstantGig`
also treated `broadcastActive` as instant, those regular jobs would wrongly become
green radar pins and fire the persistent loud alarm — violating the product rule that
regular jobs stay silent in the "📅 Cari Kerja Terjadwal" feed (purple map pins only).

**How to apply:** Only `cepat` postings trigger the full-screen flashing alarm +
looping buzzer, and only when the radar toggle is ON. Regular jobs (including
escrow-locked ones) flow to the scheduled feed and purple pins with no sound/flash.

The WS subscriber is registered **once**; live radar on/off and current `mode` are
read through `radarOnRef` / `modeRef` to avoid re-subscription churn and stale
closures. Alarm-vs-`JobPingModal` double-fire is prevented by inserting the job id
into `seenPingJobIds` before showing the alarm.
