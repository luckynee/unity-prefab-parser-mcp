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
  objectReference: { fileID: number; guid?: string } | null;
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
export function detectPrefabVariant(
  documents: ParsedDocument[],
  assetCache: MetaFileCache
): PrefabVariantInfo | null {
  const prefabInstances: PrefabInstanceInfo[] = [];
  
  for (const doc of documents) {
    if (doc.className !== 'PrefabInstance') continue;
    
    const data = doc.data as Record<string, unknown>;
    const sourcePrefab = data.m_SourcePrefab as { fileID?: number; guid?: string } | undefined;
    
    if (!sourcePrefab?.guid) continue;
    
    // This is a prefab variant - it has a source prefab reference
    const modification = data.m_Modification as Record<string, unknown> | undefined;
    
    const instanceInfo: PrefabInstanceInfo = {
      fileId: doc.fileId,
      sourcePrefabGuid: sourcePrefab.guid,
      sourcePrefabName: resolveAssetName(sourcePrefab.guid, assetCache),
      modifications: parseModifications(modification),
      addedComponents: parseAddedComponents(modification),
      addedGameObjects: parseAddedGameObjects(modification),
      removedComponents: parseRemovedComponents(data.m_RemovedComponents),
    };
    
    prefabInstances.push(instanceInfo);
  }
  
  if (prefabInstances.length === 0) {
    return null;
  }
  
  // Find the root variant instance
  // The root variant is the one that:
  // 1. Has a modification setting m_Name on the root GameObject (usually matches file name), OR
  // 2. Has the most modifications (fallback heuristic)
  let rootInstance = prefabInstances[0];
  
  for (const instance of prefabInstances) {
    // Check if this instance modifies the root transform (m_Father = {fileID: 0})
    const hasRootTransformMod = instance.modifications.some(mod => 
      mod.propertyPath === 'm_Father' || 
      mod.propertyPath === 'm_TransformParent'
    );
    
    // Check if this instance sets a root-level m_Name
    const setsRootName = instance.modifications.some(mod =>
      mod.propertyPath === 'm_Name' && mod.value !== instance.sourcePrefabName
    );
    
    // The root variant typically has the most modifications (it's the base)
    if (hasRootTransformMod || setsRootName || 
        instance.modifications.length > rootInstance.modifications.length) {
      rootInstance = instance;
    }
  }
  
  const asset = assetCache[rootInstance.sourcePrefabGuid];
  
  return {
    isVariant: true,
    basePrefabGuid: rootInstance.sourcePrefabGuid,
    basePrefabName: rootInstance.sourcePrefabName,
    basePrefabPath: asset?.path || '',
    prefabInstances,
  };
}

/**
 * Resolve asset name from GUID using the cache
 */
function resolveAssetName(guid: string, assetCache: MetaFileCache): string {
  const asset = assetCache[guid];
  return asset?.name || 'Unknown';
}

/**
 * Parse the m_Modifications array from a PrefabInstance
 */
function parseModifications(
  modification: Record<string, unknown> | undefined
): PropertyModification[] {
  if (!modification) return [];
  
  const modifications = modification.m_Modifications as Array<Record<string, unknown>> | undefined;
  if (!modifications || !Array.isArray(modifications)) return [];
  
  const result: PropertyModification[] = [];
  
  for (const mod of modifications) {
    const target = mod.target as { fileID?: number | string; guid?: string } | undefined;
    if (!target) continue;
    
    const objectRef = mod.objectReference as { fileID?: number; guid?: string } | undefined;
    
    result.push({
      targetFileId: String(target.fileID || 0).replace(/^"|"$/g, ''),
      targetGuid: target.guid || '',
      propertyPath: (mod.propertyPath as string) || '',
      value: mod.value,
      objectReference: objectRef && objectRef.fileID !== 0 ? {
        fileID: objectRef.fileID || 0,
        guid: objectRef.guid,
      } : null,
    });
  }
  
  return result;
}

/**
 * Parse m_AddedComponents from modification
 */
function parseAddedComponents(
  modification: Record<string, unknown> | undefined
): AddedComponent[] {
  if (!modification) return [];
  
  const added = modification.m_AddedComponents as Array<Record<string, unknown>> | undefined;
  if (!added || !Array.isArray(added)) return [];
  
  const result: AddedComponent[] = [];
  
  for (const item of added) {
    const targetCorrespondingSourceObject = item.targetCorrespondingSourceObject as { fileID?: number | string; guid?: string } | undefined;
    const component = item.component as { fileID?: number | string } | undefined;
    
    if (component) {
      result.push({
        targetFileId: String(targetCorrespondingSourceObject?.fileID || 0),
        targetGuid: targetCorrespondingSourceObject?.guid || '',
        componentFileId: String(component.fileID || 0),
      });
    }
  }
  
  return result;
}

/**
 * Parse m_AddedGameObjects from modification
 */
function parseAddedGameObjects(
  modification: Record<string, unknown> | undefined
): AddedGameObject[] {
  if (!modification) return [];
  
  const added = modification.m_AddedGameObjects as Array<Record<string, unknown>> | undefined;
  if (!added || !Array.isArray(added)) return [];
  
  const result: AddedGameObject[] = [];
  
  for (const item of added) {
    const targetCorrespondingSourceObject = item.targetCorrespondingSourceObject as { fileID?: number | string; guid?: string } | undefined;
    const gameObject = item.addedObject as { fileID?: number | string } | undefined;
    
    if (gameObject) {
      result.push({
        targetFileId: String(targetCorrespondingSourceObject?.fileID || 0),
        targetGuid: targetCorrespondingSourceObject?.guid || '',
        gameObjectFileId: String(gameObject.fileID || 0),
      });
    }
  }
  
  return result;
}

