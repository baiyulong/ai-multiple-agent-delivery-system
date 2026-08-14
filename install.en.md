# AI Delivery Task System · Installation Guide (install.md)

> **Language / 语言**: [English](install.en.md) · [中文](install.md)
>
> This file is an **installation manual meant for AI agents**. The user only needs to give the AI the link (or content) of this file, and the AI can complete installation, registration, and first-time configuration automatically.
>
> Repository: `https://github.com/baiyulong/ai-multiple-agent-delivery-system.git`

---

## 1. What This Is

A **MCP-based** multi-role Agent delivery orchestration system. It breaks project delivery into a **seven-role relay workflow** (Product Manager → UI/UX → Domain Architecture → Engineering → QA → DevOps), and enforces **stage gates** so every artifact must pass before the next stage begins. Task state is stored as plain-text files in a local `.delivery` directory — no database required.

Works with **OpenCode** and other MCP-capable AI coding tools.

---

## 2. Prerequisites

| Item | Requirement |
|---|---|
| Node.js | **≥ 22** |
| git | Installed |
| Target tool | OpenCode (or any AI tool supporting local MCP servers) |

---

## 3. Installation Steps (executed by AI)

> Goal: install `delivery-mcp-server` and `.opencode/agent/` **into the target project root**, so the MCP server is referenced by relative path and the dashboard reads the project's own `.delivery` when started from within the project.
>
> **Recommended Option 1: run the `install.js` script (works on Windows/Linux, completes all steps and safe merging automatically), see 【Option 1】below; or follow 【Option 2】to do it manually step by step.**

### Option 1: One-click install script (recommended)

Run in the **target project root** (requires Node.js ≥ 22):

```bash
# Install from the latest stable version on GitHub Releases (recommended, small download, pinned version)
node delivery-mcp-server/install.js --release

# Or specify a local repository path (when the script is not in the same directory as the repo):
node delivery-mcp-server/install.js --repo /tmp/ai-delivery-system
```

The script automatically:
1. **（--release mode）** Downloads the latest stable tar.gz from GitHub Releases → extracts to a temp directory → uses it as the source path; handles both `v`-prefixed and non-prefixed directory names; exits with a message if there is no Release
2. Validates the target directory (refuses to install into this repo itself; non-git projects can use `--force`)
3. Copies `delivery-mcp-server/` to the target project (if it exists: `--release` / `--force-update` / **local version lower than source version** will delete the old copy and install the new one; otherwise it is skipped)
4. Copies `.opencode/agent/` role configs to the target project (**only adds `delivery-*.md`, never overwrites existing agent files in the target project**)
5. Merges `opencode.json`: **preserves all existing fields of the target project** (mcp/plugin/permission/agent etc.), only adds `mcp.delivery`, skips if the same-named mcp already exists
6. Appends `.gitignore`: `delivery-mcp-server` (idempotent). **Email config belongs to the current user personally** (`email.set` writes to the user home `~/.config/ai-delivery/user.json`), never written into the project, no versioning concerns.
7. Runs `npm install` + `npm run build` inside `delivery-mcp-server`
8. By default does **not** auto-start the dashboard (add `--dashboard` to start in the background; avoids being killed by command-line tools with timeouts)
9. Prints follow-up configuration guidance (user.set / team.set / email.set)
10. Cleans up temporary files automatically

```bash
# Common parameters
node delivery-mcp-server/install.js                 # Install into the current directory
node delivery-mcp-server/install.js /path/to/proj   # Install into a specific project
node delivery-mcp-server/install.js --release       # Install from the latest stable GitHub Release
node delivery-mcp-server/install.js --repo ../clone # Specify a local repository path
node delivery-mcp-server/install.js --force-update  # Force-overwrite an installed delivery-mcp-server (no version comparison)
node delivery-mcp-server/install.js --dashboard     # Start the dashboard in the background after install (detached, log .delivery/dashboard.log)
node delivery-mcp-server/install.js --stop-dashboard # Stop the dashboard process (or npm run dashboard:stop)
node delivery-mcp-server/install.js --dry-run       # Only print operations that would run, change nothing
```

