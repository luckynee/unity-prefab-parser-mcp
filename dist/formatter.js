import * as YAML from 'yaml';
/**
 * Format the parsed prefab data as clean YAML output
 */
export function formatYAML(data, config) {
    const doc = new YAML.Document();
    // Build the output structure
    const output = {
        prefab_name: data.prefab_name,
    };
    // Add hierarchy
    if (data.hierarchy.length > 0) {
        output.hierarchy = formatHierarchy(data.hierarchy, config);
    }
    // Add components grouped by GameObject
    if (Object.keys(data.components).length > 0) {
        output.components = data.components;
    }
    doc.contents = doc.createNode(output);
    // Configure YAML output options
    const yamlOptions = {
        indent: config.indentSize,
        lineWidth: 120,
        minContentWidth: 20,
        defaultKeyType: 'PLAIN',
        defaultStringType: 'PLAIN',
        singleQuote: false,
        blockQuote: 'literal',
    };
    if (config.yamlStyle === 'flow') {
        yamlOptions.flowCollectionPadding = true;
    }
    return doc.toString(yamlOptions);
}
/**
 * Format hierarchy nodes for YAML output
 */
function formatHierarchy(nodes, config) {
    return nodes.map(node => formatHierarchyNode(node, config));
}
/**
 * Format a single hierarchy node
 */
function formatHierarchyNode(node, config) {
    const result = {
        name: node.name,
    };
    // Only include non-default properties
    if (node.layer !== undefined && node.layer !== 0) {
        result.layer = node.layer;
    }
    if (node.tag !== undefined && node.tag !== 'Untagged') {
        result.tag = node.tag;
    }
    if (node.active !== undefined && node.active === false) {
        result.active = false;
    }
    // Recursively format children
    if (node.children && node.children.length > 0) {
        result.children = formatHierarchy(node.children, config);
    }
    return result;
}
/**
 * Format a component's data for output
 */
export function formatComponentData(data, config) {
    const result = {};
    for (const [key, value] of Object.entries(data)) {
        result[key] = formatValue(value, config);
    }
    return result;
}
/**
 * Format a value for YAML output
 */
function formatValue(value, config) {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === 'number') {
        // Round floating point numbers to reasonable precision
        if (!Number.isInteger(value)) {
            return Math.round(value * 10000) / 10000;
        }
        return value;
    }
    if (typeof value === 'string' || typeof value === 'boolean') {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(item => formatValue(item, config));
    }
    if (typeof value === 'object') {
        const obj = value;
        // Check if it's a compact vector/color
        if (config.compactVectors && isVectorLike(obj)) {
            return formatCompactObject(obj);
        }
        const result = {};
        for (const [k, v] of Object.entries(obj)) {
            result[k] = formatValue(v, config);
        }
        return result;
    }
    return value;
}
/**
 * Check if an object looks like a vector or color
 */
function isVectorLike(obj) {
    const keys = Object.keys(obj);
    // Vector2, Vector3, Vector4, Quaternion
    if (keys.every(k => ['x', 'y', 'z', 'w'].includes(k))) {
        return keys.length >= 2 && keys.length <= 4;
    }
    // Color
    if (keys.every(k => ['r', 'g', 'b', 'a'].includes(k))) {
        return keys.length >= 3 && keys.length <= 4;
    }
    return false;
}
/**
 * Format a compact object (vector/color) with inline values
 */
function formatCompactObject(obj) {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'number') {
            result[key] = Math.round(value * 10000) / 10000;
        }
    }
    return result;
}
/**
 * Create a simple YAML string without the yaml library for comments support
 */
