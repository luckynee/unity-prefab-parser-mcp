---
description: Initialize Unity project GUID cache (run once per project)
agent: orchestrator
---

Load the `unity-asset-workflow` skill, then call `init_unity_project` with projectPath: "$ARGUMENTS".

Scan all .meta files, build the GUID→asset name cache, and save it to .unity-mcp-cache.json in the project root. Report asset count and time taken.
