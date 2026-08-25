[//]: # (SPDX-License-Identifier: MIT)
[//]: # (Copyright (c) 2026 Rug Munch Media LLC)
# AGENTS.md — rugcharts

> AI agent contract. Read this before touching anything in this repo.

## Status
canonical · owner=crmuncher · last_updated=2026-07-06

## What This Repo Is
rugcharts — ACTIVE product: real-time crypto charting engine (Rug Munch Media).

## Type
`active-product` · owner=RugMunchMedia · featured OSS

## Where It Lives
- Source: `https://github.com/RugMunchMedia/rugcharts`
- Status: live product under active development

## Built With
- Standards: See the project documentation for development standards
- Toolchain: See README.md for development toolchain
- Conventions: See CONTRIBUTING.md for coding conventions

## 🚨 CRITICAL RULES

1. **Active development.** Feature work welcome — conventional commits + tests required.
2. **No nested repos.** Don't commit other complete project trees inside this one.
3. **No secrets.** Never commit `.secrets/`, `.env`, `*.pem`, `*.key`, `*.crt`.
4. **No data blobs.** Don't commit `*.zip`, `*.parquet`, model weights, sqlite files.
5. **Coordinate merges with rmi-backend.** When the merge happens, this repo will be archived on Forgejo.
6. **Check docs/ and open issues before non-trivial changes.**

## Commands

There is no live build/test/dev cycle for this repo. It exists only to preserve the code history for reference during the merge into `rmi-backend`.

## Status

Status: active product — see README.md.

## Owners
- Primary: crmuncher
- Backup: TBD

## Related Repos
- `rmi-backend/` — canonical destination for merged code
- See product documentation for available products

## Open-Core Protection

This repo is open source (MIT), actively developed. The code
here demonstrates charting patterns — it is NOT the complete RugMunch
production charting infrastructure. The managed platform at rugmunch.io
includes proprietary enhancements.

See [CONTRIBUTING.md](CONTRIBUTING.md) for project methodology.
for details on what information belongs in public vs private repos.