export function formatYAMLWithComments(data, config) {
    const lines = [];
    const indent = ' '.repeat(config.indentSize);
    // Prefab name
    lines.push(`prefab_name: ${data.prefab_name}`);
    // Variant base prefab (if this is a variant)
    if (data.variant_of) {
        lines.push(`variant_of: ${data.variant_of}`);
    }
    lines.push('');
    // Hierarchy (can be omitted with includeHierarchy: false)
    if (config.includeHierarchy && data.hierarchy.length > 0) {
        if (config.useTreeHierarchy) {
            // Tree format (Linux-style)
            lines.push('hierarchy: |');
            const tree = formatHierarchyAsTree(data.hierarchy, config);
            // Indent each line by 2 spaces (YAML literal block)
            for (const treeLine of tree.split('\n')) {
                lines.push(`${indent}${treeLine}`);
            }
        }
        else {
            // Standard YAML format
            lines.push('hierarchy:');
            for (const node of data.hierarchy) {
                formatHierarchyToLines(node, lines, indent, 1, config);
            }
        }
        lines.push('');
    }
    // For variants with tree format, consolidate all variant sections into a unified components section
    if (data.variant_of && config.useTreeHierarchy) {
        const hasVariantContent = (data.modifications && Object.keys(data.modifications).length > 0) ||
            (data.added_gameobjects && data.added_gameobjects.length > 0) ||
            (data.added_components && Object.keys(data.added_components).length > 0) ||
            (data.removed_components && data.removed_components.length > 0);
        if (hasVariantContent) {
            lines.push('hierarchy: |');
            const variantTree = buildVariantTree(data, config);
            for (const treeLine of variantTree.split('\n')) {
                lines.push(`${indent}${treeLine}`);
            }
            lines.push('');
        }
        // Show unified components section with modifications, added, and removed components
        const hasComponentChanges = (data.modifications && Object.keys(data.modifications).length > 0) ||
            (data.added_components && Object.keys(data.added_components).length > 0) ||
            (data.removed_components && data.removed_components.length > 0);
        if (hasComponentChanges) {
            lines.push('components:');
            formatVariantComponentsSection(data, lines, indent, config);
        }
    }
    else if (data.variant_of) {
        // Non-tree format for variants (original behavior)
        // Modifications section (for variants)
        if (data.modifications && Object.keys(data.modifications).length > 0) {
            lines.push('modifications:');
            formatModificationsToLines(data.modifications, lines, indent, config);
            lines.push('');
        }
        // Added GameObjects section (for variants)
        if (data.added_gameobjects && data.added_gameobjects.length > 0) {
            lines.push('added_gameobjects:');
            for (const go of data.added_gameobjects) {
                const marker = config.showVariantMarkers ? '  # +' : '';
                lines.push(`${indent}- name: ${go.name}${marker}`);
                if (go.parent) {
                    lines.push(`${indent}  parent: ${go.parent}`);
                }
            }
            lines.push('');
        }
        // Added Components section (for variants)
        if (data.added_components && Object.keys(data.added_components).length > 0) {
            lines.push('added_components:');
            for (const [goName, components] of Object.entries(data.added_components)) {
                lines.push(`${indent}${goName}:`);
                if (typeof components === 'object' && components !== null) {
                    for (const [compType, compData] of Object.entries(components)) {
                        const marker = config.showVariantMarkers ? '  # +' : '';
                        lines.push(`${indent}${indent}${compType}:${marker}`);
                        formatObjectToLines(compData, lines, indent, 3, config);
                    }
                }
            }
            lines.push('');
        }
        // Removed Components section (for variants)
        if (data.removed_components && data.removed_components.length > 0) {
            lines.push('removed_components:');
            for (const removed of data.removed_components) {
                const marker = config.showVariantMarkers ? '  # -' : '';
                lines.push(`${indent}- ${removed}${marker}`);
            }
            lines.push('');
        }
    }
    // Components (regular, for non-variant prefabs only)
    if (!data.variant_of && Object.keys(data.components).length > 0) {
        lines.push('components:');
        for (const [gameObjectName, components] of Object.entries(data.components)) {
            lines.push(`${indent}${gameObjectName}:`);
            if (typeof components === 'object' && components !== null) {
                for (const [componentType, componentData] of Object.entries(components)) {
                    const compObj = componentData;
                    // Check if component should be inlined (1-2 simple fields)
                    if (config.inlineSimpleComponents && canInlineComponent(compObj)) {
                        const inlined = formatInlineComponent(compObj, config);
                        lines.push(`${indent}${indent}${componentType}: ${inlined}`);
                    }
                    else {
                        lines.push(`${indent}${indent}${componentType}:`);
                        formatObjectToLines(compObj, lines, indent, 3, config);
                    }
                }
            }
        }
    }
    return lines.join('\n');
}
/**
 * Format modifications section for variant prefabs
 */
