import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { parseUnityYAML, parseUnityYAMLContent } from '../src/parser.js';
import { buildFileIdMap, buildGameObjectDisplayMap, buildHierarchy, findRootTransforms } from '../src/hierarchy.js';
import { loadConfig } from '../src/config.js';
import { shouldExcludeField, renameField, isBooleanField, isDefaultOffset } from '../src/components.js';
import { resolveReferences, simplifyUnityEvent } from '../src/resolver.js';
import { formatYAMLWithComments, formatHierarchyAsTree, getLayerName, formatVariantHierarchyAsTree, type VariantHierarchyNode } from '../src/formatter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Unity YAML Parser', () => {
  test('parses simple prefab structure', async () => {
    const prefabPath = path.join(__dirname, 'fixtures', 'BatPF.prefab');
    const documents = await parseUnityYAML(prefabPath);
    
    assert.ok(documents.length > 0, 'Should parse at least one document');
    
    // Check we found GameObjects
    const gameObjects = documents.filter(d => d.className === 'GameObject');
    assert.ok(gameObjects.length >= 1, 'Should find GameObjects');
    
    // Check we found Transforms
    const transforms = documents.filter(d => d.className === 'Transform');
    assert.ok(transforms.length >= 1, 'Should find Transforms');
  });

  test('extracts correct fileId from documents', async () => {
    const prefabPath = path.join(__dirname, 'fixtures', 'BatPF.prefab');
    const documents = await parseUnityYAML(prefabPath);
    
    for (const doc of documents) {
      assert.ok(doc.fileId, 'Each document should have a fileId');
      assert.match(doc.fileId, /^\d+$/, 'fileId should be numeric string');
    }
  });

  test('parses MonoBehaviour with custom fields', async () => {
    const prefabPath = path.join(__dirname, 'fixtures', 'BatPF.prefab');
    const documents = await parseUnityYAML(prefabPath);
    
    const monoBehaviours = documents.filter(d => d.className === 'MonoBehaviour');
    assert.ok(monoBehaviours.length >= 1, 'Should find MonoBehaviours');
    
    // Check for custom fields
    const characterMono = monoBehaviours.find(m => 
      m.data.CharacterType !== undefined || m.data._entityName !== undefined
    );
    assert.ok(characterMono, 'Should find MonoBehaviour with custom fields');
  });

  test('parses multiline block scalars', () => {
    const content = `--- !u!114 &1
MonoBehaviour:
  m_ObjectHideFlags: 0
  m_Script: {fileID: 11500000, guid: abcdef1234567890abcdef1234567890, type: 3}
  dialogue: |
    Hello there
    General Kenobi
`;

    const documents = parseUnityYAMLContent(content);
    assert.equal(documents.length, 1, 'Should parse one document');
    assert.equal(documents[0].data.dialogue, 'Hello there\nGeneral Kenobi\n');
  });

  test('rejects binary Unity assets', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'unity-parser-'));
    const filePath = path.join(tempDir, 'Binary.prefab');

    try {
      await fs.writeFile(filePath, Buffer.from([0x00, 0x01, 0x02, 0x03]));
      await assert.rejects(
        () => parseUnityYAML(filePath),
        /binary/i,
      );
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe('Hierarchy Builder', () => {
  test('builds fileId map correctly', async () => {
    const prefabPath = path.join(__dirname, 'fixtures', 'BatPF.prefab');
    const documents = await parseUnityYAML(prefabPath);
    const fileIdMap = buildFileIdMap(documents);
    
    assert.ok(fileIdMap.gameObjects.size > 0, 'Should have GameObjects in map');
    assert.ok(fileIdMap.transforms.size > 0, 'Should have Transforms in map');
    assert.ok(fileIdMap.components.size > 0, 'Should have Components in map');
  });

  test('finds root transforms', async () => {
    const prefabPath = path.join(__dirname, 'fixtures', 'BatPF.prefab');
    const documents = await parseUnityYAML(prefabPath);
    const fileIdMap = buildFileIdMap(documents);
    
    const roots = findRootTransforms(fileIdMap);
    assert.ok(roots.length >= 1, 'Should find at least one root transform');
  });

  test('builds hierarchy tree', async () => {
    const prefabPath = path.join(__dirname, 'fixtures', 'BatPF.prefab');
    const documents = await parseUnityYAML(prefabPath);
    const fileIdMap = buildFileIdMap(documents);
    
    const hierarchy = buildHierarchy(fileIdMap, true);
    
    assert.ok(hierarchy.length >= 1, 'Should build hierarchy');
    assert.equal(hierarchy[0].name, 'BatPF', 'Root should be BatPF');
    
    // Check for children
    assert.ok(hierarchy[0].children, 'Root should have children');
    assert.ok(hierarchy[0].children!.length >= 2, 'Should have at least 2 children');
  });

  test('builds stable display names for duplicate object names', () => {
    const hierarchy = [
      {
        fileId: '1',
        name: 'Root',
        children: [
          { fileId: '2', name: 'Child' },
          { fileId: '3', name: 'Child' },
        ],
      },
    ];

    const displayMap = buildGameObjectDisplayMap(hierarchy);
    assert.equal(displayMap.get('1'), 'Root');
    assert.equal(displayMap.get('2'), 'Root/Child [2]');
    assert.equal(displayMap.get('3'), 'Root/Child [3]');
  });

  test('keeps simple names when they are unique', () => {
    const hierarchy = [
      {
        fileId: '1',
        name: 'Root',
        children: [
          { fileId: '2', name: 'View' },
          { fileId: '3', name: 'Shadow' },
        ],
      },
    ];

    const displayMap = buildGameObjectDisplayMap(hierarchy);
    assert.equal(displayMap.get('1'), 'Root');
    assert.equal(displayMap.get('2'), 'View');
    assert.equal(displayMap.get('3'), 'Shadow');
  });
});

describe('Component Filters', () => {
  test('excludes Unity internal fields', () => {
    assert.ok(shouldExcludeField('m_ObjectHideFlags', 'Transform'));
    assert.ok(shouldExcludeField('m_CorrespondingSourceObject', 'Transform'));
    assert.ok(shouldExcludeField('serializedVersion', 'Transform'));
    assert.ok(shouldExcludeField('m_EditorHideFlags', 'MonoBehaviour'));
  });

  test('includes Transform position/rotation/scale', () => {
    assert.ok(!shouldExcludeField('m_LocalPosition', 'Transform'));
    assert.ok(!shouldExcludeField('m_LocalRotation', 'Transform'));
    assert.ok(!shouldExcludeField('m_LocalScale', 'Transform'));
  });

  test('renames fields correctly', () => {
    assert.equal(renameField('m_LocalPosition', 'Transform'), 'localPosition');
    assert.equal(renameField('m_LocalRotation', 'Transform'), 'localRotation');
    assert.equal(renameField('m_Radius', 'CircleCollider2D'), 'radius');
    assert.equal(renameField('m_Mass', 'Rigidbody2D'), 'mass');
  });

  test('handles MonoBehaviour custom fields', () => {
    // Custom fields should not be excluded
    assert.ok(!shouldExcludeField('CharacterType', 'MonoBehaviour'));
    assert.ok(!shouldExcludeField('_entityName', 'MonoBehaviour'));
    assert.ok(!shouldExcludeField('_health', 'MonoBehaviour'));
  });
});

describe('Configuration', () => {
  test('loads default config', () => {
    const config = loadConfig();
    
    assert.equal(config.arrayMaxElements, 20);
    assert.equal(config.resolveAssetNames, true);
    assert.equal(config.includeDefaultValues, false);
  });

  test('loads minimal preset', () => {
    const config = loadConfig({ preset: 'minimal' });
    
    assert.equal(config.arrayMaxElements, 5);
    assert.equal(config.showAssetTypes, false);
    assert.ok(config.componentBlacklist.includes('Transform'));
  });

  test('loads standard preset', () => {
    const config = loadConfig({ preset: 'standard' });
    
    assert.equal(config.arrayMaxElements, 20);
    assert.equal(config.resolveAssetNames, true);
    assert.equal(config.resolveReferences, true);
  });

  test('allows user overrides on preset', () => {
    const config = loadConfig({ 
      preset: 'minimal', 
      arrayMaxElements: 10 
    });
    
    assert.equal(config.arrayMaxElements, 10); // Override
    assert.equal(config.showAssetTypes, false); // From preset
  });
});

describe('Reference Resolution', () => {
  test('resolves internal GameObject reference', async () => {
    const prefabPath = path.join(__dirname, 'fixtures', 'BatPF.prefab');
    const documents = await parseUnityYAML(prefabPath);
    const fileIdMap = buildFileIdMap(documents);
    const config = loadConfig();
    
    // Use string fileID to match how parser now handles large Unity IDs
    const testData = {
      _targetRef: { fileID: '5765943547154460588' }
    };
    
    const resolved = resolveReferences(
      testData,
      'MonoBehaviour',
      fileIdMap,
      {},
      config
    );
    
    assert.ok(resolved._targetRef, 'Should resolve reference');
    assert.match(String(resolved._targetRef), /BatPF/, 'Should reference BatPF');
  });

  test('handles null references', () => {
    const config = loadConfig({ includeNullReferences: false });
    
    // Test with both string and number 0
    const testData = {
      _nullRef: { fileID: '0' }
    };
    
    const resolved = resolveReferences(
      testData,
      'MonoBehaviour',
      { gameObjects: new Map(), transforms: new Map(), components: new Map() },
      {},
      config
    );
    
    assert.ok(!('_nullRef' in resolved), 'Should exclude null references');
  });
});

describe('Compact Mode', () => {
  test('loads compact preset', () => {
    const config = loadConfig({ preset: 'compact' });
    
    assert.equal(config.useBooleans, true);
    assert.equal(config.convertBitmasks, true);
    assert.equal(config.depthSummaryMode, true);
    assert.equal(config.includeUnityInternals, false);
    assert.equal(config.filterDefaultRenderingProps, true);
    assert.equal(config.removeRedundantScriptNames, true);
  });

  test('converts 0/1 to boolean for boolean fields', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const testData = {
      enabled: 0,          // enabled: 0 should become false (not omitted)
      isTrigger: 0,
      _isFlip: 1,
      canMove: 0,
      someValue: 5,  // Not a boolean field
    };
    
    const resolved = resolveReferences(
      testData,
      'MonoBehaviour',
      { gameObjects: new Map(), transforms: new Map(), components: new Map() },
      {},
      config
    );
    
    // Note: enabled: 1 is now omitted in compact mode (see Enabled True Omission tests)
    // enabled: 0 should still become false
    assert.equal(resolved.enabled, false, 'enabled: 0 should become false');
    // With abbreviateFieldNames: true (in compact), isTrigger -> trigger
    assert.equal(resolved.trigger, false, 'isTrigger: 0 should become false (abbreviated to trigger)');
    assert.equal(resolved._isFlip, true, '_isFlip: 1 should become true');
    assert.equal(resolved.canMove, false, 'canMove: 0 should become false');
    assert.equal(resolved.someValue, 5, 'someValue should stay as number');
  });

  test('filters default rendering properties', () => {
    const config = loadConfig({ preset: 'compact' });
    
    // Use MonoBehaviour which has 'all_except_internals' - allows any field
    const testData = {
      m_DynamicOccludee: 1,      // Default - should be filtered
      m_LightProbeUsage: 1,      // Default - should be filtered
      mySprite: 'MySprite',      // Not a rendering prop - should be kept
      mySortingLayer: 5,         // Not a rendering prop - should be kept
    };
    
    const resolved = resolveReferences(
      testData,
      'MonoBehaviour',
      { gameObjects: new Map(), transforms: new Map(), components: new Map() },
      {},
      config
    );
    
    assert.ok(!('m_DynamicOccludee' in resolved) && !('dynamicOccludee' in resolved), 'Default dynamicOccludee should be filtered');
    assert.ok(!('m_LightProbeUsage' in resolved) && !('lightProbeUsage' in resolved), 'Default lightProbeUsage should be filtered');
    assert.equal(resolved.mySprite, 'MySprite', 'Non-default mySprite should be kept');
    assert.equal(resolved.mySortingLayer, 5, 'Non-default mySortingLayer should be kept');
  });

  test('uses depth summary for nested arrays at max depth', () => {
    const config = loadConfig({ 
      preset: 'compact',
      nestedObjectDepth: 1  // Very shallow depth for testing
    });
    
    const testData = {
      items: [
        { name: 'Item1', nested: { deep: 'value' } },
        { name: 'Item2', nested: { deep: 'value' } },
        { name: 'Item3', nested: { deep: 'value' } },
      ]
    };
    
    const resolved = resolveReferences(
      testData,
      'MonoBehaviour',
      { gameObjects: new Map(), transforms: new Map(), components: new Map() },
      {},
      config
    );
    
    // At depth 1, the array should show as summary
    assert.ok(resolved.items !== undefined, 'items should be present');
  });
});

