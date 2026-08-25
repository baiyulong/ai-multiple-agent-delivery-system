# AI Delivery Task System · Installation Guide (install.md)

> **Language / 语言**: [English](install.en.md) · [中文](install.md)
>
> This file is an **installation manual meant for AI agents**. The user only needs to give the AI the link (or content) of this file, and the AI can complete installation, registration, and first-time configuration automatically.
>
> Repository: `https://github.com/baiyulong/ai-multiple-agent-delivery-system.git`

---

## 1. What This Is

A **MCP-based** multi-role Agent delivery orchestration system. It breaks project delivery into a **multi-role relay workflow** (Product Manager → UI/UX → Domain Architecture → Engineering → Developer → QA, with a Data Engineer joining on demand), and enforces **stage gates** so every artifact must pass before the next stage begins. Task state is stored as plain-text files in a local `.delivery` directory — no database required.

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

> **Installation model (important)**: the tool itself is installed **globally once** in the user directory `~/.config/ai-delivery/delivery-mcp-server/`, and the role Agents globally in `~/.config/opencode/agents/` — **shared across projects, not re-installed per project**. The project only registers:
>
> 1. `mcp.delivery` in `opencode.json` (**absolute-path** command + `DELIVERY_ROOT` env var pointing at this project's `.delivery`)
> 2. a `.delivery/` entry appended to `.gitignore` (task data root)
>
> Global paths can be overridden by env vars (normally not needed): `DELIVERY_INSTALL_ROOT` (tool root, default `~/.config/ai-delivery`), `DELIVERY_AGENTS_DIR` (agents dir, default `~/.config/opencode/agents`).
>
> **Recommended Option 1: run the `install.js` script (works on Windows/Linux, completes all steps and safe merging automatically), see 【Option 1】below; or follow 【Option 2】to do it manually step by step.**

### Option 1: One-click install script (recommended)

**Install from the latest prebuilt package on GitHub Releases (recommended, small download, pinned version, no local build)**:

```bash
# Run in the target project root
node delivery-mcp-server/install.js --release
```

**Or specify a local repository path (when the script is not in the same directory as the repo)**:

```bash
node delivery-mcp-server/install.js --repo /tmp/ai-delivery-system /path/to/project
```

> You can also run it directly from a repo checkout: `node /path/to/ai-delivery-system/delivery-mcp-server/install.js /path/to/project`.

The script automatically:

0. **（--release mode）** Queries the latest GitHub Release → downloads the prebuilt `ai-delivery-*.zip` (contains dist + web-dist/{zh,en} + config + templates) → validates the zip format → extracts to a temp directory as the source path; exits with a message if there is no Release or the download fails
1. Validates the target directory (refuses to install into the repo itself; non-git projects can use `--force`)
2. Determines the install language (see "Language selection" below)
3. Stops running dashboard and MCP server processes (avoids file locks on update)
4. **Installs the tool into the global directory** `~/.config/ai-delivery/delivery-mcp-server/` (if it exists: `--release` / `--force-update` / **local version lower than source version** delete the old copy and install the new one; otherwise it is skipped)
5. **Applies the install language**: writes `config/lang/active.json`, deletes the other language's built-in resources (config/gates, config/architectures, templates, lang json, `web-dist/`)
6. **Copies the role Agents to the global directory** `~/.config/opencode/agents/` (`delivery-*.md`, language suffix stripped; source install only adds, never overwrites existing; `--release` update mode overwrites)
7. **Merges `opencode.json`**: preserves all existing fields of the target project, only writes `mcp.delivery` = `{ "type": "local", "command": ["node", "<global>/delivery-mcp-server/dist/server.js"], "environment": { "DELIVERY_ROOT": "<project>/.delivery" }, "enabled": true }` (skips if already present with the same path; updates if an old path exists)
8. **Appends `.gitignore`**: `.delivery/` (idempotent). **Email config belongs to the current user personally** (`email.set` writes to the user home `~/.config/ai-delivery/user.json`), never written into the project
9. **Installs dependencies**: for `--release` prebuilt packages only runs `npm install --omit=dev` (**no build** — dist is included); for source installs runs `npm install` + `npm run build` (`VITE_LANG` injected into the web build, producing `web-dist/` in the selected language)
10. If the project contains an old per-project `delivery-mcp-server/`, prints a **migration hint** (task data `.delivery` is preserved in place; the old directory can be deleted manually)
11. By default does **not** auto-start the dashboard (add `--dashboard` to start in the background; avoids being killed by command-line tools with timeouts)
12. Prints follow-up configuration guidance (user.set / team.set / email.set) and local global-path info

```bash
# Common parameters
node delivery-mcp-server/install.js                          # Install into the project of the current directory
node delivery-mcp-server/install.js /path/to/proj           # Install into a specific project
node delivery-mcp-server/install.js --release               # Install/update from the latest stable GitHub Release
node delivery-mcp-server/install.js --prerelease            # Install the latest prerelease version (pre-release testing, see below)
node delivery-mcp-server/install.js --repo ../clone /path/to/proj # Specify a local repository path
node delivery-mcp-server/install.js --force-update          # Force-overwrite the installed tool (no version comparison)
node delivery-mcp-server/install.js --dashboard             # Start the dashboard in the background after install (detached, log <project>/.delivery/dashboard.log)
node delivery-mcp-server/install.js --stop-dashboard        # Only stop the dashboard process, no install
node delivery-mcp-server/install.js --dry-run               # Only print operations that would run, change nothing
node delivery-mcp-server/install.js --force                 # Continue even if the target directory is not a git repo
```

#### Installing a prerelease version (pre-release testing)

When the user asks to install a **prerelease / beta / test version** (e.g. `v0.2.26-rc.1`), add `--prerelease`:

```bash
node delivery-mcp-server/install.js --prerelease            # or combined: --release --prerelease
```

- `--prerelease` picks the **newest pre-release** from the GitHub Releases list (`--release` only fetches the latest stable release and never sees prereleases).
- All other install steps are identical to `--release` (prebuilt package, overwrite update, runtime-only deps).
- If the repo has no prerelease, the script reports a clear error; tell the user to publish one first (pushing a `v*` tag containing a `-rc`/`-beta`/`-alpha`/`-test` suffix marks it as pre-release automatically).

**Language selection (bilingual):** the system ships Chinese (`zh`) and English (`en`) versions. The install script determines the language in this order: `--lang` flag > globally installed language (`<global>/delivery-mcp-server/config/lang/active.json`) > legacy project `.install-lang` (old versions) > interactive prompt > default `zh`:

```bash
node delivery-mcp-server/install.js --lang en               # Install the English version (web UI + role agents + templates)
node delivery-mcp-server/install.js --lang zh               # Install the Chinese version (default)
```

Only the selected language is installed (the other language's built-in resources and web artifacts are deleted); the choice is remembered in the **global** `active.json` and reused on later updates. `--lang` overrides the remembered choice.

### Option 2: Manual installation

#### 1. Get the source (Release download recommended)

**Option A: download the prebuilt package from GitHub Releases (recommended, small download, pinned version)**

```bash
# Query the latest Release version
curl -s https://api.github.com/repos/baiyulong/ai-multiple-agent-delivery-system/releases/latest | grep tag_name

# Download and extract the prebuilt zip (replace v0.2.x with the actual version)
curl -L -o /tmp/ai-delivery.zip https://github.com/baiyulong/ai-multiple-agent-delivery-system/releases/download/v0.2.x/ai-delivery-v0.2.x.zip
unzip -q /tmp/ai-delivery.zip -d /tmp/ai-delivery-system
```

**Option B: git clone (full source, incl. git history)**

```bash
git clone https://github.com/baiyulong/ai-multiple-agent-delivery-system.git /tmp/ai-delivery-system
```

#### 2. Install the tool into the global directory (shared across projects)

> If `~/.config/ai-delivery/delivery-mcp-server/` already exists (installed by another project), **skip this step and step 3**, go straight to step 4 (registration).

```bash
mkdir -p ~/.config/ai-delivery
cp -r /tmp/ai-delivery-system/delivery-mcp-server ~/.config/ai-delivery/
```

> **Windows users**: `cp` is a Unix command not available in PowerShell by default. Choose one of:
> 1. Prefer the install script: `node delivery-mcp-server/install.js` (cross-platform, completes all steps)
> 2. Use the PowerShell equivalents: `Copy-Item -Recurse /tmp/ai-delivery-system/delivery-mcp-server $env:USERPROFILE\.config\ai-delivery\`
> 3. Run the Unix commands in Git Bash / WSL

#### 3. Copy the role Agents into the global directory

```bash
# 8 role configs (Chinese *.zh.md / English *.en.md), language suffix stripped, into the global agents dir
mkdir -p ~/.config/opencode/agents
# Chinese:
cp /tmp/ai-delivery-system/.opencode/agent/delivery-*.zh.md ~/.config/opencode/agents/
# English:
cp /tmp/ai-delivery-system/.opencode/agent/delivery-*.en.md ~/.config/opencode/agents/
# Strip the language suffix (delivery-orchestrator.zh.md → delivery-orchestrator.md)
cd ~/.config/opencode/agents
for f in delivery-*.zh.md delivery-*.en.md; do mv "$f" "${f%.zh.md}.md"; mv "${f}" "${f%.en.md}.md"; done 2>/dev/null || true
```

> **Important**: all role Agent files are prefixed `delivery-` (`delivery-engineer.md`, `delivery-qa.md`, etc.), **only added, never overwriting** same-named agents in the target project's `.opencode/agent/` (e.g. `engineer.md`) — note there are two agent directories: **project-level** (`.opencode/agent/`) and **global-level** (`~/.config/opencode/agents/`); project-level takes precedence.

#### 4. Install dependencies and build (only needed on first global install)

> **Note**: the following commands must run inside the global `delivery-mcp-server/`, otherwise you'll get ENOENT (package.json not found).

```bash
cd ~/.config/ai-delivery/delivery-mcp-server
npm install
# Choose the web UI language before building (zh or en):
VITE_LANG=zh npm run build        # Chinese web UI
# or: VITE_LANG=en npm run build  # English web UI
# Produces dist/server.js (what OpenCode references) + web-dist/{zh|en}/
```

> If using the `--release` prebuilt package, **skip this step** (dist and web-dist are included; only `npm install --omit=dev` is needed).

#### 5. Verify the build artifact exists

```bash
# Should exist: ~/.config/ai-delivery/delivery-mcp-server/dist/server.js
```

#### 6. Register the MCP server in the target project (must merge, never overwrite)

In the target project root's `opencode.json`, **merge** (create if the file doesn't exist). **Be sure to preserve all existing fields of the target project** (e.g. existing `mcp`, `plugin`, `permission`, `agent`, etc.):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "...target project's existing mcp...": {},
    "delivery": {
      "type": "local",
      "command": ["node", "/home/USER/.config/ai-delivery/delivery-mcp-server/dist/server.js"],
      "environment": { "DELIVERY_ROOT": "/path/to/proj/.delivery" },
      "enabled": true
    }
  }
}
```

> **Never overwrite wholesale**: if the target project already has an `opencode.json`, only add the `mcp.delivery` field, keep everything else unchanged; if `mcp.delivery` already exists, skip — do not add it again.
> **Paths**: the server lives in the **global directory** (not inside the project), so the `command` must be an **absolute path**; also use `environment.DELIVERY_ROOT` to explicitly point at this project's data root (in the new model the server and the project have no parent/child relationship, so it must be injected explicitly). On Windows the path looks like `C:\Users\USER\.config\ai-delivery\delivery-mcp-server\dist\server.js`.

#### 7. Clean up the temporary clone

```bash
rm -rf /tmp/ai-delivery-system
```

#### 8. Start the browser task dashboard and tell the user

> **Note**: the dashboard is a long-running service; **it does not auto-start with the install by default** (to avoid being killed by command-line tools with timeouts). Start it on demand after installation:
>
> - Background start (recommended, separate process + log + port check): run `node ~/.config/ai-delivery/delivery-mcp-server/install.js --dashboard` in the project root (the script injects `DELIVERY_ROOT` automatically)
> - Foreground start: `cd ~/.config/ai-delivery/delivery-mcp-server && npm run dashboard` (**you must set `DELIVERY_ROOT` to the project data root first**, e.g. PowerShell: `$env:DELIVERY_ROOT="C:\path\to\proj\.delivery"`)
> - Stop: `node ~/.config/ai-delivery/delivery-mcp-server/install.js --stop-dashboard` or `cd ~/.config/ai-delivery/delivery-mcp-server && npm run dashboard:stop`

```bash
cd ~/.config/ai-delivery/delivery-mcp-server
$env:DELIVERY_ROOT = "C:\path\to\proj\.delivery"   # must be set (data root)
npm run dashboard
# Output: AI delivery task dashboard started: http://localhost:8787
```

**Must tell the user**:
- Dashboard URL: `http://localhost:8787` (if the port is occupied, check the actual port in `<project>/.delivery/dashboard.port` or the startup log)
- Note: all task creation and status changes are visible on this page; `task.create` / `stage.complete` etc. also return `dashboard_url` and `view_hint` that can be opened directly in the browser to view the corresponding task.

> The dashboard resolves the data root as: `DELIVERY_ROOT` env var > `.delivery` in the current directory. When starting from the global directory you **must** set `DELIVERY_ROOT` (the script's `--dashboard` injects it automatically).

#### 9. Add the task data to .gitignore

Run in the **target project root** (the script does this automatically; manual installs must do it):

```bash
# Create .gitignore if missing; otherwise append idempotently only if the entry is absent
grep -qxF '.delivery/' .gitignore 2>/dev/null || echo '.delivery/' >> .gitignore
```

> Note: `.delivery/` is the task data root (team config + task records); in the new model it is **recommended to ignore it** (it is tool runtime data that can be rebuilt at any time; if you want to customize flow/gate templates in `.delivery/config/`, commit them separately). **The tool itself is no longer inside the project**, so there's no need to ignore `delivery-mcp-server`.
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

> **Important constraint**: the union of **all members' roles** in the team roster must cover all **9 roles** (see table below). If a role is missing, `team.set` returns `roles_incomplete` and lists the missing roles; keep adding members or extending roles until all 9 are covered.
> The current user's roles = the roles matched for the `user.set` email in the team roster.

| Role key | Agent file name |
|---|---|
| delivery-orchestrator | delivery-orchestrator.md |
| domain-expert | delivery-domain-expert.md |
| product-manager | delivery-product-manager.md |
| ux-designer | delivery-ux-designer.md |
| domain-architect | delivery-domain-architect.md |
| engineer | delivery-engineer.md |
| developer | delivery-developer.md |
| data-engineer | delivery-data-engineer.md |
| qa | delivery-qa.md |

> All role Agents are prefixed `delivery-` to avoid conflicts with same-named agents already in the target project (e.g. `engineer.md`). **The role key (roles value in team.json) and the Agent file name are two different concepts**: role keys never change; Agent file names carry the prefix.

> **Role assignee mechanism**: a role **can be held by multiple team members** (just register them with the same role via team.set), but **each role has exactly one assignee per task**. Whenever a stage completes, the system returns the candidate members for the next stage's role; the user picks one and it is fixed onto the task via `task.assign`. An assignee can be changed anytime via `task.assign` (overwrite semantics); use `task.role_candidates` to list candidates before changing.

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
cd ~/.config/ai-delivery/delivery-mcp-server
npm run example
```

### 3. Start the browser task dashboard (optional)

```bash
# In the project root (injects DELIVERY_ROOT automatically):
node ~/.config/ai-delivery/delivery-mcp-server/install.js --dashboard
# Open http://localhost:8787
```

Background start (separate process + log): `--dashboard` as above
Stop the dashboard: `node ~/.config/ai-delivery/delivery-mcp-server/install.js --stop-dashboard`

> Dashboard data root: `DELIVERY_ROOT` env var > `.delivery` in the current directory. When starting directly from the global directory (`npm run dashboard`) you **must** set `DELIVERY_ROOT` to the project data root.

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

> **Note**: in the new model the tool lives in the **global directory**; run the update command in the **project root**:

```bash
node ~/.config/ai-delivery/delivery-mcp-server/install.js --release
```

The script automatically: queries and downloads the latest Release prebuilt zip → stops old processes → overwrites the global tool + role Agents → `npm install --omit=dev` (no build needed for prebuilt packages). **`.delivery` task data** and custom config in `opencode.json` are **preserved**. Pass `--lang zh|en` to switch the installed language (otherwise the globally remembered `active.json` language is reused).

> **Updating to a prerelease version**: when the user asks for a pre-release/test version, use `node ~/.config/ai-delivery/delivery-mcp-server/install.js --prerelease` instead (picks the newest pre-release from the Releases list; plain `--release` only fetches the latest stable release). Note the locally installed install.js must be ≥ v0.2.26 to support this flag; with older versions run from the repo source: `node /path/to/ai-multiple-agent-delivery-system/delivery-mcp-server/install.js --prerelease`.

> **Version-comparison auto-update**: when the global install already exists, `--release` / `--force-update` / **local version lower than source version** automatically delete the old copy and overwrite; otherwise it is skipped.
> **Windows manual update** (when the script is unavailable):
> ```powershell
> # After downloading and extracting the latest Release prebuilt package
> Copy-Item -Recurse -Force "$env:TEMP\ai-delivery-system\delivery-mcp-server" "$env:USERPROFILE\.config\ai-delivery\delivery-mcp-server"
> Copy-Item -Force "$env:TEMP\ai-delivery-system\.opencode\agent\delivery-*.en.md" "$env:USERPROFILE\.config\opencode\agents\"   # or *.zh.md
> cd "$env:USERPROFILE\.config\ai-delivery\delivery-mcp-server"; npm install --omit=dev
> ```

### Option 2: MCP-tool update

- **Auto-check on every startup**: when OpenCode starts the MCP server, the server asynchronously checks for new versions (based on GitHub Releases) and prints a hint in the startup log if found; silently skips without network, doesn't affect startup.
- **Manual update**: use `update.check` to view version status (optional `force` to force re-check), then run `node ~/.config/ai-delivery/delivery-mcp-server/install.js --release` in the project root to update.

After updating, **restart OpenCode** for changes to take effect. Set `DELIVERY_UPDATE_CHECK=0` to disable the auto-check.

---

## 7. FAQ

**Q: Tools not found in OpenCode?**
A: Make sure the global `~/.config/ai-delivery/delivery-mcp-server/dist/server.js` is built and the `command` in `opencode.json` uses an **absolute path**, then restart OpenCode.

**Q: `task.create` blocked with `config_required`?**
A: The current user or team roster isn't configured. Run `user.set` and `team.set` per section 4.

**Q: `team.set` returns `roles_incomplete`?**
A: The union of members' roles in the team roster doesn't cover all 8 roles. Follow the returned `missing_roles` and add members or extend roles until all 8 are covered.

**Q: Where is the task data stored?**
A: `.delivery/tasks/` under the target project root — plain-text files, trackable and versionable.

**Q: The dashboard can't read task data?**
A: When starting the dashboard from the global directory you **must** set `DELIVERY_ROOT` to the project data root (`node ~/.config/ai-delivery/delivery-mcp-server/install.js --dashboard` injects it automatically; for the foreground `npm run dashboard`, set it manually).

**Q: Want to change the storage location?**
A: Set the env var `DELIVERY_ROOT` to the target directory.

**Q: Updated the version but OpenCode still runs the old code?**
A: The MCP server process is stopped on update; **restart OpenCode** for it to start with the new code.

---

## 8. Uninstall

> **Note**: run the uninstall command in the **project root**. In the new model the tool lives in the global directory, so uninstall is split into "project unbinding" and "global cleanup".

### Option 1: One-click uninstall (recommended)

```bash
# Run in the target project root (stops running processes, removes project registration)
node ~/.config/ai-delivery/delivery-mcp-server/uninstall.js

# Also delete .delivery/ task data (kept by default)
node ~/.config/ai-delivery/delivery-mcp-server/uninstall.js --purge-data

# Also delete the global install ~/.config/ai-delivery/delivery-mcp-server/ (affects all projects; kept by default)
node ~/.config/ai-delivery/delivery-mcp-server/uninstall.js --purge-server

# Also delete the global role Agents ~/.config/opencode/agents/delivery-*.md (affects all projects; kept by default)
node ~/.config/ai-delivery/delivery-mcp-server/uninstall.js --purge-agents

# All of the above (data + global install + global agents)
node ~/.config/ai-delivery/delivery-mcp-server/uninstall.js --purge-all

# Preview the operations that would run
node ~/.config/ai-delivery/delivery-mcp-server/uninstall.js --dry-run
```

> If the project still contains a legacy per-project `delivery-mcp-server/`, you can also use `node delivery-mcp-server/uninstall.js` (legacy script) to unbind the current project.

The script automatically:
1. Stops running dashboard (by the port in `.delivery/dashboard.port`) and MCP server processes
2. Removes the `mcp.delivery` config from `opencode.json` (deletes `mcp` too if it becomes empty)
3. Removes the `.delivery/` entry from `.gitignore`
4. Keeps the `.delivery/` task data directory (not deleted by default — only with `--purge-data`)
5. Keeps the global install and global agents (not deleted by default, **affects all projects** — only with `--purge-server` / `--purge-agents`)

### Option 2: Manual uninstall

1. Stop the dashboard (Ctrl+C closes the dashboard window) and exit OpenCode (releases the MCP server)
2. Remove the `mcp.delivery` config from `opencode.json`
3. Remove the `.delivery/` entry from `.gitignore`
4. Keep the `.delivery/` directory (task data; delete manually if you really want to)
5. Global cleanup (optional, **affects all projects**): delete `~/.config/ai-delivery/delivery-mcp-server/` and `~/.config/opencode/agents/delivery-*.md`
