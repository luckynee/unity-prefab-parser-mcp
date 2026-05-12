# Skill: unity-scene-workflow

Use this skill when working with Unity `.unity` scene files. Scenes are much larger than prefabs — a typical scene can have hundreds of GameObjects and cost 50,000+ raw tokens. This skill keeps token usage manageable.

## When to use this skill
- "What GameObjects are in this scene?"
- "Find the camera setup in MainMenu.unity"
- "What components does the Player have in GameScene.unity?"
- "Show me all UI canvases in the scene"

## Core principle: navigate first, parse scoped

Never parse a large scene with default settings — always scope first.

## Workflow

### Step 1 — Get the hierarchy only
Parse with `minimal` preset and `includeHierarchy: true`, components off:
```json
{
  "filePath": "/path/to/Scene.unity",
  "config": {
    "preset": "minimal",
    "componentBlacklist": ["Transform", "MonoBehaviour", "MeshRenderer", "MeshFilter", "Collider", "Rigidbody"]
  }
}
```
This gives you the GameObject tree cheaply (~500–2,000 tokens) so you can identify what you want.

### Step 2 — Parse specific GameObjects by component type
Once you know what you're looking for, use `componentWhitelist` to scope:
```json
{
  "filePath": "/path/to/Scene.unity",
  "config": {
    "preset": "compact",
    "componentWhitelist": ["Camera", "Light"],
    "includeHierarchy": false
  }
}
```

### Step 3 — Drill into specific components
For deep inspection of one component type across all GameObjects:
```json
{
  "filePath": "/path/to/Scene.unity",
  "config": {
    "preset": "compact",
    "componentWhitelist": ["Canvas", "CanvasScaler"],
    "includeHierarchy": false
  }
}
```

## Token budget by approach

| Approach | Approx tokens | Use when |
|---|---|---|
| Raw scene file | 50,000–500,000 | Never |
| `minimal` preset, full scene | 2,000–10,000 | Getting hierarchy overview |
| `compact` preset, full scene | 5,000–30,000 | Small scenes only (<50 GameObjects) |
| `compact` + `componentWhitelist` | 500–3,000 | Targeted inspection |
| `compact` + `includeHierarchy: false` | 300–2,000 | Component-only analysis |

## Common component whitelists

```json
// Lighting setup
{ "componentWhitelist": ["Light", "ReflectionProbe", "LightProbe"] }

// Camera setup
{ "componentWhitelist": ["Camera", "Cinemachine"] }

// UI structure
{ "componentWhitelist": ["Canvas", "CanvasScaler", "GraphicRaycaster"] }

// Physics overview
{ "componentWhitelist": ["Rigidbody", "Rigidbody2D", "BoxCollider2D", "CircleCollider2D"] }

// Audio
{ "componentWhitelist": ["AudioSource", "AudioListener"] }
```

## Finding a specific GameObject

If you know the name, parse with `minimal` first to get the hierarchy, identify the path, then parse scoped:
```json
{
  "preset": "compact",
  "componentWhitelist": ["YourTargetComponent"],
  "includeHierarchy": false
}
```

## Large scene strategy (100+ GameObjects)

1. Parse hierarchy only (`minimal` + no components) — identify the top-level structure
2. Pick the subtree you care about — note the parent GameObject name
3. Parse scoped by component type — use `componentWhitelist`
4. If still too large — add `includeHierarchy: false` and `arrayMaxElements: 5`

## Slash Commands (OpenCode)
- `/scene-overview [path]` — get hierarchy-only view of a scene
- `/scene-components [path] [componentType]` — find all instances of a component in a scene
- `/scene-cameras [path]` — show all camera setups
- `/scene-ui [path]` — show all canvas/UI structure