describe('Bitmask Conversion', () => {
  test('converts all-layers bitmask (0xFFFFFFFF) to "all"', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const testData = {
      mask: { serializedVersion: 2, m_Bits: 4294967295 }  // 0xFFFFFFFF
    };
    
    const resolved = resolveReferences(
      testData,
      'MonoBehaviour',
      { gameObjects: new Map(), transforms: new Map(), components: new Map() },
      {},
      config
    );
    
    assert.equal(resolved.mask, 'all', 'All layers bitmask should become "all"');
  });

  test('converts all-layers bitmask (-1 signed) to "all"', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const testData = {
      mask: { serializedVersion: 2, m_Bits: -1 }  // -1 as signed int
    };
    
    const resolved = resolveReferences(
      testData,
      'MonoBehaviour',
      { gameObjects: new Map(), transforms: new Map(), components: new Map() },
      {},
      config
    );
    
    assert.equal(resolved.mask, 'all', 'All layers bitmask (-1) should become "all"');
  });

  test('converts single layer bitmask to array', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const testData = {
      mask: { serializedVersion: 2, m_Bits: 67108864 }  // Layer 26 only
    };
    
    const resolved = resolveReferences(
      testData,
      'MonoBehaviour',
      { gameObjects: new Map(), transforms: new Map(), components: new Map() },
      {},
      config
    );
    
    assert.deepEqual(resolved.mask, [26], 'Single layer bitmask should be [26]');
  });

  test('converts multiple layer bitmask to array', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const testData = {
      mask: { serializedVersion: 2, m_Bits: 7 }  // Layers 0, 1, 2
    };
    
    const resolved = resolveReferences(
      testData,
      'MonoBehaviour',
      { gameObjects: new Map(), transforms: new Map(), components: new Map() },
      {},
      config
    );
    
    assert.deepEqual(resolved.mask, [0, 1, 2], 'Multi-layer bitmask should be [0, 1, 2]');
  });

  test('converts no-layers bitmask to empty array', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const testData = {
      mask: { serializedVersion: 2, m_Bits: 0 }  // No layers
    };
    
    const resolved = resolveReferences(
      testData,
      'MonoBehaviour',
      { gameObjects: new Map(), transforms: new Map(), components: new Map() },
      {},
      config
    );
    
    assert.deepEqual(resolved.mask, [], 'No layers bitmask should be []');
  });
});

