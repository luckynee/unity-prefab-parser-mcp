import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import type { MetaFileCache, MetaFileCacheEntry } from './config.js';

// Well-known Unity built-in asset GUIDs (these have no .meta files)
const UNITY_BUILTIN_ASSETS: MetaFileCache = {
  '0000000000000000f000000000000000': { name: 'Sprites-Default', type: 'Material', path: 'Built-in' },
  '0000000000000000e000000000000000': { name: 'Default-Material', type: 'Material', path: 'Built-in' },
  '0000000000000000d000000000000000': { name: 'Default-Diffuse', type: 'Material', path: 'Built-in' },
  '0000000000000000c000000000000000': { name: 'Default-Skybox', type: 'Material', path: 'Built-in' },
  '10000000000000000000000000000000': { name: 'Default-Particle', type: 'Material', path: 'Built-in' },
};

// Map Unity's importer types to readable asset type names
const IMPORTER_TYPE_MAP: Record<string, string> = {
  'MonoImporter': 'MonoScript',
  'NativeFormatImporter': 'Asset',
  'TextureImporter': 'Texture2D',
  'ModelImporter': 'Model',
  'AudioImporter': 'AudioClip',
  'DefaultImporter': 'Asset',
  'PrefabImporter': 'Prefab',
  'ShaderImporter': 'Shader',
  'VideoClipImporter': 'VideoClip',
  'TrueTypeFontImporter': 'Font',
  'TextScriptImporter': 'TextAsset',
  'SpritAtlasImporter': 'SpriteAtlas',
};

// Map file extensions to asset types
const EXTENSION_TYPE_MAP: Record<string, string> = {
  '.cs': 'MonoScript',
  '.js': 'MonoScript',
  '.boo': 'MonoScript',
  '.shader': 'Shader',
  '.cginc': 'ShaderInclude',
  '.hlsl': 'ShaderInclude',
  '.mat': 'Material',
  '.prefab': 'Prefab',
  '.unity': 'Scene',
  '.asset': 'ScriptableObject',
  '.controller': 'RuntimeAnimatorController',
  '.overrideController': 'AnimatorOverrideController',
  '.anim': 'AnimationClip',
  '.mask': 'AvatarMask',
  '.png': 'Sprite',
  '.jpg': 'Sprite',
  '.jpeg': 'Sprite',
  '.tga': 'Sprite',
  '.psd': 'Sprite',
  '.gif': 'Sprite',
  '.bmp': 'Sprite',
  '.tif': 'Sprite',
  '.tiff': 'Sprite',
  '.exr': 'Texture2D',
  '.hdr': 'Texture2D',
  '.mp3': 'AudioClip',
  '.wav': 'AudioClip',
  '.ogg': 'AudioClip',
  '.aiff': 'AudioClip',
  '.mp4': 'VideoClip',
  '.mov': 'VideoClip',
  '.webm': 'VideoClip',
  '.fbx': 'Model',
  '.obj': 'Model',
  '.dae': 'Model',
  '.blend': 'Model',
  '.3ds': 'Model',
  '.ttf': 'Font',
  '.otf': 'Font',
  '.fontsettings': 'Font',
  '.txt': 'TextAsset',
  '.json': 'TextAsset',
  '.xml': 'TextAsset',
  '.bytes': 'TextAsset',
  '.html': 'TextAsset',
  '.htm': 'TextAsset',
  '.physicMaterial': 'PhysicMaterial',
  '.physicsMaterial2D': 'PhysicsMaterial2D',
  '.flare': 'Flare',
  '.renderTexture': 'RenderTexture',
  '.cubemap': 'Cubemap',
  '.lighting': 'LightingSettings',
  '.guiskin': 'GUISkin',
  '.mixer': 'AudioMixer',
  '.playable': 'PlayableAsset',
  '.signal': 'SignalAsset',
  '.brush': 'Brush',
  '.spriteatlas': 'SpriteAtlas',
  '.spriteatlasv2': 'SpriteAtlas',
  '.terrainlayer': 'TerrainLayer',
  '.giparams': 'LightmapParameters',
};

// In-memory cache singleton
let globalCache: MetaFileCache | null = null;
let cachedProjectRoot: string | null = null;

/**
 * Find the Unity project root from a file path
 * Looks for the Assets folder and returns its parent directory
 */
export function findProjectRoot(filePath: string): string | null {
  let current = path.dirname(path.resolve(filePath));
  const root = path.parse(current).root;
  
  while (current !== root) {
    const assetsPath = path.join(current, 'Assets');
    
    try {
      // Check if Assets folder exists synchronously would be better,
      // but we're in an async context anyway
      const stat = require('fs').statSync(assetsPath);
      if (stat.isDirectory()) {
        return current;
      }
    } catch {
      // Continue searching
    }
    
    current = path.dirname(current);
  }
  
  return null;
}

/**
 * Find project root (async version)
 */