**Language selection (bilingual):** the system ships Chinese (`zh`) and English (`en`) versions. The install script asks for the language interactively (default `zh`). You can also pin it explicitly:

```bash
node delivery-mcp-server/install.js --lang en       # Install the English version (web UI + role agents + templates)
node delivery-mcp-server/install.js --lang zh       # Install the Chinese version (default)
```

Only the selected language is installed. The choice is remembered in `.install-lang` in the target project, and is reused on later updates. `--lang` overrides the remembered choice.

### Option 2: Manual installation

#### 1. Get the source (Release download recommended)

**Option A: download from GitHub Releases (recommended, small download, pinned version)**

```bash
# Query the latest Release version
curl -s https://api.github.com/repos/baiyulong/ai-multiple-agent-delivery-system/releases/latest | grep tag_name

# Download and extract (replace v0.1.0 with the actual version)
curl -L -o /tmp/release.tar.gz https://github.com/baiyulong/ai-multiple-agent-delivery-system/archive/refs/tags/v0.1.0.tar.gz
mkdir -p /tmp/ai-delivery-system
tar -xzf /tmp/release.tar.gz -C /tmp/ai-delivery-system --strip-components=1
```

**Option B: git clone (full source, incl. git history)**

```bash
git clone https://github.com/baiyulong/ai-multiple-agent-delivery-system.git /tmp/ai-delivery-system
```

#### 2. Copy components into the target project root

Run in the **target project root** to copy in the server and role Agent configs:

```bash
# Copy the MCP server (source/config/templates/frontend)
cp -r /tmp/ai-delivery-system/delivery-mcp-server ./delivery-mcp-server

# Copy the multi-role Agent configs (8 delivery-*.md role files)
mkdir -p .opencode/agent
cp -n /tmp/ai-delivery-system/.opencode/agent/delivery-*.md ./.opencode/agent/
```

> **Windows users**: `cp` is a Unix command not available in PowerShell by default. Choose one of:
> 1. Prefer the install script: `node delivery-mcp-server/install.js` (cross-platform, completes all steps)
> 2. Use the PowerShell equivalents: `Copy-Item -Recurse /tmp/ai-delivery-system/delivery-mcp-server ./delivery-mcp-server`; `Copy-Item /tmp/ai-delivery-system/.opencode/agent/delivery-*.md .opencode/agent/` (`-NoClobber` ≈ `-n`)
> 3. Run the Unix commands in Git Bash / WSL

> **Important**: all role Agent files are prefixed `delivery-` (`delivery-engineer.md`, `delivery-qa.md`, etc.), **only added, never overwriting** same-named agents that already exist in the target project (e.g. `engineer.md`). `cp -n` guarantees existing same-named files are not overwritten.

#### 3. Install dependencies and build

> **Note**: the following commands must run inside `delivery-mcp-server/`, otherwise you'll get ENOENT (package.json not found).

```bash
cd delivery-mcp-server
npm install
npm run build        # produces dist/server.js (the file OpenCode references)
```

> **Note**: the built web UI language follows `VITE_LANG` (zh/en). The install script's `--lang` controls this automatically.

#### 4. Verify the build artifact exists

```bash
# Should exist: delivery-mcp-server/dist/server.js
```

#### 5. Register the MCP server in the target project (must merge, never overwrite)