function formatModificationsToLines(modifications, lines, indent, config) {
    for (const [goName, components] of Object.entries(modifications)) {
        lines.push(`${indent}${goName}:`);
        for (const [compType, fields] of Object.entries(components)) {
            lines.push(`${indent}${indent}${compType}:`);
            for (const [fieldName, fieldData] of Object.entries(fields)) {
                const valueStr = formatValueToString(fieldData, indent, 3, config);
                const marker = config.showVariantMarkers ? '  # $' : '';
                lines.push(`${indent}${indent}${indent}${fieldName}: ${valueStr}${marker}`);
            }
        }
    }
}
/**
 * Check if a component can be inlined (1-2 simple scalar fields)
 */
function canInlineComponent(obj) {
    const keys = Object.keys(obj);
    if (keys.length === 0 || keys.length > 2) {
        return false;
    }
    // Check if all values are simple (string, number, boolean)
    return keys.every(k => {
        const v = obj[k];
        return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
    });
}
/**
 * Format a simple component as an inline object
 */
function formatInlineComponent(obj, config) {
    const parts = Object.entries(obj).map(([k, v]) => {
        if (typeof v === 'boolean') {
            return `${k}: ${v}`;
        }
        if (typeof v === 'number') {
            if (!Number.isInteger(v)) {
                return `${k}: ${Math.round(v * 10000) / 10000}`;
            }
            return `${k}: ${v}`;
        }
        if (typeof v === 'string') {
            // Quote if needed
            if (v === 'true' || v === 'false' || v === 'null' || /^\d+$/.test(v)) {
                return `${k}: "${v}"`;
            }
            return `${k}: ${v}`;
        }
        return `${k}: ${v}`;
    });
    return `{${parts.join(', ')}}`;
}
/**
 * Format a hierarchy node to YAML lines
 */
function formatHierarchyToLines(node, lines, indent, level, config) {
    const prefix = indent.repeat(level);
    lines.push(`${prefix}- name: ${node.name}`);
    if (node.layer !== undefined && node.layer !== 0) {
        lines.push(`${prefix}  layer: ${node.layer}`);
    }
    if (node.tag !== undefined && node.tag !== 'Untagged') {
        lines.push(`${prefix}  tag: ${node.tag}`);
    }
    if (node.active === false) {
        lines.push(`${prefix}  active: false`);
    }
    if (node.children && node.children.length > 0) {
        lines.push(`${prefix}  children:`);
        for (const child of node.children) {
            formatHierarchyToLines(child, lines, indent, level + 2, config);
        }
    }
}
/**
 * Format an object to YAML lines, preserving comments in string values
 */
function formatObjectToLines(obj, lines, indent, level, config) {
    const prefix = indent.repeat(level);
    for (const [key, value] of Object.entries(obj)) {
        const formattedValue = formatValueToString(value, indent, level, config);
        if (formattedValue.includes('\n')) {
            // Multi-line value
            lines.push(`${prefix}${key}:`);
            lines.push(formattedValue);
        }
        else {
            lines.push(`${prefix}${key}: ${formattedValue}`);
        }
    }
}
/**
 * Format a value to a YAML string
 */
function formatValueToString(value, indent, level, config) {
    if (value === null || value === undefined) {
        return 'null';
    }
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }
    if (typeof value === 'number') {
        if (!Number.isInteger(value)) {
            return (Math.round(value * 10000) / 10000).toString();
        }
        return value.toString();
    }
    if (typeof value === 'string') {
        // Preserve comment syntax for asset references
        if (value.includes('  #')) {
            return value;
        }
        // Quote strings that might be interpreted as other types
        if (value === 'true' || value === 'false' || value === 'null' || /^\d+$/.test(value)) {
            return `"${value}"`;
        }
        return value;
    }
    if (Array.isArray(value)) {
        if (value.length === 0) {
            return '[]';
        }
        // Check if all items are simple values (can use inline format)
        const allSimple = value.every(item => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean');
        if (allSimple && value.length <= 5) {
            return `[${value.map(v => formatValueToString(v, indent, level, config)).join(', ')}]`;
        }
        // Multi-line array
        const prefix = indent.repeat(level);
        const lines = value.map(item => {
            const formatted = formatValueToString(item, indent, level + 1, config);
            return `${prefix}  - ${formatted}`;
        });
        return '\n' + lines.join('\n');
    }
    if (typeof value === 'object') {
        const obj = value;
        const keys = Object.keys(obj);
        // Empty object
        if (keys.length === 0) {
            return '{}';
        }
        // Compact vector/color format
        if (config.compactVectors && isVectorLike(obj)) {
            if (config.useParenVectors) {
                return formatParenVector(obj);
            }
            const parts = keys.map(k => `${k}: ${formatValueToString(obj[k], indent, level, config)}`);
            return `{${parts.join(', ')}}`;
        }
        // Multi-line object
        const prefix = indent.repeat(level);
        const lines = keys.map(k => {
            const formatted = formatValueToString(obj[k], indent, level + 1, config);
            return `${prefix}  ${k}: ${formatted}`;
        });
        return '\n' + lines.join('\n');
    }
    return String(value);
}
/**
 * Format a vector/color using parentheses notation: (x, y, z) or rgba(r, g, b, a)
 */
