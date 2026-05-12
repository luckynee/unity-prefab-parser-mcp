# Unity Prefab Parser MCP — Agent Instructions

This MCP server parses Unity text-serialized assets (.prefab, .unity, .asset) into clean, Inspector-visible YAML.

## Recommended Workflow

**First time on a Unity project:**
1. `init_unity_project` — scan .meta files, build GUID cache (run once)
2. `browse_unity_project` — navigate folder tree to find assets
3. `list_unity_assets` — list assets in target folder (supports search/filter)
4. `parse_unity_file` — parse with `preset: "compact"` for token efficiency

**Subsequent calls:** skip init if `.unity-mcp-cache.json` exists and is < 24h old.

## Tool Reference

### init_unity_project
- Input: `projectPath` (string, required), `force` (boolean, optional)
- Run once per project. Saves cache to `<projectPath>/.unity-mcp-cache.json`

### browse_unity_project
- Input: `projectPath` (string), `subPath` (string, optional), `depth` (number, default 2)
- Returns folder tree with asset counts

### list_unity_assets
- Input: `directory` (string), `type` ("prefab"|"unity"|"asset"|"all"), `recursive` (boolean), `search` (string), `limit` (number)
- Returns grouped asset list with absolute paths

### parse_unity_file
- Input: `filePath` (string), `config` (object with `preset`: "compact"|"standard"|"minimal")
- Returns clean YAML with component data

### parse_unity_prefab (deprecated)
- Alias for parse_unity_file

## Preset Guide
- `compact` — 92% token reduction, best for analysis
- `standard` — balanced, shows asset type comments
- `minimal` — structural overview only

## Available Skills

Load the appropriate skill when the task matches:

| Skill | When to use |
|---|---|
| `unity-asset-workflow` | General workflow: init, browse, list, parse |
| `unity-diff-workflow` | Comparing prefabs, variants, or scenes across versions |
| `unity-scene-workflow` | Navigating large `.unity` scenes token-efficiently |

Skills are in `skills/<skill-name>/SKILL.md` in this repo.