In the target project root's `opencode.json`, **merge** (create if the file doesn't exist). **Be sure to preserve all existing fields of the target project** (e.g. existing `mcp`, `plugin`, `permission`, `agent`, etc.):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "...target project's existing mcp...": {},
    "delivery": {
      "type": "local",
      "command": ["node", "delivery-mcp-server/dist/server.js"],
      "enabled": true
    }
  }
}
```

> **Never overwrite wholesale**: if the target project already has an `opencode.json`, only add the `mcp.delivery` field, keep everything else unchanged; if `mcp.delivery` already exists, skip — do not add it again.
> Because the server is installed inside the project, the `command` can use the **relative path** `delivery-mcp-server/dist/server.js`; OpenCode starts it with the project root as cwd.

#### 6. Clean up the temporary clone

```bash
rm -rf /tmp/ai-delivery-system
```

#### 7. Start the browser task dashboard and tell the user

> **Note**: the dashboard is a long-running service; **it does not auto-start with the install by default** (to avoid being killed by command-line tools with timeouts). Start it on demand after installation:
>
> - Background start (recommended, separate process + log + port check): `node delivery-mcp-server/install.js --dashboard`
> - Foreground start: `cd delivery-mcp-server && npm run dashboard` (must run inside `delivery-mcp-server/`, otherwise ENOENT)
> - Stop: `node delivery-mcp-server/install.js --stop-dashboard` or `cd delivery-mcp-server && npm run dashboard:stop`
>
> **Windows manual start** (if the script's background start is unavailable):
> ```powershell
> # Option 1: PowerShell Start-Process background start
> cd delivery-mcp-server
> Start-Process -FilePath "npm.cmd" -ArgumentList "run","dashboard" -RedirectStandardOutput ".delivery\dashboard.log" -RedirectStandardError ".delivery\dashboard.err.log" -NoNewWindow
> # Option 2: open a separate cmd window in the foreground (closing the window stops it)
> Start-Process cmd -ArgumentList "/k","npm run dashboard"
> ```

```bash
cd delivery-mcp-server
npm run dashboard
# Output: AI delivery task dashboard started: http://localhost:8787
```

**Must tell the user**:
- Dashboard URL: `http://localhost:8787` (if the port is occupied, check the actual port in `.delivery/dashboard.port` or the startup log)
- Note: all task creation and status changes are visible on this page; `task.create` / `stage.complete` etc. also return `dashboard_url` and `view_hint` that can be opened directly in the browser to view the corresponding task.

> The dashboard automatically reads `.delivery` in the **project root** (the parent directory of delivery-mcp-server), no extra config needed. To use a different data directory, set the env var `DELIVERY_ROOT`.

#### 8. Add delivery-related files to .gitignore

`delivery-mcp-server` is the **tool itself** copied from this repo (incl. node_modules/dist), not source code of the target project — it should be ignored. Run in the **target project root**:

```bash
# Create .gitignore if missing; otherwise append idempotently only if the entry is absent
grep -qxF 'delivery-mcp-server' .gitignore 2>/dev/null || echo 'delivery-mcp-server' >> .gitignore
```

> Note: do **not** ignore `.delivery/` wholesale — it's the target project's delivery records and should be version-controlled.
> **Email config (SMTP server + authorization code) belongs to the current user personally**; `email.set` writes to the user home `~/.config/ai-delivery/user.json`, never appears in the project directory, so it must not and need not be committed.

---

## 4. First-Time Configuration (executed by AI)

The system requires configuring the **current user** and the **team roster** first; otherwise `task.create` is blocked (returns `config_required`).

### 1. Configure the current user (personal config, reused across projects)

Call the MCP tool `user.set`:

```json
{
  "name": "User Name",
  "email": "user@example.com"
}
```

### 2. Configure the team roster (project-level, one person can hold multiple roles)

Call the MCP tool `team.set`:

```json
{
  "name": "User Name",
  "email": "user@example.com",
  "roles": ["product-manager", "engineer"]
}
```

> **Important constraint**: the union of **all members' roles** in the team roster must cover all **8 roles** (see table below). If a role is missing, `team.set` returns `roles_incomplete` and lists the missing roles; keep adding members or extending roles until all 8 are covered.
> The current user's roles = the roles matched for the `user.set` email in the team roster.

| Role key | Agent file name |
|---|---|
| delivery-orchestrator | delivery-orchestrator.md |
| domain-expert | delivery-domain-expert.md |
| product-manager | delivery-product-manager.md |
| ux-designer | delivery-ux-designer.md |
| domain-architect | delivery-domain-architect.md |
| engineer | delivery-engineer.md |
| qa | delivery-qa.md |
| devops | delivery-devops.md |

