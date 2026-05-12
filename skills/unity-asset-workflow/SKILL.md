---
name: unity-asset-workflow
description: Use when working with Unity .prefab, .unity, or .asset files via the unity-prefab-parser MCP. Guides init, browse, list, and parse workflow.
---

# Skill: unity-asset-workflow

Use this skill when working with Unity `.prefab`, `.unity`, or `.asset` files via the unity-prefab-parser MCP.

## Recommended Workflow

### First time on a project
1. Call `init_unity_project` with the project root path — scans .meta files, builds GUID cache, saves to `.unity-mcp-cache.json`
2. Call `browse_unity_project` to navigate the folder tree and find relevant assets
3. Call `list_unity_assets` on the target folder (use `search` to filter by name)
4. Call `parse_unity_file` with `preset: "compact"` for token-efficient output

### Subsequent sessions
- Skip `init_unity_project` if `.unity-mcp-cache.json` is recent (< 24h)
- Go straight to `browse_unity_project` or `list_unity_assets`

## Preset Guide
- `compact` — best for LLMs, ~92% smaller than raw, use for analysis and comparison
- `standard` — balanced, shows GUIDs as comments, use when you need asset references
- `minimal` — lowest detail, use for quick structural overview

## Config Overrides
You can mix preset with overrides:
```json
{ "preset": "compact", "includeDefaultValues": true }
```

## Token Cost Reference
| Operation | Approx tokens |
|---|---|
| init_unity_project | 0 (disk only) |
| browse_unity_project | ~200-500 |
| list_unity_assets (50 files) | ~800 |
| parse_unity_file compact | ~150-500 |
| parse_unity_file standard | ~300-1000 |

## Slash Commands (OpenCode)
- `/init-unity [path]` — initialize project cache
- `/browse-unity [path]` — browse project tree
- `/list-assets [path] [type] [search]` — list assets
- `/parse-asset [path]` — parse with compact preset
