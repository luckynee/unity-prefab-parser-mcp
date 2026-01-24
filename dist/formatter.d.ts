import type { ParseConfig, ParsedPrefab, HierarchyNode } from './config.js';
/**
 * Format the parsed prefab data as clean YAML output
 */
export declare function formatYAML(data: ParsedPrefab, config: ParseConfig): string;
/**
 * Format a component's data for output
 */
export declare function formatComponentData(data: Record<string, unknown>, config: ParseConfig): Record<string, unknown>;
/**
 * Create a simple YAML string without the yaml library for comments support
 */
export declare function formatYAMLWithComments(data: ParsedPrefab, config: ParseConfig): string;
/**
 * Get a human-readable layer name
 */
export declare function getLayerName(layer: number): string;
/**
 * Format hierarchy as a tree structure (Linux-style)
 * Output format:
 *   Root (t: Tag, l: Layer, a: false)
 *   ├── Child1
 *   │   └── GrandChild
 *   └── Child2
 */
export declare function formatHierarchyAsTree(nodes: HierarchyNode[], config: ParseConfig): string;
/**
 * Variant hierarchy node with modification markers
 */
export interface VariantHierarchyNode {
    name: string;
    marker?: 'added' | 'modified' | 'removed';
    children?: VariantHierarchyNode[];
}
/**
 * Format variant hierarchy as a tree with modification markers
 */
export declare function formatVariantHierarchyAsTree(nodes: VariantHierarchyNode[], config: ParseConfig): string;
//# sourceMappingURL=formatter.d.ts.map