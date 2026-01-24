#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, McpError, ErrorCode, } from '@modelcontextprotocol/sdk/types.js';
import * as path from 'path';
import { loadConfig } from './config.js';
import { parseUnityYAML } from './parser.js';
import { findProjectRootAsync, buildAssetCache } from './cache.js';
import { buildFileIdMap, buildHierarchy, getComponentsByGameObject } from './hierarchy.js';
import { resolveReferences, extractScriptName, resolveReference } from './resolver.js';
import { FIELD_ABBREVIATIONS, isDefaultTransformValue } from './components.js';
import { formatYAMLWithComments } from './formatter.js';
import { detectPrefabVariant, mergeVectorProperties, filterInternalModifications, getReadablePropertyName, } from './variant.js';
/**
 * Main function to parse a Unity prefab file
 */
async function parsePrefab(filePath, config) {
    // 1. Validate file path
    if (!filePath.endsWith('.prefab') && !filePath.endsWith('.unity')) {
        throw new Error('File must be a .prefab or .unity file');
    }
    // 2. Auto-detect Unity project root
    const projectRoot = await findProjectRootAsync(filePath);
    // 3. Load and parse the prefab file
    const documents = await parseUnityYAML(filePath);
    if (documents.length === 0) {
        throw new Error('No valid Unity objects found in file');
    }
    // 4. Build GUID → Name cache from .meta files (if project root found)
    let assetCache = {};
    if (projectRoot && config.resolveAssetNames) {
        assetCache = await buildAssetCache(projectRoot, config.cacheMetaFiles);
    }
    // 5. Check if this is a prefab variant
    const variantInfo = detectPrefabVariant(documents, assetCache);
    // 6. Build FileID → Object map
    const fileIdMap = buildFileIdMap(documents);
    // 7. Reconstruct GameObject hierarchy
    const hierarchy = buildHierarchy(fileIdMap, config.includeDisabledObjects);
    // 8. Extract and filter components (ordered by hierarchy)
    const components = extractComponents(documents, fileIdMap, assetCache, config, hierarchy);
    // 9. Format as YAML
    const prefabName = path.basename(filePath, path.extname(filePath));
    const parsedPrefab = {
        prefab_name: prefabName,
        hierarchy,
        components,
    };
    // 10. Add variant information if applicable
    if (variantInfo) {
        parsedPrefab.variant_of = variantInfo.basePrefabName;
        // Process modifications from all prefab instances
        const allModifications = processVariantModifications(variantInfo, assetCache, config);
        if (Object.keys(allModifications).length > 0) {
            parsedPrefab.modifications = allModifications;
        }
        // Process added components
        const addedComponents = processAddedComponents(variantInfo, documents, fileIdMap, assetCache, config);
        if (Object.keys(addedComponents).length > 0) {
            parsedPrefab.added_components = addedComponents;
        }
        // Process added GameObjects
        const addedGameObjects = processAddedGameObjects(variantInfo, fileIdMap);
        if (addedGameObjects.length > 0) {
            parsedPrefab.added_gameobjects = addedGameObjects;
        }
        // Process removed components
        const removedComponents = processRemovedComponents(variantInfo, assetCache);
        if (removedComponents.length > 0) {
            parsedPrefab.removed_components = removedComponents;
        }
    }
    return formatYAMLWithComments(parsedPrefab, config);
}
/**
 * Fields to exclude from variant modifications output
 */
const VARIANT_EXCLUDE_FIELDS = [
    'sortingLayerID',
    'm_SortingLayerID',
    'spriteSortPoint',
    'm_SpriteSortPoint',
    'wasSpriteAssigned',
    'm_WasSpriteAssigned',
    'm_CorrespondingSourceObject',
    'm_PrefabInstance',
    'm_PrefabAsset',
];
/**
 * Process variant modifications into a structured format
 * Groups all modifications under the base prefab name only
 */