describe('Boolean Field Detection', () => {
  test('detects standard boolean prefixes', () => {
    assert.ok(isBooleanField('isEnabled'), 'isEnabled should be boolean');
    assert.ok(isBooleanField('hasWeapon'), 'hasWeapon should be boolean');
    assert.ok(isBooleanField('canJump'), 'canJump should be boolean');
    assert.ok(isBooleanField('shouldAttack'), 'shouldAttack should be boolean');
    assert.ok(isBooleanField('useGravity'), 'useGravity should be boolean');
  });

  test('detects underscore-prefixed boolean fields', () => {
    assert.ok(isBooleanField('_isFlip'), '_isFlip should be boolean');
    assert.ok(isBooleanField('_hasTarget'), '_hasTarget should be boolean');
    assert.ok(isBooleanField('_useRaycasting'), '_useRaycasting should be boolean');
  });

  test('detects m_ prefixed boolean fields', () => {
    assert.ok(isBooleanField('m_IsKinematic'), 'm_IsKinematic should be boolean');
    assert.ok(isBooleanField('m_HasPath'), 'm_HasPath should be boolean');
    assert.ok(isBooleanField('m_UseGravity'), 'm_UseGravity should be boolean');
  });

  test('detects draw/allow/show/hide prefixes', () => {
    assert.ok(isBooleanField('drawGizmos'), 'drawGizmos should be boolean');
    assert.ok(isBooleanField('allowWaterBypass'), 'allowWaterBypass should be boolean');
    assert.ok(isBooleanField('_allowWaterBypass'), '_allowWaterBypass should be boolean');
    assert.ok(isBooleanField('showDebug'), 'showDebug should be boolean');
    assert.ok(isBooleanField('hideInHierarchy'), 'hideInHierarchy should be boolean');
  });

  test('detects Enabled/Active/Visible suffixes', () => {
    assert.ok(isBooleanField('componentEnabled'), 'componentEnabled should be boolean');
    assert.ok(isBooleanField('BrainActive'), 'BrainActive should be boolean');
    assert.ok(isBooleanField('isVisible'), 'isVisible should be boolean');
  });

  test('detects specific Unity fields', () => {
    assert.ok(isBooleanField('enabled'), 'enabled should be boolean');
    assert.ok(isBooleanField('isTrigger'), 'isTrigger should be boolean');
    assert.ok(isBooleanField('simulated'), 'simulated should be boolean');
    assert.ok(isBooleanField('loop'), 'loop should be boolean');
    assert.ok(isBooleanField('mute'), 'mute should be boolean');
    assert.ok(isBooleanField('playOnAwake'), 'playOnAwake should be boolean');
    assert.ok(isBooleanField('flipX'), 'flipX should be boolean');
    assert.ok(isBooleanField('convex'), 'convex should be boolean');
  });

  test('detects pathfinding boolean fields', () => {
    assert.ok(isBooleanField('interpolatePathSwitches'), 'interpolatePathSwitches should be boolean');
    assert.ok(isBooleanField('useRaycasting'), 'useRaycasting should be boolean');
    assert.ok(isBooleanField('alwaysDrawGizmos'), 'alwaysDrawGizmos should be boolean');
  });

  test('does not false-positive on non-boolean fields', () => {
    assert.ok(!isBooleanField('speed'), 'speed should not be boolean');
    assert.ok(!isBooleanField('position'), 'position should not be boolean');
    assert.ok(!isBooleanField('targetName'), 'targetName should not be boolean');
    assert.ok(!isBooleanField('damage'), 'damage should not be boolean');
    assert.ok(!isBooleanField('value'), 'value should not be boolean');
  });
});

describe('Static Batch Info Removal', () => {
  test('omits empty staticBatchInfo in compact mode', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const testData = {
      staticBatchInfo: { firstSubMesh: 0, subMeshCount: 0 },
      mesh: 'MyMesh'
    };
    
    const resolved = resolveReferences(
      testData,
      'MonoBehaviour',
      { gameObjects: new Map(), transforms: new Map(), components: new Map() },
      {},
      config
    );
    
    assert.ok(!('staticBatchInfo' in resolved), 'Empty staticBatchInfo should be omitted');
    assert.equal(resolved.mesh, 'MyMesh', 'Other fields should be kept');
  });

  test('omits empty m_StaticBatchInfo variant', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const testData = {
      m_StaticBatchInfo: { firstSubMesh: 0, subMeshCount: 0 },
      m_Mesh: 'MyMesh'
    };
    
    const resolved = resolveReferences(
      testData,
      'MonoBehaviour',
      { gameObjects: new Map(), transforms: new Map(), components: new Map() },
      {},
      config
    );
    
    assert.ok(!('m_StaticBatchInfo' in resolved) && !('staticBatchInfo' in resolved), 
      'Empty m_StaticBatchInfo should be omitted');
  });

  test('keeps non-empty staticBatchInfo', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const testData = {
      staticBatchInfo: { firstSubMesh: 0, subMeshCount: 3 },
      mesh: 'MyMesh'
    };
    
    const resolved = resolveReferences(
      testData,
      'MonoBehaviour',
      { gameObjects: new Map(), transforms: new Map(), components: new Map() },
      {},
      config
    );
    
    assert.ok('staticBatchInfo' in resolved, 'Non-empty staticBatchInfo should be kept');
  });
});

describe('Unity Event Simplification', () => {
  test('simplifies empty Unity event to empty array', () => {
    const emptyEvent = {
      m_PersistentCalls: {
        m_Calls: []
      }
    };
    
    const result = simplifyUnityEvent(emptyEvent);
    assert.deepEqual(result, [], 'Empty event should become empty array');
  });

  test('extracts method names from Unity event', () => {
    const eventWithCalls = {
      m_PersistentCalls: {
        m_Calls: [
          { m_MethodName: 'OnDamageReceived', m_Target: {}, m_Arguments: {} },
          { m_MethodName: 'PlaySound', m_Target: {}, m_Arguments: {} }
        ]
      }
    };
    
    const result = simplifyUnityEvent(eventWithCalls);
    assert.deepEqual(result, ['OnDamageReceived', 'PlaySound'], 
      'Should extract method names');
  });

  test('shows callback count for many callbacks', () => {
    const eventWithManyCalls = {
      m_PersistentCalls: {
        m_Calls: [
          { m_MethodName: 'Method1' },
          { m_MethodName: 'Method2' },
          { m_MethodName: 'Method3' },
          { m_MethodName: 'Method4' },
          { m_MethodName: 'Method5' },
          { m_MethodName: 'Method6' },
        ]
      }
    };
    
    const result = simplifyUnityEvent(eventWithManyCalls);
    assert.equal(result, '[6 callbacks]', 'Many callbacks should show count');
  });

  test('handles Unity event without method names', () => {
    const eventWithoutNames = {
      m_PersistentCalls: {
        m_Calls: [
          { m_Target: {} },
          { m_Target: {} }
        ]
      }
    };
    
    const result = simplifyUnityEvent(eventWithoutNames);
    assert.equal(result, '[2 callbacks]', 'Should show count when no method names');
  });
});

