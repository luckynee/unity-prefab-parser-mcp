# Unity Prefab Parser MCP Server

An MCP (Model Context Protocol) server that parses Unity **text-serialized** `.prefab`, `.unity`, and `.asset` files and outputs only Inspector-visible data in a clean, hierarchical YAML format — reducing token usage by up to 92%.

Works with **any MCP-compatible AI client**: Claude Desktop, OpenCode, VS Code Copilot, Cursor, Windsurf, Codex, and more.

---

## Quick Start

```bash
git clone https://github.com/luckynee/unity-prefab-parser-mcp.git
cd unity-prefab-parser-mcp
npm install && npm run build
```

Then add to your AI client config (see [Client Setup](#client-setup) below).

---

## Recommended Workflow

### First time on a project
```
1. init_unity_project   — scan .meta files, build GUID cache (once per project)
2. browse_unity_project — navigate folder tree to find the right subfolder
3. list_unity_assets    — list assets in that folder (filter by type or name)
4. parse_unity_file     — parse with preset: "compact" for token-efficient output
```

### Subsequent sessions
Skip `init_unity_project` if `.unity-mcp-cache.json` exists and is less than 24h old. Go straight to `browse_unity_project` or `list_unity_assets`.

### Example prompt
```
Initialize my Unity project at /path/to/MyGame, then show me all enemy prefabs.
```
The AI will call `init_unity_project` → `browse_unity_project` → `list_unity_assets` → `parse_unity_file` automatically.

---

## Tools

### `init_unity_project`
Scans all `.meta` files in a Unity project and saves a GUID→asset name cache to `.unity-mcp-cache.json`. Run once per project. Subsequent parse calls load from cache automatically — zero rescan cost.

```json
{
  "projectPath": "/path/to/MyUnityProject",
  "force": false
}
```

- `projectPath` — path to the Unity project root (the folder containing `Assets/`, `ProjectSettings/`)
- `force` — force rescan even if cache is fresh (default: `false`)

Returns: asset count, time taken, cache file location.

---

### `browse_unity_project`
Navigate the Unity project folder tree with asset counts per folder. Use this to find the subfolder you want before calling `list_unity_assets`.

```json
{
  "projectPath": "/path/to/MyUnityProject",
  "subPath": "Assets/Enemies",
  "depth": 2
}
```

Example output:
```
Assets/
├── Enemies/          (12 prefabs)
├── UI/               (8 prefabs, 3 assets)
│   ├── HUD/          (4 prefabs)
│   └── Menus/        (4 prefabs)
├── Levels/           (5 scenes)
└── ScriptableObjects/ (23 assets)
```

---

### `list_unity_assets`
List `.prefab`, `.unity`, and `.asset` files in a directory with absolute paths ready to paste into `parse_unity_file`.

```json
{
  "directory": "/path/to/MyUnityProject/Assets/Enemies",
  "type": "prefab",
  "search": "bat",
  "recursive": true,
  "limit": 50
}
```

- `type` — `"prefab"`, `"unity"`, `"asset"`, or `"all"` (default: `"all"`)
- `search` — case-insensitive name filter (e.g. `"enemy"` returns `EnemyBat.prefab`, `EnemyWolf.prefab`)
- `recursive` — search subfolders (default: `true`)
- `limit` — max results (default: `50`)

---

### `parse_unity_file`
Parse a Unity text-serialized file and extract Inspector-visible component data as clean YAML.

```json
{
  "filePath": "/path/to/MyUnityProject/Assets/Enemies/BatPF.prefab",
  "config": {
    "preset": "compact"
  }
}
```

**Presets:**

| Preset | Token reduction | Best for |
|--------|----------------|----------|
| `compact` | ~92% | LLM analysis, comparisons |
| `standard` | ~84% | When you need GUID comments |
| `minimal` | ~95% | Quick structural overview |

You can mix preset with overrides:
```json
{ "preset": "compact", "includeDefaultValues": true }
```

---

### `parse_unity_prefab` *(deprecated)*
Alias for `parse_unity_file`. Still works for backward compatibility.

---

## Client Setup

All clients use the same MCP server binary. Replace `/path/to/unity-prefab-parser-mcp` with your actual clone path.

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "unity-prefab-parser": {
      "command": "node",
      "args": ["/path/to/unity-prefab-parser-mcp/dist/index.js"]
    }
  }
}
```

### OpenCode

Add to your `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "unity-parser": {
      "type": "local",
      "command": ["node", "/path/to/unity-prefab-parser-mcp/dist/index.js"],
      "enabled": true
    }
  }
}
```

**OpenCode users:** register the bundled skill for guided workflow and slash commands:

```json
{
  "skills": {
    "unity-asset-workflow": {
      "path": "/path/to/unity-prefab-parser-mcp/skills/unity-asset-workflow/SKILL.md"
    }
  }
}
```

Slash commands available after registering the skill:
- `/init-unity [path]` — initialize project cache
- `/browse-unity [path]` — browse project tree
- `/list-assets [path] [type] [search]` — list assets
- `/parse-asset [path]` — parse with compact preset

### VS Code (GitHub Copilot / MCP extension)

Add to `.vscode/mcp.json` in your workspace, or to VS Code user settings:

```json
{
  "mcpServers": {
    "unity-prefab-parser": {
      "command": "node",
      "args": ["/path/to/unity-prefab-parser-mcp/dist/index.js"]
    }
  }
}
```

The `.github/copilot-instructions.md` bundled in this repo is auto-read by Copilot when the repo is open — no extra config needed for workflow guidance.

### Cursor / Windsurf

Add to your MCP settings (Settings → MCP → Add Server):

```json
{
  "unity-prefab-parser": {
    "command": "node",
    "args": ["/path/to/unity-prefab-parser-mcp/dist/index.js"]
  }
}
```

### Codex / Claude Code (CLI agents)

The `AGENTS.md` file bundled in this repo is auto-read by Codex and Claude Code when they run in the project directory — no extra config needed. They will follow the init → browse → list → parse workflow automatically.

---

## Unity Serialization Requirement

This server requires Unity's **text serialization** format. If a file is binary, the server will reject it with a clear error.

Enable text serialization: **Edit → Project Settings → Editor → Asset Serialization → Mode = Force Text**

- [Unity Editor Manager docs](https://docs.unity3d.com/Manual/class-EditorManager.html)
- [UnityYAML docs](https://docs.unity3d.com/Manual/UnityYAML.html)

---

## Example Output

### Regular Prefab (compact mode)

```yaml
prefab_name: BatPF