function formatParenVector(obj) {
    const keys = Object.keys(obj);
    // Round numbers for cleaner output
    const format = (v) => {
        if (typeof v === 'number') {
            const rounded = Math.round(v * 10000) / 10000;
            return rounded.toString();
        }
        return String(v);
    };
    // Color: rgba(r, g, b, a)
    if (keys.includes('r') && keys.includes('g') && keys.includes('b')) {
        if (keys.includes('a')) {
            return `rgba(${format(obj.r)}, ${format(obj.g)}, ${format(obj.b)}, ${format(obj.a)})`;
        }
        return `rgb(${format(obj.r)}, ${format(obj.g)}, ${format(obj.b)})`;
    }
    // Vector: (x, y) or (x, y, z) or (x, y, z, w)
    const values = [];
    if ('x' in obj)
        values.push(format(obj.x));
    if ('y' in obj)
        values.push(format(obj.y));
    if ('z' in obj)
        values.push(format(obj.z));
    if ('w' in obj)
        values.push(format(obj.w));
    return `(${values.join(', ')})`;
}
// Unity default layer names (layers 0-31)
// Users can customize layers 3-7 and 8-31 in Unity
const UNITY_LAYER_NAMES = {
    0: 'Default',
    1: 'TransparentFX',
    2: 'Ignore Raycast',
    3: 'Layer3',
    4: 'Water',
    5: 'UI',
    6: 'Layer6',
    7: 'Layer7',
    // Layers 8-31 are user-defined, will show as "Layer N" if not in this map
};
/**
 * Get a human-readable layer name
 */
export function getLayerName(layer) {
    if (UNITY_LAYER_NAMES[layer]) {
        return UNITY_LAYER_NAMES[layer];
    }
    return `Layer${layer}`;
}
/**
 * Format hierarchy as a tree structure (Linux-style)
 * Output format:
 *   Root (t: Tag, l: Layer, a: false)
 *   ├── Child1
 *   │   └── GrandChild
 *   └── Child2
 */
export function formatHierarchyAsTree(nodes, config) {
    const lines = [];
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const isLast = i === nodes.length - 1;
        // Root node: no connector, just name with metadata
        const meta = formatNodeMetadata(node, config);
        lines.push(`${node.name}${meta}`);
        // Children with tree connectors
        if (node.children && node.children.length > 0) {
            for (let j = 0; j < node.children.length; j++) {
                const childIsLast = j === node.children.length - 1;
                formatTreeNode(node.children[j], lines, '', childIsLast, config);
            }
        }
    }
    return lines.join('\n');
}
/**
 * Format inline metadata for a hierarchy node
 * Only shows non-default values: (t: Tag, l: Layer, a: false)
 */
function formatNodeMetadata(node, config) {
    const meta = [];
    // Tag (non-default)
    if (node.tag && node.tag !== 'Untagged') {
        meta.push(`t: ${node.tag}`);
    }
    // Layer (non-default)
    if (node.layer && node.layer !== 0) {
        meta.push(`l: ${getLayerName(node.layer)}`);
    }
    // Active (only show if false)
    if (node.active === false) {
        meta.push('a: false');
    }
    return meta.length > 0 ? ` (${meta.join(', ')})` : '';
}
/**
 * Recursively format tree nodes with connectors
 */
function formatTreeNode(node, lines, prefix, isLast, config, marker) {
    // Tree connectors (Unicode)
    const connector = isLast ? '└── ' : '├── ';
    // Build inline metadata
    const meta = formatNodeMetadata(node, config);
    // Marker for variants (# +, # $, # -)
    const markerStr = marker ? `  ${marker}` : '';
    lines.push(`${prefix}${connector}${node.name}${meta}${markerStr}`);
    // Process children
    if (node.children && node.children.length > 0) {
        // Prefix for children: add vertical line or spaces depending on whether this is last
        const childPrefix = prefix + (isLast ? '    ' : '│   ');
        for (let i = 0; i < node.children.length; i++) {
            const childIsLast = i === node.children.length - 1;
            formatTreeNode(node.children[i], lines, childPrefix, childIsLast, config);
        }
    }
}
/**
 * Format variant hierarchy as a tree with modification markers
 */
