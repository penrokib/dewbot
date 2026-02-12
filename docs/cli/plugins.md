---
summary: "CLI reference for `dewbot plugins` (list, install, enable/disable, doctor)"
read_when:
  - You want to install or manage in-process Gateway plugins
  - You want to debug plugin load failures
title: "plugins"
---

# `dewbot plugins`

Manage Gateway plugins/extensions (loaded in-process).

Related:

- Plugin system: [Plugins](/tools/plugin)
- Plugin manifest + schema: [Plugin manifest](/plugins/manifest)
- Security hardening: [Security](/gateway/security)

## Commands

```bash
dewbot plugins list
dewbot plugins info <id>
dewbot plugins enable <id>
dewbot plugins disable <id>
dewbot plugins doctor
dewbot plugins update <id>
dewbot plugins update --all
```

Bundled plugins ship with DewBot but start disabled. Use `plugins enable` to
activate them.

All plugins must ship a `dewbot.plugin.json` file with an inline JSON Schema
(`configSchema`, even if empty). Missing/invalid manifests or schemas prevent
the plugin from loading and fail config validation.

### Install

```bash
dewbot plugins install <path-or-spec>
```

Security note: treat plugin installs like running code. Prefer pinned versions.

Supported archives: `.zip`, `.tgz`, `.tar.gz`, `.tar`.

Use `--link` to avoid copying a local directory (adds to `plugins.load.paths`):

```bash
dewbot plugins install -l ./my-plugin
```

### Update

```bash
dewbot plugins update <id>
dewbot plugins update --all
dewbot plugins update <id> --dry-run
```

Updates only apply to plugins installed from npm (tracked in `plugins.installs`).