describe('Extended Default Value Filtering', () => {
  test('filters physics default values', () => {
    const config = loadConfig({ preset: 'compact' });
    
    // density is still in DEFAULT_RENDERING_VALUES and is filtered via filterDefaultRenderingProps.
    // mass/gravityScale were removed from DEFAULT_RENDERING_VALUES (fix #2) so they are no longer
    // globally filtered. Use m_-prefixed keys so fix #3 (MonoBehaviour user field protection) doesn't apply.
    const testData = {
      m_Density: 1,         // Still in DEFAULT_RENDERING_VALUES - should be filtered
      m_Mass: 1,            // Removed from DEFAULT_RENDERING_VALUES - isDefaultValue(1) is false, kept
      m_GravityScale: 1,    // Removed from DEFAULT_RENDERING_VALUES - isDefaultValue(1) is false, kept
      m_Speed: 5,           // Not default - should be kept
    };
    
    const resolved = resolveReferences(
      testData,
      'MonoBehaviour',
      { gameObjects: new Map(), transforms: new Map(), components: new Map() },
      {},
      config
    );
    
    assert.ok(!('density' in resolved) && !('m_Density' in resolved), 'Default density should be filtered');
    assert.equal(resolved.speed ?? resolved.m_Speed, 5, 'Non-default speed should be kept');
  });

  test('filters collider default values', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const testData = {
      edgeRadius: 0,        // Default - should be filtered
      usedByEffector: 0,    // Default - should be filtered
      radius: 0.5,          // Non-default - should be kept
    };
    
    const resolved = resolveReferences(
      testData,
      'MonoBehaviour',
      { gameObjects: new Map(), transforms: new Map(), components: new Map() },
      {},
      config
    );
    
    assert.ok(!('edgeRadius' in resolved), 'Default edgeRadius should be filtered');
    assert.ok(!('usedByEffector' in resolved), 'Default usedByEffector should be filtered');
    assert.equal(resolved.radius, 0.5, 'Non-default radius should be kept');
  });
});

describe('Enabled True Omission', () => {
  test('omits enabled: 1 (true) in compact mode', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const testData = {
      enabled: 1,
      isTrigger: 1,
      radius: 0.5,
    };
    
    const resolved = resolveReferences(
      testData,
      'MonoBehaviour',
      { gameObjects: new Map(), transforms: new Map(), components: new Map() },
      {},
      config
    );
    
    assert.ok(!('enabled' in resolved), 'enabled: 1 should be omitted');
    // With abbreviateFieldNames: true (in compact), isTrigger -> trigger
    assert.equal(resolved.trigger, true, 'Other boolean fields should still convert (abbreviated to trigger)');
    assert.equal(resolved.radius, 0.5, 'Non-boolean fields should be kept');
  });

  test('keeps enabled: 0 (false) in compact mode', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const testData = {
      enabled: 0,
      radius: 0.5,
    };
    
    const resolved = resolveReferences(
      testData,
      'MonoBehaviour',
      { gameObjects: new Map(), transforms: new Map(), components: new Map() },
      {},
      config
    );
    
    assert.equal(resolved.enabled, false, 'enabled: 0 should become false and be kept');
  });

  test('keeps enabled: 1 in standard mode', () => {
    const config = loadConfig({ preset: 'standard' });
    
    const testData = {
      enabled: 1,
      radius: 0.5,
    };
    
    const resolved = resolveReferences(
      testData,
      'MonoBehaviour',
      { gameObjects: new Map(), transforms: new Map(), components: new Map() },
      {},
      config
    );
    
    // Standard mode doesn't have omitEnabledTrue, so enabled should be kept
    assert.ok('enabled' in resolved, 'enabled should be kept in standard mode');
  });
});

describe('Default Offset Filtering', () => {
  test('detects default Vector2 offset', () => {
    assert.ok(isDefaultOffset('offset', { x: 0, y: 0 }), 'offset {x:0, y:0} should be default');
    assert.ok(isDefaultOffset('m_Offset', { x: 0, y: 0 }), 'm_Offset {x:0, y:0} should be default');
    assert.ok(!isDefaultOffset('offset', { x: 0.5, y: 0 }), 'offset {x:0.5, y:0} should not be default');
    assert.ok(!isDefaultOffset('offset', { x: 0, y: 0.5 }), 'offset {x:0, y:0.5} should not be default');
  });

  test('detects default Vector3 offset', () => {
    assert.ok(isDefaultOffset('offset', { x: 0, y: 0, z: 0 }), 'offset {x:0, y:0, z:0} should be default');
    assert.ok(!isDefaultOffset('offset', { x: 0, y: 0, z: 1 }), 'offset {x:0, y:0, z:1} should not be default');
  });

  test('does not match non-offset fields', () => {
    assert.ok(!isDefaultOffset('position', { x: 0, y: 0 }), 'position should not match');
    assert.ok(!isDefaultOffset('size', { x: 0, y: 0 }), 'size should not match');
  });

  test('omits default offsets in compact mode', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const testData = {
      offset: { x: 0, y: 0 },
      size: { x: 1, y: 1 },
    };
    
    const resolved = resolveReferences(
      testData,
      'MonoBehaviour',
      { gameObjects: new Map(), transforms: new Map(), components: new Map() },
      {},
      config
    );
    
    assert.ok(!('offset' in resolved), 'Default offset should be omitted');
    assert.ok('size' in resolved, 'Size should be kept');
  });

  test('keeps non-default offsets in compact mode', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const testData = {
      offset: { x: 0.5, y: 0.3 },
    };
    
    const resolved = resolveReferences(
      testData,
      'MonoBehaviour',
      { gameObjects: new Map(), transforms: new Map(), components: new Map() },
      {},
      config
    );
    
    assert.ok('offset' in resolved, 'Non-default offset should be kept');
  });
});

describe('FlipX/FlipY Filtering', () => {
  test('filters flipX: 0 (false) in compact mode', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const testData = {
      flipX: 0,
      flipY: 0,
      sprite: 'MySprite',
    };
    
    const resolved = resolveReferences(
      testData,
      'MonoBehaviour',
      { gameObjects: new Map(), transforms: new Map(), components: new Map() },
      {},
      config
    );
    
    assert.ok(!('flipX' in resolved), 'flipX: 0 should be filtered as default');
    assert.ok(!('flipY' in resolved), 'flipY: 0 should be filtered as default');
    assert.equal(resolved.sprite, 'MySprite', 'sprite should be kept');
  });

  test('keeps flipX: 1 (true) in compact mode', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const testData = {
      flipX: 1,
      flipY: 0,
    };
    
    const resolved = resolveReferences(
      testData,
      'MonoBehaviour',
      { gameObjects: new Map(), transforms: new Map(), components: new Map() },
      {},
      config
    );
    
    // flipX: 1 is not default, so should be kept (and converted to true)
    assert.equal(resolved.flipX, true, 'flipX: 1 should become true and be kept');
    assert.ok(!('flipY' in resolved), 'flipY: 0 should be filtered');
  });
});