function processVariantModifications(variantInfo, assetCache, config) {
    const result = {};
    // Use only the base prefab name for grouping all modifications
    const groupKey = variantInfo.basePrefabName || 'Unknown';
    for (const instance of variantInfo.prefabInstances) {
        // Filter out internal modifications
        const filtered = filterInternalModifications(instance.modifications);
        // Merge vector properties
        const merged = mergeVectorProperties(filtered);
        // Process all modifications under the base prefab name
        for (const [targetKey, properties] of merged) {
            if (!result[groupKey]) {
                result[groupKey] = {};
            }
            // Group properties by component type (inferred from property path)
            for (const [propPath, value] of Object.entries(properties)) {
                // Skip null/empty values  
                if (value === null || value === undefined || value === '')
                    continue;
                // Try to determine component type from property path
                const componentType = inferComponentType(propPath);
                if (!result[groupKey][componentType]) {
                    result[groupKey][componentType] = {};
                }
                // Get readable field name and apply abbreviations if in compact mode
                let fieldName = getReadablePropertyName(propPath);
                if (config.abbreviateFieldNames && FIELD_ABBREVIATIONS[fieldName]) {
                    fieldName = FIELD_ABBREVIATIONS[fieldName];
                }
                // Skip excluded internal fields
                if (VARIANT_EXCLUDE_FIELDS.includes(propPath) ||
                    VARIANT_EXCLUDE_FIELDS.includes(fieldName)) {
                    continue;
                }
                // Format value based on config
                const formattedValue = formatModificationValue(value, config, assetCache);
                // Skip null/Unknown results (null refs, unresolved GUIDs)
                if (formattedValue === null || formattedValue === 'null')
                    continue;
                if (config.omitUnknownRefs && formattedValue === 'Unknown')
                    continue;
                // Skip default values (position 0,0,0 / rotation 0,0,0,1 / scale 1,1,1)
                if (isDefaultTransformValue(fieldName, formattedValue))
                    continue;
                result[groupKey][componentType][fieldName] = formattedValue;
            }
        }
    }
    // Clean up empty entries
    for (const gKey of Object.keys(result)) {
        for (const componentType of Object.keys(result[gKey])) {
            if (Object.keys(result[gKey][componentType]).length === 0) {
                delete result[gKey][componentType];
            }
        }
        if (Object.keys(result[gKey]).length === 0) {
            delete result[gKey];
        }
    }
    return result;
}
/**
 * Infer component type from property path
 */
function inferComponentType(propertyPath) {
    // Common patterns
    if (propertyPath.startsWith('m_LocalPosition') ||
        propertyPath.startsWith('m_LocalRotation') ||
        propertyPath.startsWith('m_LocalScale')) {
        return 'Transform';
    }
    if (propertyPath.startsWith('m_Sprite') ||
        propertyPath.startsWith('m_Color') ||
        propertyPath.startsWith('m_SortingLayer')) {
        return 'SpriteRenderer';
    }
    if (propertyPath.startsWith('m_IsActive') ||
        propertyPath.startsWith('m_Name') ||
        propertyPath.startsWith('m_Layer') ||
        propertyPath.startsWith('m_TagString')) {
        return 'GameObject';
    }
    // Default to component name from path if available
    return 'Properties';
}
/**
 * Format a modification value based on config
 */
function formatModificationValue(value, config, assetCache) {
    if (value === null || value === undefined) {
        return null;
    }
    // Check if it's an object
    if (typeof value === 'object' && value !== null) {
        const obj = value;
        const keys = Object.keys(obj);
        // Check if it's a Unity reference (has fileID)
        if ('fileID' in obj) {
            // Create a minimal fileIdMap for external references
            // (variant modifications are typically external asset refs)
            const emptyFileIdMap = {
                gameObjects: new Map(),
                transforms: new Map(),
                components: new Map(),
            };
            const resolved = resolveReference(obj, emptyFileIdMap, assetCache, config);
            // If resolved to null (e.g., null reference), return null
            if (resolved === null) {
                return null;
            }
            return resolved;
        }
        // Vector format
        if (keys.every(k => ['x', 'y', 'z', 'w'].includes(k))) {
            if (config.useParenVectors) {
                const values = [];
                if ('x' in obj)
                    values.push(obj.x);
                if ('y' in obj)
                    values.push(obj.y);
                if ('z' in obj)
                    values.push(obj.z);
                if ('w' in obj)
                    values.push(obj.w);
                return `(${values.join(', ')})`;
            }
        }
    }
    return value;
}
/**
 * Process added components from variant info
 */
