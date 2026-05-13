import * as fs from 'fs/promises';
import * as YAML from 'yaml';

// Unity YAML uses custom tags like !u!1, !u!4, etc.
// These correspond to Unity class IDs

const UNITY_CLASS_IDS: Record<string, string> = {
  '1': 'GameObject',
  '4': 'Transform',
  '20': 'Camera',
  '21': 'Material',
  '23': 'MeshRenderer',
  '25': 'Renderer',
  '28': 'Texture2D',
  '33': 'MeshFilter',
  '43': 'Mesh',
  '48': 'Shader',
  '49': 'TextAsset',
  '50': 'Rigidbody2D',
  '54': 'Rigidbody',
  '58': 'CircleCollider2D',
  '60': 'PolygonCollider2D',
  '61': 'BoxCollider2D',
  '62': 'PhysicsMaterial2D',
  '64': 'MeshCollider',
  '65': 'BoxCollider',
  '68': 'EdgeCollider2D',
  '70': 'CapsuleCollider2D',
  '82': 'AudioSource',
  '83': 'AudioClip',
  '84': 'RenderTexture',
  '91': 'AnimatorController',
  '93': 'RuntimeAnimatorController',
  '95': 'Animator',
  '102': 'TextMesh',
  '108': 'Light',
  '109': 'SkinnedMeshRenderer',
  '111': 'Animation',
  '114': 'MonoBehaviour',
  '115': 'MonoScript',
  '119': 'LODGroup',
  '120': 'LineRenderer',
  '121': 'SpriteRenderer',
  '128': 'Font',
  '131': 'ParticleSystem',
  '132': 'TrailRenderer',
  '135': 'SphereCollider',
  '136': 'CapsuleCollider',
  '137': 'SkinnedMeshFilter',
  '183': 'SpriteMask',
  '198': 'ParticleSystemRenderer',
  '199': 'ShaderVariantCollection',
  '212': 'SpriteAtlas',
  '213': 'Sprite',
  '220': 'NavMeshAgent',
  '222': 'PhysicMaterial',
  '223': 'Canvas',
  '224': 'RectTransform',
  '225': 'CanvasGroup',
  '226': 'BillboardRenderer',
  '227': 'CanvasScaler',
  '228': 'GraphicRaycaster',
  '229': 'ContentSizeFitter',
  '230': 'AspectRatioFitter',
  '231': 'LayoutElement',
  '232': 'Button',
  '233': 'Toggle',
  '234': 'Image',
  '235': 'Text',
  '236': 'RawImage',
  '237': 'Scrollbar',
  '238': 'ScrollRect',
  '239': 'Slider',
  '240': 'DropDown',
  '241': 'InputField',
  '244': 'HorizontalLayoutGroup',
  '245': 'VerticalLayoutGroup',
  '246': 'GridLayoutGroup',
  '258': 'EventSystem',
  '259': 'StandaloneInputModule',
  '326': 'Terrain',
  '328': 'WindZone',
  '1001': 'PrefabInstance',
  '1002': 'EditorExtensionImpl',
};

export interface ParsedDocument {
  tag: string;
  classId: string;
  fileId: string;
  className: string;
  data: Record<string, unknown>;
}

/**
 * Parse a Unity YAML file (prefab or scene)
 * Unity YAML files contain multiple YAML documents separated by ---
 * Each document has a tag like !u!1 &12345678 where 1 is the class ID and 12345678 is the file ID
 */
export async function parseUnityYAML(filePath: string): Promise<ParsedDocument[]> {
  const buffer = await fs.readFile(filePath);

  if (isBinaryContent(buffer)) {
    throw new Error(
      'Unity asset appears to be binary. Switch Unity Asset Serialization Mode to Force Text before parsing this file.'
    );
  }

  const content = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  return parseUnityYAMLContent(content);
}

/**
 * Parse Unity YAML content string
 */
export function parseUnityYAMLContent(content: string): ParsedDocument[] {
  const documents: ParsedDocument[] = [];
  
  // Split into documents by the Unity document separator pattern
  // Format: --- !u!<classId> &<fileId>
  const docRegex = /^---\s*!u!(\d+)\s*&(-?\d+)(?:\s+stripped)?\s*$/gm;
  const docStarts: { index: number; classId: string; fileId: string }[] = [];
  
  let match: RegExpExecArray | null;
  while ((match = docRegex.exec(content)) !== null) {
    docStarts.push({
      index: match.index,
      classId: match[1],
      fileId: match[2],
    });
  }
  
  // Parse each document
  for (let i = 0; i < docStarts.length; i++) {
    const start = docStarts[i];
    const endIndex = i < docStarts.length - 1 ? docStarts[i + 1].index : content.length;
    
    const docContent = content.slice(start.index, endIndex);
    const className = UNITY_CLASS_IDS[start.classId] || `UnknownType_${start.classId}`;
    
    try {
      const data = parseYAMLDocument(docContent);
      
      documents.push({
        tag: `!u!${start.classId}`,
        classId: start.classId,
        fileId: start.fileId,
        className,
        data,
      });
    } catch (error) {
      // Skip malformed documents
      console.error(`Error parsing document ${start.fileId}:`, error);
    }
  }
  
  return documents;
}

