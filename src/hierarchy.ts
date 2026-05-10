import type { ParsedDocument } from './parser.js';
import type { FileIdMap, HierarchyNode } from './config.js';

/**
 * Build a map of fileIDs to their corresponding objects
 */
export function buildFileIdMap(documents: ParsedDocument[]): FileIdMap {
  const map: FileIdMap = {
    gameObjects: new Map(),
    transforms: new Map(),
    components: new Map(),
  };
  
  // First pass: extract all GameObjects, Transforms, and Components
  for (const doc of documents) {
    const fileId = doc.fileId;
    const data = doc.data as Record<string, unknown>;
    
    if (doc.className === 'GameObject') {
      const name = (data.m_Name as string) || 'Unnamed';
      const layer = (data.m_Layer as number) || 0;
      const tagId = data.m_TagString as string | undefined;
      const isActive = data.m_IsActive !== 0;
      
      map.gameObjects.set(fileId, {
        name,
        layer,
        tag: tagId || 'Untagged',
        active: isActive,
        transformFileId: '', // Will be set in second pass
      });
    } else if (doc.className === 'Transform' || doc.className === 'RectTransform') {
      const gameObjectRef = data.m_GameObject as { fileID: string | number } | undefined;
      const parentRef = data.m_Father as { fileID: string | number } | undefined;
      const children = data.m_Children as Array<{ fileID: string | number }> | undefined;
      
      // Handle both string and number fileIDs (string for precision with large IDs)
      const getFileId = (ref: { fileID: string | number } | undefined): string | null => {
        if (!ref) return null;
        const id = ref.fileID;
        if (typeof id === 'string') return id === '0' ? null : id;
        return id === 0 ? null : id.toString();
      };
      
      map.transforms.set(fileId, {
        gameObjectFileId: getFileId(gameObjectRef) || '',
        parentFileId: getFileId(parentRef),
        childrenFileIds: children?.map(c => String(c.fileID)).filter(id => id !== '0') || [],
      });
    } else if (doc.className !== 'PrefabInstance' && doc.className !== 'PrefabModification') {
      // All other components
      const gameObjectRef = data.m_GameObject as { fileID: string | number } | undefined;
      
      const goFileId = gameObjectRef?.fileID;
      if (goFileId && goFileId !== 0 && goFileId !== '0') {
        map.components.set(fileId, {
          type: doc.className,
          gameObjectFileId: String(goFileId),
          data: data,
        });
      }
    }
  }
  
  // Second pass: link GameObjects to their Transforms
  for (const [transformFileId, transform] of map.transforms) {
    const gameObjectFileId = transform.gameObjectFileId;
    const gameObject = map.gameObjects.get(gameObjectFileId);
    
    if (gameObject) {
      gameObject.transformFileId = transformFileId;
    }
  }
  
  return map;
}

/**
 * Find the root transforms (transforms with no parent or parent with fileID 0)
 */
export function findRootTransforms(map: FileIdMap): string[] {
  const roots: string[] = [];
  
  for (const [fileId, transform] of map.transforms) {
    if (!transform.parentFileId || transform.parentFileId === '0') {
      roots.push(fileId);
    }
  }
  
  return roots;
}

/**
 * Build the hierarchy tree starting from root transforms
 */
export function buildHierarchy(
  map: FileIdMap,
  includeDisabledObjects: boolean = true
): HierarchyNode[] {
  const rootTransforms = findRootTransforms(map);
  
  const hierarchy: HierarchyNode[] = [];
  
  for (const rootTransformFileId of rootTransforms) {
    const node = buildHierarchyNode(rootTransformFileId, map, includeDisabledObjects);
    if (node) {
      hierarchy.push(node);
    }
  }
  
  return hierarchy;
}

/**
 * Build a hierarchy node for a single transform
 */
