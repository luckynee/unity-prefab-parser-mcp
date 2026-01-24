import { getComponentInfo } from './hierarchy.js';
import { shouldExcludeField, renameField, ALWAYS_EXCLUDE, COMPACT_MODE_EXCLUDE, isBooleanField, isDefaultRenderingValue, isDefaultOffset, isDefaultTransformValue, } from './components.js';
/**
 * Resolve all references in component data
 */
export function resolveReferences(data, componentType, fileIdMap, assetCache, config, depth = 0) {
    if (depth > config.nestedObjectDepth) {
        if (config.depthSummaryMode) {
            return { '...': `[${Object.keys(data).length} fields]` };
        }
        return { '...': 'max depth reached' };
    }
    const result = {};
    for (const [key, value] of Object.entries(data)) {
        // Skip excluded fields
        if (shouldExcludeField(key, componentType)) {
            continue;
        }
        // Skip additional fields in compact mode
        if (!config.includeUnityInternals && COMPACT_MODE_EXCLUDE.includes(key)) {
            continue;
        }
        // Skip default rendering properties in compact mode
        if (config.filterDefaultRenderingProps && isDefaultRenderingValue(key, value)) {
            continue;
        }
        // Skip enabled: true in compact mode (enabled is default state)
        if (config.omitEnabledTrue && (key === 'enabled' || key === 'm_Enabled') && value === 1) {
            continue;
        }
        // Skip default offset vectors in compact mode
        if (config.omitDefaultOffsets && isDefaultOffset(key, value)) {
            continue;
        }
        // Skip default Transform values (lPos 0,0,0 / lRot 0,0,0,1 / lScale 1,1,1)
        if (config.omitDefaultTransforms && isDefaultTransformValue(key, value)) {
            continue;
        }
        // Handle empty Unity events in compact mode
        if (config.simplifyUnityEvents && isEmptyUnityEvent(value)) {
            continue; // Omit empty events entirely
        }
        // Handle empty staticBatchInfo in compact mode (both naming conventions)
        if (config.omitEmptyStaticBatch && (key === 'staticBatchInfo' || key === 'm_StaticBatchInfo') && isEmptyStaticBatchInfo(value)) {
            continue;
        }
        // Handle LayerMask bitmask conversion
        if (config.convertBitmasks && isLayerMaskObject(value)) {
            const bits = value.m_Bits;
            const newKey = renameField(key, componentType, config.abbreviateFieldNames);
            result[newKey] = convertBitmaskToLayers(bits);
            continue;
        }
        // Rename the field (with optional abbreviation)
        const newKey = renameField(key, componentType, config.abbreviateFieldNames);
        // Process the value
        let resolvedValue = resolveValue(value, fileIdMap, assetCache, config, depth, key);
        // Convert to boolean if applicable
        const wasBooleanConverted = config.useBooleans && isBooleanField(key) && (value === 0 || value === 1);
        if (config.useBooleans && isBooleanField(key)) {
            resolvedValue = convertToBoolean(resolvedValue);
        }
        // Skip null references if configured
        if (resolvedValue === null && !config.includeNullReferences) {
            continue;
        }
        // Skip default values if configured
        // BUT don't skip boolean fields that were converted - false is a valid value
        if (!config.includeDefaultValues && !wasBooleanConverted && isDefaultValue(resolvedValue, key)) {
            continue;
        }
        if (resolvedValue !== undefined) {
            result[newKey] = resolvedValue;
        }
    }
    return result;
}
/**
 * Resolve a single value, handling references and nested objects
 */
export function resolveValue(value, fileIdMap, assetCache, config, depth = 0, fieldName = '') {
    if (value === null || value === undefined) {
        return config.includeNullReferences ? null : undefined;
    }
    // Handle primitive types
    if (typeof value === 'string' || typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number') {
        // Convert to boolean if this is a boolean field
        if (config.useBooleans && isBooleanField(fieldName)) {
            return convertToBoolean(value);
        }
        return value;
    }
    // Handle arrays
    if (Array.isArray(value)) {
        return resolveArray(value, fileIdMap, assetCache, config, depth, fieldName);
    }
    // Handle objects
    if (typeof value === 'object') {
        return resolveObject(value, fileIdMap, assetCache, config, depth);
    }
    return value;
}
/**
 * Resolve an array value
 */
