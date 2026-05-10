# Changelog

## 1.1.0 - 2026-05-10

### Added
- `parse_unity_file` as the primary MCP tool, with `parse_unity_prefab` kept as a compatibility alias.
- Binary Unity asset detection with a clear `Force Text` guidance message.
- Support for text-serialized `.asset` files in addition to `.prefab` and `.unity`.
- GitHub Actions CI for build and test validation.
- End-to-end MCP stdio integration coverage.

### Changed
- Switched Unity document parsing to the `yaml` library for better correctness and block-scalar support.
- Improved GameObject display-name disambiguation so unique names stay simple and duplicates get stable path-based keys.
- Tightened package publishing metadata and publish contents.

### Fixed
- Dependency vulnerabilities resolved via package updates and `npm audit fix`.
- Repository cleanup to stop tracking generated `dist/` output and `node_modules/`.
