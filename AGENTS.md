[//]: # (SPDX-License-Identifier: MIT)
[//]: # (Copyright (c) 2026 Rug Munch Media LLC)
# AGENTS.md — rugcharts

> AI agent contract. Read this before touching anything in this repo.

## Status
canonical · owner=crmuncher · last_updated=2026-07-06

## What This Repo Is
rugcharts — orphaned component. See TRIAGE.md for disposition.

## Type
`orphan` · decision=MERGE → `rmi-backend` then ARCHIVE

## Where It Lives
- Source: `https://github.com/RugMunchMedia/rugcharts`
- Status: no live deployment (orphaned, merging into rmi-backend)

## Built With
- Standards: [github.com/RugMunchMedia/standards](https://github.com/RugMunchMedia/standards)
- Toolchain: [TOOLCHAIN.md](https://github.com/RugMunchMedia/standards/raw/main/TOOLCHAIN.md)
- Conventions: [CONVENTIONS.md](https://github.com/RugMunchMedia/standards/raw/main/CONVENTIONS.md)

## 🚨 CRITICAL RULES

1. **No new features.** This repo is on a merge-and-archive track. Add nothing that isn't a fix or a docs improvement.
2. **No nested repos.** Don't commit other complete project trees inside this one.
3. **No secrets.** Never commit `.secrets/`, `.env`, `*.pem`, `*.key`, `*.crt`.
4. **No data blobs.** Don't commit `*.zip`, `*.parquet`, model weights, sqlite files.
5. **Coordinate merges with rmi-backend.** When the merge happens, this repo will be archived on Forgejo.
6. **Read TRIAGE.md before doing anything non-trivial.** The decision is final unless escalated.

## Commands

There is no live build/test/dev cycle for this repo. It exists only to preserve the code history for reference during the merge into `rmi-backend`.

## Status

See [TRIAGE.md](TRIAGE.md) for the disposition decision.

## Owners
- Primary: crmuncher
- Backup: TBD

## Related Repos
- `rmi-backend/` — canonical destination for merged code
- [standards/PRODUCTS.md](https://github.com/RugMunchMedia/standards/raw/main/PRODUCTS.md)

## Open-Core Protection

This repo is open source (MIT) and on a merge-and-archive track. The code
here demonstrates charting patterns — it is NOT the complete RugMunch
production charting infrastructure. The managed platform at rugmunch.io
includes proprietary enhancements.

See [METHODOLOGY-PROTECTION.md](https://github.com/RugMunchMedia/standards/blob/main/METHODOLOGY-PROTECTION.md)
for details on what information belongs in public vs private repos.