export function formatVariantHierarchyAsTree(nodes, config) {
    const lines = [];
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const isLast = i === nodes.length - 1;
        // Root node with marker
        const marker = getMarkerString(node.marker, config);
        lines.push(`${node.name}${marker}`);
        // Children with tree connectors
        if (node.children && node.children.length > 0) {
            for (let j = 0; j < node.children.length; j++) {
                const childIsLast = j === node.children.length - 1;
                formatVariantTreeNode(node.children[j], lines, '', childIsLast, config);
            }
        }
    }
    return lines.join('\n');
}
/**
 * Recursively format variant tree nodes with connectors and markers
 */
function formatVariantTreeNode(node, lines, prefix, isLast, config) {
    const connector = isLast ? '└── ' : '├── ';
    const marker = getMarkerString(node.marker, config);
    lines.push(`${prefix}${connector}${node.name}${marker}`);
    if (node.children && node.children.length > 0) {
        const childPrefix = prefix + (isLast ? '    ' : '│   ');
        for (let i = 0; i < node.children.length; i++) {
            const childIsLast = i === node.children.length - 1;
            formatVariantTreeNode(node.children[i], lines, childPrefix, childIsLast, config);
        }
    }
}
/**
 * Get the marker string for variant modifications
 */
function getMarkerString(marker, config) {
    if (!config.showVariantMarkers || !marker) {
        return '';
    }
    switch (marker) {
        case 'added':
            return '  # +';
        case 'modified':
            return '  # $';
        case 'removed':
            return '  # -';
        default:
            return '';
    }
}
/**
 * Build a variant tree from parsed prefab data
 * Shows only GameObject names with combined markers (# $ +)
 * Only shows GameObjects, not individual components
 */
function buildVariantTree(data, config) {
    const lines = [];
    // Track GameObjects and their change types
    const gameObjectChanges = new Map();
    // Helper to add a change type for a GameObject
    const addChange = (goName, changeType) => {
        if (!gameObjectChanges.has(goName)) {
            gameObjectChanges.set(goName, new Set());
        }
        gameObjectChanges.get(goName).add(changeType);
    };
    // Track modified GameObjects (from modifications section)
    if (data.modifications) {
        for (const goName of Object.keys(data.modifications)) {
            addChange(goName, 'modified');
        }
    }
    // Track added GameObjects
    if (data.added_gameobjects) {
        for (const go of data.added_gameobjects) {
            addChange(go.name, 'added');
        }
    }
    // Track GameObjects with added components
    if (data.added_components) {
        for (const goName of Object.keys(data.added_components)) {
            addChange(goName, 'added');
        }
    }
    // Track GameObjects with removed components
    if (data.removed_components) {
        for (const removed of data.removed_components) {
            // removed format is "GameObjectName.ComponentType" or just "ComponentType"
            const dotIndex = removed.lastIndexOf('.');
            const goName = dotIndex > 0 ? removed.substring(0, dotIndex) : removed;
            addChange(goName, 'removed');
        }
    }
    // Build the tree
    if (gameObjectChanges.size > 0) {
        const baseName = data.variant_of || 'Unknown';
        // Check if the base prefab itself has changes (not just children)
        const baseChanges = gameObjectChanges.get(baseName);
        const baseMarker = baseChanges ? getCombinedMarkerString(baseChanges, config) : '';
        lines.push(`${baseName}${baseMarker}`);
        // Show other GameObjects as children (exclude base if it was already shown with marker)
        const entries = Array.from(gameObjectChanges.entries())
            .filter(([goName]) => goName !== baseName);
        for (let i = 0; i < entries.length; i++) {
            const [goName, changes] = entries[i];
            const isLast = i === entries.length - 1;
            const connector = isLast ? '└── ' : '├── ';
            const marker = getCombinedMarkerString(changes, config);
            lines.push(`${connector}${goName}${marker}`);
        }
    }
    return lines.join('\n');
}
/**
 * Get combined marker string for multiple change types
 * e.g., "# $ +" for modified AND added
 */
