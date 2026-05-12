#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';

import { loadConfig, type ParseConfig, type ParsedPrefab, type FileIdMap, type MetaFileCache, type HierarchyNode } from './config.js';
import { parseUnityYAML, type ParsedDocument } from './parser.js';
import { findProjectRootAsync, buildAssetCache } from './cache.js';
import { buildFileIdMap, buildGameObjectDisplayMap, buildHierarchy, getComponentInfo } from './hierarchy.js';
import { resolveReferences, extractScriptName, resolveReference } from './resolver.js';
import { FIELD_ABBREVIATIONS, isDefaultTransformValue } from './components.js';
import { formatYAMLWithComments } from './formatter.js';
import { 
  detectPrefabVariant, 
  mergeVectorProperties, 
  filterInternalModifications,
  getReadablePropertyName,
  type PrefabVariantInfo,
  type PropertyModification,
} from './variant.js';

// ---------------------------------------------------------------------------
// Global in-memory registry: projectPath → loaded MetaFileCache
// Populated by init_unity_project; used by parsePrefab to skip rescanning
// ---------------------------------------------------------------------------
const projectCacheRegistry = new Map<string, MetaFileCache>();

// ---------------------------------------------------------------------------
// Disk cache helpers
// ---------------------------------------------------------------------------

interface DiskCacheFile {
  projectPath: string;
  scannedAt: string;
  assetCount: number;
  assets: MetaFileCache;
}

const CACHE_FILENAME = '.unity-mcp-cache.json';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

async function loadDiskCache(projectPath: string): Promise<DiskCacheFile | null> {
  const cachePath = path.join(projectPath, CACHE_FILENAME);
  try {
    const raw = await fs.readFile(cachePath, 'utf-8');
    const data = JSON.parse(raw) as DiskCacheFile;
    return data;
  } catch {
    return null;
  }
}

async function saveDiskCache(projectPath: string, assets: MetaFileCache): Promise<string> {
  const cachePath = path.join(projectPath, CACHE_FILENAME);
  const data: DiskCacheFile = {
    projectPath,
    scannedAt: new Date().toISOString(),
    assetCount: Object.keys(assets).length,
    assets,
  };
  await fs.writeFile(cachePath, JSON.stringify(data, null, 2), 'utf-8');
  return cachePath;
}

function isCacheFresh(scannedAt: string): boolean {
  const age = Date.now() - new Date(scannedAt).getTime();
  return age < CACHE_MAX_AGE_MS;
}

/**
 * Main function to parse a Unity prefab file
 */