hierarchy: |
  BatPF (t: Player, l: Layer28)
  ├── Geometry
  └── Data

components:
  BatPF:
    Transform:
      lPos: (27.13, -6.38, 0)
    Rigidbody2D:
      mass: 3
      linearDrag: 5
      angularDrag: 6
      gravity: 0
      bodyType: 0
      sleepingMode: 1
    CircleCollider2D: {trigger: true, radius: 0.5}
  Data:
    EntityData:
      _entityName: Bat
      _walkSpeed: 1.5
      _attack: 10
      _defense: 2
      _isAlive: true
```

### Prefab Variant (compact mode)

Variants show only modifications from the base prefab:

```yaml
prefab_name: Interactable Animal
variant_of: Base Animal

hierarchy: |
  Base Animal  # $
  ├── View  # $ +
  └── NewChild  # +

components:
  Base Animal:
    Transform:  # $
      lPos: (0, 0.14, 0)  # $
  View:
    SpriteRenderer:  # $
      color: rgba(1, 0, 0, 1)  # $
    BoxCollider2D:  # +
      trigger: true
      size: (1, 1)
    # CircleCollider2D  # -
```

**Variant markers:**
| Marker | Meaning |
|--------|---------|
| `# $` | Modified from base |
| `# +` | Added (new component or GameObject) |
| `# -` | Removed from base |

---

## Token Cost Reference