function getCombinedMarkerString(changes, config) {
    if (!config.showVariantMarkers || changes.size === 0) {
        return '';
    }
    const markers = [];
    // Order: modified, added, removed
    if (changes.has('modified'))
        markers.push('$');
    if (changes.has('added'))
        markers.push('+');
    if (changes.has('removed'))
        markers.push('-');
    return `  # ${markers.join(' ')}`;
}
/**
 * Format variant components section with unified output
 * Handles modifications (# $ on component and fields), added (# + on component), and removed (# - as comment)
 */
function formatVariantComponentsSection(data, lines, indent, config) {
    // Group all changes by GameObject
    const gameObjectComponents = new Map();
    // Helper to ensure GameObject entry exists
    const ensureGO = (goName) => {
        if (!gameObjectComponents.has(goName)) {
            gameObjectComponents.set(goName, {
                modified: new Map(),
                added: new Map(),
                removed: [],
            });
        }
        return gameObjectComponents.get(goName);
    };
    // Process modifications
    if (data.modifications) {
        for (const [goName, components] of Object.entries(data.modifications)) {
            const go = ensureGO(goName);
            for (const [compType, fields] of Object.entries(components)) {
                go.modified.set(compType, fields);
            }
        }
    }
    // Process added components
    if (data.added_components) {
        for (const [goName, components] of Object.entries(data.added_components)) {
            if (typeof components === 'object' && components !== null) {
                const go = ensureGO(goName);
                for (const [compType, compData] of Object.entries(components)) {
                    go.added.set(compType, compData);
                }
            }
        }
    }
    // Process removed components
    if (data.removed_components) {
        for (const removed of data.removed_components) {
            // Parse "GameObject.ComponentType" format
            const dotIndex = removed.lastIndexOf('.');
            if (dotIndex > 0) {
                const goName = removed.substring(0, dotIndex);
                const compType = removed.substring(dotIndex + 1);
                const go = ensureGO(goName);
                go.removed.push(compType);
            }
            else {
                // Fallback: treat the whole string as component name under base prefab
                const goName = data.variant_of || 'Unknown';
                const go = ensureGO(goName);
                go.removed.push(removed);
            }
        }
    }
    // Output each GameObject's components
    for (const [goName, components] of gameObjectComponents.entries()) {
        lines.push(`${indent}${goName}:`);
        // Output modified components (# $ on component name and each field)
        for (const [compType, fields] of components.modified.entries()) {
            const compMarker = config.showVariantMarkers ? '  # $' : '';
            lines.push(`${indent}${indent}${compType}:${compMarker}`);
            for (const [fieldName, fieldData] of Object.entries(fields)) {
                const valueStr = formatValueToString(fieldData, indent, 3, config);
                const fieldMarker = config.showVariantMarkers ? '  # $' : '';
                lines.push(`${indent}${indent}${indent}${fieldName}: ${valueStr}${fieldMarker}`);
            }
        }
        // Output added components (# + on component name only)
        for (const [compType, compData] of components.added.entries()) {
            const compMarker = config.showVariantMarkers ? '  # +' : '';
            lines.push(`${indent}${indent}${compType}:${compMarker}`);
            if (typeof compData === 'object' && compData !== null) {
                formatObjectToLines(compData, lines, indent, 3, config);
            }
        }
        // Output removed components as comments at end (# ComponentName  # -)
        for (const compType of components.removed) {
            if (config.showVariantMarkers) {
                lines.push(`${indent}${indent}# ${compType}  # -`);
            }
        }
    }
}
/**
 * Format modifications as components section (for tree variant format)
 * @deprecated Use formatVariantComponentsSection instead
 */
function formatModificationsAsComponents(modifications, lines, indent, config) {
    for (const [goName, components] of Object.entries(modifications)) {
        lines.push(`${indent}${goName}:`);
        for (const [compType, fields] of Object.entries(components)) {
            lines.push(`${indent}${indent}${compType}:`);
            for (const [fieldName, fieldData] of Object.entries(fields)) {
                const valueStr = formatValueToString(fieldData, indent, 3, config);
                const marker = config.showVariantMarkers ? '  # $' : '';
                lines.push(`${indent}${indent}${indent}${fieldName}: ${valueStr}${marker}`);
            }
        }
    }
}
//# sourceMappingURL=formatter.js.map