function buildHierarchyNode(
  transformFileId: string,
  map: FileIdMap,
  includeDisabledObjects: boolean
): HierarchyNode | null {
  const transform = map.transforms.get(transformFileId);
  if (!transform) return null;
  
  const gameObject = map.gameObjects.get(transform.gameObjectFileId);
  if (!gameObject) return null;
  
  // Skip disabled objects if configured
  if (!includeDisabledObjects && !gameObject.active) {
    return null;
  }
  
  const node: HierarchyNode = {
    fileId: transform.gameObjectFileId,
    name: gameObject.name,
  };
  
  // Only include non-default values to save tokens
  if (gameObject.layer !== 0) {
    node.layer = gameObject.layer;
  }
  if (gameObject.tag !== 'Untagged') {
    node.tag = gameObject.tag;
  }
  if (!gameObject.active) {
    node.active = false;
  }
  
  // Recursively build children
  const children: HierarchyNode[] = [];
  for (const childTransformFileId of transform.childrenFileIds) {
    const childNode = buildHierarchyNode(childTransformFileId, map, includeDisabledObjects);
    if (childNode) {
      children.push(childNode);
    }
  }
  
  if (children.length > 0) {
    node.children = children;
  }
  
  return node;
}

/**
 * Build stable display keys for GameObjects.
 * Uses full hierarchy paths when names repeat, and appends fileId when paths still collide.
 */
export function buildGameObjectDisplayMap(nodes: HierarchyNode[]): Map<string, string> {
  const rawPaths = new Map<string, string>();
  const rawNames = new Map<string, string>();
  const pathCounts = new Map<string, number>();
  const nameCounts = new Map<string, number>();

  function walk(node: HierarchyNode, parentPath: string): void {
    const path = parentPath ? `${parentPath}/${node.name}` : node.name;

    if (node.fileId) {
      rawPaths.set(node.fileId, path);
      rawNames.set(node.fileId, node.name);
      pathCounts.set(path, (pathCounts.get(path) || 0) + 1);
      nameCounts.set(node.name, (nameCounts.get(node.name) || 0) + 1);
    }

    if (node.children) {
      for (const child of node.children) {
        walk(child, path);
      }
    }
  }

  for (const node of nodes) {
    walk(node, '');
  }

  const displayMap = new Map<string, string>();
  for (const [fileId, path] of rawPaths) {
    const rawName = rawNames.get(fileId) || path;
    const nameCount = nameCounts.get(rawName) || 0;
    const pathCount = pathCounts.get(path) || 0;

    const displayName = nameCount <= 1
      ? rawName
      : pathCount <= 1
        ? path
        : `${path} [${fileId}]`;

    displayMap.set(fileId, displayName);
  }

  return displayMap;
}

/**
 * Get all GameObjects in the hierarchy as a flat map
 */
export function getGameObjectMap(map: FileIdMap): Map<string, string> {
  // Returns a map of fileID -> GameObject name
  const result = new Map<string, string>();
  
  for (const [fileId, gameObject] of map.gameObjects) {
    result.set(fileId, gameObject.name);
  }
  
  return result;
}

/**
 * Get the component type and owning GameObject name for a component fileID
 */
export function getComponentInfo(
  componentFileId: string,
  map: FileIdMap
): { type: string; gameObjectName: string } | null {
  const component = map.components.get(componentFileId);
  if (!component) {
    // Check if it's a Transform
    const transform = map.transforms.get(componentFileId);
    if (transform) {
      const gameObject = map.gameObjects.get(transform.gameObjectFileId);
      return {
        type: 'Transform',
        gameObjectName: gameObject?.name || 'Unknown',
      };
    }
    return null;
  }
  
  const gameObject = map.gameObjects.get(component.gameObjectFileId);
  return {
    type: component.type,
    gameObjectName: gameObject?.name || 'Unknown',
  };
}

/**
 * Get all components grouped by GameObject name
 */
export function getComponentsByGameObject(
  map: FileIdMap
): Map<string, Array<{ type: string; fileId: string; data: Record<string, unknown> }>> {
  const result = new Map<string, Array<{ type: string; fileId: string; data: Record<string, unknown> }>>();
  
  // Process transforms first
  for (const [fileId, transform] of map.transforms) {
    const gameObject = map.gameObjects.get(transform.gameObjectFileId);
    if (!gameObject) continue;
    
    const name = gameObject.name;
    
    if (!result.has(name)) {
      result.set(name, []);
    }
    
    // We'll handle Transform data extraction separately
  }
  
  // Process other components
  for (const [fileId, component] of map.components) {
    const gameObject = map.gameObjects.get(component.gameObjectFileId);
    if (!gameObject) continue;
    
    const name = gameObject.name;
    
    if (!result.has(name)) {
      result.set(name, []);
    }
    
    result.get(name)!.push({
      type: component.type,
      fileId,
      data: component.data,
    });
  }
  
  return result;
}