function resolveArray(arr, fileIdMap, assetCache, config, depth, fieldName = '') {
    if (arr.length === 0) {
        return [];
    }
    // In depth summary mode, show count instead of expanding at max depth
    if (depth >= config.nestedObjectDepth && config.depthSummaryMode) {
        // Try to extract names from array items for summary
        const names = extractArrayItemNames(arr);
        if (names.length > 0 && names.length <= 10) {
            return `[${names.join(', ')}]`;
        }
        return `[${arr.length} items]`;
    }
    // Check if array is too large
    if (arr.length > config.arrayMaxElements) {
        const resolved = arr.slice(0, config.arrayMaxElements).map(item => resolveValue(item, fileIdMap, assetCache, config, depth + 1, fieldName));
        if (config.depthSummaryMode) {
            return `[${config.arrayMaxElements} shown, ${arr.length - config.arrayMaxElements} more]`;
        }
        if (config.showElementCount) {
            return {
                items: resolved,
                '...': `${arr.length - config.arrayMaxElements} more items`,
            };
        }
        resolved.push(`... ${arr.length - config.arrayMaxElements} more`);
        return resolved;
    }
    return arr.map(item => resolveValue(item, fileIdMap, assetCache, config, depth + 1, fieldName));
}
/**
 * Extract names from array items for summary display
 */
function extractArrayItemNames(arr) {
    const names = [];
    for (const item of arr) {
        if (typeof item === 'object' && item !== null) {
            const obj = item;
            // Look for common name fields
            const name = obj.StateName || obj.name || obj.Name || obj._name || obj.m_Name;
            if (typeof name === 'string' && name.length > 0) {
                names.push(name);
            }
        }
    }
    return names;
}
/**
 * Resolve an object value (could be a reference or nested object)
 */
function resolveObject(obj, fileIdMap, assetCache, config, depth) {
    // Check for Unity reference format: {fileID: 123}
    if ('fileID' in obj) {
        return resolveReference(obj, fileIdMap, assetCache, config);
    }
    // Check for LayerMask format and convert if in compact mode
    if (config.convertBitmasks && isLayerMaskObject(obj)) {
        const bits = obj.m_Bits;
        return convertBitmaskToLayers(bits);
    }
    // Check for vector/color format
    if (isVectorOrColor(obj)) {
        return config.compactVectors ? formatCompactVector(obj) : obj;
    }
    // Check for Unity event (simplify in compact mode)
    if (config.simplifyUnityEvents && isUnityEvent(obj)) {
        if (isEmptyUnityEvent(obj)) {
            return []; // Return empty array for empty events
        }
        // Simplify non-empty events to show method names
        return simplifyUnityEvent(obj);
    }
    // Regular nested object
    if (depth >= config.nestedObjectDepth) {
        if (config.depthSummaryMode) {
            return `[${Object.keys(obj).length} fields]`;
        }
        return { '...': 'max depth reached' };
    }
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        // Skip internal fields in nested objects too
        if (ALWAYS_EXCLUDE.includes(key)) {
            continue;
        }
        // Skip additional fields in compact mode
        if (!config.includeUnityInternals && COMPACT_MODE_EXCLUDE.includes(key)) {
            continue;
        }
        // Skip default rendering properties in compact mode
        if (config.filterDefaultRenderingProps && isDefaultRenderingValue(key, value)) {
            continue;
        }
        // Skip enabled: true in compact mode (enabled is default state)
        if (config.omitEnabledTrue && (key === 'enabled' || key === 'm_Enabled') && value === 1) {
            continue;
        }
        // Skip default offset vectors in compact mode
        if (config.omitDefaultOffsets && isDefaultOffset(key, value)) {
            continue;
        }
        // Skip default Transform values in nested objects too
        if (config.omitDefaultTransforms && isDefaultTransformValue(key, value)) {
            continue;
        }
        // Handle empty staticBatchInfo (both naming conventions)
        if (config.omitEmptyStaticBatch && (key === 'staticBatchInfo' || key === 'm_StaticBatchInfo') && isEmptyStaticBatchInfo(value)) {
            continue;
        }
        let resolved = resolveValue(value, fileIdMap, assetCache, config, depth + 1, key);
        // Convert to boolean if applicable
        if (config.useBooleans && isBooleanField(key)) {
            resolved = convertToBoolean(resolved);
        }
        if (resolved !== undefined) {
            result[key] = resolved;
        }
    }
    return result;
}
/**
 * Resolve a Unity reference
 */