function processAddedComponents(variantInfo, documents, fileIdMap, assetCache, config) {
    const result = {};
    for (const instance of variantInfo.prefabInstances) {
        for (const added of instance.addedComponents) {
            // Find the component in documents
            const doc = documents.find(d => d.fileId === added.componentFileId);
            if (!doc)
                continue;
            // Get the target GameObject name
            const component = fileIdMap.components.get(added.componentFileId);
            const gameObject = component ? fileIdMap.gameObjects.get(component.gameObjectFileId) : null;
            const goName = gameObject?.name || 'Unknown';
            if (!result[goName]) {
                result[goName] = {};
            }
            // Get component display name
            let displayName = doc.className;
            if (doc.className === 'MonoBehaviour' && doc.data.m_Script) {
                const scriptRef = doc.data.m_Script;
                if (scriptRef.guid) {
                    const asset = assetCache[scriptRef.guid];
                    if (asset)
                        displayName = asset.name;
                }
            }
            // Resolve component data
            const resolved = resolveReferences(doc.data, doc.className, fileIdMap, assetCache, config);
            result[goName][displayName] = resolved;
        }
    }
    return result;
}
/**
 * Process added GameObjects from variant info
 */
function processAddedGameObjects(variantInfo, fileIdMap) {
    const result = [];
    for (const instance of variantInfo.prefabInstances) {
        for (const added of instance.addedGameObjects) {
            const gameObject = fileIdMap.gameObjects.get(added.gameObjectFileId);
            if (!gameObject)
                continue;
            // Try to find parent
            const transform = Array.from(fileIdMap.transforms.entries())
                .find(([_, t]) => t.gameObjectFileId === added.gameObjectFileId);
            let parentName;
            if (transform) {
                const [_, transformData] = transform;
                if (transformData.parentFileId) {
                    const parentTransform = fileIdMap.transforms.get(transformData.parentFileId);
                    if (parentTransform) {
                        const parentGO = fileIdMap.gameObjects.get(parentTransform.gameObjectFileId);
                        parentName = parentGO?.name;
                    }
                }
            }
            result.push({
                name: gameObject.name,
                parent: parentName,
            });
        }
    }
    return result;
}
/**
 * Process removed components from variant info
 */
function processRemovedComponents(variantInfo, assetCache) {
    const result = [];
    for (const instance of variantInfo.prefabInstances) {
        for (const removed of instance.removedComponents) {
            // Format: "SourcePrefab:FileId" or resolve to component name if possible
            const prefabName = removed.targetGuid
                ? (assetCache[removed.targetGuid]?.name || 'Unknown')
                : 'Unknown';
            result.push(`${prefabName}:${removed.targetFileId}`);
        }
    }
    return result;
}
/**
 * Get GameObject names in hierarchy traversal order (depth-first)
 */
function getHierarchyOrder(nodes) {
    const order = [];
    function traverse(node) {
        order.push(node.name);
        if (node.children) {
            for (const child of node.children) {
                traverse(child);
            }
        }
    }
    for (const node of nodes) {
        traverse(node);
    }
    return order;
}
/**
 * Extract and process all components from parsed documents
 * Components are ordered to match hierarchy traversal order
 */
