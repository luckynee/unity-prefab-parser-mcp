---
name: unity-diff-workflow
description: Use when comparing Unity .prefab, .unity, or .asset files across versions, variants, or branches.
---

# Skill: unity-diff-workflow

Use this skill when comparing Unity `.prefab`, `.unity`, or `.asset` files — across versions, variants, or branches.

## When to use this skill
- "What changed in this prefab?"
- "How does EnemyBat differ from EnemyWolf?"
- "What did this PR change in the scene?"
- "Show me what the variant overrides from the base prefab"

## Workflow

### Comparing two separate prefabs
1. `parse_unity_file` on file A with `preset: "compact"`
2. `parse_unity_file` on file B with `preset: "compact"`
3. Diff the two YAML outputs — focus on components, field values, hierarchy shape

### Comparing a prefab variant to its base
Variants already show only their differences — no manual diff needed:
1. `parse_unity_file` on the variant with `preset: "compact"`
2. The output includes `variant_of: BasePrefabName` and modification markers:
   - `# $` — field modified from base
   - `# +` — component or GameObject added
   - `# -` — component removed from base

### Comparing across git branches/versions
1. Parse the current version: `parse_unity_file` on the current file
2. Parse the old version: `git show <commit>:<path>` to a temp file, then `parse_unity_file` on it
3. Diff the two compact YAML outputs

## Diff reading guide

Focus on these sections when diffing:
- `hierarchy` — shape changes (added/removed GameObjects, reparenting)
- `components` — added/removed component types per GameObject
- Field values within components — value changes

Ignore noise:
- `lPos: (0, 0, 0)`, `lScale: (1, 1, 1)` — default transforms, omitted in compact
- `enabled: true` — omitted in compact
- Internal Unity fields (`m_ObjectHideFlags`, etc.) — always filtered

## Token strategy for large diffs

For large prefabs or scenes, scope the diff:
- Use `componentWhitelist` to compare only specific components:
  ```json
  { "preset": "compact", "componentWhitelist": ["Rigidbody2D", "CircleCollider2D"] }
  ```
- Use `includeHierarchy: false` to skip hierarchy and focus on component data:
  ```json
  { "preset": "compact", "includeHierarchy": false }
  ```

## Example output (variant diff)

```yaml
prefab_name: BatElite
variant_of: BatPF

hierarchy: |
  BatPF  # $
  └── Data  # $

components:
  BatPF:
    Rigidbody2D:  # $
      mass: 6  # $        (was 3 in base)
    CircleCollider2D:  # $
      radius: 0.8  # $    (was 0.5 in base)
  Data:
    EntityData:  # $
      _attack: 20  # $    (was 10 in base)
      _defense: 5  # $    (was 2 in base)
```

## Slash Commands (OpenCode)
- `/diff-prefabs [pathA] [pathB]` — parse both and compare
- `/diff-variant [variantPath]` — parse variant to see base overrides
