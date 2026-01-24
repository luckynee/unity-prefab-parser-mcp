# Unity Prefab Parser MCP Server

An MCP (Model Context Protocol) server that intelligently parses Unity `.prefab` and `.unity` files and outputs only Inspector-visible data in a clean, hierarchical YAML format, reducing token usage by 70-90%.

## Important: Usage with AI Tools

> **Warning**: Do NOT use `@filename.prefab` syntax to reference Unity files in OpenCode, Cursor, or similar AI tools. This reads the raw file content and costs many tokens (10,000-50,000+ tokens for complex prefabs).
>
> Instead, **paste the full file path manually** and let the AI use this MCP parser tool, which provides a token-efficient parsed output (70-90% savings).
>
> **Example prompt:**
> ```
> Parse this prefab: /path/to/Project/Assets/Prefabs/MyPrefab.prefab
> ```
>
> The AI will automatically use the `unity-parser_read_unity_file` MCP tool.

## Features

- **Token Efficient**: Outputs clean YAML with only Inspector-visible properties (70-90% reduction)
- **Tree Hierarchy**: Visual tree format with Unicode connectors in compact mode
- **Prefab Variant Support**: Detects variants and shows only modifications with markers (`# $`, `# +`, `# -`)
- **GUID Resolution**: Automatically resolves asset GUIDs to human-readable names
- **Internal Reference Resolution**: Resolves fileID references to readable `@GameObjectName` format
- **Field Abbreviations**: Shortens field names in compact mode (`localPosition` → `lPos`)
- **Smart Filtering**: Excludes Unity internal fields, default values, and disabled components
- **Layer Name Mapping**: Shows layer names instead of numbers (`l: UI` instead of `layer: 5`)
- **Configurable**: Multiple presets (minimal, standard, compact) and custom options

## Installation

```bash
npm install
npm run build
```

## MCP Client Setup

### OpenCode

Add to your `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "unity-parser": {
      "type": "local",
      "command": ["node", "/path/to/unity-prefab-parser/dist/index.js"],
      "enabled": true
    }
  }
}
```

### VS Code (with MCP extension)

Add to your VS Code settings or MCP config:

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

### Google Gemini / AI Studio

For Gemini API with MCP support, configure the server:

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

### Claude Desktop

Add to your `claude_desktop_config.json`:

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

## Tool: unity-parser_read_unity_file

Parse a Unity prefab or scene file and extract Inspector-visible component data.

**Input:**
```json
{
  "filePath": "/path/to/your/prefab.prefab",
  "config": {
    "preset": "compact"
  }
}
```

## Presets

### Minimal
Absolute minimum data for quick overview:
- 5 max array elements
- Excludes Transform component
- No asset type comments
- No default values or null references

### Standard
Balanced output with full details:
- 20 max array elements
- Full asset name resolution
- Reference resolution enabled
- Standard YAML list format for hierarchy

### Compact (Recommended)
Optimized for LLMs with maximum token savings:
- Tree hierarchy with Unicode connectors
- Field name abbreviations (`localPosition` → `lPos`)
- Inline metadata for non-default values
- Boolean conversion (`1` → `true`)
- LayerMask bitmasks to layer arrays
- Omits default transforms, enabled states, offsets
- Short reference syntax (`@GameObjectName`)
- **40-50% additional savings** vs standard mode

## Example Output

### Regular Prefab (Compact Mode)

**Before (Raw Unity YAML - ~25,000 tokens):**
```yaml
--- !u!114 &5264680121762722832
MonoBehaviour:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 5765943547154460588}
  m_Enabled: 1
  ...
```

**After (Compact Mode - ~2,000 tokens):**
```yaml
prefab_name: BatPF

hierarchy: |
  BatPF (t: Player, l: Layer28)
  ├── Data
  ├── AI State
  └── View
      ├── Geometry
      └── Shadow (a: false)

components:
  BatPF:
    CircleCollider2D: {trigger: true, radius: 0.75}
    Rigidbody2D: {mass: 3}
    Character:
      CharacterType: 1
      UseDefaultMecanim: true
  View:
    SpriteRenderer:
      sprite: @bat_sprite_0
      sOrder: 5
```

**Token savings: ~92% reduction** (25K → 2K tokens)

### Prefab Variant (Compact Mode)

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

**Variant Markers:**
| Marker | Meaning |
|--------|---------|
| `# $` | Modified (property changed from base) |
| `# +` | Added (new GameObject or component) |
| `# -` | Removed (component removed from base) |

## Tree Hierarchy Format

In compact mode, the hierarchy uses a visual tree format:

