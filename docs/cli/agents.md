---
summary: "CLI reference for `dewbot agents` (list/add/delete/set identity)"
read_when:
  - You want multiple isolated agents (workspaces + routing + auth)
title: "agents"
---

# `dewbot agents`

Manage isolated agents (workspaces + auth + routing).

Related:

- Multi-agent routing: [Multi-Agent Routing](/concepts/multi-agent)
- Agent workspace: [Agent workspace](/concepts/agent-workspace)

## Examples

```bash
dewbot agents list
dewbot agents add work --workspace ~/.dewbot/workspace-work
dewbot agents set-identity --workspace ~/.dewbot/workspace --from-identity
dewbot agents set-identity --agent main --avatar avatars/dewbot.png
dewbot agents delete work
```

## Identity files

Each agent workspace can include an `IDENTITY.md` at the workspace root:

- Example path: `~/.dewbot/workspace/IDENTITY.md`
- `set-identity --from-identity` reads from the workspace root (or an explicit `--identity-file`)

Avatar paths resolve relative to the workspace root.

## Set identity

`set-identity` writes fields into `agents.list[].identity`:

- `name`
- `theme`
- `emoji`
- `avatar` (workspace-relative path, http(s) URL, or data URI)

Load from `IDENTITY.md`:

```bash
dewbot agents set-identity --workspace ~/.dewbot/workspace --from-identity
```

Override fields explicitly:

```bash
dewbot agents set-identity --agent main --name "DewBot" --emoji "🦞" --avatar avatars/dewbot.png
```

Config sample:

```json5
{
  agents: {
    list: [
      {
        id: "main",
        identity: {
          name: "DewBot",
          theme: "space lobster",
          emoji: "🦞",
          avatar: "avatars/dewbot.png",
        },
      },
    ],
  },
}
```
