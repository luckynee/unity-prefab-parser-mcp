import type { FileIdMap, MetaFileCache, ParseConfig } from './config.js';
/**
 * Resolve all references in component data
 */
export declare function resolveReferences(data: Record<string, unknown>, componentType: string, fileIdMap: FileIdMap, assetCache: MetaFileCache, config: ParseConfig, depth?: number): Record<string, unknown>;
/**
 * Resolve a single value, handling references and nested objects
 */
export declare function resolveValue(value: unknown, fileIdMap: FileIdMap, assetCache: MetaFileCache, config: ParseConfig, depth?: number, fieldName?: string): unknown;
/**
 * Resolve a Unity reference
 */
export declare function resolveReference(ref: Record<string, unknown>, fileIdMap: FileIdMap, assetCache: MetaFileCache, config: ParseConfig): string | null;
/**
 * Simplify a Unity event to show method names instead of verbose structure
 * Returns: string[] of "TargetType.MethodName" or count if too many
 */
export declare function simplifyUnityEvent(value: unknown): unknown;
/**
 * Extract script name from m_Script field
 */
export declare function extractScriptName(scriptRef: Record<string, unknown>, assetCache: MetaFileCache, config: ParseConfig): string;
//# sourceMappingURL=resolver.d.ts.map