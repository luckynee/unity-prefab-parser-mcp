/**
 * Build a map of fileIDs to their corresponding objects
 */
export function buildFileIdMap(documents) {
    const map = {
        gameObjects: new Map(),
        transforms: new Map(),
        components: new Map(),
    };
    // First pass: extract all GameObjects, Transforms, and Components
    for (const doc of documents) {
        const fileId = doc.fileId;
        const data = doc.data;
        if (doc.className === 'GameObject') {
            const name = data.m_Name || 'Unnamed';
            const layer = data.m_Layer || 0;
            const tagId = data.m_TagString;
            const isActive = data.m_IsActive !== 0;
            map.gameObjects.set(fileId, {
                name,
                layer,
                tag: tagId || 'Untagged',
                active: isActive,
                transformFileId: '', // Will be set in second pass
            });
        }
        else if (doc.className === 'Transform' || doc.className === 'RectTransform') {
            const gameObjectRef = data.m_GameObject;
            const parentRef = data.m_Father;
            const children = data.m_Children;
            // Handle both string and number fileIDs (string for precision with large IDs)
            const getFileId = (ref) => {
                if (!ref)
                    return null;
                const id = ref.fileID;
                if (typeof id === 'string')
                    return id === '0' ? null : id;
                return id === 0 ? null : id.toString();
            };
            map.transforms.set(fileId, {
                gameObjectFileId: getFileId(gameObjectRef) || '',
                parentFileId: getFileId(parentRef),
                childrenFileIds: children?.map(c => String(c.fileID)).filter(id => id !== '0') || [],
            });
        }
        else if (doc.className !== 'PrefabInstance' && doc.className !== 'PrefabModification') {
            // All other components
            const gameObjectRef = data.m_GameObject;
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
export function findRootTransforms(map) {
    const roots = [];
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
export function buildHierarchy(map, includeDisabledObjects = true) {
    const rootTransforms = findRootTransforms(map);
    const hierarchy = [];
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
function buildHierarchyNode(transformFileId, map, includeDisabledObjects) {
    const transform = map.transforms.get(transformFileId);
    if (!transform)
        return null;
    const gameObject = map.gameObjects.get(transform.gameObjectFileId);
    if (!gameObject)
        return null;
    // Skip disabled objects if configured
    if (!includeDisabledObjects && !gameObject.active) {
        return null;
    }
    const node = {
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
    const children = [];
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
 * Get all GameObjects in the hierarchy as a flat map
 */
export function getGameObjectMap(map) {
    // Returns a map of fileID -> GameObject name
    const result = new Map();
    for (const [fileId, gameObject] of map.gameObjects) {
        result.set(fileId, gameObject.name);
    }
    return result;
}
/**
 * Get the component type and owning GameObject name for a component fileID
 */
export function getComponentInfo(componentFileId, map) {
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
export function getComponentsByGameObject(map) {
    const result = new Map();
    // Process transforms first
    for (const [fileId, transform] of map.transforms) {
        const gameObject = map.gameObjects.get(transform.gameObjectFileId);
        if (!gameObject)
            continue;
        const name = gameObject.name;
        if (!result.has(name)) {
            result.set(name, []);
        }
        // We'll handle Transform data extraction separately
    }
    // Process other components
    for (const [fileId, component] of map.components) {
        const gameObject = map.gameObjects.get(component.gameObjectFileId);
        if (!gameObject)
            continue;
        const name = gameObject.name;
        if (!result.has(name)) {
            result.set(name, []);
        }
        result.get(name).push({
            type: component.type,
            fileId,
            data: component.data,
        });
    }
    return result;
}
//# sourceMappingURL=hierarchy.js.map