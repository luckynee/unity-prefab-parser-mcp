import type { ParsedDocument } from './parser.js';
import type { FileIdMap, HierarchyNode } from './config.js';
/**
 * Build a map of fileIDs to their corresponding objects
 */
export declare function buildFileIdMap(documents: ParsedDocument[]): FileIdMap;
/**
 * Find the root transforms (transforms with no parent or parent with fileID 0)
 */
export declare function findRootTransforms(map: FileIdMap): string[];
/**
 * Build the hierarchy tree starting from root transforms
 */
export declare function buildHierarchy(map: FileIdMap, includeDisabledObjects?: boolean): HierarchyNode[];
/**
 * Get all GameObjects in the hierarchy as a flat map
 */
export declare function getGameObjectMap(map: FileIdMap): Map<string, string>;
/**
 * Get the component type and owning GameObject name for a component fileID
 */
export declare function getComponentInfo(componentFileId: string, map: FileIdMap): {
    type: string;
    gameObjectName: string;
} | null;
/**
 * Get all components grouped by GameObject name
 */
export declare function getComponentsByGameObject(map: FileIdMap): Map<string, Array<{
    type: string;
    fileId: string;
    data: Record<string, unknown>;
}>>;
//# sourceMappingURL=hierarchy.d.ts.map