```yaml
hierarchy: |
  RootObject (t: Player, l: UI)
  ├── Child1
  ├── Child2 (a: false)
  │   ├── GrandChild1
  │   └── GrandChild2
  └── Child3
```

**Inline Metadata** (only shown when non-default):
- `t: TagName` - GameObject tag (omitted if "Untagged")
- `l: LayerName` - Layer name (omitted if "Default")
- `a: false` - Active state (omitted if true)

**Unity Layer Names:**
| Layer | Name |
|-------|------|
| 0 | Default |
| 1 | TransparentFX |
| 2 | Ignore Raycast |
| 4 | Water |
| 5 | UI |
| 8+ | Layer{N} |

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `preset` | `"minimal"` \| `"standard"` \| `"compact"` | - | Use a preset configuration |
| `resolveAssetNames` | boolean | true | Resolve GUIDs to asset names |
| `showAssetTypes` | boolean | true | Show asset type as comment |
| `arrayMaxElements` | number | 20 | Maximum array elements before summarizing |
| `nestedObjectDepth` | number | 4 | Maximum depth for nested objects |
| `includeTransform` | boolean | true | Include Transform components |
| `includeDisabledObjects` | boolean | true | Include disabled GameObjects |
| `includeDefaultValues` | boolean | false | Include properties with default values |
| `includeNullReferences` | boolean | false | Include null/empty references |
| `includeHierarchy` | boolean | true | Include hierarchy section |
| `componentWhitelist` | string[] | [] | Only include these component types |
| `componentBlacklist` | string[] | [] | Exclude these component types |
| `useBooleans` | boolean | false | Convert 0/1 to true/false |
| `convertBitmasks` | boolean | false | Convert LayerMask to layer arrays |
| `useTreeHierarchy` | boolean | false | Use tree format for hierarchy |
| `abbreviateFieldNames` | boolean | false | Shorten field names (lPos, lRot, etc.) |
| `omitDefaultTransforms` | boolean | false | Omit default position/rotation/scale |
| `useShortRefs` | boolean | false | Use `@Name` instead of `<Type:Name>` |
| `useParenVectors` | boolean | false | Use `(x, y, z)` instead of `{x, y, z}` |
| `inlineSimpleComponents` | boolean | false | Inline components with 1-2 fields |
| `showVariantMarkers` | boolean | true | Show `# $`, `# +`, `# -` markers |

## Compact Mode Optimizations

| Optimization | Before | After |
|--------------|--------|-------|
| Tree hierarchy | YAML list | Visual tree with `├──` `└──` |
| Field abbreviations | `localPosition` | `lPos` |
| Vector notation | `{x: 1, y: 2, z: 3}` | `(1, 2, 3)` |
| Color notation | `{r: 1, g: 0, b: 0, a: 1}` | `rgba(1, 0, 0, 1)` |
| Boolean conversion | `enabled: 1` | `enabled: true` |
| Bitmask to layers | `{m_Bits: 67108864}` | `[26]` |
| Reference syntax | `<GameObject:Player>` | `@Player` |
| Default transforms | `lPos: (0, 0, 0)` | *(omitted)* |
| Enabled true | `enabled: true` | *(omitted)* |
| Empty events | `{m_PersistentCalls: ...}` | `[]` |
| Simple components | Multi-line | `{field: value}` |

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
│   ├── cache.ts        # Meta file cache
│   └── variant.ts      # Prefab variant detection
├── test/
│   └── parser.test.ts  # Test suite (96 tests)
├── package.json
└── tsconfig.json
```

## How It Works

1. **Parse Unity YAML**: Handles Unity's custom YAML format with `!u!` tags
2. **Detect Prefab Type**: Identifies regular prefabs vs variants
3. **Build FileID Map**: Creates lookup tables for GameObjects, Transforms, and Components
4. **Auto-detect Project Root**: Finds Unity project root by looking for `Assets/` folder
5. **Build GUID Cache**: Scans `.meta` files to create GUID → asset name mapping
6. **Reconstruct Hierarchy**: Builds GameObject tree from Transform relationships
7. **Filter & Rename Fields**: Applies component-specific filters and abbreviations
8. **Resolve References**: Converts fileIDs and GUIDs to readable names
9. **Extract Variant Modifications**: For variants, extract only changed properties
10. **Format Output**: Generates clean YAML with tree hierarchy and markers

## Supported Components

Built-in field filters for:
- Transform, RectTransform
- Rigidbody, Rigidbody2D
- All Collider types (Box, Sphere, Capsule, Circle, Polygon, etc.)
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

# Watch mode
npm run dev
```

## License

MIT
