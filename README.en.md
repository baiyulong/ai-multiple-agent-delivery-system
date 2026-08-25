# AI Delivery Task System

> **Language / 语言**: [English](README.en.md) · [中文](README.md)

A **multi-role Agent delivery orchestration system** built on **MCP (Model Context Protocol)**. It breaks project delivery into a **multi-role relay workflow** (Product Manager → UI/UX → Domain Architecture → Engineering → Developer → QA, with a Data Engineer joining on demand), enforces **stage gates** so every artifact must pass before the next stage begins, and stores all task state as plain-text files in a local `.delivery` directory — no database required.

Works with MCP-capable AI coding tools such as **OpenCode**.

---

## Background & Problem Solved

This system targets **team development**. When a team develops with AI assistance, common pain points are:

| Pain point | Symptom | How this system solves it |
|---|---|---|
| **Opaque delivery flow** | Who owns each stage (requirements→design→dev→test→release) and where it's stuck is communicated only verbally/on paper | Multi-role relay workflow; stage status, owners, and blocking questions all persisted and inspectable |
| **Inconsistent artifact quality** | No unified template or acceptance criteria per role; quality depends on individual skill | 17 artifact templates + hard gate checks (missing sections / forbidden wording / insufficient acceptance criteria → rejected) |
| **No gate before stage advance** | Substandard artifacts move to the next stage; costly rework | Stage completion pre-checks: artifacts exist, gate passed, no blocking questions — all required |
| **Unclear role boundaries** | Blurred boundaries in multi-role collaboration; overstepping or omissions | 9 dedicated Agents (1 orchestrator + 8 roles), each with explicit responsibilities and artifacts |
| **Poor cross-role consistency** | Terms, statuses, API contracts, and test cases written independently don't match | Shared context (ubiquitous language) + consistency checks + question blocking mechanism |
| **Untrackable progress** | What stage is a task at, who is waiting on whom — only by asking | Browser task dashboard: task list, stage progress, gate results, artifacts, pending questions at a glance |
| **Awkward multi-machine collaboration** | Database deployments are heavy and hard to migrate | Plain-text file storage (`.delivery/`), versionable, trackable, copyable across machines |

In one sentence: **turn "AI team delivery" from "hoping prompts work" into an engineered process with flow, gates, a dashboard, and traceability.**

---

## Table of Contents

