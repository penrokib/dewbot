---
summary: "CLI reference for `dewbot reset` (reset local state/config)"
read_when:
  - You want to wipe local state while keeping the CLI installed
  - You want a dry-run of what would be removed
title: "reset"
---

# `dewbot reset`

Reset local config/state (keeps the CLI installed).

```bash
dewbot reset
dewbot reset --dry-run
dewbot reset --scope config+creds+sessions --yes --non-interactive
```