describe('Compact Config Options', () => {
  test('compact preset has all new options enabled', () => {
    const config = loadConfig({ preset: 'compact' });
    
    assert.equal(config.omitEnabledTrue, true, 'omitEnabledTrue should be true');
    assert.equal(config.omitDefaultOffsets, true, 'omitDefaultOffsets should be true');
    assert.equal(config.filterDefaultRenderingProps, true, 'filterDefaultRenderingProps should be true');
  });

  test('standard preset has new options disabled', () => {
    const config = loadConfig({ preset: 'standard' });
    
    assert.equal(config.omitEnabledTrue, false, 'omitEnabledTrue should be false');
    assert.equal(config.omitDefaultOffsets, false, 'omitDefaultOffsets should be false');
  });
});

// New tests for Phase 3 optimizations
describe('Unknown Reference Omission', () => {
  test('omits Unknown references in compact mode', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const fileIdMap = {
      gameObjects: new Map(),
      transforms: new Map(),
      components: new Map(),
    };
    
    // Test data with an unknown GUID reference
    const testData = {
      myRef: { fileID: 11400000, guid: 'unknown-guid-12345', type: 3 },
      validValue: 'test',
    };
    
    const resolved = resolveReferences(testData, 'MonoBehaviour', fileIdMap, {}, config);
    
    assert.ok(!('myRef' in resolved), 'Unknown reference should be omitted in compact mode');
    assert.equal(resolved.validValue, 'test', 'Valid values should be kept');
  });

  test('keeps Unknown references in standard mode', () => {
    const config = loadConfig({ preset: 'standard' });
    
    const fileIdMap = {
      gameObjects: new Map(),
      transforms: new Map(),
      components: new Map(),
    };
    
    const testData = {
      myRef: { fileID: 11400000, guid: 'unknown-guid-12345', type: 3 },
    };
    
    const resolved = resolveReferences(testData, 'MonoBehaviour', fileIdMap, {}, config);
    
    assert.ok('myRef' in resolved, 'Unknown reference should be kept in standard mode');
    assert.ok(String(resolved.myRef).includes('Unknown'), 'Should contain Unknown');
  });
});

describe('Short Reference Syntax', () => {
  test('uses @ syntax for references in compact mode', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const fileIdMap = {
      gameObjects: new Map([
        ['123', { name: 'Player', layer: 0, tag: 'Player', active: true, transformFileId: '456' }],
      ]),
      transforms: new Map(),
      components: new Map(),
    };
    
    const testData = {
      target: { fileID: 123 },
    };
    
    const resolved = resolveReferences(testData, 'MonoBehaviour', fileIdMap, {}, config);
    
    assert.equal(resolved.target, '@Player', 'Should use @Name syntax for GameObject refs');
  });

  test('uses @Name.Type for component references in compact mode', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const fileIdMap = {
      gameObjects: new Map([
        ['100', { name: 'Enemy', layer: 0, tag: 'Untagged', active: true, transformFileId: '101' }],
      ]),
      transforms: new Map([
        ['101', { gameObjectFileId: '100', parentFileId: null, childrenFileIds: [] }],
      ]),
      components: new Map([
        ['200', { type: 'Rigidbody2D', gameObjectFileId: '100', data: {} }],
      ]),
    };
    
    const testData = {
      rb: { fileID: 200 },
    };
    
    const resolved = resolveReferences(testData, 'MonoBehaviour', fileIdMap, {}, config);
    
    assert.equal(resolved.rb, '@Enemy.Rigidbody2D', 'Should use @Name.Type for component refs');
  });
});

describe('SortingLayerID Removal', () => {
  test('omits sortingLayerID: 0 in compact mode (via DEFAULT_RENDERING_VALUES)', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const testData = {
      sortingLayerID: 0,    // Zero — filtered via DEFAULT_RENDERING_VALUES
      sortingLayer: 5,
      sortingOrder: 10,
    };
    
    const resolved = resolveReferences(testData, 'MonoBehaviour', {
      gameObjects: new Map(),
      transforms: new Map(),
      components: new Map(),
    }, {}, config);
    
    assert.ok(!('sortingLayerID' in resolved), 'sortingLayerID: 0 should be omitted (default)');
    // sortingLayer is abbreviated to sLayer in compact mode
    assert.equal(resolved.sLayer, 5, 'sortingLayer should be kept (as sLayer)');
    assert.equal(resolved.order, 10, 'sortingOrder should be kept (as order)');
  });

  test('keeps non-zero sortingLayerID in compact mode', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const testData = {
      sortingLayerID: 15,   // Non-zero — meaningful, should be kept
      sortingLayer: 5,
      sortingOrder: 10,
    };
    
    const resolved = resolveReferences(testData, 'MonoBehaviour', {
      gameObjects: new Map(),
      transforms: new Map(),
      components: new Map(),
    }, {}, config);
    
    assert.equal(resolved.sortingLayerID, 15, 'Non-zero sortingLayerID should be kept');
  });
});

describe('Compact Vector Notation', () => {
  test('formats vectors with parentheses in compact mode', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const testData = {
      prefab_name: 'Test',
      hierarchy: [],
      components: {
        Player: {
          Transform: {
            localPosition: { x: 1, y: 2, z: 3 },
          },
        },
      },
    };
    
    const yaml = formatYAMLWithComments(testData, config);
    
    // Should contain parentheses notation
    assert.ok(yaml.includes('(1, 2, 3)'), 'Vector should use (x, y, z) format');
  });

  test('formats colors with rgba notation', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const testData = {
      prefab_name: 'Test',
      hierarchy: [],
      components: {
        Player: {
          SpriteRenderer: {
            color: { r: 1, g: 0.5, b: 0, a: 1 },
          },
        },
      },
    };
    
    const yaml = formatYAMLWithComments(testData, config);
    
    assert.ok(yaml.includes('rgba(1, 0.5, 0, 1)'), 'Color should use rgba format');
  });
});

describe('Inline Simple Components', () => {
  test('inlines components with 1-2 simple fields', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const testData = {
      prefab_name: 'Test',
      hierarchy: [],
      components: {
        Player: {
          SimpleComponent: {
            value: 42,
            active: true,
          },
        },
      },
    };
    
    const yaml = formatYAMLWithComments(testData, config);
    
    // Should inline the component
    assert.ok(yaml.includes('SimpleComponent: {'), 'Simple component should be inlined');
  });

  test('does not inline components with complex fields', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const testData = {
      prefab_name: 'Test',
      hierarchy: [],
      components: {
        Player: {
          ComplexComponent: {
            nested: { a: 1, b: 2 },
            value: 42,
          },
        },
      },
    };
    
    const yaml = formatYAMLWithComments(testData, config);
    
    // Should NOT inline (has nested object)
    assert.ok(!yaml.includes('ComplexComponent: {'), 'Complex component should not be inlined');
  });
});