| Operation | Approx tokens |
|---|---|
| `init_unity_project` | 0 (disk only) |
| `browse_unity_project` | ~200–500 |
| `list_unity_assets` (50 files) | ~800 |
| `parse_unity_file` compact | ~150–500 |
| `parse_unity_file` standard | ~300–1,000 |
| Raw Unity YAML (same file) | ~5,000–50,000 |

---

## Configuration Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `preset` | `"minimal"` \| `"standard"` \| `"compact"` | — | Use a preset |
| `resolveAssetNames` | boolean | `true` | Resolve GUIDs to asset names |
| `showAssetTypes` | boolean | `true` | Show asset type as comment |
| `arrayMaxElements` | number | `20` | Max array elements before summarizing |
| `nestedObjectDepth` | number | `4` | Max depth for nested objects |
| `includeTransform` | boolean | `true` | Include Transform components |
| `includeDisabledObjects` | boolean | `true` | Include disabled GameObjects |
| `includeDefaultValues` | boolean | `false` | Include properties with default values |
| `includeNullReferences` | boolean | `false` | Include null/empty references |
| `includeHierarchy` | boolean | `true` | Include hierarchy section |
| `componentWhitelist` | string[] | `[]` | Only include these component types |
| `componentBlacklist` | string[] | `[]` | Exclude these component types |
| `useBooleans` | boolean | `false` | Convert 0/1 to true/false |
| `convertBitmasks` | boolean | `false` | Convert LayerMask to layer arrays |
| `useTreeHierarchy` | boolean | `false` | Use tree format for hierarchy |
| `abbreviateFieldNames` | boolean | `false` | Shorten field names (`lPos`, `lRot`) |
| `omitDefaultTransforms` | boolean | `false` | Omit default position/rotation/scale |
| `useShortRefs` | boolean | `false` | Use `@Name` instead of `<Type:Name>` |
| `useParenVectors` | boolean | `false` | Use `(x, y, z)` instead of `{x, y, z}` |
| `inlineSimpleComponents` | boolean | `false` | Inline components with 1–2 fields |
| `showVariantMarkers` | boolean | `true` | Show `# $`, `# +`, `# -` markers |

---

## Supported Components

Built-in field filters for:
- Transform, RectTransform
- Rigidbody, Rigidbody2D
- All Collider types (Box, Sphere, Capsule, Circle, Polygon, Mesh)
- SpriteRenderer, MeshRenderer, SkinnedMeshRenderer, MeshFilter
- Animator, Animation
- AudioSource, Camera, Light
- Canvas, CanvasScaler, GraphicRaycaster
- UI: Image, Text, TextMeshProUGUI, Button
- ParticleSystem, ParticleSystemRenderer, TrailRenderer, LineRenderer
- MonoBehaviour (custom scripts — all serialized fields shown)

---

## Project Structure

```
unity-prefab-parser-mcp/
├── src/
│   ├── index.ts        # MCP server, all tool definitions
│   ├── parser.ts       # Unity YAML parsing
│   ├── resolver.ts     # Reference and value resolution
│   ├── components.ts   # Component field filters and renames
│   ├── hierarchy.ts    # GameObject tree builder
│   ├── formatter.ts    # YAML output formatter
│   ├── config.ts       # Configuration and presets
│   ├── cache.ts        # Meta file GUID cache
│   └── variant.ts      # Prefab variant detection
├── skills/
│   └── unity-asset-workflow/
│       └── SKILL.md    # OpenCode skill (workflow + slash commands)
├── test/
│   └── parser.test.ts  # Test suite (103 tests)
├── AGENTS.md           # Auto-read by Codex and Claude Code
├── .github/
│   └── copilot-instructions.md  # Auto-read by GitHub Copilot
├── package.json
└── tsconfig.json
```

---

## Development

```bash
npm install       # install dependencies
npm run build     # compile TypeScript
npm test          # run test suite (103 tests)
npm run dev       # run with tsx (no build needed)
```

---

## License

MIT
