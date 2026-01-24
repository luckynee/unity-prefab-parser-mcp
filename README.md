# Unity Prefab Parser MCP Server

An MCP (Model Context Protocol) server that intelligently parses Unity `.prefab` files and outputs only Inspector-visible data in a clean, hierarchical YAML format, reducing token usage by 70-90%.

## Features

- **Token Efficient**: Outputs clean YAML with only Inspector-visible properties
- **GUID Resolution**: Automatically resolves asset GUIDs to human-readable names by scanning `.meta` files
- **Hierarchy Reconstruction**: Builds the complete GameObject tree from Transform relationships
- **Internal Reference Resolution**: Resolves fileID references to readable `<Type:GameObjectName>` format
- **Field Filtering**: Excludes Unity internal fields (m_ObjectHideFlags, serializedVersion, etc.)
- **Field Renaming**: Converts `m_LocalPosition` to `localPosition` for readability
- **Configurable**: Multiple presets (minimal, standard, full, compact) and custom configuration options
- **Compact Mode**: Optimized for LLMs with 40-50% additional token savings

## Installation

```bash
npm install
npm run build
```

## Usage

### As MCP Server

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "unity-prefab-parser": {
      "command": "node",
      "args": ["/path/to/unity-prefab-parser/dist/index.js"]
    }
  }
}
```

### Tool: parse_unity_prefab

Parse a Unity prefab file and extract Inspector-visible component data.

**Input:**
```json
{
  "filePath": "/path/to/your/prefab.prefab",
  "config": {
    "preset": "compact"
  }
}
```

**Configuration Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `preset` | `"minimal"` \| `"standard"` \| `"full"` \| `"compact"` | - | Use a preset configuration |
| `resolveAssetNames` | boolean | true | Resolve GUIDs to asset names |
| `showAssetTypes` | boolean | true | Show asset type as comment (e.g., `# MonoScript`) |
| `arrayMaxElements` | number | 20 | Maximum array elements before summarizing |
| `includeTransform` | boolean | true | Include Transform components |
| `includeDisabledObjects` | boolean | true | Include disabled GameObjects |
| `includeDefaultValues` | boolean | false | Include properties with default values |
| `includeNullReferences` | boolean | false | Include null/empty references |
| `componentWhitelist` | string[] | [] | Only include these component types |
| `componentBlacklist` | string[] | [] | Exclude these component types |
| `useBooleans` | boolean | false | Convert 0/1 to true/false for boolean fields |
| `convertBitmasks` | boolean | false | Convert LayerMask bitmasks to layer arrays |
| `depthSummaryMode` | boolean | false | Show `[N items]` instead of expanding at max depth |

### Presets

**Minimal** - Absolute minimum data:
- 5 max array elements
- Excludes Transform component
- No asset type comments
- No default values or null references

**Standard** (default) - Balanced:
- 20 max array elements
- Full asset name resolution
- Reference resolution enabled
- No default values

**Full** - Maximum detail:
- 100 max array elements
- Includes default values
- Includes null references
- 10 levels of object nesting

**Compact** (Recommended for LLMs) - Optimized for token efficiency:
- All standard features plus:
- Converts 0/1 to true/false for boolean fields
- Converts LayerMask bitmasks to layer arrays `[26]`
- Filters default rendering properties (dynamicOccludee, lightProbeUsage, etc.)
- Removes redundant script names when they match component name
- Omits empty Unity events and staticBatchInfo
- Shows `[N items]` or `[Name1, Name2, ...]` for deep nested arrays
- No asset type comments
- **40-50% additional token savings** vs standard mode

## Example Output

**Before (Raw Prefab - ~25,000 tokens):**
```yaml
--- !u!114 &5264680121762722832
MonoBehaviour:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 5765943547154460588}
  m_Enabled: 1
  m_EditorHideFlags: 0
  m_Script: {fileID: 11500000, guid: e8722e45f56965a46a5e9e7f22785a7a, type: 3}
  version: 1073741824
  ...
```