export async function findProjectRootAsync(filePath: string): Promise<string | null> {
  let current = path.dirname(path.resolve(filePath));
  const root = path.parse(current).root;
  
  while (current !== root) {
    const assetsPath = path.join(current, 'Assets');
    
    try {
      const stat = await fs.stat(assetsPath);
      if (stat.isDirectory()) {
        return current;
      }
    } catch {
      // Continue searching
    }
    
    current = path.dirname(current);
  }
  
  return null;
}

/**
 * Get asset type from meta file content and file extension
 */
function getAssetType(metaContent: string, assetPath: string): string {
  // Try to get importer type from meta content
  const importerMatch = metaContent.match(/^(\w+Importer):$/m);
  if (importerMatch) {
    const importerType = importerMatch[1];
    if (IMPORTER_TYPE_MAP[importerType]) {
      return IMPORTER_TYPE_MAP[importerType];
    }
  }
  
  // Fall back to extension-based type detection
  const ext = path.extname(assetPath).toLowerCase();
  return EXTENSION_TYPE_MAP[ext] || 'Asset';
}

/**
 * Extract GUID from meta file content
 */
function extractGuid(metaContent: string): string | null {
  const guidMatch = metaContent.match(/guid:\s*([a-f0-9]+)/);
  return guidMatch ? guidMatch[1] : null;
}

/**
 * Build the GUID to asset name cache from all .meta files in the project
 */
export async function buildAssetCache(
  projectRoot: string,
  useCache: boolean = true
): Promise<MetaFileCache> {
  // Return cached version if available
  if (useCache && globalCache && cachedProjectRoot === projectRoot) {
    return globalCache;
  }
  
  const cache: MetaFileCache = { ...UNITY_BUILTIN_ASSETS };
  const assetsDir = path.join(projectRoot, 'Assets');
  
  try {
    // Find all .meta files
    const metaFiles = await glob('**/*.meta', {
      cwd: assetsDir,
      nodir: true,
      absolute: false,
    });
    
    // Process in parallel for speed
    const batchSize = 100;
    for (let i = 0; i < metaFiles.length; i += batchSize) {
      const batch = metaFiles.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (metaFile) => {
        try {
          const metaPath = path.join(assetsDir, metaFile);
          const content = await fs.readFile(metaPath, 'utf-8');
          
          const guid = extractGuid(content);
          if (!guid) return;
          
          const assetPath = metaFile.replace(/\.meta$/, '');
          const assetName = path.basename(assetPath, path.extname(assetPath));
          const assetType = getAssetType(content, assetPath);
          
          cache[guid] = {
            name: assetName,
            type: assetType,
            path: assetPath,
          };
        } catch {
          // Skip unreadable files
        }
      }));
    }
    
    // Also look for Packages folder for package assets
    const packagesDir = path.join(projectRoot, 'Packages');
    try {
      const stat = await fs.stat(packagesDir);
      if (stat.isDirectory()) {
        const packageMetaFiles = await glob('**/*.meta', {
          cwd: packagesDir,
          nodir: true,
          absolute: false,
        });
        
        for (let i = 0; i < packageMetaFiles.length; i += batchSize) {
          const batch = packageMetaFiles.slice(i, i + batchSize);
          
          await Promise.all(batch.map(async (metaFile) => {
            try {
              const metaPath = path.join(packagesDir, metaFile);
              const content = await fs.readFile(metaPath, 'utf-8');
              
              const guid = extractGuid(content);
              if (!guid) return;
              
              const assetPath = metaFile.replace(/\.meta$/, '');
              const assetName = path.basename(assetPath, path.extname(assetPath));
              const assetType = getAssetType(content, assetPath);
              
              cache[guid] = {
                name: assetName,
                type: assetType,
                path: `Packages/${assetPath}`,
              };
            } catch {
              // Skip unreadable files
            }
          }));
        }
      }
    } catch {
      // No Packages folder
    }
    
    // Cache the result
    if (useCache) {
      globalCache = cache;
      cachedProjectRoot = projectRoot;
    }
    
    return cache;
  } catch (error) {
    console.error('Error building asset cache:', error);
    return cache;
  }
}

/**
 * Clear the cached asset data
 */
export function clearCache(): void {
  globalCache = null;
  cachedProjectRoot = null;
}

/**
 * Resolve a GUID to asset information
 */
export function resolveGuid(
  guid: string,
  cache: MetaFileCache
): MetaFileCacheEntry | null {
  return cache[guid] || null;
}

/**
 * Format an asset reference for output
 */
export function formatAssetReference(
  guid: string,
  cache: MetaFileCache,
  showType: boolean = true
): string {
  const asset = cache[guid];
  
  if (!asset) {
    return showType ? `Unknown  # guid:${guid}` : 'Unknown';
  }
  
  return showType ? `${asset.name}  # ${asset.type}` : asset.name;
}
