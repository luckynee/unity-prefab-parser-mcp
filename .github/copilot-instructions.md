# GitHub Copilot Instructions — Unity Prefab Parser MCP

When working with Unity assets using this MCP:

1. Always call `init_unity_project` first on a new project
2. Use `browse_unity_project` to navigate, `list_unity_assets` to find files
3. Use `parse_unity_file` with `{ "preset": "compact" }` for token-efficient output
4. For comparisons, parse both files then diff the YAML output

See AGENTS.md for full tool reference.