**After (Standard Mode - ~4,000 tokens):**
```yaml
prefab_name: BatPF

hierarchy:
  - name: BatPF
    layer: 28
    tag: Player
    children:
      - name: Geometry
      - name: Data

components:
  BatPF:
    Transform:
      localPosition: {x: 27.13, y: -6.38, z: 0}
    Rigidbody2D:
      mass: 3
      gravityScale: 0
    CircleCollider2D:
      radius: 0.5
      isTrigger: 1
    Character:
      script: Character  # MonoScript
      CharacterType: 1
      UseDefaultMecanim: 1
      
  Geometry:
    SpriteRenderer:
      sprite: bat_sprite_0  # Sprite
      sortingOrder: 0
    Animator:
      controller: BatAnimator  # RuntimeAnimatorController
```

**After (Compact Mode - ~2,000-2,500 tokens):**
```yaml
prefab_name: BatPF

hierarchy:
  - name: BatPF
    layer: 28
    tag: Player
    children:
      - name: Geometry
      - name: Data

components:
  BatPF:
    Transform:
      localPosition: {x: 27.13, y: -6.38, z: 0}
    Rigidbody2D:
      mass: 3
    CircleCollider2D:
      radius: 0.5
      isTrigger: true
    Character:
      CharacterType: 1
      UseDefaultMecanim: true
      
  Geometry:
    SpriteRenderer:
      sprite: bat_sprite_0
    Animator:
      controller: BatAnimator
```

**Token savings:**
- Standard mode: ~80% reduction (25K → 4K tokens)
- Compact mode: ~90% reduction (25K → 2-2.5K tokens)

## Project Structure

```
unity-prefab-parser/
├── src/
│   ├── index.ts        # MCP server entry point
│   ├── parser.ts       # Unity YAML parsing
│   ├── resolver.ts     # Reference resolution
│   ├── components.ts   # Component field filters
│   ├── hierarchy.ts    # GameObject tree builder
│   ├── formatter.ts    # YAML output formatter
│   ├── config.ts       # Configuration system
│   └── cache.ts        # Meta file cache
├── test/
│   ├── fixtures/       # Sample prefab files
│   └── parser.test.ts  # Test suite
├── presets/
│   ├── minimal.json
│   ├── standard.json
│   ├── full.json
│   └── compact.json
├── package.json
└── tsconfig.json
```

## How It Works

1. **Parse Unity YAML**: Handles Unity's custom YAML format with `!u!` tags
2. **Build FileID Map**: Creates lookup tables for GameObjects, Transforms, and Components
3. **Auto-detect Project Root**: Finds the Unity project root by looking for `Assets/` folder
4. **Build GUID Cache**: Scans all `.meta` files to create GUID → asset name mapping
5. **Reconstruct Hierarchy**: Builds the GameObject tree from Transform parent/child relationships
6. **Filter & Rename Fields**: Applies component-specific field filters and renames
7. **Resolve References**: Converts fileIDs and GUIDs to readable names
8. **Apply Compact Optimizations**: Boolean conversion, bitmask handling, etc. (if enabled)
9. **Format Output**: Generates clean YAML grouped by GameObject

## Compact Mode Optimizations

When using `preset: 'compact'`, the following optimizations are applied:

| Optimization | Example |
|--------------|---------|
| Boolean conversion | `enabled: 1` → `enabled: true` |
| Bitmask to layers | `{m_Bits: 67108864}` → `[26]` |
| Default rendering props | Removes `dynamicOccludee: 1`, etc. |
| Redundant script names | Removes `script: Character` when component is `Character:` |
| Empty events | Removes `{m_PersistentCalls: {m_Calls: []}}` |
| Empty staticBatchInfo | Removes `{firstSubMesh: 0, subMeshCount: 0}` |
| Depth summaries | Deep arrays show `[7 items]` or `[Idle, Patrol, ...]` |
| No type comments | `sprite: bat_sprite_0` (no `# Sprite`) |

## Supported Components

Built-in field filters for:
- Transform, RectTransform
- Rigidbody, Rigidbody2D
- All Collider types (Box, Sphere, Capsule, Circle, Polygon, Mesh, etc.)
- SpriteRenderer, MeshRenderer, SkinnedMeshRenderer
- Animator, Animation
- AudioSource, Camera, Light
- Canvas, CanvasScaler, GraphicRaycaster
- UI components (Image, Text, Button, etc.)
- ParticleSystem, TrailRenderer, LineRenderer
- MonoBehaviour (custom scripts - all serialized fields)

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run in development mode
npm run dev
```

## License

MIT
