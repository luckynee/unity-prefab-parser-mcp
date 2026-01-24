export interface ComponentFilter {
    include?: string[] | 'all_except_internals';
    exclude?: string[];
    rename?: Record<string, string>;
    scriptField?: string;
}
export declare const ALWAYS_EXCLUDE: string[];
export declare const COMPACT_MODE_EXCLUDE: string[];
export declare const FIELD_ABBREVIATIONS: Record<string, string>;
export declare const DEFAULT_RENDERING_VALUES: Record<string, unknown>;
/**
 * Check if a field is a default offset vector {x: 0, y: 0}
 */
export declare function isDefaultOffset(key: string, value: unknown): boolean;
/**
 * Check if a field name represents a boolean field
 */
export declare function isBooleanField(fieldName: string): boolean;
/**
 * Check if a field has a default rendering value that can be filtered
 */
export declare function isDefaultRenderingValue(fieldName: string, value: unknown): boolean;
/**
 * Check if a Transform value is a default value that can be omitted
 * - lPos/localPosition: (0, 0, 0)
 * - lRot/localRotation: (0, 0, 0, 1) - identity quaternion
 * - lScale/localScale: (1, 1, 1)
 */
export declare function isDefaultTransformValue(fieldName: string, value: unknown): boolean;
export declare const INSPECTOR_FIELDS: Record<string, ComponentFilter>;
/**
 * Get the appropriate filter for a component type
 */
export declare function getComponentFilter(componentType: string): ComponentFilter;
/**
 * Check if a field should be excluded
 */
export declare function shouldExcludeField(fieldName: string, componentType: string): boolean;
/**
 * Rename a field if a mapping exists
 */
export declare function renameField(fieldName: string, componentType: string, abbreviate?: boolean): string;
//# sourceMappingURL=components.d.ts.map