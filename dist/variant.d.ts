import type { ParsedDocument } from './parser.js';
import type { MetaFileCache } from './config.js';
/**
 * Represents a property modification in a prefab variant
 */
export interface PropertyModification {
    targetFileId: string;
    targetGuid: string;
    propertyPath: string;
    value: unknown;
    objectReference: {
        fileID: number;
        guid?: string;
    } | null;
}
/**
 * Represents an added component in a prefab variant
 */
export interface AddedComponent {
    targetFileId: string;
    targetGuid: string;
    componentFileId: string;
}
/**
 * Represents an added GameObject in a prefab variant
 */
export interface AddedGameObject {
    targetFileId: string;
    targetGuid: string;
    gameObjectFileId: string;
}
/**
 * Represents a removed component in a prefab variant
 */
export interface RemovedComponent {
    targetFileId: string;
    targetGuid: string;
}
/**
 * Complete information about a prefab variant
 */
export interface PrefabVariantInfo {
    isVariant: boolean;
    basePrefabGuid: string;
    basePrefabName: string;
    basePrefabPath: string;
    prefabInstances: PrefabInstanceInfo[];
}
/**
 * Information about a single PrefabInstance within a variant
 */
export interface PrefabInstanceInfo {
    fileId: string;
    sourcePrefabGuid: string;
    sourcePrefabName: string;
    modifications: PropertyModification[];
    addedComponents: AddedComponent[];
    addedGameObjects: AddedGameObject[];
    removedComponents: RemovedComponent[];
}
/**
 * Grouped modifications by GameObject/Component
 */
export interface GroupedModifications {
    [gameObjectName: string]: {
        [componentType: string]: {
            [fieldName: string]: {
                value: unknown;
                isModified: boolean;
            };
        };
    };
}
/**
 * Detect if a prefab file is a variant and extract variant information
 */
export declare function detectPrefabVariant(documents: ParsedDocument[], assetCache: MetaFileCache): PrefabVariantInfo | null;
/**
 * Merge vector properties like m_LocalPosition.x, .y, .z into a single object
 */
export declare function mergeVectorProperties(modifications: PropertyModification[]): Map<string, Record<string, unknown>>;
/**
 * Get a human-readable property name from a Unity property path
 */
export declare function getReadablePropertyName(propertyPath: string): string;
/**
 * Filter out internal/noise modifications (like m_RootOrder, euler hints)
 */
export declare function filterInternalModifications(modifications: PropertyModification[]): PropertyModification[];
/**
 * Group modifications by a descriptive target name
 * This requires resolving the target fileID to a component/gameobject name
 */
export declare function groupModificationsByTarget(modifications: PropertyModification[], assetCache: MetaFileCache): Map<string, PropertyModification[]>;
/**
 * Check if a prefab has nested prefab instances (contains other prefabs)
 */
export declare function hasNestedPrefabs(documents: ParsedDocument[]): boolean;
//# sourceMappingURL=variant.d.ts.map