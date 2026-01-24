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
export declare function parseUnityYAML(filePath: string): Promise<ParsedDocument[]>;
/**
 * Parse Unity YAML content string
 */
export declare function parseUnityYAMLContent(content: string): ParsedDocument[];
/**
 * Get the Unity class name for a class ID
 */
export declare function getClassName(classId: string): string;
/**
 * Get the Unity class ID for a class name
 */
export declare function getClassId(className: string): string | undefined;
//# sourceMappingURL=parser.d.ts.map