/**
 * Parse a single YAML document with Unity-specific handling
 */
function parseYAMLDocument(docContent: string): Record<string, unknown> {
  const lines = docContent.split('\n');
  const body = lines.slice(1).join('\n').trim();

  if (!body) {
    return {};
  }

  const normalizedBody = normalizeUnityYaml(body);
  const document = YAML.parseDocument(normalizedBody, {
    prettyErrors: true,
    uniqueKeys: false,
  });

  if (document.errors.length > 0) {
    throw document.errors[0];
  }

  const parsed = document.toJS({ maxAliasCount: -1 });
  if (!parsed || typeof parsed !== 'object') {
    return {};
  }

  const rootEntries = Object.entries(parsed as Record<string, unknown>);
  if (rootEntries.length === 0) {
    return {};
  }

  const [, value] = rootEntries[0];
  return normalizeParsedValue(value) as Record<string, unknown>;
}

/**
 * Parse a YAML value string into the appropriate type
 */
function parseYAMLValue(value: string): unknown {
  // Handle empty/null
  if (value === '' || value === 'null' || value === '~') {
    return null;
  }
  
  // Handle booleans
  if (value === 'true' || value === 'yes' || value === 'on') {
    return true;
  }
  if (value === 'false' || value === 'no' || value === 'off') {
    return false;
  }
  
  // Handle Unity fileID references: {fileID: 12345}
  // Note: Keep fileID as string to preserve precision for large Unity IDs
  const fileIdMatch = value.match(/^\{fileID:\s*(-?\d+)\}$/);
  if (fileIdMatch) {
    return { fileID: fileIdMatch[1] };
  }
  
  // Handle Unity asset references: {fileID: 12345, guid: abc123, type: 3}
  const assetRefMatch = value.match(/^\{fileID:\s*(-?\d+),\s*guid:\s*([a-f0-9]+),\s*type:\s*(\d+)\}$/);
  if (assetRefMatch) {
    return {
      fileID: assetRefMatch[1],
      guid: assetRefMatch[2],
      type: parseInt(assetRefMatch[3], 10),
    };
  }
  
  // Handle inline objects: {x: 1, y: 2, z: 3}
  if (value.startsWith('{') && value.endsWith('}')) {
    return parseInlineObject(value);
  }
  
  // Handle inline arrays: [1, 2, 3]
  if (value.startsWith('[') && value.endsWith(']')) {
    return parseInlineArray(value);
  }
  
  // Handle numbers
  if (/^-?\d+$/.test(value)) {
    return parseInt(value, 10);
  }
  if (/^-?\d*\.?\d+([eE][+-]?\d+)?$/.test(value)) {
    return parseFloat(value);
  }
  
  // Handle quoted strings
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  
  // Default: return as string
  return value;
}

function normalizeUnityYaml(content: string): string {
  return content.replace(/(fileID:\s*)(-?\d+)/g, '$1"$2"');
}

function normalizeParsedValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => normalizeParsedValue(item));
  }

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(obj)) {
      if (key === 'fileID' && typeof entry === 'number') {
        normalized[key] = String(entry);
      } else {
        normalized[key] = normalizeParsedValue(entry);
      }
    }

    return normalized;
  }

  return value;
}

function isBinaryContent(buffer: Buffer): boolean {
  for (const byte of buffer) {
    if (byte === 0) {
      return true;
    }
  }

  return false;
}

/**
 * Parse inline YAML object: {x: 1, y: 2}
 */
function parseInlineObject(value: string): Record<string, unknown> {
  const content = value.slice(1, -1).trim();
  const result: Record<string, unknown> = {};
  
  if (!content) {
    return result;
  }
  
  // Split by comma, but handle nested braces
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  
  for (const char of content) {
    if (char === '{' || char === '[') {
      depth++;
      current += char;
    } else if (char === '}' || char === ']') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  if (current.trim()) {
    parts.push(current.trim());
  }
  
  for (const part of parts) {
    const colonIndex = part.indexOf(':');
    if (colonIndex !== -1) {
      const key = part.substring(0, colonIndex).trim();
      const val = part.substring(colonIndex + 1).trim();
      result[key] = parseYAMLValue(val);
    }
  }
  
  return result;
}

/**
 * Parse inline YAML array: [1, 2, 3]
 */
function parseInlineArray(value: string): unknown[] {
  const content = value.slice(1, -1).trim();
  
  if (!content) {
    return [];
  }
  
  // Split by comma, but handle nested braces
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  
  for (const char of content) {
    if (char === '{' || char === '[') {
      depth++;
      current += char;
    } else if (char === '}' || char === ']') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  if (current.trim()) {
    parts.push(current.trim());
  }
  
  return parts.map(part => parseYAMLValue(part));
}

/**
 * Get the Unity class name for a class ID
 */
export function getClassName(classId: string): string {
  return UNITY_CLASS_IDS[classId] || `UnknownType_${classId}`;
}

/**
 * Get the Unity class ID for a class name
 */
export function getClassId(className: string): string | undefined {
  for (const [id, name] of Object.entries(UNITY_CLASS_IDS)) {
    if (name === className) {
      return id;
    }
  }
  return undefined;
}