describe('Field Name Abbreviation', () => {
  test('abbreviates field names in compact mode', () => {
    const config = loadConfig({ preset: 'compact' });
    
    // Use MonoBehaviour which passes through field names (no component-specific filtering)
    // Note: We use m_* format to test the full flow: m_LocalPosition -> localPosition -> lPos
    const testData = {
      m_LocalPosition: { x: 1, y: 2, z: 3 },
      sortingOrder: 5,
      materials: ['mat1'],
      isTrigger: 1,
    };
    
    const resolved = resolveReferences(testData, 'MonoBehaviour', {
      gameObjects: new Map(),
      transforms: new Map(),
      components: new Map(),
    }, {}, config);
    
    // Check abbreviations are applied
    // m_LocalPosition -> localPosition -> lPos
    assert.ok('lPos' in resolved, 'localPosition should be abbreviated to lPos');
    assert.ok('order' in resolved, 'sortingOrder should be abbreviated to order');
    assert.ok('mats' in resolved, 'materials should be abbreviated to mats');
    // isTrigger -> trigger (abbreviated)
    assert.ok('trigger' in resolved, 'isTrigger should be abbreviated to trigger');
  });

  test('does not abbreviate in standard mode', () => {
    const config = loadConfig({ preset: 'standard' });
    
    const testData = {
      m_LocalPosition: { x: 1, y: 2, z: 3 },
    };
    
    const resolved = resolveReferences(testData, 'MonoBehaviour', {
      gameObjects: new Map(),
      transforms: new Map(),
      components: new Map(),
    }, {}, config);
    
    // In standard mode, m_LocalPosition becomes localPosition (just renamed, not abbreviated)
    assert.ok('localPosition' in resolved, 'localPosition should NOT be abbreviated in standard mode');
    assert.ok(!('lPos' in resolved), 'lPos should NOT exist in standard mode');
  });
});

describe('Hierarchy Omission', () => {
  test('can omit hierarchy with includeHierarchy: false', () => {
    const config = loadConfig({ preset: 'compact', includeHierarchy: false });
    
    const testData = {
      prefab_name: 'Test',
      hierarchy: [{ name: 'Root', children: [{ name: 'Child' }] }],
      components: {
        Root: { Transform: { lPos: '(0, 0, 0)' } },
      },
    };
    
    const yaml = formatYAMLWithComments(testData, config);
    
    assert.ok(!yaml.includes('hierarchy:'), 'Hierarchy section should be omitted');
    assert.ok(yaml.includes('components:'), 'Components should still be included');
  });

  test('includes hierarchy by default', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const testData = {
      prefab_name: 'Test',
      hierarchy: [{ name: 'Root' }],
      components: {},
    };
    
    const yaml = formatYAMLWithComments(testData, config);
    
    assert.ok(yaml.includes('hierarchy:'), 'Hierarchy should be included by default');
  });
});

describe('Compact Preset New Options', () => {
  test('compact preset has all Phase 3 options enabled', () => {
    const config = loadConfig({ preset: 'compact' });
    
    assert.equal(config.omitUnknownRefs, true, 'omitUnknownRefs should be true');
    assert.equal(config.useShortRefs, true, 'useShortRefs should be true');
    assert.equal(config.useParenVectors, true, 'useParenVectors should be true');
    assert.equal(config.inlineSimpleComponents, true, 'inlineSimpleComponents should be true');
    assert.equal(config.abbreviateFieldNames, true, 'abbreviateFieldNames should be true');
    assert.equal(config.includeHierarchy, true, 'includeHierarchy should be true by default');
  });

  test('standard preset has Phase 3 options disabled', () => {
    const config = loadConfig({ preset: 'standard' });
    
    assert.equal(config.omitUnknownRefs, false, 'omitUnknownRefs should be false');
    assert.equal(config.useShortRefs, false, 'useShortRefs should be false');
    assert.equal(config.useParenVectors, false, 'useParenVectors should be false');
    assert.equal(config.inlineSimpleComponents, false, 'inlineSimpleComponents should be false');
    assert.equal(config.abbreviateFieldNames, false, 'abbreviateFieldNames should be false');
  });
});

// Prefab Variant Tests
import { 
  detectPrefabVariant, 
  mergeVectorProperties, 
  filterInternalModifications,
  getReadablePropertyName,
  type PropertyModification,
} from '../src/variant.js';

describe('Prefab Variant Detection', () => {
  test('detects PrefabInstance documents', () => {
    // Mock parsed documents with a PrefabInstance
    const mockDocs = [
      {
        tag: '!u!1001',
        classId: '1001',
        fileId: '123',
        className: 'PrefabInstance',
        data: {
          m_SourcePrefab: { fileID: 100100000, guid: 'abc123', type: 3 },
          m_Modification: {
            m_Modifications: [
              { target: { fileID: 456, guid: 'abc123' }, propertyPath: 'm_LocalPosition.x', value: '5', objectReference: { fileID: 0 } },
            ],
          },
        },
      },
    ];
    
    const assetCache = {
      'abc123': { name: 'TestPrefab', type: 'Prefab', path: 'Assets/Test.prefab' },
    };
    
    const variantInfo = detectPrefabVariant(mockDocs, assetCache);
    
    assert.ok(variantInfo !== null, 'Should detect variant');
    assert.equal(variantInfo.basePrefabName, 'TestPrefab', 'Should resolve base prefab name');
    assert.equal(variantInfo.prefabInstances.length, 1, 'Should have 1 prefab instance');
    assert.equal(variantInfo.prefabInstances[0].modifications.length, 1, 'Should have 1 modification');
  });

  test('returns null for non-variant prefabs', () => {
    // Regular prefab without PrefabInstance
    const mockDocs = [
      {
        tag: '!u!1',
        classId: '1',
        fileId: '123',
        className: 'GameObject',
        data: { m_Name: 'Test' },
      },
    ];
    
    const variantInfo = detectPrefabVariant(mockDocs, {});
    
    assert.equal(variantInfo, null, 'Should return null for non-variant');
  });
});

describe('Vector Property Merging', () => {
  test('merges x, y, z into vector object', () => {
    const modifications: PropertyModification[] = [
      { targetFileId: '123', targetGuid: 'abc', propertyPath: 'm_LocalPosition.x', value: '1', objectReference: null },
      { targetFileId: '123', targetGuid: 'abc', propertyPath: 'm_LocalPosition.y', value: '2', objectReference: null },
      { targetFileId: '123', targetGuid: 'abc', propertyPath: 'm_LocalPosition.z', value: '3', objectReference: null },
    ];
    
    const merged = mergeVectorProperties(modifications);
    
    assert.equal(merged.size, 1, 'Should have 1 target');
    
    const targetProps = merged.get('abc:123');
    assert.ok(targetProps, 'Should have target properties');
    assert.ok('m_LocalPosition' in targetProps, 'Should have merged m_LocalPosition');
    
    const pos = targetProps.m_LocalPosition as Record<string, number>;
    assert.equal(pos.x, 1, 'x should be 1');
    assert.equal(pos.y, 2, 'y should be 2');
    assert.equal(pos.z, 3, 'z should be 3');
  });

  test('keeps single properties as-is', () => {
    const modifications: PropertyModification[] = [
      { targetFileId: '123', targetGuid: 'abc', propertyPath: 'm_IsActive', value: '1', objectReference: null },
    ];
    
    const merged = mergeVectorProperties(modifications);
    const targetProps = merged.get('abc:123');
    
    assert.ok(targetProps, 'Should have target properties');
    assert.equal(targetProps.m_IsActive, '1', 'Should keep single property value');
  });
});

