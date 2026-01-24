import { z } from 'zod';
export declare const ParseConfigSchema: z.ZodObject<{
    resolveAssetNames: z.ZodDefault<z.ZodBoolean>;
    showAssetTypes: z.ZodDefault<z.ZodBoolean>;
    cacheMetaFiles: z.ZodDefault<z.ZodBoolean>;
    arrayMaxElements: z.ZodDefault<z.ZodNumber>;
    nestedObjectDepth: z.ZodDefault<z.ZodNumber>;
    showElementCount: z.ZodDefault<z.ZodBoolean>;
    resolveReferences: z.ZodDefault<z.ZodBoolean>;
    shorthandRefs: z.ZodDefault<z.ZodBoolean>;
    includeTransform: z.ZodDefault<z.ZodBoolean>;
    includeDisabledObjects: z.ZodDefault<z.ZodBoolean>;
    componentWhitelist: z.ZodDefault<z.ZodArray<z.ZodString>>;
    componentBlacklist: z.ZodDefault<z.ZodArray<z.ZodString>>;
    includeDefaultValues: z.ZodDefault<z.ZodBoolean>;
    includeNullReferences: z.ZodDefault<z.ZodBoolean>;
    compactVectors: z.ZodDefault<z.ZodBoolean>;
    groupByGameObject: z.ZodDefault<z.ZodBoolean>;
    indentSize: z.ZodDefault<z.ZodNumber>;
    yamlStyle: z.ZodDefault<z.ZodEnum<{
        block: "block";
        flow: "flow";
    }>>;
    includeUnityInternals: z.ZodDefault<z.ZodBoolean>;
    simplifyUnityEvents: z.ZodDefault<z.ZodBoolean>;
    convertBitmasks: z.ZodDefault<z.ZodBoolean>;
    removeRedundantScriptNames: z.ZodDefault<z.ZodBoolean>;
    omitEmptyStaticBatch: z.ZodDefault<z.ZodBoolean>;
    useBooleans: z.ZodDefault<z.ZodBoolean>;
    depthSummaryMode: z.ZodDefault<z.ZodBoolean>;
    filterDefaultRenderingProps: z.ZodDefault<z.ZodBoolean>;
    omitEnabledTrue: z.ZodDefault<z.ZodBoolean>;
    omitDefaultOffsets: z.ZodDefault<z.ZodBoolean>;
    omitUnknownRefs: z.ZodDefault<z.ZodBoolean>;
    useShortRefs: z.ZodDefault<z.ZodBoolean>;
    includeHierarchy: z.ZodDefault<z.ZodBoolean>;
    useParenVectors: z.ZodDefault<z.ZodBoolean>;
    inlineSimpleComponents: z.ZodDefault<z.ZodBoolean>;
    abbreviateFieldNames: z.ZodDefault<z.ZodBoolean>;
    useTreeHierarchy: z.ZodDefault<z.ZodBoolean>;
    showVariantMarkers: z.ZodDefault<z.ZodBoolean>;
    omitDefaultTransforms: z.ZodDefault<z.ZodBoolean>;
    preset: z.ZodOptional<z.ZodEnum<{
        minimal: "minimal";
        standard: "standard";
        compact: "compact";
    }>>;
}, z.core.$strip>;
export type ParseConfig = z.infer<typeof ParseConfigSchema>;
export interface MetaFileCacheEntry {
    name: string;
    type: string;
    path: string;
}
export interface MetaFileCache {
    [guid: string]: MetaFileCacheEntry;
}
export interface UnityObject {
    fileId: string;
    type: string;
    data: Record<string, unknown>;
}
export interface GameObject {
    fileId: string;
    name: string;
    layer: number;
    tag: string;
    active: boolean;
    children: GameObject[];
    components: ComponentInfo[];
}
export interface ComponentInfo {
    fileId: string;
    type: string;
    gameObjectFileId: string;
    data: Record<string, unknown>;
}
export interface FileIdMap {
    gameObjects: Map<string, {
        name: string;
        layer: number;
        tag: string;
        active: boolean;
        transformFileId: string;
    }>;
    transforms: Map<string, {
        gameObjectFileId: string;
        parentFileId: string | null;
        childrenFileIds: string[];
    }>;
    components: Map<string, {
        type: string;
        gameObjectFileId: string;
        data: Record<string, unknown>;
    }>;
}
export interface ParsedPrefab {
    prefab_name: string;
    variant_of?: string;
    hierarchy: HierarchyNode[];
    components: Record<string, Record<string, unknown>>;
    modifications?: Record<string, Record<string, Record<string, unknown>>>;
    added_components?: Record<string, Record<string, unknown>>;
    added_gameobjects?: Array<{
        name: string;
        parent?: string;
    }>;
    removed_components?: string[];
}
export interface HierarchyNode {
    name: string;
    layer?: number;
    tag?: string;
    active?: boolean;
    children?: HierarchyNode[];
}
export declare const PRESETS: Record<string, Partial<ParseConfig>>;
export declare function loadConfig(userConfig?: Partial<ParseConfig>): ParseConfig;
//# sourceMappingURL=config.d.ts.map