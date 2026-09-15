<!-- bmad:context -->
<!-- Verified 2026-09-15 against 5d80f78. Managed by bmad-project-context; edits inside this block are replaced on refresh. Keep anything you want preserved outside the markers. -->

## customerportal-product-owner

Tool for product owners to run semi-automated EquipmentCloud customer-portal workflows via its REST API — currently done manually. First area: managing SoftwareCenter software versions/sets and assigning them to customer equipment hierarchies. Later: clustering OpenIssues (issues + discussions) into backlog items/roadmap themes. Stack: Node.js backend, local DB (SQLite or better, TBD), web frontend framework TBD — see TODOs below.

## Policy

- Never hardcode or commit EquipmentCloud credentials; store them in OS-level secret storage (e.g. Windows Credential Manager), never in code, config files, or git.
- Always show the exact request (method, path, payload) before any mutating EquipmentCloud call (POST/PUT/DELETE) and wait for explicit user confirmation — no autonomous writes against the production API.
- Only BasicAuth-secured EquipmentCloud endpoints are in scope; ignore the Bearer/OAuth2-secured `_oa` endpoint variants (`equipmenthub_oa`, `openissues_oa`) entirely.
- Solo project: commit directly to `main`, no branch/PR requirement.
- Follow general security best practices (OWASP-style); no stricter compliance standard mandated.
- Produce an SBOM for releases (tool/command TODO once `package.json` exists).

## Where things are

- Full EquipmentCloud REST API spec: `openapi_equipmentcloud_preview.yaml` (~56k lines) — never load it whole; `grep` for the path prefix below, or read targeted line ranges.
- API base: `https://eqcloud.kontron-ais.com/{container}` (production; `{container}` is the tenant/mandant prefix, no separate sandbox in the spec).
- Module map (verified against the spec's `tags:` and each path's `security:` block):
  - Checklists → `/cloudconnect/api/checklists/v1`
  - DeviceManagement → `/cloudconnect/api/devices/v1`
  - EquipmentHub → `/cloudconnect/api/equipmenthub/v1`
  - Maintenance → `/cloudconnect/api/maintenance/v1`
  - Monitoring → `/cloudconnect/api/monitoring/v2`
  - OpenIssues → `/cloudconnect/api/openissues/v1`
  - Portal (login/token) → `/cloudconnect/api/portal/v1` (`/auth/account`, `/auth/idprovider`, `/auth/token`)
  - SoftwareCenter → `/cloudconnect/api/softwarecenter/v1` (catalog/releases/sets) and `/cloudconnect/api/software/v1` (installed software per equipment) — first feature area
  - SpareParts / SparePartsPro → `/cloudconnect/api/spareparts/v1`, `/cloudconnect/api/sparepartspro/v1`
  - UserManagement → `/cloudconnect/api/usermanagement/v1`
  - eDocs → `/cloudconnect/api/edocs/v1`

## Running and verifying

- TODO: backend runtime/package manager, local DB, and frontend framework are not chosen yet — record the real install/run/test/build commands here once they are.

## Conventions that differ from defaults

- Code, identifiers, comments, and commit messages: English. GUI-facing text: German.

<!-- /bmad:context -->
