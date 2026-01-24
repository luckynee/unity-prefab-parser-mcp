import * as fs from 'fs/promises';
import * as path from 'path';
import type { UnityObject } from './config.js';

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
  const content = await fs.readFile(filePath, 'utf-8');
  return parseUnityYAMLContent(content);
}

/**
 * Parse Unity YAML content string
 */
export function parseUnityYAMLContent(content: string): ParsedDocument[] {
  const documents: ParsedDocument[] = [];
  
  // Split into documents by the Unity document separator pattern
  // Format: --- !u!<classId> &<fileId>
  const docRegex = /--- !u!(\d+) &(\d+)/g;
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
      const data = parseYAMLDocument(docContent, className);
      
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
function parseYAMLDocument(docContent: string, className: string): Record<string, unknown> {
  // Remove the document header line
  const lines = docContent.split('\n');
  const dataLines = lines.slice(1); // Skip the --- !u!X &Y line
  
  // Find the root key (e.g., "GameObject:", "Transform:", "MonoBehaviour:")
  const rootKeyLine = dataLines.find(line => /^[A-Za-z_][A-Za-z0-9_]*:/.test(line));
  
  if (!rootKeyLine) {
    return {};
  }
  
  const rootKey = rootKeyLine.replace(':', '').trim();
  const rootIndex = dataLines.indexOf(rootKeyLine);
  
  // Parse the content under the root key
  const contentLines = dataLines.slice(rootIndex + 1);
  return parseYAMLObject(contentLines, 2);
}

/**
 * Parse YAML object from lines with given base indentation
 */
function parseYAMLObject(lines: string[], baseIndent: number): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trimStart();
    
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      i++;
      continue;
    }
    
    // Calculate indentation
    const indent = line.length - trimmed.length;
    
    // If we've gone back to a lower indentation, we're done with this object
    if (indent < baseIndent) {
      break;
    }
    
    // Parse key-value pair
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) {
      i++;
      continue;
    }
    
    const key = trimmed.substring(0, colonIndex).trim();
    const valueStr = trimmed.substring(colonIndex + 1).trim();
    
    if (key.startsWith('-')) {
      // This is an array item at the wrong level
      i++;
      continue;
    }
    
    if (valueStr === '' || valueStr === '[]' || valueStr === '{}') {
      // Check if this is an object/array with nested content
      const nestedLines: string[] = [];
      let j = i + 1;
      
      // Look ahead to see if the next line starts an array (same indent with -)
      let isArrayAtSameIndent = false;
      if (j < lines.length) {
        const nextLine = lines[j];
        const nextTrimmed = nextLine.trimStart();
        const nextIndent = nextLine.length - nextTrimmed.length;
        if (nextTrimmed.startsWith('-') && nextIndent === indent) {
          isArrayAtSameIndent = true;
        }
      }
      
      while (j < lines.length) {
        const nestedLine = lines[j];
        const nestedTrimmed = nestedLine.trimStart();
        
        if (!nestedTrimmed || nestedTrimmed.startsWith('#')) {
          j++;
          continue;
        }
        
        const nestedIndent = nestedLine.length - nestedTrimmed.length;
        
        // For arrays at same indent level, check if we hit a non-array-item line
        if (isArrayAtSameIndent) {
          // Stop if we hit a line at same indent that isn't an array item
          if (nestedIndent === indent && !nestedTrimmed.startsWith('-')) {
            break;
          }
          // Stop if we go to a lower indent
          if (nestedIndent < indent) {
            break;
          }
        } else {
          // Normal case: nested content must be more indented
          if (nestedIndent <= indent) {
            break;
          }
        }
        
        nestedLines.push(nestedLine);
        j++;
      }
      
      if (nestedLines.length > 0) {
        const firstNested = nestedLines[0].trimStart();
        if (firstNested.startsWith('-')) {
          // This is an array - use the actual indent of the array items
          result[key] = parseYAMLArray(nestedLines, indent);
        } else {
          // This is an object
          result[key] = parseYAMLObject(nestedLines, indent + 2);
        }
      } else {
        result[key] = valueStr === '[]' ? [] : (valueStr === '{}' ? {} : null);
      }
      
      i = j;
    } else {
      // Simple value
      result[key] = parseYAMLValue(valueStr);
      i++;
    }
  }
  
  return result;
}

/**
 * Parse YAML array from lines
 */
function parseYAMLArray(lines: string[], baseIndent: number): unknown[] {
  const result: unknown[] = [];
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trimStart();
    
    if (!trimmed || trimmed.startsWith('#')) {
      i++;
      continue;
    }
    
    const indent = line.length - trimmed.length;
    
    if (indent < baseIndent) {
      break;
    }
    
    if (trimmed.startsWith('- ')) {
      const value = trimmed.substring(2);
      
      // Check if this is an inline object like {fileID: 123}
      if (value.startsWith('{') && value.endsWith('}')) {
        // Parse as inline object value
        result.push(parseYAMLValue(value));
        i++;
        continue;
      }
      
      // Check if this is an inline array like [1, 2, 3]
      if (value.startsWith('[') && value.endsWith(']')) {
        result.push(parseYAMLValue(value));
        i++;
        continue;
      }
      
      // Check if this is a key:value object item
      if (value.includes(':')) {
        // Parse inline object or complex nested object
        const colonIndex = value.indexOf(':');
        const key = value.substring(0, colonIndex).trim();
        const valueStr = value.substring(colonIndex + 1).trim();
        
        // Collect nested lines for this array item
        const nestedLines: string[] = [];
        let j = i + 1;
        
        while (j < lines.length) {
          const nestedLine = lines[j];
          const nestedTrimmed = nestedLine.trimStart();
          
          if (!nestedTrimmed) {
            j++;
            continue;
          }
          
          const nestedIndent = nestedLine.length - nestedTrimmed.length;
          
          if (nestedIndent <= indent) {
            break;
          }
          
          nestedLines.push(nestedLine);
          j++;
        }
        
        const obj: Record<string, unknown> = {};
        obj[key] = valueStr ? parseYAMLValue(valueStr) : null;
        
        if (nestedLines.length > 0) {
          const nestedObj = parseYAMLObject(nestedLines, indent + 2);
          Object.assign(obj, nestedObj);
        }
        
        result.push(obj);
        i = j;
      } else {
        // Simple value
        result.push(parseYAMLValue(value));
        i++;
      }
    } else if (trimmed.startsWith('-')) {
      // Just a dash, likely an object follows
      const nestedLines: string[] = [];
      let j = i + 1;
      
      while (j < lines.length) {
        const nestedLine = lines[j];
        const nestedTrimmed = nestedLine.trimStart();
        
        if (!nestedTrimmed) {
          j++;
          continue;
        }
        
        const nestedIndent = nestedLine.length - nestedTrimmed.length;
        
        if (nestedIndent <= indent) {
          break;
        }
        
        nestedLines.push(nestedLine);
        j++;
      }
      
      if (nestedLines.length > 0) {
        result.push(parseYAMLObject(nestedLines, indent + 2));
      }
      
      i = j;
    } else {
      i++;
    }
  }
  
  return result;
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
