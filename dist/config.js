import { z } from 'zod';
export const ParseConfigSchema = z.object({
    // Asset resolution
    resolveAssetNames: z.boolean().default(true),
    showAssetTypes: z.boolean().default(true),
    cacheMetaFiles: z.boolean().default(true),
    // Detail level
    arrayMaxElements: z.number().default(20),
    nestedObjectDepth: z.number().default(4),
    showElementCount: z.boolean().default(false),
    // Reference resolution
    resolveReferences: z.boolean().default(true),
    shorthandRefs: z.boolean().default(true),
    // Component filtering
    includeTransform: z.boolean().default(true),
    includeDisabledObjects: z.boolean().default(true),
    componentWhitelist: z.array(z.string()).default([]),
    componentBlacklist: z.array(z.string()).default([]),
    // Value filtering
    includeDefaultValues: z.boolean().default(false),
    includeNullReferences: z.boolean().default(false),
    compactVectors: z.boolean().default(true),
    // Output formatting
    groupByGameObject: z.boolean().default(true),
    indentSize: z.number().default(2),
    yamlStyle: z.enum(['block', 'flow']).default('block'),
    // Compact mode options
    includeUnityInternals: z.boolean().default(true), // false = remove version, serializedVersion, etc.
    simplifyUnityEvents: z.boolean().default(false), // true = empty events become []
    convertBitmasks: z.boolean().default(false), // true = m_Bits to layer array
    removeRedundantScriptNames: z.boolean().default(false), // true = omit script: when it matches component name
    omitEmptyStaticBatch: z.boolean().default(false), // true = omit staticBatchInfo when all zeros
    useBooleans: z.boolean().default(false), // true = convert 0/1 to true/false for boolean fields
    depthSummaryMode: z.boolean().default(false), // true = show [N items] instead of max depth reached
    filterDefaultRenderingProps: z.boolean().default(false), // true = omit default rendering properties
    omitEnabledTrue: z.boolean().default(false), // true = omit enabled: true (default state)
    omitDefaultOffsets: z.boolean().default(false), // true = omit offset: {x:0, y:0} (default position)
    omitUnknownRefs: z.boolean().default(false), // true = omit 'Unknown' asset references entirely
    useShortRefs: z.boolean().default(false), // true = <Type:Name> -> @Name
    includeHierarchy: z.boolean().default(true), // false = omit hierarchy section
    useParenVectors: z.boolean().default(false), // true = {x:1, y:2} -> (1, 2)
    inlineSimpleComponents: z.boolean().default(false), // true = inline components with 1-2 fields
    abbreviateFieldNames: z.boolean().default(false), // true = localPosition -> lPos
    useTreeHierarchy: z.boolean().default(false), // true = use tree format for hierarchy
    // Variant handling
    showVariantMarkers: z.boolean().default(true), // true = show # + markers for variant modifications
    // Transform filtering
    omitDefaultTransforms: z.boolean().default(false), // true = omit default lPos(0,0,0), lRot(0,0,0,1), lScale(1,1,1)
    // Preset support
    preset: z.enum(['minimal', 'standard', 'compact']).optional(),
});
// Preset configurations
export const PRESETS = {
    minimal: {
        arrayMaxElements: 5,
        includeDefaultValues: false,
        includeNullReferences: false,
        componentBlacklist: ['Transform'],
        showAssetTypes: false,
    },
    standard: {
        arrayMaxElements: 20,
        resolveAssetNames: true,
        resolveReferences: true,
        includeDefaultValues: false,
    },
    compact: {
        // Optimized for minimal token usage while preserving essential info
        resolveAssetNames: true,
        showAssetTypes: false, // No type comments
        arrayMaxElements: 20,
        nestedObjectDepth: 3, // Shallower depth
        includeDefaultValues: false,
        includeNullReferences: false,
        includeUnityInternals: false, // Remove version, serializedVersion, etc.
        simplifyUnityEvents: true, // Empty events become [] or show method names
        convertBitmasks: true, // m_Bits to layer array or 'all'
        removeRedundantScriptNames: true, // Omit script: when matches component name
        omitEmptyStaticBatch: true, // Omit staticBatchInfo when all zeros
        useBooleans: true, // 0/1 to true/false
        depthSummaryMode: true, // [N items] instead of max depth reached
        filterDefaultRenderingProps: true, // Omit default rendering properties
        omitEnabledTrue: true, // Omit enabled: true (default state)
        omitDefaultOffsets: true, // Omit offset: {x:0, y:0} (default position)
        omitUnknownRefs: true, // Omit 'Unknown' asset references
        useShortRefs: true, // <Type:Name> -> @Name
        useParenVectors: true, // {x:1, y:2} -> (1, 2)
        inlineSimpleComponents: true, // Inline components with 1-2 fields
        abbreviateFieldNames: true, // localPosition -> lPos
        omitDefaultTransforms: true, // Omit lPos(0,0,0), lRot(0,0,0,1), lScale(1,1,1)
        useTreeHierarchy: true, // Use tree format for hierarchy
    },
};
export function loadConfig(userConfig) {
    let baseConfig = {};
    if (userConfig?.preset && PRESETS[userConfig.preset]) {
        baseConfig = { ...PRESETS[userConfig.preset] };
    }
    const mergedConfig = { ...baseConfig, ...userConfig };
    return ParseConfigSchema.parse(mergedConfig);
}
//# sourceMappingURL=config.js.map