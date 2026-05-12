---
description: List Unity assets in a directory — args: [path] [type?] [search?] [exact:true?]
agent: orchestrator
---

Load the `unity-asset-workflow` skill, then call `list_unity_assets` with the arguments: $ARGUMENTS.

Return a grouped list of .prefab, .unity, and .asset files with absolute paths ready to use with unity-parse.

Tips:
- Add `exact:true` to match only files where the search term appears as a word boundary. E.g. `bat exact:true` returns Bat.prefab, BatPF.prefab but NOT CombatText.prefab or Battery.prefab.
- Without `exact:true`, search is a broad substring match.