/**
 * Parse m_RemovedComponents array
 */
function parseRemovedComponents(
  removed: unknown
): RemovedComponent[] {
  if (!removed || !Array.isArray(removed)) return [];
  
  const result: RemovedComponent[] = [];
  
  for (const item of removed) {
    if (typeof item === 'object' && item !== null) {
      const ref = item as { fileID?: number | string; guid?: string };
      result.push({
        targetFileId: String(ref.fileID || 0),
        targetGuid: ref.guid || '',
      });
    }
  }
  
  return result;
}

/**
 * Merge vector properties like m_LocalPosition.x, .y, .z into a single object
 */
export function mergeVectorProperties(
  modifications: PropertyModification[]
): Map<string, Record<string, unknown>> {
  // Group by targetFileId + base property path
  const grouped = new Map<string, Map<string, PropertyModification[]>>();
  
  for (const mod of modifications) {
    const key = `${mod.targetGuid}:${mod.targetFileId}`;
    
    if (!grouped.has(key)) {
      grouped.set(key, new Map());
    }
    
    const targetMods = grouped.get(key)!;
    
    // Check if this is a vector component (ends with .x, .y, .z, .w, .r, .g, .b, .a)
    const vectorMatch = mod.propertyPath.match(/^(.+)\.(x|y|z|w|r|g|b|a)$/);
    
    if (vectorMatch) {
      const basePath = vectorMatch[1];
      
      if (!targetMods.has(basePath)) {
        targetMods.set(basePath, []);
      }
      targetMods.get(basePath)!.push(mod);
    } else {
      // Non-vector property - use the full path
      if (!targetMods.has(mod.propertyPath)) {
        targetMods.set(mod.propertyPath, []);
      }
      targetMods.get(mod.propertyPath)!.push(mod);
    }
  }
  
  // Now merge vector components
  const result = new Map<string, Record<string, unknown>>();
  
  for (const [targetKey, pathMods] of grouped) {
    const mergedProperties: Record<string, unknown> = {};
    
    for (const [basePath, mods] of pathMods) {
      // Check if all modifications are vector components
      const allVectorComponents = mods.every(m => 
        m.propertyPath.match(/\.(x|y|z|w|r|g|b|a)$/)
      );
      
      if (allVectorComponents && mods.length > 1) {
        // Vector property - merge components
        const vector: Record<string, number> = {};
        
        for (const mod of mods) {
          const component = mod.propertyPath.split('.').pop()!;
          const value = mod.value;
          vector[component] = typeof value === 'string' ? parseFloat(value) : (value as number);
        }
        
        mergedProperties[basePath] = vector;
      } else {
        // Single property or non-vector
        const mod = mods[0];
        // Use value for scalar modifications, skip null objectReferences
        // objectReference with fileID: 0 means "null reference" - not useful
        let value = mod.value;
        if (mod.objectReference && typeof mod.objectReference === 'object') {
          const objRef = mod.objectReference as { fileID?: number | string; guid?: string };
          // Only use objectReference if it's a real reference (non-zero fileID or has guid)
          if ((objRef.fileID && objRef.fileID !== 0 && objRef.fileID !== '0') || objRef.guid) {
            value = mod.objectReference;
          }
        }
        mergedProperties[basePath] = value;
      }
    }
    
    result.set(targetKey, mergedProperties);
  }
  
  return result;
}

/**
 * Get a human-readable property name from a Unity property path
 */
export function getReadablePropertyName(propertyPath: string): string {
  // Remove array indices like [0], [1]
  let name = propertyPath.replace(/\[\d+\]/g, '');
  
  // Remove m_ prefix
  if (name.startsWith('m_')) {
    name = name.substring(2);
  }
  
  // Lowercase first letter of each segment (split by .)
  name = name.split('.').map(segment => {
    return segment.charAt(0).toLowerCase() + segment.slice(1);
  }).join('.');
  
  return name;
}

/**
 * Filter out internal/noise modifications (like m_RootOrder, euler hints)
 */
export function filterInternalModifications(
  modifications: PropertyModification[]
): PropertyModification[] {
  const internalPatterns = [
    /^m_RootOrder$/,
    /^m_LocalEulerAnglesHint/,
    /^m_ConstrainProportionsScale$/,
    /^m_StaticEditorFlags$/,
    /^m_NavMeshLayer$/,
    /^m_Icon$/,
    /^m_Father$/,              // Parent reference (internal)
    /^m_Children$/,            // Children references (internal)
    /^m_Component$/,           // Component references (internal)
  ];
  
  return modifications.filter(mod => {
    return !internalPatterns.some(pattern => pattern.test(mod.propertyPath));
  });
}

/**
 * Group modifications by a descriptive target name
 * This requires resolving the target fileID to a component/gameobject name
 */
export function groupModificationsByTarget(
  modifications: PropertyModification[],
  assetCache: MetaFileCache
): Map<string, PropertyModification[]> {
  const grouped = new Map<string, PropertyModification[]>();
  
  for (const mod of modifications) {
    // Group by targetGuid (prefab source) and targetFileId
    const key = mod.targetGuid 
      ? `${resolveAssetName(mod.targetGuid, assetCache)}:${mod.targetFileId}`
      : mod.targetFileId;
    
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(mod);
  }
  
  return grouped;
}

/**
 * Check if a prefab has nested prefab instances (contains other prefabs)
 */
export function hasNestedPrefabs(documents: ParsedDocument[]): boolean {
  let prefabInstanceCount = 0;
  
  for (const doc of documents) {
    if (doc.className === 'PrefabInstance') {
      prefabInstanceCount++;
      if (prefabInstanceCount > 0) return true;
    }
  }
  
  return false;
}