> All role Agents are prefixed `delivery-` to avoid conflicts with same-named agents already in the target project (e.g. `engineer.md`). **The role key (roles value in team.json) and the Agent file name are two different concepts**: role keys never change; Agent file names carry the prefix.

### 3. Configure email notifications (optional, current-user personal level)

For email notifications, call `email.set` (requires `user.set` first). **Only email + authorization code are needed**; `host/port/secure` are auto-filled by email domain (built-in support for QQ/163/126/yeah/Foxmail/Gmail/Outlook/iCloud):

```json
{
  "user": "your.email@qq.com",
  "pass": "SMTP authorization code"
}
```

You can also explicitly specify a provider (`email.providers` lists all built-in providers and notes):

```json
{
  "provider": "qq",
  "user": "your.email@qq.com",
  "pass": "SMTP authorization code"
}
```

For a custom SMTP server, provide `host` + `port` explicitly:

```json
{
  "host": "smtp.example.com",
  "port": 465,
  "secure": true,
  "user": "noreply@example.com",
  "pass": "authorization code",
  "from": "noreply@example.com"
}
```

> **About the authorization code**: `pass` is the **SMTP authorization code** issued by the provider, not the login password. You must first enable "SMTP/IMAP service" in the email web settings and generate an authorization code (provider entries: QQ "Settings → Account → Enable services", 163 "Settings → POP3/SMTP", Gmail "Google Account → 2-Step Verification → App passwords"). Not configuring email doesn't affect the main flow (best-effort; send failures are silently skipped).
>
> **Config ownership**: email server and auth info are the **current user's personal** config; `email.set` writes to the user home `~/.config/ai-delivery/user.json` (same file as `user.set`'s name/email), reused across projects, **never written into the project repository** — each member configures their own sender account with their own email/authorization code, no shared global sender config. Updating name/email via `user.set` won't overwrite configured email.

---

## 5. Verifying the Installation

### 1. Confirm the MCP tools are available

In OpenCode, confirm you can see the following tool groups: `task.*`, `stage.*`, `artifact.*`, `gate.*`, `context.*`, `question.*`, `team.*`, `user.*`, `email.*`.

### 2. Run a full example (optional)

```bash
cd delivery-mcp-server
npm run example
```

### 3. Start the browser task dashboard (optional)

```bash
cd delivery-mcp-server
npm run dashboard
# Open http://localhost:8787
```

Background start (separate process + log): `node delivery-mcp-server/install.js --dashboard`
Stop the dashboard: `node delivery-mcp-server/install.js --stop-dashboard` or `cd delivery-mcp-server && npm run dashboard:stop`

> The dashboard automatically reads `.delivery` in the **project root** (the parent directory of delivery-mcp-server), no extra config needed. To use a different data directory, set the env var `DELIVERY_ROOT`.

---

## 6. Getting Started

In OpenCode, select the **delivery-orchestrator** Agent and describe your requirement directly, e.g.:

> Build a "supplier onboarding" feature: suppliers submit onboarding applications, the procurement department reviews them, and approved suppliers enter the supplier database.

The orchestrator will, in order:
1. `task.create` create the task (auto-detect type)
2. `stage.get` determine the current stage and assigned role
3. Call the corresponding role Agent to produce artifacts
4. `artifact.submit` → `gate.check` gate → `stage.complete` advance
5. When everything is done, `task.export_delivery_package` exports the delivery package