- [Background & Problem Solved](#background--problem-solved)
- [System Components](#system-components)
- [How It Works](#how-it-works)
- [Quick Start](#quick-start)
- [Using in a New Project](#using-in-a-new-project)
- [MCP Tools Overview](#mcp-tools-overview)
- [Workflow Examples](#workflow-examples)
- [Team Configuration](#team-configuration)
- [Browser Task Dashboard](#browser-task-dashboard)
- [Storage Structure](#storage-structure)
- [Upgrade](#upgrade)
- [Customizing Flows & Gates](#customizing-flows--gates)
- [Testing & Validation](#testing--validation)
- [FAQ](#faq)

---

## System Components

| Component | Path | Description |
|---|---|---|
| **MCP Server** | `delivery-mcp-server/` | 17 tools: task/stage/artifact/gate/context/question |
| **Flow templates** | `delivery-mcp-server/config/flows/` | crud (6 stages) / lightweight-ddd (6 stages) / full-ddd (7 stages) |
| **Gate rules** | `delivery-mcp-server/config/gates/` | Check rules for 17 artifact types |
| **Artifact templates** | `delivery-mcp-server/templates/` | Shared context + 17 artifact templates |
| **Multi-role Agents** | `.opencode/agent/` | 9 OpenCode Agents (1 orchestrator + 8 roles) |
| **OpenCode registration** | `opencode.json` | Registers the MCP server with OpenCode |
| **Design documents** | `AI 任务管理系统 PRD.md`, `自定义多角色 Agent 设计稿.md`, `AI 交付任务系统实现计划.md` | Requirements, role design, implementation plan |

## How It Works

```
You describe a new requirement
     ↓
delivery-orchestrator creates a task, auto-detects the task type
     ↓
Task enters the first stage; orchestrator assigns the corresponding role Agent
     ↓
Role Agent produces an artifact → artifact.submit
     ↓
gate.check gate check (missing sections / forbidden wording / insufficient acceptance criteria → sent back for revision)
     ↓
stage.complete completes the stage → automatically advances to the next stage
     ↓
… through all stages …
     ↓
task.export_delivery_package exports the delivery package
```

Core design:
- **Gates are hard constraints**: if an artifact doesn't meet the standard, the stage cannot complete; it must be revised and resubmitted.
- **Upstream dependencies**: downstream stages are blocked while upstream is incomplete, and the corresponding role is auto-assigned to fill the gap.
- **Question blocking**: roles can create questions that block a stage; resolving them unblocks it.
- **Type adaptation**: simple CRUD uses a lightweight 6-stage flow; complex core business auto-runs the full DDD flow.

---

## Quick Start

### Option 1: Let AI install it for you (recommended)

Give your AI tool the link to this repo's **install.md**, and the AI will clone, build, register the MCP server, and do the first-time configuration automatically:

```
https://github.com/baiyulong/ai-multiple-agent-delivery-system/blob/main/install.md
```

> In OpenCode, just say: "Please install the AI Delivery Task System following this link: https://github.com/baiyulong/ai-multiple-agent-delivery-system/blob/main/install.md" — the AI reads install.md and runs the installation.

### Option 2: Manual install

Requirement: **Node.js ≥ 22**

```bash
# 1. Install dependencies
cd delivery-mcp-server
npm install

# 2. Build (produces dist/server.js, which OpenCode references)
npm run build

# 3. Run a full example (optional)
npm run example

# 4. Run all tests (optional)
npm test
```

---

## Using in a New Project

> **Installation model**: the tool is installed **globally once** (`~/.config/ai-delivery/delivery-mcp-server/`), role Agents globally (`~/.config/opencode/agents/`), **shared across projects, not re-installed per project**. The project only registers `mcp.delivery` in `opencode.json` (absolute path + `DELIVERY_ROOT`) and a `.delivery/` entry in `.gitignore`. See [install.en.md](install.en.md).

### 1. One-click install (recommended)

Run in the **target project root** (downloads the prebuilt package from GitHub Releases; no local build):

```bash
node delivery-mcp-server/install.js --release
```

> Or install from a local repo checkout: `node /path/to/ai-delivery-system/delivery-mcp-server/install.js /path/to/project`.

The script automatically: installs the tool into the global directory → copies Agents to the global directory → merges `opencode.json` (registers `mcp.delivery`) → appends `.gitignore` (`.delivery/`) → installs dependencies. Re-running is idempotent (skips if already present with the same version).

### 2. Manual registration (equivalent to script step 3)

In the target project root's `opencode.json`, **merge** (preserve existing fields); the `command` must be an **absolute path**:

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

> On Windows the path looks like `C:\Users\USER\.config\ai-delivery\delivery-mcp-server\dist\server.js`. Append `.delivery/` to `.gitignore`.

### 4. Start delivering in OpenCode

Open OpenCode, select the **delivery-orchestrator** Agent, and describe your requirement directly, e.g.:

> Build a "supplier onboarding" feature: suppliers submit onboarding applications, the procurement department reviews them, and approved suppliers enter the supplier database.

The orchestrator will, in order:
1. `task.create` create the task (auto-detect type: crud / lightweight_ddd / full_ddd / analysis / bug_fix)
2. Check `stage.get` to determine the current stage and assigned role
3. Call the corresponding role Agent (`delivery-product-manager` / `delivery-ux-designer` / `delivery-domain-architect` / `delivery-engineer` / `delivery-developer` / `delivery-qa`; `delivery-data-engineer` when data lookups are needed) to produce artifacts
4. `artifact.submit` → `gate.check` gate → `stage.complete` advance
5. When everything is done, `task.export_delivery_package` exports the delivery package

### Viewing task progress

- Ask the orchestrator to call `task.get <task_id>` to view stage status, artifacts, and pending questions.
- Or open files under `.delivery/tasks/TASK-xxx/` directly.
- Or start the **browser task dashboard** (see next section) to browse all tasks visually.

---

## Team Configuration

The system requires the project to configure **participants and their roles** first (one person can hold multiple roles); it must be configured before first use (creating a task).

### Configuring via MCP

```jsonc
// team.set: add or update a member (matched by email, roles overwrite)
{
  "name": "Yulong",
  "email": "xiaoum@live.com",
  "roles": ["product-manager", "engineer"]   // one person can hold multiple roles
}
```

- `team.get`: view the current team configuration (includes role labels).
- Without configuration, `task.create` returns `team_not_configured`, prompting you to configure first.
- The configuration is stored in `.delivery/config/team.json` (project-level, excluded via gitignore).

### Role list

All role Agent files are prefixed with `delivery-` to avoid conflicts with same-named agents that already exist in the target project. The role key (roles value in team.json) and the Agent file name are two different concepts.

| Role key | Agent file name |
|---|---|
| delivery-orchestrator | delivery-orchestrator.md |
| domain-expert | delivery-domain-expert.md |
| product-manager | delivery-product-manager.md |
| ux-designer | delivery-ux-designer.md |
| domain-architect | delivery-domain-architect.md |
| engineer | delivery-engineer.md |
| qa | delivery-qa.md |
| developer | delivery-developer.md |
| data-engineer | delivery-data-engineer.md |

The dashboard header shows current team members (name/email/roles); if not configured, a hint bar is shown.

---

## Browser Task Dashboard

A local, read-only, no-login dashboard for browsing task status in the browser: task list, stage progress, gate results, artifact content, pending questions, shared context, and public documents.

```bash
# In the project root (injects DELIVERY_ROOT automatically, recommended):
node ~/.config/ai-delivery/delivery-mcp-server/install.js --dashboard

# Or foreground start (set DELIVERY_ROOT first):
cd ~/.config/ai-delivery/delivery-mcp-server
$env:DELIVERY_ROOT = "C:\path\to\proj\.delivery"   # data root (required)
npm run dashboard
# Output: AI delivery task dashboard started: http://localhost:8787
```

Open `http://localhost:8787`.

- **Task list**: task cards (title, type, status, stage progress bar); click to enter detail; auto-refreshes every 8 seconds.
- **Task detail**: stage step bar, gate result badges (passed/failed/warning), artifact list (click to expand markdown content), pending questions, shared context, delivery package (viewable after task completion).
- **Public documents**: home tab navigation "Tasks / Public Documents", aggregates the architect's `ubiquitous_language_code_map` and `technical_architecture` across tasks, grouped by type, expandable.

Configuration:

| Item | Description |
|---|---|
| Port | env var `DELIVERY_DASHBOARD_PORT` or `PORT`, default `8787`; auto-falls back to a random port if occupied, actual port written to `<dataRoot>/dashboard.port` |
| Data root | env var `DELIVERY_ROOT`, default `.delivery` in the current directory (**required** when starting from the global directory) |

> The dashboard is an independent entry point, independent of the MCP server; both can run simultaneously. Stop: `node ~/.config/ai-delivery/delivery-mcp-server/install.js --stop-dashboard`.

---

## MCP Tools Overview

> On every startup the system checks for a new version; if one is found it's noted in the startup log. See [Upgrade](#upgrade).

| Tool | Description |
|---|---|
| `task.create` | Creates a task, auto-detects type and initializes the flow; can specify assignees (pre-fixed single assignee per role) and skip_stages |
| `task.assign` | Sets/reassigns a role's owner for a task (role -> member email; exactly one assignee per role per task; overwrites on repeat) |
| `task.role_candidates` | Queries candidate assignees for a role (team members holding it) and the current fixed assignee |
| `task.get` | Gets task details (task/stages/artifacts/pending questions) |
| `task.detect_type` | Type detection only |
| `task.get_flow` | Views the flow template for a task type |
| `task.export_delivery_package` | Exports the delivery package (requires all stages complete) |
| `stage.get` | Stage status, readiness, missing upstream, assigned Agent, blocking questions |
| `stage.complete` | Completes a stage (four pre-checks: artifacts exist / gate passed / no blocking questions) |
| `artifact.submit` | Submits an artifact (validates upstream stage and type) |
| `artifact.get` / `artifact.list` | Read artifacts |
| `artifact.update` | Revises an artifact (keeps history versions) |
| `gate.check` | Runs the gate check and records the result |
| `context.get_shared` / `context.update` | Read/write shared context |
| `question.create` / `question.resolve` | Create/resolve blocking questions |
| `update.check` | Checks for a new system version, optional force re-check |

---

## Workflow Examples

### Full delivery (core business)

```
crud_spec_card → ux_interaction_card → ddd_applicability_review + ubiquitous_language_code_map + technical_architecture → engineering_plan → qa_test_plan
```

| Stage | Role Agent | Required artifacts | Gate rules |
|---|---|---|---|
| product_requirement | product-manager | crud_spec_card / product_requirement_card | 14 required sections, includes deletion rules, acceptance criteria ≥3 |
| ux_design | ux-designer | ux_interaction_card | 17 sections, state-action matrix |
| domain_review | domain-architect | ddd_applicability_review + ubiquitous_language_code_map + technical_architecture | DDD applicability judgment + term-code mapping + architecture sections |
| engineering_design | engineer | engineering_plan | 12 sections, API/data model/test suggestions |
| qa_validation | qa | qa_test_plan | Test strategy, functional cases ≥3 |

### Simple CRUD

`product_requirement → ux_design → domain_review(lightweight review) → engineering_design → qa_validation`, without forcing DDD.

---

## Storage Structure

```
.delivery/
├── config/                    # Project-level config (user-editable, takes priority over global defaults)
│   ├── flows/                 # Flow templates
│   ├── gates/                 # Gate rules
│   └── architectures/         # Preset architecture templates (for greenfield projects)
└── tasks/
    └── TASK-YYYYMMDD-NNN/
        ├── task.json          # Task metadata
        ├── stages.json        # Stage status
        ├── context.md         # Shared context (17 sections)
        ├── questions.json     # Question list
        ├── artifacts/
        │   ├── index.json
        │   └── {stage}/{type}.md   # Artifacts (incl. history versions v{n})
        ├── gates/{stage}.gate.json # Gate records
        └── delivery_package.md     # Delivery package (exported on completion)
```

- Task IDs increment per day: `TASK-20260805-001`
- Storage root priority: tool-passed `root` > env var `DELIVERY_ROOT` > current working directory `.delivery`
- Config read chain: project `.delivery/config/*` > global install defaults `~/.config/ai-delivery/delivery-mcp-server/config/*` > built-in fallback

---

## Upgrade

> **Scope of update**: upgrading overwrites the global `~/.config/ai-delivery/delivery-mcp-server/` tool + global agents (`~/.config/opencode/agents/delivery-*.md`) + flow/gate/artifact templates, and installs dependencies. **Project `.delivery` task data** and custom config in `opencode.json` are **preserved**. After upgrading, **restart OpenCode** for changes to take effect.

### Option 1: Let AI upgrade it (recommended)

Open OpenCode and say to the orchestrator (or any Agent):

> Please upgrade the AI Delivery Task System to the latest version: https://github.com/baiyulong/ai-multiple-agent-delivery-system/blob/main/install.md

The AI reads the update section of install.md and runs `node ~/.config/ai-delivery/delivery-mcp-server/install.js --release` (downloads the latest prebuilt package → overwrites the global tool + role configs → installs dependencies → prompts to restart OpenCode). No commands needed from you.

### Option 2: Run the upgrade command yourself

In the target project root:

```bash
node ~/.config/ai-delivery/delivery-mcp-server/install.js --release
```

The script automatically: stops old processes → downloads the latest prebuilt zip → overwrites the global install and global agents → `npm install --omit=dev` (no build needed for prebuilt packages).

Common parameters:

| Parameter | Description |
|---|---|
| `--release` | Downloads the latest stable prebuilt package from GitHub Releases and updates (default for upgrades) |
| `--force-update` | Force-overwrites the installed delivery-mcp-server (without version comparison) |
| `--dashboard` | Starts the browser dashboard in the background after upgrading (log `.delivery/dashboard.log`) |
| `--dry-run` | Only prints the operations that would run, changes nothing |
| `--skip-build` | Skips the build (only meaningful for source installs; prebuilt packages have no build step) |

You can also check version status with `update.check` first (optional `force` to force re-check) before upgrading.

---

## Customizing Flows & Gates

All flows and gate rules are JSON config; **user config takes priority over built-in** (project `.delivery/config/*` > global install defaults `~/.config/ai-delivery/delivery-mcp-server/config/*` > built-in fallback):

- **Modify flows**: edit `.delivery/config/flows/<type>-flow.json` or the global `~/.config/ai-delivery/delivery-mcp-server/config/flows/` — add/remove stages, adjust roles, set `allow_skip`, specify upstream dependencies.
- **Modify gates**: edit `.delivery/config/gates/<artifact_type>.json`; rules support four check types:
  - `required_sections`: required sections (missing one deducts 15 points)
  - `non_empty_sections`: content must not be empty
  - `forbidden_patterns`: forbidden wording (e.g. vague phrases like "controlled by permissions")
  - `min_list_items`: minimum list items (e.g. acceptance criteria ≥3)

Gate results: `missing > 0` → failed; `issues > 0` → failed; `score < 60` → warning; otherwise passed.

---

## Testing & Validation

```bash
cd delivery-mcp-server
npm test          # 156 tests (26 test files, incl. E2E acceptance)
npm run typecheck # TypeScript type check
npm run build     # Build
```

E2E acceptance covers the five scenarios in PRD chapter 16: full CRUD loop, missing-upstream blocking, gate failure, stage advance, delivery package export, plus rework flow and question blocking.

---

## FAQ

**Q: Where is the task data stored?**
A: `.delivery/tasks/` under the project — plain-text files, trackable and versionable.

**Q: What if the gate doesn't pass?**
A: Revise the artifact with `artifact.update` (history is preserved), re-run `gate.check`, and once it passes run `stage.complete`.

**Q: Can multiple roles work on one stage in parallel?**
A: Stages support multiple artifacts via `required_artifact_types`; parallel roles can submit and gate independently; the stage completes when all are up to standard.

**Q: Want to change the storage location?**
A: Set the env var `DELIVERY_ROOT` to the target directory.

**Q: Tools not found in OpenCode?**
A: Make sure the global `~/.config/ai-delivery/delivery-mcp-server/dist/server.js` is built and the `command` in `opencode.json` uses an **absolute path**, then restart OpenCode.