async function parsePrefab(filePath: string, config: ParseConfig): Promise<string> {
  // 1. Validate file path
  if (!filePath.endsWith('.prefab') && !filePath.endsWith('.unity') && !filePath.endsWith('.asset')) {
    throw new Error('File must be a .prefab, .unity, or .asset file');
  }
  
  // 2. Auto-detect Unity project root
  const projectRoot = await findProjectRootAsync(filePath);
  
  // 3. Load and parse the prefab file
  const documents = await parseUnityYAML(filePath);
  
  if (documents.length === 0) {
    throw new Error('No valid Unity objects found in file');
  }
  
  // 4. Build GUID → Name cache from .meta files (if project root found)
  // Prefer: in-memory registry → disk cache → live scan
  let assetCache: MetaFileCache = {};
  if (projectRoot && config.resolveAssetNames) {
    const registryCache = projectCacheRegistry.get(projectRoot);
    if (registryCache) {
      assetCache = registryCache;
    } else {
      const diskCache = await loadDiskCache(projectRoot);
      if (diskCache && isCacheFresh(diskCache.scannedAt)) {
        assetCache = diskCache.assets;
        projectCacheRegistry.set(projectRoot, assetCache);
      } else {
        assetCache = await buildAssetCache(projectRoot, config.cacheMetaFiles);
      }
    }
  }
  
  // 5. Check if this is a prefab variant
  const variantInfo = detectPrefabVariant(documents, assetCache);
  
  // 6. Build FileID → Object map
  const fileIdMap = buildFileIdMap(documents);
  
  // 7. Reconstruct GameObject hierarchy
  const hierarchy = buildHierarchy(fileIdMap, config.includeDisabledObjects);
  const displayMap = buildGameObjectDisplayMap(hierarchy);
  const prefabName = path.basename(filePath, path.extname(filePath));
  
  // 8. Extract and filter components (ordered by hierarchy)
  const components = extractComponents(documents, fileIdMap, assetCache, config, hierarchy, displayMap, prefabName);
  
  // 9. Format as YAML
  const parsedPrefab: ParsedPrefab = {
    prefab_name: prefabName,
    hierarchy,
    components,
  };
  
  // 10. Add variant information if applicable
  if (variantInfo) {
    parsedPrefab.variant_of = variantInfo.basePrefabName;
    
    // Process modifications from all prefab instances
    const allModifications = processVariantModifications(variantInfo, fileIdMap, assetCache, config, displayMap);
    if (Object.keys(allModifications).length > 0) {
      parsedPrefab.modifications = allModifications;
    }
    
    // Process added components
    const addedComponents = processAddedComponents(variantInfo, documents, fileIdMap, assetCache, config, displayMap);
    if (Object.keys(addedComponents).length > 0) {
      parsedPrefab.added_components = addedComponents;
    }
    
    // Process added GameObjects
    const addedGameObjects = processAddedGameObjects(variantInfo, fileIdMap, displayMap);
    if (addedGameObjects.length > 0) {
      parsedPrefab.added_gameobjects = addedGameObjects;
    }
    
    // Process removed components
    const removedComponents = processRemovedComponents(variantInfo, fileIdMap, assetCache, displayMap);
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
 * Preserves target GameObject/component identity for variant changes
 */
function processVariantModifications(
  variantInfo: PrefabVariantInfo,
  fileIdMap: FileIdMap,
  assetCache: MetaFileCache,
  config: ParseConfig,
  displayMap: Map<string, string>
): Record<string, Record<string, Record<string, unknown>>> {
  const result: Record<string, Record<string, Record<string, unknown>>> = {};

  for (const instance of variantInfo.prefabInstances) {
    // Filter out internal modifications
    const filtered = filterInternalModifications(instance.modifications);
    
    // Merge vector properties
    const merged = mergeVectorProperties(filtered);
    
    // Process all modifications under the base prefab name
    for (const [targetKey, properties] of merged) {
      const targetFileId = targetKey.includes(':') ? targetKey.split(':').pop() || '' : targetKey;
      const targetInfo = getVariantTargetInfo(targetFileId, fileIdMap, displayMap, variantInfo.basePrefabName);

      if (!result[targetInfo.gameObjectKey]) {
        result[targetInfo.gameObjectKey] = {};
      }
      
      // Group properties by component type (inferred from property path)
      for (const [propPath, value] of Object.entries(properties)) {
        // Skip null/empty values  
        if (value === null || value === undefined || value === '') continue;
        
        // Try to determine component type from property path
        const componentType = targetInfo.componentType || inferComponentType(propPath);
        
        if (!result[targetInfo.gameObjectKey][componentType]) {
          result[targetInfo.gameObjectKey][componentType] = {};
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
        if (formattedValue === null || formattedValue === 'null') continue;
        if (config.omitUnknownRefs && formattedValue === 'Unknown') continue;
        
        // Skip default values (position 0,0,0 / rotation 0,0,0,1 / scale 1,1,1)
        if (isDefaultTransformValue(fieldName, formattedValue)) continue;
        
        result[targetInfo.gameObjectKey][componentType][fieldName] = formattedValue;
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
function inferComponentType(propertyPath: string): string {
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
function formatModificationValue(
  value: unknown, 
  config: ParseConfig,
  assetCache: MetaFileCache
): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  
  // Check if it's an object
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    
    // Check if it's a Unity reference (has fileID)
    if ('fileID' in obj) {
      // Create a minimal fileIdMap for external references
      // (variant modifications are typically external asset refs)
      const emptyFileIdMap: FileIdMap = {
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
        const values: number[] = [];
        if ('x' in obj) values.push(obj.x as number);
        if ('y' in obj) values.push(obj.y as number);
        if ('z' in obj) values.push(obj.z as number);
        if ('w' in obj) values.push(obj.w as number);
        return `(${values.join(', ')})`;
      }
    }
  }
  
  return value;
}

/**
 * Process added components from variant info
 */
function processAddedComponents(
  variantInfo: PrefabVariantInfo,
  documents: ParsedDocument[],
  fileIdMap: FileIdMap,
  assetCache: MetaFileCache,
  config: ParseConfig,
  displayMap: Map<string, string>
): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};
  
  for (const instance of variantInfo.prefabInstances) {
    for (const added of instance.addedComponents) {
      // Find the component in documents
      const doc = documents.find(d => d.fileId === added.componentFileId);
      if (!doc) continue;
      
      // Get the target GameObject name
      const component = fileIdMap.components.get(added.componentFileId);
      const gameObject = component ? fileIdMap.gameObjects.get(component.gameObjectFileId) : null;
      const goName = gameObject
        ? getDisplayName(gameObject.name, component?.gameObjectFileId || '', displayMap)
        : 'Unknown';
      
      if (!result[goName]) {
        result[goName] = {};
      }
      
      // Get component display name
      let displayName = doc.className;
      if (doc.className === 'MonoBehaviour' && doc.data.m_Script) {
        const scriptRef = doc.data.m_Script as { guid?: string };
        if (scriptRef.guid) {
          const asset = assetCache[scriptRef.guid];
          if (asset) displayName = asset.name;
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
function processAddedGameObjects(
  variantInfo: PrefabVariantInfo,
  fileIdMap: FileIdMap,
  displayMap: Map<string, string>
): Array<{ name: string; parent?: string }> {
  const result: Array<{ name: string; parent?: string }> = [];
  
  for (const instance of variantInfo.prefabInstances) {
    for (const added of instance.addedGameObjects) {
      const gameObject = fileIdMap.gameObjects.get(added.gameObjectFileId);
      if (!gameObject) continue;
      
      // Try to find parent
      const transform = Array.from(fileIdMap.transforms.entries())
        .find(([_, t]) => t.gameObjectFileId === added.gameObjectFileId);
      
      let parentName: string | undefined;
      if (transform) {
        const [_, transformData] = transform;
        if (transformData.parentFileId) {
          const parentTransform = fileIdMap.transforms.get(transformData.parentFileId);
          if (parentTransform) {
            const parentGO = fileIdMap.gameObjects.get(parentTransform.gameObjectFileId);
            parentName = parentGO
              ? getDisplayName(parentGO.name, parentTransform.gameObjectFileId, displayMap)
              : undefined;
          }
        }
      }
      
      result.push({
        name: getDisplayName(gameObject.name, added.gameObjectFileId, displayMap),
        parent: parentName,
      });
    }
  }
  
  return result;
}

/**
 * Process removed components from variant info
 */
function processRemovedComponents(
  variantInfo: PrefabVariantInfo,
  fileIdMap: FileIdMap,
  assetCache: MetaFileCache,
  displayMap: Map<string, string>
): string[] {
  const result: string[] = [];
  
  for (const instance of variantInfo.prefabInstances) {
    for (const removed of instance.removedComponents) {
      const componentInfo = getComponentInfo(removed.targetFileId, fileIdMap);
      if (componentInfo) {
        const ownerFileId = getOwningGameObjectFileId(removed.targetFileId, fileIdMap);
        const goName = getDisplayName(componentInfo.gameObjectName, ownerFileId, displayMap);
        result.push(`${goName}.${componentInfo.type}`);
        continue;
      }

      const prefabName = removed.targetGuid
        ? (assetCache[removed.targetGuid]?.name || variantInfo.basePrefabName || 'Unknown')
        : (variantInfo.basePrefabName || 'Unknown');

      result.push(`${prefabName}.${removed.targetFileId}`);
    }
  }
  
  return result;
}

/**
 * Get GameObject names in hierarchy traversal order (depth-first)
 */
function getHierarchyOrder(nodes: HierarchyNode[], displayMap: Map<string, string>): string[] {
  const order: string[] = [];
  
  function traverse(node: HierarchyNode): void {
    order.push(node.fileId ? getDisplayName(node.name, node.fileId, displayMap) : node.name);
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
function extractComponents(
  documents: ParsedDocument[],
  fileIdMap: FileIdMap,
  assetCache: MetaFileCache,
  config: ParseConfig,
  hierarchy: HierarchyNode[],
  displayMap: Map<string, string>,
  rootAssetName: string
): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};
  
  // Get hierarchy traversal order for sorting
  const hierarchyOrder = getHierarchyOrder(hierarchy, displayMap);
  
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
      if (!transform) continue;
      
      const gameObject = fileIdMap.gameObjects.get(transform.gameObjectFileId);
      if (!gameObject) continue;
      
      const goName = getDisplayName(gameObject.name, transform.gameObjectFileId, displayMap);
      
      if (!result[goName]) {
        result[goName] = {};
      }
      
      const resolvedData = resolveReferences(
        doc.data,
        doc.className,
        fileIdMap,
        assetCache,
        config
      );
      
      if (Object.keys(resolvedData).length > 0) {
        result[goName][doc.className] = resolvedData;
      }
    }
  }

  if (Object.keys(result).length === 0 && hierarchy.length === 0) {
    const assetComponents: Record<string, unknown> = {};

    for (const doc of documents) {
      if (['PrefabInstance', 'PrefabModification'].includes(doc.className)) {
        continue;
      }

      if (config.componentBlacklist.length > 0 && config.componentBlacklist.includes(doc.className)) {
        continue;
      }
      if (config.componentWhitelist.length > 0 && !config.componentWhitelist.includes(doc.className)) {
        continue;
      }

      let componentDisplayName = doc.className;
      if (doc.className === 'MonoBehaviour') {
        const scriptRef = doc.data.m_Script as Record<string, unknown> | undefined;
        if (scriptRef?.guid) {
          componentDisplayName = extractScriptName(scriptRef, assetCache, config).split('  #')[0];
        }
      }

      const resolvedData = resolveReferences(doc.data, doc.className, fileIdMap, assetCache, config);
      if (Object.keys(resolvedData).length > 0) {
        assetComponents[componentDisplayName] = resolvedData;
      }
    }

    if (Object.keys(assetComponents).length > 0) {
      result[rootAssetName] = assetComponents;
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
    if (!component) continue;
    
    const gameObject = fileIdMap.gameObjects.get(component.gameObjectFileId);
    if (!gameObject) continue;
    
    // Skip disabled GameObjects if configured
    if (!config.includeDisabledObjects && !gameObject.active) {
      continue;
    }
    
    const goName = getDisplayName(gameObject.name, component.gameObjectFileId, displayMap);
    
    if (!result[goName]) {
      result[goName] = {};
    }
    
    // Determine display name for the component
    let componentDisplayName = doc.className;
    
    // For MonoBehaviour, extract script name
    if (doc.className === 'MonoBehaviour') {
      const scriptRef = doc.data.m_Script as Record<string, unknown> | undefined;
      if (scriptRef && scriptRef.guid) {
        const scriptName = extractScriptName(scriptRef, assetCache, config);
        // Remove the " # MonoScript" comment for the component name
        componentDisplayName = scriptName.split('  #')[0];
      }
    }
    
    // Resolve references in component data
    const resolvedData = resolveReferences(
      doc.data,
      doc.className,
      fileIdMap,
      assetCache,
      config
    );
    
    // For MonoBehaviour, add script field at the top
    if (doc.className === 'MonoBehaviour') {
      const scriptRef = doc.data.m_Script as Record<string, unknown> | undefined;
      if (scriptRef && scriptRef.guid) {
        const scriptName = extractScriptName(scriptRef, assetCache, config);
        const scriptNameClean = scriptName.split('  #')[0]; // Remove type comment
        
        // Check if we should include the script field
        // In compact mode with removeRedundantScriptNames, skip if script name matches component display name
        const shouldIncludeScript = !(
          config.removeRedundantScriptNames && 
          scriptNameClean === componentDisplayName
        );
        
        if (shouldIncludeScript) {
          resolvedData.script = scriptName;
        }
        
        // Move script to the front (if included)
        const orderedData: Record<string, unknown> = {};
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
    } else if (Object.keys(resolvedData).length > 0) {
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
  const sortedResult: Record<string, Record<string, unknown>> = {};
  
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
const server = new Server(
  {
    name: 'unity-prefab-parser',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'init_unity_project',
      description: `Initialize a Unity project for use with this MCP. Scans all .meta files to build a GUID→asset name cache, enabling full asset name resolution in parse_unity_file.

WORKFLOW: Call this ONCE per project before using parse_unity_file or browse_unity_project. The cache is saved to .unity-mcp-cache.json in the project root and reused automatically.

For large projects (100GB+), this may take 10-30 seconds but only needs to run once per session or when assets change significantly.`,
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: {
            type: 'string',
            description: 'Path to Unity project root (the folder containing Assets/, ProjectSettings/, etc.). Required.',
          },
          force: {
            type: 'boolean',
            description: 'Force rescan even if cache exists. Default: false.',
          },
        },
        required: ['projectPath'],
      },
    },
    {
      name: 'browse_unity_project',
      description: `Browse the Unity project folder tree with asset counts. Use this to navigate large projects and find the subfolder containing the assets you want to work with.

WORKFLOW:
1. init_unity_project (once)
2. browse_unity_project (navigate to the right folder)
3. list_unity_assets (list assets in that folder)
4. parse_unity_file (parse specific assets)`,
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: {
            type: 'string',
            description: 'Unity project root path (must have been initialized with init_unity_project first, or will auto-init).',
          },
          subPath: {
            type: 'string',
            description: 'Subfolder to browse relative to Assets/. Omit to browse Assets/ root.',
          },
          depth: {
            type: 'number',
            description: 'How many folder levels to show. Default: 2.',
          },
        },
        required: ['projectPath'],
      },
    },
    {
      name: 'parse_unity_file',
      description: `Parse a Unity text-serialized prefab, scene, or asset file and extract Inspector-visible component data in YAML format.

WORKFLOW: For best results with asset name resolution, call init_unity_project first. If already initialized, the cache is loaded automatically.

Automatically resolves asset names from GUIDs by scanning the project's .meta files (or using the initialized cache).
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
            description: 'Absolute path to the .prefab, .unity, or .asset file',
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
    {
      name: 'parse_unity_prefab',
      description: `Deprecated alias for parse_unity_file. Use parse_unity_file for new clients.

WORKFLOW: For best results with asset name resolution, call init_unity_project first. If already initialized, the cache is loaded automatically.`,
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Absolute path to the .prefab, .unity, or .asset file',
          },
          config: {
            type: 'object',
            description: 'Optional configuration (uses "standard" preset if omitted)',
          },
        },
        required: ['filePath'],
      },
    },
    {
      name: 'list_unity_assets',
      description: 'Scan a directory for Unity asset files (.prefab, .unity, .asset) and return a grouped list with absolute paths ready to use with parse_unity_file.',
      inputSchema: {
        type: 'object',
        properties: {
          directory: {
            type: 'string',
            description: 'Directory to scan. Can be a Unity project root, an Assets folder, or any subfolder. If omitted, uses current working directory.',
          },
          type: {
            type: 'string',
            enum: ['prefab', 'unity', 'asset', 'all'],
            description: 'Filter by file type. Default: all',
          },
          recursive: {
            type: 'boolean',
            description: 'Search recursively. Default: true',
          },
          search: {
            type: 'string',
            description: 'Filter assets by name (case-insensitive substring). E.g. "enemy" returns EnemyBat.prefab, EnemyWolf.prefab etc.',
          },
          exact: {
            type: 'boolean',
            description: 'When true, only match files whose name (without extension) exactly equals the search term. E.g. search:"bat" exact:true returns Bat.prefab, BatPF.prefab but NOT CombatText.prefab. Default: false.',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results to return. Default: 50.',
          },
        },
        required: [],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {

  // -------------------------------------------------------------------------
  // init_unity_project
  // -------------------------------------------------------------------------
  if (request.params.name === 'init_unity_project') {
    const args = request.params.arguments as {
      projectPath: string;
      force?: boolean;
    };

    if (!args.projectPath) {
      throw new McpError(ErrorCode.InvalidParams, 'projectPath is required');
    }

    const projectPath = path.resolve(args.projectPath);

    // Validate Assets/ folder exists
    const assetsDir = path.join(projectPath, 'Assets');
    try {
      const stat = await fs.stat(assetsDir);
      if (!stat.isDirectory()) {
        throw new McpError(ErrorCode.InvalidParams, `${assetsDir} exists but is not a directory`);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new McpError(ErrorCode.InvalidParams, `Not a Unity project root — Assets/ folder not found at: ${assetsDir}`);
      }
      throw err;
    }

    // Check existing cache freshness (unless force)
    if (!args.force) {
      const existing = await loadDiskCache(projectPath);
      if (existing && isCacheFresh(existing.scannedAt)) {
        // Load into registry so subsequent calls benefit
        projectCacheRegistry.set(projectPath, existing.assets);
        const cacheFile = path.join(projectPath, CACHE_FILENAME);
        return {
          content: [{
            type: 'text',
            text: [
              `status: already_initialized`,
              `projectPath: ${projectPath}`,
              `assetCount: ${existing.assetCount}`,
              `scannedAt: ${existing.scannedAt}`,
              `cacheFile: ${cacheFile}`,
              ``,
              `# Cache is less than 24 hours old. Use force: true to rescan.`,
            ].join('\n'),
          }],
        };
      }
    }

    // Run the scan
    const startMs = Date.now();
    try {
      const assets = await buildAssetCache(projectPath, false); // false = bypass in-memory cache, do fresh scan
      const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);

      // Save to disk
      const cacheFile = await saveDiskCache(projectPath, assets);

      // Register in memory
      projectCacheRegistry.set(projectPath, assets);

      const assetCount = Object.keys(assets).length;
      return {
        content: [{
          type: 'text',
          text: [
            `status: initialized`,
            `projectPath: ${projectPath}`,
            `assetCount: ${assetCount}`,
            `timeTaken: ${elapsed}s`,
            `cacheFile: ${cacheFile}`,
            ``,
            `# Cache saved. Subsequent parse_unity_file calls will use this cache automatically.`,
          ].join('\n'),
        }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new McpError(ErrorCode.InternalError, `Error initializing project: ${message}`);
    }
  }

  // -------------------------------------------------------------------------
  // browse_unity_project
  // -------------------------------------------------------------------------
  if (request.params.name === 'browse_unity_project') {
    const args = request.params.arguments as {
      projectPath: string;
      subPath?: string;
      depth?: number;
    };

    if (!args.projectPath) {
      throw new McpError(ErrorCode.InvalidParams, 'projectPath is required');
    }

    const projectPath = path.resolve(args.projectPath);
    const depth = typeof args.depth === 'number' ? Math.max(1, args.depth) : 2;

    // Build the root browse path
    const browseRoot = args.subPath
      ? path.join(projectPath, 'Assets', args.subPath)
      : path.join(projectPath, 'Assets');

    // Validate it exists
    try {
      const stat = await fs.stat(browseRoot);
      if (!stat.isDirectory()) {
        throw new McpError(ErrorCode.InvalidParams, `Path is not a directory: ${browseRoot}`);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new McpError(ErrorCode.InvalidParams, `Directory not found: ${browseRoot}`);
      }
      throw err;
    }

    // Recursively count assets in a directory
    async function countAssets(dir: string): Promise<{ prefab: number; unity: number; asset: number }> {
      const [prefabs, scenes, assets] = await Promise.all([
        glob('**/*.prefab', { cwd: dir, nodir: true }),
        glob('**/*.unity', { cwd: dir, nodir: true }),
        glob('**/*.asset', { cwd: dir, nodir: true }),
      ]);
      return { prefab: prefabs.length, unity: scenes.length, asset: assets.length };
    }

    // Build tree lines recursively
    async function buildTree(
      dir: string,
      currentDepth: number,
      prefix: string,
      isLast: boolean,
    ): Promise<string[]> {
      const lines: string[] = [];

      // Read immediate children (directories only)
      let entries: string[];
      try {
        const dirents = await fs.readdir(dir, { withFileTypes: true });
        entries = dirents
          .filter(d => d.isDirectory() && !d.name.startsWith('.'))
          .map(d => d.name)
          .sort();
      } catch {
        return lines;
      }

      for (let i = 0; i < entries.length; i++) {
        const name = entries[i];
        const childPath = path.join(dir, name);
        const childIsLast = i === entries.length - 1;
        const connector = childIsLast ? '└── ' : '├── ';
        const childPrefix = prefix + (childIsLast ? '    ' : '│   ');

        // Count assets in this subtree
        const counts = await countAssets(childPath);
        const total = counts.prefab + counts.unity + counts.asset;

        // Build count label
        const parts: string[] = [];
        if (counts.prefab > 0) parts.push(`${counts.prefab} prefab${counts.prefab !== 1 ? 's' : ''}`);
        if (counts.unity > 0) parts.push(`${counts.unity} scene${counts.unity !== 1 ? 's' : ''}`);
        if (counts.asset > 0) parts.push(`${counts.asset} asset${counts.asset !== 1 ? 's' : ''}`);
        const label = parts.length > 0 ? `  (${parts.join(', ')})` : '';

        lines.push(`${prefix}${connector}${name}/${label}`);
        lines.push(`  # abs: ${childPath}`);

        // Recurse if within depth
        if (currentDepth < depth) {
          const childLines = await buildTree(childPath, currentDepth + 1, childPrefix, childIsLast);
          lines.push(...childLines);
        }
      }

      return lines;
    }

    try {
      const rootLabel = args.subPath ? `Assets/${args.subPath}/` : 'Assets/';
      const rootCounts = await countAssets(browseRoot);
      const rootParts: string[] = [];
      if (rootCounts.prefab > 0) rootParts.push(`${rootCounts.prefab} prefabs`);
      if (rootCounts.unity > 0) rootParts.push(`${rootCounts.unity} scenes`);
      if (rootCounts.asset > 0) rootParts.push(`${rootCounts.asset} assets`);
      const rootLabel2 = rootParts.length > 0 ? `${rootLabel}  (${rootParts.join(', ')} total)` : rootLabel;

      const treeLines = await buildTree(browseRoot, 1, '', false);

      const output = [
        rootLabel2,
        ...treeLines,
        '',
        `# Showing ${depth} level(s). Use depth param to see more.`,
        `# Pass a folder's abs path to list_unity_assets to list its files.`,
      ].join('\n');

      return { content: [{ type: 'text', text: output }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new McpError(ErrorCode.InternalError, `Error browsing project: ${message}`);
    }
  }

  // -------------------------------------------------------------------------
  // list_unity_assets
  // -------------------------------------------------------------------------
   if (request.params.name === 'list_unity_assets') {
    const args = request.params.arguments as {
      directory?: string;
      type?: 'prefab' | 'unity' | 'asset' | 'all';
      recursive?: boolean;
      search?: string;
      exact?: boolean;
      limit?: number;
    };

    const scanDir = path.resolve(args.directory || process.cwd());
    const fileType = args.type || 'all';
    const recursive = args.recursive !== false; // default true
    const searchTerm = args.search ? args.search.toLowerCase() : null;
    const exactMatch = args.exact === true;
    const limit = typeof args.limit === 'number' ? args.limit : 50;

    // Build glob patterns based on requested type
    const patterns: string[] = [];
    const globOpts = { cwd: scanDir, nodir: true, absolute: true };

    if (fileType === 'all' || fileType === 'prefab') {
      patterns.push(recursive ? '**/*.prefab' : '*.prefab');
    }
    if (fileType === 'all' || fileType === 'unity') {
      patterns.push(recursive ? '**/*.unity' : '*.unity');
    }
    if (fileType === 'all' || fileType === 'asset') {
      patterns.push(recursive ? '**/*.asset' : '*.asset');
    }

    try {
      // Run all globs in parallel
      const results = await Promise.all(patterns.map(p => glob(p, globOpts)));
      let allFiles = results.flat().sort();

      // Apply search filter
      if (searchTerm) {
        allFiles = allFiles.filter(f => {
          const basename = path.basename(f);
          const stem = basename.replace(/\.(prefab|unity|asset)$/i, '');
          if (exactMatch) {
            // Word-boundary match: search term must appear at start or after a separator (_  - space),
            // followed by end-of-string, separator, digit, or uppercase (camelCase boundary) — not lowercase.
            // e.g. "bat" matches: Bat, BatPF, Bat_cave, pf_base_bat — but NOT Combat, CombatText, Battery
            const matchRe = new RegExp(`(^|[_\\s\\-])${searchTerm}`, 'i');
            const m = stem.match(matchRe);
            if (!m) return false;
            const afterIdx = (m.index ?? 0) + m[0].length;
            const nextChar = stem[afterIdx];
            return !nextChar || /[_\s\-0-9A-Z]/.test(nextChar);
          }
          return basename.toLowerCase().includes(searchTerm);
        });
      }

      const totalCount = allFiles.length;
      const truncated = totalCount > limit;
      const displayFiles = truncated ? allFiles.slice(0, limit) : allFiles;

      // Group by extension
      const grouped: Record<string, string[]> = { prefab: [], unity: [], asset: [] };
      for (const absPath of displayFiles) {
        const ext = path.extname(absPath).slice(1);
        if (grouped[ext]) {
          grouped[ext].push(absPath);
        }
      }

      // Build YAML-style output
      const lines: string[] = [
        `scanned: ${scanDir}`,
        `total: ${totalCount}${truncated ? ` (showing first ${limit})` : ''}`,
        '',
      ];

      if (searchTerm) {
        lines.splice(2, 0, `search: "${args.search}"`);
      }

      for (const [ext, files] of Object.entries(grouped)) {
        if (files.length === 0) continue;
        lines.push(`${ext}: # ${files.length} file${files.length !== 1 ? 's' : ''}`);
        for (const absPath of files) {
          const rel = path.relative(scanDir, absPath);
          lines.push(`  - path: ${absPath}`);
          lines.push(`    rel:  ${rel}`);
        }
        lines.push('');
      }

      if (totalCount === 0) {
        lines.push('# No matching files found.');
      } else if (truncated) {
        lines.push(`# ${totalCount - limit} more files not shown. Use limit param or narrow with search/type.`);
      }

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new McpError(ErrorCode.InternalError, `Error scanning directory: ${message}`);
    }
  }

  if (request.params.name === 'parse_unity_prefab' || request.params.name === 'parse_unity_file') {
    const args = request.params.arguments as {
      filePath: string;
      config?: Partial<ParseConfig>;
    };
    
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new McpError(ErrorCode.InternalError, `Error parsing prefab: ${message}`);
    }
  }
  
  throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
});

function getDisplayName(name: string, fileId: string, displayMap: Map<string, string>): string {
  return displayMap.get(fileId) || name;
}

function getVariantTargetInfo(
  targetFileId: string,
  fileIdMap: FileIdMap,
  displayMap: Map<string, string>,
  fallbackName: string
): { gameObjectKey: string; componentType?: string } {
  if (fileIdMap.gameObjects.has(targetFileId)) {
    const gameObject = fileIdMap.gameObjects.get(targetFileId)!;
    return {
      gameObjectKey: getDisplayName(gameObject.name, targetFileId, displayMap),
      componentType: 'GameObject',
    };
  }

  const componentInfo = getComponentInfo(targetFileId, fileIdMap);
  if (componentInfo) {
    const ownerFileId = getOwningGameObjectFileId(targetFileId, fileIdMap);

    return {
      gameObjectKey: getDisplayName(componentInfo.gameObjectName, ownerFileId, displayMap),
      componentType: componentInfo.type,
    };
  }

  return {
    gameObjectKey: fallbackName || 'Unknown',
  };
}

function getOwningGameObjectFileId(targetFileId: string, fileIdMap: FileIdMap): string {
  const component = fileIdMap.components.get(targetFileId);
  if (component) {
    return component.gameObjectFileId;
  }

  const transform = fileIdMap.transforms.get(targetFileId);
  if (transform) {
    return transform.gameObjectFileId;
  }

  return targetFileId;
}

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