> **User confirmation (mandatory)**: when each role completes a stage, `stage.complete` must be executed by the **user themselves** (required field `confirmed_by`, filled with the user's name/email). The configured OpenCode permission enforces this: for the orchestrating Agent, `delivery_stage.complete` is `deny`, other calls are `ask` (pop-up prompting user approval). So even if the gate passes, the AI cannot advance the stage by itself — the user must interactively confirm before it goes to the next role. The AI only reports completion and guides the user to call `stage.complete`.
> **Dashboard hint**: `task.create` / `stage.complete` return `dashboard_url` and `view_hint`; the AI should tell the user "new task created / stage advanced, view it in the browser: <dashboard_url>".

---

## Appendix: Updating

### Option 1: One-click update (recommended)

An installed project can update to the latest version with the install script:

```bash
# Run in the target project root
node delivery-mcp-server/install.js --release
```

The script automatically downloads the latest Release → overwrites the `delivery-mcp-server/` tool + `delivery-*.md` role configs → rebuilds. **`.delivery` task data** and custom config in `opencode.json` are **preserved**. Pass `--lang zh|en` to switch the installed language (otherwise the remembered `.install-lang` language is reused).

> **Version-comparison auto-update**: when `delivery-mcp-server` already exists, `--release` / `--force-update` / **local version lower than source version** automatically delete the old copy and overwrite; otherwise it is skipped.
> **Windows manual update** (when the script is unavailable):
> ```powershell
> # After downloading and extracting the latest Release, run in the target project root
> Copy-Item -Recurse -Force "$env:TEMP\ai-delivery-system\delivery-mcp-server" .\delivery-mcp-server
> Copy-Item -Force "$env:TEMP\ai-delivery-system\.opencode\agent\delivery-*.md" .\.opencode\agent\
> cd delivery-mcp-server; npm install; npm run build
> ```

### Option 2: MCP-tool update

- **Auto-check on every startup**: when OpenCode starts the MCP server, the server asynchronously checks for new versions (based on GitHub Releases) and prints a hint in the startup log if found; silently skips without network, doesn't affect startup.
- **Manual update**: use `update.check` to view version status (optional `force` to force re-check), then run `node delivery-mcp-server/install.js --release` to update.

After updating, **restart OpenCode** for changes to take effect. Set `DELIVERY_UPDATE_CHECK=0` to disable the auto-check.

---

## 7. FAQ

**Q: Tools not found in OpenCode?**
A: Make sure `npm run build` produced `dist/server.js`, the `command` path in `opencode.json` is correct, then restart OpenCode.

**Q: `task.create` blocked with `config_required`?**
A: The current user or team roster isn't configured. Run `user.set` and `team.set` per section 4.

**Q: `team.set` returns `roles_incomplete`?**
A: The union of members' roles in the team roster doesn't cover all 8 roles. Follow the returned `missing_roles` and add members or extend roles until all 8 are covered.

**Q: Where is the task data stored?**
A: `.delivery/tasks/` under the target project root — plain-text files, trackable and versionable.

**Q: The dashboard can't read task data?**
A: Make sure `delivery-mcp-server` is installed under the **project root** (install.md section 3); the dashboard reads the project root `.delivery` automatically. If the server is elsewhere, set `DELIVERY_ROOT` to the project root.

**Q: Want to change the storage location?**
A: Set the env var `DELIVERY_ROOT` to the target directory.

---

## 8. Uninstall

### Option 1: One-click uninstall (recommended)

```bash
# Run in the target project root (stops running processes and cleans up automatically)
node delivery-mcp-server/uninstall.js

# Also delete .delivery/ task data (kept by default)
node delivery-mcp-server/uninstall.js --purge-data

# Also delete .opencode/agent/delivery-*.md (kept by default; may have been customized)
node delivery-mcp-server/uninstall.js --purge-agents

# Preview the operations that would run
node delivery-mcp-server/uninstall.js --dry-run
```

The script automatically:
1. Stops running dashboard and MCP server processes
2. Deletes the `delivery-mcp-server/` directory
3. Keeps `.opencode/agent/delivery-*.md` role configs (may have been customized; not deleted by default — only with `--purge-agents`)
4. Removes the `mcp.delivery` config from `opencode.json`
5. Keeps the `.delivery/` task data directory (not deleted by default — only with `--purge-data`)

### Option 2: Manual uninstall

1. Stop the dashboard (Ctrl+C closes the dashboard window) and exit OpenCode (releases the MCP server)
2. Remove the `mcp.delivery` config from `opencode.json`
3. Delete the `delivery-mcp-server/` directory
4. Keep `.opencode/agent/delivery-*.md` (may have been customized; if you really want them gone, only delete the `delivery-` prefixed files)
5. Keep the `.delivery/` directory (task data; delete manually if you really want to)
