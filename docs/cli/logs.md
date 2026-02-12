---
summary: "CLI reference for `dewbot logs` (tail gateway logs via RPC)"
read_when:
  - You need to tail Gateway logs remotely (without SSH)
  - You want JSON log lines for tooling
title: "logs"
---

# `dewbot logs`

Tail Gateway file logs over RPC (works in remote mode).

Related:

- Logging overview: [Logging](/logging)

## Examples

```bash
dewbot logs
dewbot logs --follow
dewbot logs --json
dewbot logs --limit 500
dewbot logs --local-time
dewbot logs --follow --local-time
```

Use `--local-time` to render timestamps in your local timezone.