describe('Internal Modification Filtering', () => {
  test('filters out internal properties', () => {
    const modifications: PropertyModification[] = [
      { targetFileId: '1', targetGuid: 'a', propertyPath: 'm_RootOrder', value: '5', objectReference: null },
      { targetFileId: '1', targetGuid: 'a', propertyPath: 'm_LocalEulerAnglesHint.x', value: '0', objectReference: null },
      { targetFileId: '1', targetGuid: 'a', propertyPath: 'm_LocalPosition.x', value: '10', objectReference: null },
      { targetFileId: '1', targetGuid: 'a', propertyPath: 'm_StaticEditorFlags', value: '0', objectReference: null },
    ];
    
    const filtered = filterInternalModifications(modifications);
    
    assert.equal(filtered.length, 1, 'Should only keep non-internal properties');
    assert.equal(filtered[0].propertyPath, 'm_LocalPosition.x', 'Should keep m_LocalPosition');
  });
});

describe('Readable Property Names', () => {
  test('converts Unity property paths to readable names', () => {
    assert.equal(getReadablePropertyName('m_LocalPosition'), 'localPosition');
    assert.equal(getReadablePropertyName('m_IsActive'), 'isActive');
    assert.equal(getReadablePropertyName('States[0].Actions.array'), 'states.actions.array');
  });
});

describe('Formatter Variant Output', () => {
  test('includes variant_of field for variants', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const testData = {
      prefab_name: 'TestVariant',
      variant_of: 'BasePrefab',
      hierarchy: [],
      components: {},
    };
    
    const yaml = formatYAMLWithComments(testData, config);
    
    assert.ok(yaml.includes('variant_of: BasePrefab'), 'Should include variant_of field');
  });

  test('includes modifications section with markers', () => {
    // Use standard preset to test non-tree format (modifications section)
    const config = loadConfig({ preset: 'standard', showVariantMarkers: true });
    
    const testData = {
      prefab_name: 'TestVariant',
      variant_of: 'BasePrefab',
      hierarchy: [],
      components: {},
      modifications: {
        BasePrefab: {
          Transform: {
            localPosition: '(1, 2, 3)',
          },
        },
      },
    };
    
    const yaml = formatYAMLWithComments(testData, config);
    
    assert.ok(yaml.includes('modifications:'), 'Should include modifications section');
    assert.ok(yaml.includes('# $'), 'Should include # $ marker for modifications');
  });

  test('can disable variant markers', () => {
    const config = loadConfig({ preset: 'compact', showVariantMarkers: false });
    
    const testData = {
      prefab_name: 'TestVariant',
      variant_of: 'BasePrefab',
      hierarchy: [],
      components: {},
      modifications: {
        BasePrefab: {
          Transform: {
            localPosition: '(1, 2, 3)',
          },
        },
      },
    };
    
    const yaml = formatYAMLWithComments(testData, config);
    
    assert.ok(!yaml.includes('# +'), 'Should NOT include # + marker when disabled');
  });
  
  test('shows combined markers for GameObject with multiple change types', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const testData = {
      prefab_name: 'TestVariant',
      variant_of: 'BasePrefab',
      hierarchy: [],
      components: {},
      modifications: {
        'BasePrefab': {
          Transform: { lPos: '(0, 1, 0)' },
        },
      },
      added_components: {
        'BasePrefab': {
          BoxCollider2D: { trigger: true },
        },
      },
      removed_components: [
        'BasePrefab.CircleCollider2D',
      ],
    };
    
    const yaml = formatYAMLWithComments(testData, config);
    
    // Root should show combined markers
    assert.ok(yaml.includes('BasePrefab  # $ + -'), 'Should show combined markers on root');
  });
  
  test('shows # $ on component name and fields for modifications', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const testData = {
      prefab_name: 'TestVariant',
      variant_of: 'BasePrefab',
      hierarchy: [],
      components: {},
      modifications: {
        'BasePrefab': {
          Transform: { lPos: '(0, 1, 0)' },
        },
      },
    };
    
    const yaml = formatYAMLWithComments(testData, config);
    
    assert.ok(yaml.includes('Transform:  # $'), 'Should have # $ on component name');
    assert.ok(yaml.includes('lPos: (0, 1, 0)  # $'), 'Should have # $ on field');
  });
  
  test('shows # + on component name for added components', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const testData = {
      prefab_name: 'TestVariant',
      variant_of: 'BasePrefab',
      hierarchy: [],
      components: {},
      added_components: {
        'BasePrefab': {
          BoxCollider2D: { trigger: true, size: '(1, 1)' },
        },
      },
    };
    
    const yaml = formatYAMLWithComments(testData, config);
    
    assert.ok(yaml.includes('BoxCollider2D:  # +'), 'Should have # + on added component name');
    // Fields should NOT have markers
    assert.ok(yaml.includes('trigger: true'), 'Should include field without marker');
  });
  
  test('shows removed components as comments', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const testData = {
      prefab_name: 'TestVariant',
      variant_of: 'BasePrefab',
      hierarchy: [],
      components: {},
      removed_components: [
        'BasePrefab.SpriteRenderer',
        'BasePrefab.AudioSource',
      ],
    };
    
    const yaml = formatYAMLWithComments(testData, config);
    
    assert.ok(yaml.includes('# SpriteRenderer  # -'), 'Should show removed component as comment');
    assert.ok(yaml.includes('# AudioSource  # -'), 'Should show second removed component');
  });
  
  test('variant hierarchy shows only GameObjects not components', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const testData = {
      prefab_name: 'TestVariant',
      variant_of: 'BasePrefab',
      hierarchy: [],
      components: {},
      modifications: {
        'BasePrefab': {
          Transform: { lPos: '(0, 1, 0)' },
          SpriteRenderer: { color: 'rgba(1, 0, 0, 1)' },
        },
        'Child': {
          Transform: { lPos: '(1, 0, 0)' },
        },
      },
    };
    
    const yaml = formatYAMLWithComments(testData, config);
    
    // Should NOT show Transform, SpriteRenderer in hierarchy
    assert.ok(!yaml.includes('├── BasePrefab.Transform'), 'Should not list components in hierarchy');
    // Should show only GameObjects
    assert.ok(yaml.includes('BasePrefab  # $'), 'Should show root with marker');
    assert.ok(yaml.includes('Child  # $'), 'Should show child GameObject with marker');
  });
});