export function resolveReference(ref, fileIdMap, assetCache, config) {
    const fileID = ref.fileID;
    const guid = ref.guid;
    const type = ref.type;
    // Null reference (handle both string and number)
    if ((fileID === 0 || fileID === '0') && !guid) {
        return config.includeNullReferences ? 'null' : null;
    }
    // External asset reference (has GUID)
    if (guid) {
        const asset = assetCache[guid];
        if (!asset) {
            // In compact mode, omit unknown references entirely
            if (config.omitUnknownRefs) {
                return null;
            }
            return config.showAssetTypes
                ? `Unknown  # guid:${guid}`
                : 'Unknown';
        }
        return config.showAssetTypes
            ? `${asset.name}  # ${asset.type}`
            : asset.name;
    }
    // Internal reference (within prefab)
    if (fileID && !guid) {
        const fileIdStr = String(fileID);
        // Check if it's a GameObject reference
        const gameObject = fileIdMap.gameObjects.get(fileIdStr);
        if (gameObject) {
            if (config.useShortRefs) {
                return `@${gameObject.name}`;
            }
            return config.shorthandRefs
                ? `<GameObject:${gameObject.name}>`
                : `GameObject:${gameObject.name}`;
        }
        // Check if it's a component reference
        const componentInfo = getComponentInfo(fileIdStr, fileIdMap);
        if (componentInfo) {
            if (config.useShortRefs) {
                // For components, use @Name.Type format (or just @Name if it's MonoBehaviour)
                if (componentInfo.type === 'MonoBehaviour') {
                    return `@${componentInfo.gameObjectName}`;
                }
                return `@${componentInfo.gameObjectName}.${componentInfo.type}`;
            }
            return config.shorthandRefs
                ? `<${componentInfo.type}:${componentInfo.gameObjectName}>`
                : `${componentInfo.type}:${componentInfo.gameObjectName}`;
        }
        // Unknown internal reference
        if (config.omitUnknownRefs) {
            return null;
        }
        return `<Unknown:${fileID}>`;
    }
    if (config.omitUnknownRefs) {
        return null;
    }
    return 'Unknown';
}
/**
 * Check if an object is a vector or color
 */
function isVectorOrColor(obj) {
    const keys = Object.keys(obj);
    // Vector2: {x, y}
    if (keys.length === 2 && keys.includes('x') && keys.includes('y')) {
        return true;
    }
    // Vector3: {x, y, z}
    if (keys.length === 3 && keys.includes('x') && keys.includes('y') && keys.includes('z')) {
        return true;
    }
    // Vector4/Quaternion: {x, y, z, w}
    if (keys.length === 4 && keys.includes('x') && keys.includes('y') && keys.includes('z') && keys.includes('w')) {
        return true;
    }
    // Color: {r, g, b, a}
    if (keys.length === 4 && keys.includes('r') && keys.includes('g') && keys.includes('b') && keys.includes('a')) {
        return true;
    }
    // Color RGB: {r, g, b}
    if (keys.length === 3 && keys.includes('r') && keys.includes('g') && keys.includes('b')) {
        return true;
    }
    return false;
}
/**
 * Format a vector or color in compact form
 */
function formatCompactVector(obj) {
    // Just return as-is but ensure it's clean
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'number') {
            // Round to reasonable precision
            result[key] = Math.round(value * 1000) / 1000;
        }
    }
    return result;
}
/**
 * Check if a value is a default value that can be omitted
 */
function isDefaultValue(value, key) {
    // Common default values
    if (value === 0)
        return true;
    if (value === false)
        return true;
    if (value === '')
        return true;
    if (value === null)
        return true;
    // Default unity reference (null)
    if (typeof value === 'string' && value === 'null')
        return true;
    // Empty arrays
    if (Array.isArray(value) && value.length === 0)
        return true;
    // Empty objects
    if (typeof value === 'object' && value !== null && Object.keys(value).length === 0)
        return true;
    // Default vectors
    if (typeof value === 'object' && value !== null) {
        const obj = value;
        // Default position/rotation (0,0,0)
        if ('x' in obj && 'y' in obj && 'z' in obj && !('w' in obj)) {
            if (obj.x === 0 && obj.y === 0 && obj.z === 0)
                return true;
        }
        // Default quaternion (0,0,0,1)
        if ('x' in obj && 'y' in obj && 'z' in obj && 'w' in obj) {
            if (obj.x === 0 && obj.y === 0 && obj.z === 0 && obj.w === 1)
                return true;
        }
        // Default scale (1,1,1)
        if (key.toLowerCase().includes('scale')) {
            if (obj.x === 1 && obj.y === 1 && obj.z === 1)
                return true;
        }
        // Default color (1,1,1,1) white
        if ('r' in obj && 'g' in obj && 'b' in obj && 'a' in obj) {
            if (obj.r === 1 && obj.g === 1 && obj.b === 1 && obj.a === 1)
                return true;
        }
    }
    return false;
}
/**
 * Convert 0/1 to false/true for boolean fields
 */