function extractComponents(documents, fileIdMap, assetCache, config, hierarchy) {
    const result = {};
    const componentsByGO = getComponentsByGameObject(fileIdMap);
    // Get hierarchy traversal order for sorting
    const hierarchyOrder = getHierarchyOrder(hierarchy);
    // Process transforms
    for (const doc of documents) {
        if (doc.className === 'Transform' || doc.className === 'RectTransform') {
            if (!config.includeTransform && doc.className === 'Transform') {
                continue;
            }
            // Skip if on blacklist or not on whitelist
            if (config.componentBlacklist.length > 0 && config.componentBlacklist.includes(doc.className)) {
                continue;
            }
            if (config.componentWhitelist.length > 0 && !config.componentWhitelist.includes(doc.className)) {
                continue;
            }
            const transform = fileIdMap.transforms.get(doc.fileId);
            if (!transform)
                continue;
            const gameObject = fileIdMap.gameObjects.get(transform.gameObjectFileId);
            if (!gameObject)
                continue;
            const goName = gameObject.name;
            if (!result[goName]) {
                result[goName] = {};
            }
            const resolvedData = resolveReferences(doc.data, doc.className, fileIdMap, assetCache, config);
            if (Object.keys(resolvedData).length > 0) {
                result[goName][doc.className] = resolvedData;
            }
        }
    }
    // Process other components
    for (const doc of documents) {
        // Skip non-component types
        if (['GameObject', 'Transform', 'RectTransform', 'PrefabInstance', 'PrefabModification'].includes(doc.className)) {
            continue;
        }
        // Skip if on blacklist or not on whitelist
        if (config.componentBlacklist.length > 0 && config.componentBlacklist.includes(doc.className)) {
            continue;
        }
        if (config.componentWhitelist.length > 0 && !config.componentWhitelist.includes(doc.className)) {
            continue;
        }
        const component = fileIdMap.components.get(doc.fileId);
        if (!component)
            continue;
        const gameObject = fileIdMap.gameObjects.get(component.gameObjectFileId);
        if (!gameObject)
            continue;
        // Skip disabled GameObjects if configured
        if (!config.includeDisabledObjects && !gameObject.active) {
            continue;
        }
        const goName = gameObject.name;
        if (!result[goName]) {
            result[goName] = {};
        }
        // Determine display name for the component
        let componentDisplayName = doc.className;
        // For MonoBehaviour, extract script name
        if (doc.className === 'MonoBehaviour') {
            const scriptRef = doc.data.m_Script;
            if (scriptRef && scriptRef.guid) {
                const scriptName = extractScriptName(scriptRef, assetCache, config);
                // Remove the " # MonoScript" comment for the component name
                componentDisplayName = scriptName.split('  #')[0];
            }
        }
        // Resolve references in component data
        const resolvedData = resolveReferences(doc.data, doc.className, fileIdMap, assetCache, config);
        // For MonoBehaviour, add script field at the top
        if (doc.className === 'MonoBehaviour') {
            const scriptRef = doc.data.m_Script;
            if (scriptRef && scriptRef.guid) {
                const scriptName = extractScriptName(scriptRef, assetCache, config);
                const scriptNameClean = scriptName.split('  #')[0]; // Remove type comment
                // Check if we should include the script field
                // In compact mode with removeRedundantScriptNames, skip if script name matches component display name
                const shouldIncludeScript = !(config.removeRedundantScriptNames &&
                    scriptNameClean === componentDisplayName);
                if (shouldIncludeScript) {
                    resolvedData.script = scriptName;
                }
                // Move script to the front (if included)
                const orderedData = {};
                if (shouldIncludeScript) {
                    orderedData.script = scriptName;
                }
                for (const [key, value] of Object.entries(resolvedData)) {
                    if (key !== 'script') {
                        orderedData[key] = value;
                    }
                }
                if (Object.keys(orderedData).length > 0) {
                    result[goName][componentDisplayName] = orderedData;
                }
            }
        }
        else if (Object.keys(resolvedData).length > 0) {
            result[goName][componentDisplayName] = resolvedData;
        }
    }
    // Remove empty GameObjects
    for (const goName of Object.keys(result)) {
        if (Object.keys(result[goName]).length === 0) {
            delete result[goName];
        }
    }
    // Sort result by hierarchy order
    const sortedResult = {};
    // First, add entries in hierarchy order
    for (const goName of hierarchyOrder) {
        if (result[goName]) {
            sortedResult[goName] = result[goName];
        }
    }
    // Then add any remaining entries not in hierarchy (shouldn't happen normally)
    for (const goName of Object.keys(result)) {
        if (!sortedResult[goName]) {
            sortedResult[goName] = result[goName];
        }
    }
    return sortedResult;
}
// Create MCP server
const server = new Server({
    name: 'unity-prefab-parser',
    version: '1.0.0',
}, {
    capabilities: {
        tools: {},
    },
});
// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: 'parse_unity_prefab',
            description: `Parse Unity prefab file and extract Inspector-visible component data in YAML format.
Automatically resolves asset names from GUIDs by scanning the project's .meta files.
Outputs a clean, hierarchical structure showing the GameObject tree and all component data.

IMPORTANT: Fields not shown in output have their default values or are null references.
- Transform: lPos (0,0,0), lRot (0,0,0,1), lScale (1,1,1) are omitted when default
- Null references and unresolved GUIDs are omitted
- enabled:true is omitted (only enabled:false is shown)

Features:
- Resolves script, material, sprite, and other asset references to human-readable names
- Filters out Unity internal fields (m_ObjectHideFlags, serializedVersion, etc.)
- Renames fields to match Unity Inspector names (m_LocalPosition -> localPosition)
- Supports configurable detail levels: minimal, standard, or compact
- Prefab Variant Support:
  * Auto-detects prefab variants and nested prefab instances
  * Shows variant_of field with base prefab name
  * Groups all modifications under base prefab name
  * Merges Vector3 properties (x, y, z -> single vector)
  * Filters default values and null references
  * Adds # + markers for variant modifications
- Compact mode optimizations (83% token reduction):
  * Short reference syntax (@Player instead of <GameObject:Player>)
  * Parentheses vector notation: (1, 2, 3) instead of {x:1, y:2, z:3}
  * Field abbreviations: lPos, lRot, lScale, trigger, order, mats
  * Inline simple components: {value: 42, active: true}
  * Omits null/Unknown references entirely
  * Omits enabled:true, default offsets, flipX/flipY:false
  * Removes redundant sortingLayerID (keeps sortingLayer)
  * Converts 0/1 to true/false for boolean fields
  * Converts bitmasks to layer arrays or 'all'
  * Simplifies Unity events to show method names`,
            inputSchema: {
                type: 'object',
                properties: {
                    filePath: {
                        type: 'string',
                        description: 'Absolute path to the .prefab file',
                    },
                    config: {
                        type: 'object',
                        description: 'Optional configuration (uses "standard" preset if omitted)',
                        properties: {
                            preset: {
                                type: 'string',
                                enum: ['minimal', 'standard', 'compact'],
                                description: 'Use a preset configuration: minimal (lowest detail), standard (balanced), compact (optimized for LLMs with up to 95% token reduction)',
                            },
                            resolveAssetNames: {
                                type: 'boolean',
                                description: 'Resolve GUIDs to asset names (default: true)',
                            },
                            showAssetTypes: {
                                type: 'boolean',
                                description: 'Show asset type as comment after resolved names (default: true)',
                            },
                            arrayMaxElements: {
                                type: 'number',
                                description: 'Maximum array elements to show before summarizing (default: 20)',
                            },
                            includeTransform: {
                                type: 'boolean',
                                description: 'Include Transform components (default: true)',
                            },
                            includeDisabledObjects: {
                                type: 'boolean',
                                description: 'Include disabled GameObjects (default: true)',
                            },
                            includeDefaultValues: {
                                type: 'boolean',
                                description: 'Include properties with default values (default: false)',
                            },
                            includeNullReferences: {
                                type: 'boolean',
                                description: 'Include null/empty references (default: false)',
                            },
                            componentWhitelist: {
                                type: 'array',
                                items: { type: 'string' },
                                description: 'Only include these component types (empty = all)',
                            },
                            componentBlacklist: {
                                type: 'array',
                                items: { type: 'string' },
                                description: 'Exclude these component types',
                            },
                        },
                    },
                },
                required: ['filePath'],
            },
        },
    ],
}));
// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === 'parse_unity_prefab') {
        const args = request.params.arguments;
        if (!args.filePath) {
            throw new McpError(ErrorCode.InvalidParams, 'filePath is required');
        }
        try {
            // Load configuration with preset support
            const config = loadConfig(args.config);
            // Parse the prefab
            const yamlOutput = await parsePrefab(args.filePath, config);
            return {
                content: [
                    {
                        type: 'text',
                        text: yamlOutput,
                    },
                ],
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new McpError(ErrorCode.InternalError, `Error parsing prefab: ${message}`);
        }
    }
    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
});
// Start the server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Unity Prefab Parser MCP Server running on stdio');
}
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map