// Tree Hierarchy Format Tests
describe('Tree Hierarchy Format', () => {
  test('formats simple hierarchy as tree', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const hierarchy = [
      {
        name: 'Root',
        children: [
          { name: 'Child1' },
          { name: 'Child2' },
        ],
      },
    ];
    
    const tree = formatHierarchyAsTree(hierarchy, config);
    
    assert.ok(tree.includes('Root'), 'Should include Root node');
    assert.ok(tree.includes('├── Child1'), 'Should have Child1 with connector');
    assert.ok(tree.includes('└── Child2'), 'Should have Child2 as last child');
  });
  
  test('formats nested hierarchy with proper connectors', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const hierarchy = [
      {
        name: 'Root',
        children: [
          {
            name: 'Parent',
            children: [
              { name: 'GrandChild1' },
              { name: 'GrandChild2' },
            ],
          },
          { name: 'Sibling' },
        ],
      },
    ];
    
    const tree = formatHierarchyAsTree(hierarchy, config);
    
    assert.ok(tree.includes('Root'), 'Should include Root');
    assert.ok(tree.includes('├── Parent'), 'Should have Parent with mid connector');
    assert.ok(tree.includes('│   ├── GrandChild1'), 'Should have GrandChild1 with vertical line prefix');
    assert.ok(tree.includes('│   └── GrandChild2'), 'Should have GrandChild2 as last child of Parent');
    assert.ok(tree.includes('└── Sibling'), 'Should have Sibling as last child of Root');
  });
  
  test('includes inline metadata for non-default values', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const hierarchy = [
      {
        name: 'Player',
        tag: 'Player',
        layer: 5,
        children: [
          { name: 'Active Child' },
          { name: 'Inactive Child', active: false },
        ],
      },
    ];
    
    const tree = formatHierarchyAsTree(hierarchy, config);
    
    // Root should have tag and layer metadata
    assert.ok(tree.includes('Player (t: Player, l: UI)'), 'Should show tag and layer for root');
    // Inactive child should show a: false
    assert.ok(tree.includes('Inactive Child (a: false)'), 'Should show active: false');
    // Active child should not have metadata
    assert.ok(tree.includes('├── Active Child\n') || tree.includes('├── Active Child\r\n'), 'Active child should have no metadata');
  });
  
  test('omits default values from metadata', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const hierarchy = [
      {
        name: 'Default',
        tag: 'Untagged',  // Default - should be omitted
        layer: 0,         // Default - should be omitted
        active: true,     // Default - should be omitted
      },
    ];
    
    const tree = formatHierarchyAsTree(hierarchy, config);
    
    // Should just be the name with no parentheses
    assert.equal(tree.trim(), 'Default', 'Default values should not show metadata');
  });
});

// Layer Name Mapping Tests
describe('Layer Name Mapping', () => {
  test('returns default Unity layer names', () => {
    assert.equal(getLayerName(0), 'Default', 'Layer 0 should be Default');
    assert.equal(getLayerName(1), 'TransparentFX', 'Layer 1 should be TransparentFX');
    assert.equal(getLayerName(2), 'Ignore Raycast', 'Layer 2 should be Ignore Raycast');
    assert.equal(getLayerName(4), 'Water', 'Layer 4 should be Water');
    assert.equal(getLayerName(5), 'UI', 'Layer 5 should be UI');
  });
  
  test('returns LayerN for undefined layers', () => {
    assert.equal(getLayerName(8), 'Layer8', 'Layer 8 should be Layer8');
    assert.equal(getLayerName(15), 'Layer15', 'Layer 15 should be Layer15');
    assert.equal(getLayerName(28), 'Layer28', 'Layer 28 should be Layer28');
    assert.equal(getLayerName(31), 'Layer31', 'Layer 31 should be Layer31');
  });
});

// Variant Tree Format Tests
describe('Variant Tree Format', () => {
  test('formats variant hierarchy with markers', () => {
    const config = loadConfig({ preset: 'compact', showVariantMarkers: true });
    
    const nodes: VariantHierarchyNode[] = [
      {
        name: 'Base',
        children: [
          { name: 'Modified.Transform', marker: 'modified' },
          { name: 'NewChild', marker: 'added' },
          { name: 'OldChild', marker: 'removed' },
        ],
      },
    ];
    
    const tree = formatVariantHierarchyAsTree(nodes, config);
    
    assert.ok(tree.includes('Base'), 'Should include base node');
    assert.ok(tree.includes('Modified.Transform  # $'), 'Should show # $ for modified');
    assert.ok(tree.includes('NewChild  # +'), 'Should show # + for added');
    assert.ok(tree.includes('OldChild  # -'), 'Should show # - for removed');
  });
  
  test('omits markers when showVariantMarkers is false', () => {
    const config = loadConfig({ preset: 'compact', showVariantMarkers: false });
    
    const nodes: VariantHierarchyNode[] = [
      {
        name: 'Base',
        children: [
          { name: 'Modified', marker: 'modified' },
        ],
      },
    ];
    
    const tree = formatVariantHierarchyAsTree(nodes, config);
    
    assert.ok(!tree.includes('# $'), 'Should not include markers when disabled');
    assert.ok(!tree.includes('# +'), 'Should not include markers when disabled');
    assert.ok(!tree.includes('# -'), 'Should not include markers when disabled');
  });
});

// Tree Format Config Tests
describe('Tree Format Configuration', () => {
  test('compact preset has useTreeHierarchy enabled', () => {
    const config = loadConfig({ preset: 'compact' });
    
    assert.equal(config.useTreeHierarchy, true, 'Compact preset should have useTreeHierarchy: true');
  });
  
  test('standard preset has useTreeHierarchy disabled', () => {
    const config = loadConfig({ preset: 'standard' });
    
    assert.equal(config.useTreeHierarchy, false, 'Standard preset should have useTreeHierarchy: false');
  });
  
  test('useTreeHierarchy can be overridden', () => {
    const config = loadConfig({ preset: 'compact', useTreeHierarchy: false });
    
    assert.equal(config.useTreeHierarchy, false, 'Should be able to override useTreeHierarchy');
  });
  
  test('formats output with tree hierarchy when enabled', () => {
    const config = loadConfig({ preset: 'compact' });
    
    const testData = {
      prefab_name: 'TestPrefab',
      hierarchy: [
        {
          name: 'Root',
          children: [
            { name: 'Child' },
          ],
        },
      ],
      components: {},
    };
    
    const yaml = formatYAMLWithComments(testData, config);
    
    // Tree format uses literal block style with |
    assert.ok(yaml.includes('hierarchy: |'), 'Should use literal block style for tree');
    assert.ok(yaml.includes('Root'), 'Should include Root');
    assert.ok(yaml.includes('└── Child'), 'Should include tree connector');
  });
  
  test('formats output with standard hierarchy when disabled', () => {
    const config = loadConfig({ preset: 'standard' });
    
    const testData = {
      prefab_name: 'TestPrefab',
      hierarchy: [
        {
          name: 'Root',
          children: [
            { name: 'Child' },
          ],
        },
      ],
      components: {},
    };
    
    const yaml = formatYAMLWithComments(testData, config);
    
    // Standard format uses YAML list structure
    assert.ok(yaml.includes('hierarchy:'), 'Should have hierarchy section');
    assert.ok(yaml.includes('- name: Root'), 'Should use YAML list format');
    assert.ok(!yaml.includes('├──'), 'Should not use tree connectors');
  });
});

// Run all tests
console.log('Running Unity Prefab Parser tests...');