function convertToBoolean(value) {
    if (value === 0)
        return false;
    if (value === 1)
        return true;
    return value;
}
/**
 * Check if an object is an empty Unity event
 */
function isEmptyUnityEvent(value) {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const obj = value;
    // Check for pattern: { m_PersistentCalls: { m_Calls: [] } }
    if ('m_PersistentCalls' in obj) {
        const calls = obj.m_PersistentCalls;
        if (typeof calls === 'object' && calls !== null && 'm_Calls' in calls) {
            const callsArray = calls.m_Calls;
            return Array.isArray(callsArray) && callsArray.length === 0;
        }
    }
    return false;
}
/**
 * Check if an object is a Unity event (has m_PersistentCalls)
 */
function isUnityEvent(value) {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const obj = value;
    return 'm_PersistentCalls' in obj;
}
/**
 * Simplify a Unity event to show method names instead of verbose structure
 * Returns: string[] of "TargetType.MethodName" or count if too many
 */
export function simplifyUnityEvent(value) {
    if (typeof value !== 'object' || value === null) {
        return value;
    }
    const obj = value;
    if (!('m_PersistentCalls' in obj)) {
        return value;
    }
    const persistentCalls = obj.m_PersistentCalls;
    if (typeof persistentCalls !== 'object' || persistentCalls === null || !('m_Calls' in persistentCalls)) {
        return value;
    }
    const calls = persistentCalls.m_Calls;
    if (!Array.isArray(calls)) {
        return value;
    }
    if (calls.length === 0) {
        return []; // Empty event
    }
    // Extract method names from each call
    const methodNames = [];
    for (const call of calls) {
        if (typeof call === 'object' && call !== null) {
            const callObj = call;
            const methodName = callObj.m_MethodName;
            if (methodName && typeof methodName === 'string' && methodName.length > 0) {
                methodNames.push(methodName);
            }
        }
    }
    if (methodNames.length === 0) {
        return `[${calls.length} callbacks]`;
    }
    // If there are too many methods, show count
    if (methodNames.length > 5) {
        return `[${methodNames.length} callbacks]`;
    }
    return methodNames;
}
/**
 * Check if an object is an empty staticBatchInfo
 */
function isEmptyStaticBatchInfo(value) {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const obj = value;
    return obj.firstSubMesh === 0 && obj.subMeshCount === 0;
}
/**
 * Check if an object is a LayerMask with m_Bits
 */
function isLayerMaskObject(value) {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const obj = value;
    return 'serializedVersion' in obj && 'm_Bits' in obj && typeof obj.m_Bits === 'number';
}
/**
 * Convert a bitmask to an array of layer numbers or 'all' for all layers
 */
function convertBitmaskToLayers(bits) {
    if (bits === 0)
        return [];
    // Check for all layers set (0xFFFFFFFF = 4294967295 or -1 in signed)
    if (bits === 0xFFFFFFFF || bits === -1 || bits === 4294967295) {
        return 'all';
    }
    const layers = [];
    for (let i = 0; i < 32; i++) {
        if (bits & (1 << i)) {
            layers.push(i);
        }
    }
    return layers;
}
/**
 * Extract script name from m_Script field
 */
export function extractScriptName(scriptRef, assetCache, config) {
    const guid = scriptRef.guid;
    if (!guid) {
        return 'Unknown';
    }
    const asset = assetCache[guid];
    if (!asset) {
        return config.showAssetTypes
            ? `Unknown  # guid:${guid}`
            : 'Unknown';
    }
    return config.showAssetTypes
        ? `${asset.name}  # MonoScript`
        : asset.name;
}
//# sourceMappingURL=resolver.js.map