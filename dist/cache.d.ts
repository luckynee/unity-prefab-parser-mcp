import type { MetaFileCache, MetaFileCacheEntry } from './config.js';
/**
 * Find the Unity project root from a file path
 * Looks for the Assets folder and returns its parent directory
 */
export declare function findProjectRoot(filePath: string): string | null;
/**
 * Find project root (async version)
 */
export declare function findProjectRootAsync(filePath: string): Promise<string | null>;
/**
 * Build the GUID to asset name cache from all .meta files in the project
 */
export declare function buildAssetCache(projectRoot: string, useCache?: boolean): Promise<MetaFileCache>;
/**
 * Clear the cached asset data
 */
export declare function clearCache(): void;
/**
 * Resolve a GUID to asset information
 */
export declare function resolveGuid(guid: string, cache: MetaFileCache): MetaFileCacheEntry | null;
/**
 * Format an asset reference for output
 */
export declare function formatAssetReference(guid: string, cache: MetaFileCache, showType?: boolean): string;
//# sourceMappingURL=cache.d.ts.map