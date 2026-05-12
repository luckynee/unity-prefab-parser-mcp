// Component property definitions for Inspector-visible fields
// Maps Unity internal field names to clean Inspector names

export interface ComponentFilter {
  include?: string[] | 'all_except_internals';
  exclude?: string[];
  rename?: Record<string, string>;
  scriptField?: string;
}

// Fields that should ALWAYS be excluded (Unity internals)
export const ALWAYS_EXCLUDE = [
  'm_ObjectHideFlags',
  'm_CorrespondingSourceObject',
  'm_PrefabInstance',
  'm_PrefabAsset',
  'serializedVersion',
  'm_EditorHideFlags',
  'm_EditorClassIdentifier',
  'm_ForceSendLayers',
  'm_ForceReceiveLayers',
  'm_ContactCaptureLayers',
  'm_CallbackLayers',
  'm_IncludeLayers',
  'm_ExcludeLayers',
  'm_LayerOverridePriority',
  'm_GameObject',
  'm_Name',
];

// Additional fields to exclude in compact mode (Unity internals with less obvious names)
export const COMPACT_MODE_EXCLUDE = [
  'version',                    // Large numeric version fields like 1073741824
  'm_ConstrainProportionsScale',
  'm_LocalEulerAnglesHint',
  'm_RootOrder',
  // sortingLayerID / m_SortingLayerID removed: non-zero values (e.g. 15) are meaningful.
  // Zero values are still filtered via DEFAULT_RENDERING_VALUES.
];

// Field name abbreviations for compact mode
// Uses distinct prefixes to avoid ambiguity (l = local, w = world/global)
export const FIELD_ABBREVIATIONS: Record<string, string> = {
  // Transform
  'localPosition': 'lPos',
  'localRotation': 'lRot',
  'localScale': 'lScale',
  'localEulerAngles': 'lEuler',
  'worldPosition': 'wPos',
  'globalPosition': 'wPos',
  'position': 'pos',            // When context is clear (not Transform)
  'rotation': 'rot',
  
  // RectTransform
  'anchoredPosition': 'anchorPos',
  'anchorMin': 'ancMin',
  'anchorMax': 'ancMax',
  'sizeDelta': 'size',
  
  // Sorting
  'sortingOrder': 'order',
  'sortingLayer': 'sLayer',
  
  // Renderer
  'materials': 'mats',
  'material': 'mat',
  
  // Physics
  'linearDamping': 'linDamp',
  'angularDamping': 'angDamp',
  'gravityScale': 'gravity',
  
  // Collider
  'isTrigger': 'trigger',
  
  // Audio
  'playOnAwake': 'autoPlay',
  'spatialBlend': 'spatial',
  
  // Animation
  'controller': 'ctrl',
  'applyRootMotion': 'rootMotion',
  
  // Camera
  'orthographicSize': 'orthoSize',
  'fieldOfView': 'fov',
  'nearClipPlane': 'near',
  'farClipPlane': 'far',
  'backgroundColor': 'bgColor',
  
  // Common
  'interactable': 'interact',
  'raycastTarget': 'raycast',
};

// Default rendering properties with their default values
// These are filtered in compact mode when they match default values
export const DEFAULT_RENDERING_VALUES: Record<string, unknown> = {
  // Renderer properties
  dynamicOccludee: 1,
  m_DynamicOccludee: 1,
  motionVectors: 1,
  m_MotionVectors: 1,
  lightProbeUsage: 1,
  m_LightProbeUsage: 1,
  reflectionProbeUsage: 1,
  m_ReflectionProbeUsage: 1,
  rayTracingAccelStructBuildFlags: 1,
  smallMeshCulling: 1,
  m_SmallMeshCulling: 1,
  forceMeshLod: -1,
  renderingLayerMask: 1,
  m_RenderingLayerMask: 1,
  rendererPriority: 0,
  m_RendererPriority: 0,
  
  // Lightmap properties
  scaleInLightmap: 1,
  m_ScaleInLightmap: 1,
  receiveGI: 1,
  m_ReceiveGI: 1,
  stitchLightmapSeams: 1,
  m_StitchLightmapSeams: 1,
  preserveUVs: 0,
  m_PreserveUVs: 0,
  ignoreNormalsForChartDetection: 0,
  m_IgnoreNormalsForChartDetection: 0,
  importantGI: 0,
  m_ImportantGI: 0,
  minimumChartSize: 4,
  m_MinimumChartSize: 4,
  autoUVMaxDistance: 0.5,
  m_AutoUVMaxDistance: 0.5,
  autoUVMaxAngle: 89,
  m_AutoUVMaxAngle: 89,
  
  // Shadow properties
  castShadows: 1,
  m_CastShadows: 1,
  receiveShadows: 1,
  m_ReceiveShadows: 1,
  staticShadowCaster: 0,
  m_StaticShadowCaster: 0,
  
  // Raytracing
  rayTracingMode: 0,
  m_RayTracingMode: 0,
  
  // Sprite specific
  wasSpriteAssigned: 1,
  m_WasSpriteAssigned: 1,
  adaptiveModeThreshold: 0.5,
  m_AdaptiveModeThreshold: 0.5,
  spriteSortPoint: 0,
  m_SpriteSortPoint: 0,
  
  // Additional sprite defaults (various non-zero defaults to filter)
  m_RayTracingAccelStructBuildFlags: 1,
  m_ForceMeshLod: -1,
  
  // Physics defaults (Collider only — Rigidbody2D fields removed to avoid silently dropping non-default values)
  density: 1,
  m_Density: 1,
  
  // Collider defaults
  edgeRadius: 0,
  m_EdgeRadius: 0,
  usedByEffector: 0,
  m_UsedByEffector: 0,
  usedByComposite: 0,
  m_UsedByComposite: 0,
  compositeOperation: 0,
  m_CompositeOperation: 0,
  compositeOrder: 0,
  m_CompositeOrder: 0,
  
  // Layer override defaults
  layerOverridePriority: 0,
  m_LayerOverridePriority: 0,
  
  // Sorting defaults
  sortingLayerID: 0,
  m_SortingLayerID: 0,
  sortingOrder: 0,
  m_SortingOrder: 0,
  
  // Audio defaults
  priority: 128,
  m_Priority: 128,
  spatialBlend: 0,
  m_SpatialBlend: 0,
  
  // Animator defaults
  updateMode: 0,
  m_UpdateMode: 0,
  cullingMode: 0,
  m_CullingMode: 0,
  
  // Sprite flip defaults (false = 0)
  flipX: 0,
  m_FlipX: 0,
  flipY: 0,
  m_FlipY: 0,

  // Sorting layer name index (0 = default layer, redundant when sortingLayerID is shown)
  sortingLayer: 0,
  m_SortingLayer: 0,
  sLayer: 0,           // abbreviated form

  // Draw mode defaults
  drawMode: 0,
  m_DrawMode: 0,
  spriteTileMode: 0,
  m_SpriteTileMode: 0,
  maskInteraction: 0,
  m_MaskInteraction: 0,
};

/**
 * Check if a field is a default offset vector {x: 0, y: 0}
 */
export function isDefaultOffset(key: string, value: unknown): boolean {
  // Only check fields that contain 'offset' in name
  if (!key.toLowerCase().includes('offset')) return false;
  
  if (typeof value !== 'object' || value === null) return false;
  
  const obj = value as Record<string, unknown>;
  
  // Check for Vector2 {x: 0, y: 0}
  if ('x' in obj && 'y' in obj && !('z' in obj)) {
    return obj.x === 0 && obj.y === 0;
  }
  
  // Check for Vector3 {x: 0, y: 0, z: 0}
  if ('x' in obj && 'y' in obj && 'z' in obj) {
    return obj.x === 0 && obj.y === 0 && obj.z === 0;
  }
  
  return false;
}

// Patterns to identify boolean fields that should use true/false instead of 0/1
const BOOLEAN_FIELD_PATTERNS = [
  // Core patterns
  /^enabled$/i,
  /^m_Enabled$/,
  /^isTrigger$/i,
  /^m_IsTrigger$/,
  
  // Prefix patterns (is, has, can, should, use)
  /^is[A-Z]/,
  /^has[A-Z]/,
  /^can[A-Z]/,
  /^should[A-Z]/,
  /^use[A-Z]/,
  /^_is[A-Z]/,
  /^_has[A-Z]/,
  /^_can[A-Z]/,
  /^_use[A-Z]/,
  /^m_Is[A-Z]/,
  /^m_Has[A-Z]/,
  /^m_Can[A-Z]/,
  /^m_Use[A-Z]/,
  
  // Additional prefix patterns (draw, allow, show, hide)
  /^draw[A-Z]/i,         // drawGizmos, drawDebug
  /^_draw[A-Z]/i,
  /^allow[A-Z]/i,        // allowWaterBypass
  /^_allow[A-Z]/i,       // _allowWaterBypass
  /^show[A-Z]/i,         // showDebug, showGizmos
  /^_show[A-Z]/i,
  /^hide[A-Z]/i,         // hideInHierarchy
  /^_hide[A-Z]/i,
  
  // Suffix patterns
  /Enabled$/,            // isEnabled, componentEnabled
  /Active$/,             // BrainActive, gameObjectActive
  /Visible$/,            // isVisible
  /Interactable$/,       // buttonInteractable
  
  // Specific Unity fields
  /^simulated$/i,
  /^m_Simulated$/,
  /^loop$/i,
  /^m_Loop$/,
  /^mute$/i,
  /^m_Mute$/,
  /^playOnAwake$/i,
  /^m_PlayOnAwake$/,
  /^flipX$/i,
  /^m_FlipX$/,
  /^flipY$/i,
  /^m_FlipY$/,
  /^convex$/i,
  /^m_Convex$/,
  /^kinematic$/i,
  /^m_IsKinematic$/,
  /^applyRootMotion$/i,
  /^m_ApplyRootMotion$/,
  
  // A* Pathfinding specific
  /^interpolatePathSwitches$/i,
  /^useRaycasting$/i,
  /^alwaysDrawGizmos$/i,
  
  // Common game dev patterns
  /^debug[A-Z]/i,        // debugMode
  /^_debug[A-Z]/i,
  /^locked$/i,           // isLocked
  /^paused$/i,           // isPaused
  /^valid$/i,            // isValid
  /^dirty$/i,            // isDirty
  /^initialized$/i,      // isInitialized
  /^destroyed$/i,        // isDestroyed
  /^spawned$/i,          // isSpawned
  /^grounded$/i,         // isGrounded
  /^jumping$/i,          // isJumping
  /^attacking$/i,        // isAttacking
  /^moving$/i,           // isMoving
  /^alive$/i,            // isAlive
  /^dead$/i,             // isDead
];

/**
 * Check if a field name represents a boolean field
 */
export function isBooleanField(fieldName: string): boolean {
  return BOOLEAN_FIELD_PATTERNS.some(pattern => pattern.test(fieldName));
}

/**
 * Check if a field has a default rendering value that can be filtered
 */
export function isDefaultRenderingValue(fieldName: string, value: unknown): boolean {
  const defaultValue = DEFAULT_RENDERING_VALUES[fieldName];
  return defaultValue !== undefined && defaultValue === value;
}

/**
 * Check if a Transform value is a default value that can be omitted
 * - lPos/localPosition: (0, 0, 0)
 * - lRot/localRotation: (0, 0, 0, 1) - identity quaternion
 * - lScale/localScale: (1, 1, 1)
 */
export function isDefaultTransformValue(fieldName: string, value: unknown): boolean {
  // Handle string format (from useParenVectors)
  if (typeof value === 'string') {
    // Default position (0, 0, 0)
    if ((fieldName === 'lPos' || fieldName === 'localPosition' || 
         fieldName === 'm_LocalPosition') && 
        value === '(0, 0, 0)') {
      return true;
    }
    // Default scale (1, 1, 1)
    if ((fieldName === 'lScale' || fieldName === 'localScale' || 
         fieldName === 'm_LocalScale') && 
        value === '(1, 1, 1)') {
      return true;
    }
    // Default rotation - identity quaternion (0, 0, 0, 1)
    if ((fieldName === 'lRot' || fieldName === 'localRotation' || 
         fieldName === 'm_LocalRotation') && 
        value === '(0, 0, 0, 1)') {
      return true;
    }
    return false;
  }
  
  // Handle object format {x, y, z, w}
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  
  const v = value as Record<string, number>;
  
  // Default position (0, 0, 0)
  if ((fieldName === 'lPos' || fieldName === 'localPosition' || 
       fieldName === 'm_LocalPosition') &&
      v.x === 0 && v.y === 0 && v.z === 0) {
    return true;
  }
  
  // Default scale (1, 1, 1)
  if ((fieldName === 'lScale' || fieldName === 'localScale' || 
       fieldName === 'm_LocalScale') &&
      v.x === 1 && v.y === 1 && v.z === 1) {
    return true;
  }
  
  // Default rotation - identity quaternion (0, 0, 0, 1)
  if ((fieldName === 'lRot' || fieldName === 'localRotation' || 
       fieldName === 'm_LocalRotation') &&
      v.x === 0 && v.y === 0 && v.z === 0 && v.w === 1) {
    return true;
  }
  
  return false;
}

// Component-specific field filters and renames
export const INSPECTOR_FIELDS: Record<string, ComponentFilter> = {
  Transform: {
    include: ['m_LocalPosition', 'm_LocalRotation', 'm_LocalScale'],
    rename: {
      'm_LocalPosition': 'localPosition',
      'm_LocalRotation': 'localRotation',
      'm_LocalScale': 'localScale',
    },
  },

  RectTransform: {
    include: [
      'm_LocalPosition', 'm_LocalRotation', 'm_LocalScale',
      'm_AnchorMin', 'm_AnchorMax', 'm_AnchoredPosition',
      'm_SizeDelta', 'm_Pivot',
    ],
    rename: {
      'm_LocalPosition': 'localPosition',
      'm_LocalRotation': 'localRotation',
      'm_LocalScale': 'localScale',
      'm_AnchorMin': 'anchorMin',
      'm_AnchorMax': 'anchorMax',
      'm_AnchoredPosition': 'anchoredPosition',
      'm_SizeDelta': 'sizeDelta',
      'm_Pivot': 'pivot',
    },
  },

  Rigidbody2D: {
    include: [
      'm_Mass',
      'm_LinearDrag', 'm_AngularDrag',           // Unity 2021 and earlier
      'm_LinearDamping', 'm_AngularDamping',      // Unity 2022+
      'm_GravityScale',
      'm_BodyType', 'm_Constraints', 'm_Simulated', 'm_Material',
      'm_UseAutoMass', 'm_Interpolate', 'm_SleepingMode', 'm_CollisionDetection',
    ],
    rename: {
      'm_Mass': 'mass',
      'm_LinearDrag': 'linearDrag',
      'm_AngularDrag': 'angularDrag',
      'm_LinearDamping': 'linearDamping',
      'm_AngularDamping': 'angularDamping',
      'm_GravityScale': 'gravityScale',
      'm_BodyType': 'bodyType',
      'm_Constraints': 'constraints',
      'm_Simulated': 'simulated',
      'm_Material': 'material',
      'm_UseAutoMass': 'useAutoMass',
      'm_Interpolate': 'interpolate',
      'm_SleepingMode': 'sleepingMode',
      'm_CollisionDetection': 'collisionDetection',
    },
  },

  Rigidbody: {
    include: [
      'm_Mass', 'm_Drag', 'm_AngularDrag', 'm_UseGravity',
      'm_IsKinematic', 'm_Interpolate', 'm_Constraints',
      'm_CollisionDetection',
    ],
    rename: {
      'm_Mass': 'mass',
      'm_Drag': 'drag',
      'm_AngularDrag': 'angularDrag',
      'm_UseGravity': 'useGravity',
      'm_IsKinematic': 'isKinematic',
      'm_Interpolate': 'interpolate',
      'm_Constraints': 'constraints',
      'm_CollisionDetection': 'collisionDetection',
    },
  },

  CircleCollider2D: {
    include: ['m_Radius', 'm_Offset', 'm_IsTrigger', 'm_Density', 'm_Material', 'm_Enabled'],
    rename: {
      'm_Radius': 'radius',
      'm_Offset': 'offset',
      'm_IsTrigger': 'isTrigger',
      'm_Density': 'density',
      'm_Material': 'material',
      'm_Enabled': 'enabled',
    },
  },

  BoxCollider2D: {
    include: ['m_Size', 'm_Offset', 'm_IsTrigger', 'm_Density', 'm_Material', 'm_Enabled', 'm_EdgeRadius'],
    rename: {
      'm_Size': 'size',
      'm_Offset': 'offset',
      'm_IsTrigger': 'isTrigger',
      'm_Density': 'density',
      'm_Material': 'material',
      'm_Enabled': 'enabled',
      'm_EdgeRadius': 'edgeRadius',
    },
  },

  CapsuleCollider2D: {
    include: ['m_Size', 'm_Offset', 'm_IsTrigger', 'm_Density', 'm_Material', 'm_Enabled', 'm_Direction'],
    rename: {
      'm_Size': 'size',
      'm_Offset': 'offset',
      'm_IsTrigger': 'isTrigger',
      'm_Density': 'density',
      'm_Material': 'material',
      'm_Enabled': 'enabled',
      'm_Direction': 'direction',
    },
  },

  PolygonCollider2D: {
    include: ['m_Points', 'm_Offset', 'm_IsTrigger', 'm_Density', 'm_Material', 'm_Enabled'],
    rename: {
      'm_Points': 'points',
      'm_Offset': 'offset',
      'm_IsTrigger': 'isTrigger',
      'm_Density': 'density',
      'm_Material': 'material',
      'm_Enabled': 'enabled',
    },
  },

  BoxCollider: {
    include: ['m_Size', 'm_Center', 'm_IsTrigger', 'm_Material', 'm_Enabled'],
    rename: {
      'm_Size': 'size',
      'm_Center': 'center',
      'm_IsTrigger': 'isTrigger',
      'm_Material': 'material',
      'm_Enabled': 'enabled',
    },
  },

  SphereCollider: {
    include: ['m_Radius', 'm_Center', 'm_IsTrigger', 'm_Material', 'm_Enabled'],
    rename: {
      'm_Radius': 'radius',
      'm_Center': 'center',
      'm_IsTrigger': 'isTrigger',
      'm_Material': 'material',
      'm_Enabled': 'enabled',
    },
  },

  CapsuleCollider: {
    include: ['m_Radius', 'm_Height', 'm_Direction', 'm_Center', 'm_IsTrigger', 'm_Material', 'm_Enabled'],
    rename: {
      'm_Radius': 'radius',
      'm_Height': 'height',
      'm_Direction': 'direction',
      'm_Center': 'center',
      'm_IsTrigger': 'isTrigger',
      'm_Material': 'material',
      'm_Enabled': 'enabled',
    },
  },

  MeshCollider: {
    include: ['m_Convex', 'm_IsTrigger', 'm_Material', 'm_Mesh', 'm_Enabled'],
    rename: {
      'm_Convex': 'convex',
      'm_IsTrigger': 'isTrigger',
      'm_Material': 'material',
      'm_Mesh': 'mesh',
      'm_Enabled': 'enabled',
    },
  },

  SpriteRenderer: {
    include: [
      'm_Sprite', 'm_Color', 'm_FlipX', 'm_FlipY', 'm_SortingLayerID',
      'm_SortingLayer', 'm_SortingOrder', 'm_Materials', 'm_DrawMode',
      'm_Size', 'm_Enabled', 'm_SpriteTileMode', 'm_MaskInteraction',
    ],
    rename: {
      'm_Sprite': 'sprite',
      'm_Color': 'color',
      'm_FlipX': 'flipX',
      'm_FlipY': 'flipY',
      'm_SortingLayerID': 'sortingLayerID',
      'm_SortingLayer': 'sortingLayer',
      'm_SortingOrder': 'sortingOrder',
      'm_Materials': 'materials',
      'm_DrawMode': 'drawMode',
      'm_Size': 'size',
      'm_Enabled': 'enabled',
      'm_SpriteTileMode': 'spriteTileMode',
      'm_MaskInteraction': 'maskInteraction',
    },
  },

  MeshRenderer: {
    include: [
      'm_Enabled', 'm_CastShadows', 'm_ReceiveShadows', 'm_Materials',
      'm_LightProbeUsage', 'm_ReflectionProbeUsage', 'm_SortingLayerID',
      'm_SortingLayer', 'm_SortingOrder',
    ],
    rename: {
      'm_Enabled': 'enabled',
      'm_CastShadows': 'castShadows',
      'm_ReceiveShadows': 'receiveShadows',
      'm_Materials': 'materials',
      'm_LightProbeUsage': 'lightProbeUsage',
      'm_ReflectionProbeUsage': 'reflectionProbeUsage',
      'm_SortingLayerID': 'sortingLayerID',
      'm_SortingLayer': 'sortingLayer',
      'm_SortingOrder': 'sortingOrder',
    },
  },

  SkinnedMeshRenderer: {
    include: [
      'm_Enabled', 'm_CastShadows', 'm_ReceiveShadows', 'm_Materials',
      'm_Mesh', 'm_RootBone', 'm_Bones', 'm_BlendShapeWeights',
      'm_UpdateWhenOffscreen', 'm_SkinnedMotionVectors',
    ],
    rename: {
      'm_Enabled': 'enabled',
      'm_CastShadows': 'castShadows',
      'm_ReceiveShadows': 'receiveShadows',
      'm_Materials': 'materials',
      'm_Mesh': 'mesh',
      'm_RootBone': 'rootBone',
      'm_Bones': 'bones',
      'm_BlendShapeWeights': 'blendShapeWeights',
      'm_UpdateWhenOffscreen': 'updateWhenOffscreen',
      'm_SkinnedMotionVectors': 'skinnedMotionVectors',
    },
  },

  MeshFilter: {
    include: ['m_Mesh'],
    rename: {
      'm_Mesh': 'mesh',
    },
  },

  Animator: {
    include: ['m_Controller', 'm_Avatar', 'm_UpdateMode', 'm_CullingMode', 'm_Enabled', 'm_ApplyRootMotion'],
    rename: {
      'm_Controller': 'controller',
      'm_Avatar': 'avatar',
      'm_UpdateMode': 'updateMode',
      'm_CullingMode': 'cullingMode',
      'm_Enabled': 'enabled',
      'm_ApplyRootMotion': 'applyRootMotion',
    },
  },

  Animation: {
    include: ['m_Animation', 'm_Animations', 'm_PlayAutomatically', 'm_AnimatePhysics', 'm_CullingType', 'm_Enabled'],
    rename: {
      'm_Animation': 'animation',
      'm_Animations': 'animations',
      'm_PlayAutomatically': 'playAutomatically',
      'm_AnimatePhysics': 'animatePhysics',
      'm_CullingType': 'cullingType',
      'm_Enabled': 'enabled',
    },
  },

  AudioSource: {
    include: [
      'm_audioClip', 'm_PlayOnAwake', 'm_Volume', 'm_Pitch', 'm_Loop',
      'm_Mute', 'm_SpatialBlend', 'm_OutputAudioMixerGroup', 'm_Enabled',
      'm_MinDistance', 'm_MaxDistance', 'm_Priority',
    ],
    rename: {
      'm_audioClip': 'clip',
      'm_PlayOnAwake': 'playOnAwake',
      'm_Volume': 'volume',
      'm_Pitch': 'pitch',
      'm_Loop': 'loop',
      'm_Mute': 'mute',
      'm_SpatialBlend': 'spatialBlend',
      'm_OutputAudioMixerGroup': 'outputAudioMixerGroup',
      'm_Enabled': 'enabled',
      'm_MinDistance': 'minDistance',
      'm_MaxDistance': 'maxDistance',
      'm_Priority': 'priority',
    },
  },

  Camera: {
    include: [
      'm_ClearFlags', 'm_BackGroundColor', 'm_projectionMatrixMode',
      'm_FOVAxisMode', 'field of view', 'm_NearClipPlane', 'm_FarClipPlane',
      'm_Depth', 'm_CullingMask', 'm_TargetTexture', 'm_Enabled',
      'm_orthographic', 'm_OrthographicSize',
    ],
    rename: {
      'm_ClearFlags': 'clearFlags',
      'm_BackGroundColor': 'backgroundColor',
      'm_projectionMatrixMode': 'projectionMatrixMode',
      'm_FOVAxisMode': 'fovAxisMode',
      'field of view': 'fieldOfView',
      'm_NearClipPlane': 'nearClipPlane',
      'm_FarClipPlane': 'farClipPlane',
      'm_Depth': 'depth',
      'm_CullingMask': 'cullingMask',
      'm_TargetTexture': 'targetTexture',
      'm_Enabled': 'enabled',
      'm_orthographic': 'orthographic',
      'm_OrthographicSize': 'orthographicSize',
    },
  },

  Light: {
    include: [
      'm_Type', 'm_Color', 'm_Intensity', 'm_Range', 'm_SpotAngle',
      'm_CullingMask', 'm_RenderMode', 'm_Shadows', 'm_Enabled',
    ],
    rename: {
      'm_Type': 'type',
      'm_Color': 'color',
      'm_Intensity': 'intensity',
      'm_Range': 'range',
      'm_SpotAngle': 'spotAngle',
      'm_CullingMask': 'cullingMask',
      'm_RenderMode': 'renderMode',
      'm_Shadows': 'shadows',
      'm_Enabled': 'enabled',
    },
  },

  Canvas: {
    include: [
      'm_RenderMode', 'm_SortingLayerID', 'm_SortingOrder',
      'm_OverrideSorting', 'm_OverridePixelPerfect', 'm_PixelPerfect',
      'm_PlaneDistance', 'm_Enabled',
    ],
    rename: {
      'm_RenderMode': 'renderMode',
      'm_SortingLayerID': 'sortingLayerID',
      'm_SortingOrder': 'sortingOrder',
      'm_OverrideSorting': 'overrideSorting',
      'm_OverridePixelPerfect': 'overridePixelPerfect',
      'm_PixelPerfect': 'pixelPerfect',
      'm_PlaneDistance': 'planeDistance',
      'm_Enabled': 'enabled',
    },
  },

  CanvasScaler: {
    include: [
      'm_UiScaleMode', 'm_ReferencePixelsPerUnit', 'm_ScaleFactor',
      'm_ReferenceResolution', 'm_ScreenMatchMode', 'm_MatchWidthOrHeight',
      'm_PhysicalUnit', 'm_FallbackScreenDPI', 'm_DefaultSpriteDPI',
      'm_DynamicPixelsPerUnit',
    ],
    rename: {
      'm_UiScaleMode': 'uiScaleMode',
      'm_ReferencePixelsPerUnit': 'referencePixelsPerUnit',
      'm_ScaleFactor': 'scaleFactor',
      'm_ReferenceResolution': 'referenceResolution',
      'm_ScreenMatchMode': 'screenMatchMode',
      'm_MatchWidthOrHeight': 'matchWidthOrHeight',
      'm_PhysicalUnit': 'physicalUnit',
      'm_FallbackScreenDPI': 'fallbackScreenDPI',
      'm_DefaultSpriteDPI': 'defaultSpriteDPI',
      'm_DynamicPixelsPerUnit': 'dynamicPixelsPerUnit',
    },
  },

  GraphicRaycaster: {
    include: ['m_IgnoreReversedGraphics', 'm_BlockingObjects', 'm_BlockingMask', 'm_Enabled'],
    rename: {
      'm_IgnoreReversedGraphics': 'ignoreReversedGraphics',
      'm_BlockingObjects': 'blockingObjects',
      'm_BlockingMask': 'blockingMask',
      'm_Enabled': 'enabled',
    },
  },

  Image: {
    include: [
      'm_Sprite', 'm_Color', 'm_Material', 'm_RaycastTarget',
      'm_Type', 'm_FillCenter', 'm_FillMethod', 'm_FillAmount',
      'm_FillClockwise', 'm_FillOrigin', 'm_PreserveAspect', 'm_Enabled',
    ],
    rename: {
      'm_Sprite': 'sprite',
      'm_Color': 'color',
      'm_Material': 'material',
      'm_RaycastTarget': 'raycastTarget',
      'm_Type': 'type',
      'm_FillCenter': 'fillCenter',
      'm_FillMethod': 'fillMethod',
      'm_FillAmount': 'fillAmount',
      'm_FillClockwise': 'fillClockwise',
      'm_FillOrigin': 'fillOrigin',
      'm_PreserveAspect': 'preserveAspect',
      'm_Enabled': 'enabled',
    },
  },

  Text: {
    include: [
      'm_Text', 'm_FontData', 'm_Color', 'm_Material',
      'm_RaycastTarget', 'm_Enabled',
    ],
    rename: {
      'm_Text': 'text',
      'm_FontData': 'fontData',
      'm_Color': 'color',
      'm_Material': 'material',
      'm_RaycastTarget': 'raycastTarget',
      'm_Enabled': 'enabled',
    },
  },

  TextMeshProUGUI: {
    include: [
      'm_text', 'm_fontAsset', 'm_fontMaterial', 'm_fontColor',
      'm_fontSize', 'm_fontStyle', 'm_textAlignment', 'm_isRichText',
      'm_enableWordWrapping', 'm_overflowMode', 'm_RaycastTarget', 'm_Enabled',
    ],
    rename: {
      'm_text': 'text',
      'm_fontAsset': 'fontAsset',
      'm_fontMaterial': 'fontMaterial',
      'm_fontColor': 'fontColor',
      'm_fontSize': 'fontSize',
      'm_fontStyle': 'fontStyle',
      'm_textAlignment': 'textAlignment',
      'm_isRichText': 'isRichText',
      'm_enableWordWrapping': 'enableWordWrapping',
      'm_overflowMode': 'overflowMode',
      'm_RaycastTarget': 'raycastTarget',
      'm_Enabled': 'enabled',
    },
  },

  Button: {
    include: [
      'm_Interactable', 'm_TargetGraphic', 'm_Transition', 'm_Colors',
      'm_SpriteState', 'm_AnimationTriggers', 'm_OnClick', 'm_Navigation',
    ],
    rename: {
      'm_Interactable': 'interactable',
      'm_TargetGraphic': 'targetGraphic',
      'm_Transition': 'transition',
      'm_Colors': 'colors',
      'm_SpriteState': 'spriteState',
      'm_AnimationTriggers': 'animationTriggers',
      'm_OnClick': 'onClick',
      'm_Navigation': 'navigation',
    },
  },

  ParticleSystem: {
    include: [
      'InitialModule', 'EmissionModule', 'ShapeModule', 'VelocityModule',
      'ColorModule', 'SizeModule', 'RotationModule', 'CollisionModule',
      'TriggerModule', 'SubModule', 'LightsModule', 'TrailModule',
      'CustomDataModule', 'prewarm', 'lengthInSec', 'startDelay',
      'playOnAwake', 'moveWithTransform',
    ],
    rename: {
      'InitialModule': 'initialModule',
      'EmissionModule': 'emissionModule',
      'ShapeModule': 'shapeModule',
      'VelocityModule': 'velocityModule',
      'ColorModule': 'colorModule',
      'SizeModule': 'sizeModule',
      'RotationModule': 'rotationModule',
      'CollisionModule': 'collisionModule',
      'TriggerModule': 'triggerModule',
      'SubModule': 'subModule',
      'LightsModule': 'lightsModule',
      'TrailModule': 'trailModule',
      'CustomDataModule': 'customDataModule',
    },
  },

  ParticleSystemRenderer: {
    include: [
      'm_Enabled', 'm_CastShadows', 'm_ReceiveShadows', 'm_Materials',
      'm_RenderMode', 'm_SortMode', 'm_SortingFudge', 'm_NormalDirection',
      'm_MinParticleSize', 'm_MaxParticleSize', 'm_Mesh',
    ],
    rename: {
      'm_Enabled': 'enabled',
      'm_CastShadows': 'castShadows',
      'm_ReceiveShadows': 'receiveShadows',
      'm_Materials': 'materials',
      'm_RenderMode': 'renderMode',
      'm_SortMode': 'sortMode',
      'm_SortingFudge': 'sortingFudge',
      'm_NormalDirection': 'normalDirection',
      'm_MinParticleSize': 'minParticleSize',
      'm_MaxParticleSize': 'maxParticleSize',
      'm_Mesh': 'mesh',
    },
  },

  TrailRenderer: {
    include: [
      'm_Time', 'm_StartWidth', 'm_EndWidth', 'm_WidthMultiplier',
      'm_Colors', 'm_MinVertexDistance', 'm_Materials', 'm_Enabled',
      'm_Autodestruct', 'm_Emitting', 'm_NumCornerVertices', 'm_NumCapVertices',
    ],
    rename: {
      'm_Time': 'time',
      'm_StartWidth': 'startWidth',
      'm_EndWidth': 'endWidth',
      'm_WidthMultiplier': 'widthMultiplier',
      'm_Colors': 'colors',
      'm_MinVertexDistance': 'minVertexDistance',
      'm_Materials': 'materials',
      'm_Enabled': 'enabled',
      'm_Autodestruct': 'autodestruct',
      'm_Emitting': 'emitting',
      'm_NumCornerVertices': 'numCornerVertices',
      'm_NumCapVertices': 'numCapVertices',
    },
  },

  LineRenderer: {
    include: [
      'm_Positions', 'm_WidthMultiplier', 'm_WidthCurve', 'm_Colors',
      'm_Materials', 'm_Enabled', 'm_Loop', 'm_NumCornerVertices',
      'm_NumCapVertices', 'm_UseWorldSpace',
    ],
    rename: {
      'm_Positions': 'positions',
      'm_WidthMultiplier': 'widthMultiplier',
      'm_WidthCurve': 'widthCurve',
      'm_Colors': 'colors',
      'm_Materials': 'materials',
      'm_Enabled': 'enabled',
      'm_Loop': 'loop',
      'm_NumCornerVertices': 'numCornerVertices',
      'm_NumCapVertices': 'numCapVertices',
      'm_UseWorldSpace': 'useWorldSpace',
    },
  },

  // MonoBehaviour - special handling for custom scripts
  MonoBehaviour: {
    include: 'all_except_internals',
    scriptField: 'm_Script',
  },
};

/**
 * Get the appropriate filter for a component type
 */
export function getComponentFilter(componentType: string): ComponentFilter {
  return INSPECTOR_FIELDS[componentType] || INSPECTOR_FIELDS.MonoBehaviour;
}

/**
 * Check if a field should be excluded
 */
export function shouldExcludeField(fieldName: string, componentType: string): boolean {
  if (ALWAYS_EXCLUDE.includes(fieldName)) {
    return true;
  }

  const filter = getComponentFilter(componentType);
  
  if (filter.exclude && filter.exclude.includes(fieldName)) {
    return true;
  }

  if (filter.include === 'all_except_internals') {
    return false;
  }

  if (Array.isArray(filter.include) && !filter.include.includes(fieldName)) {
    return true;
  }

  return false;
}

/**
 * Check if a field is explicitly listed in a component's include whitelist.
 * Fields that are explicitly whitelisted should never have their zero/empty
 * values silently dropped — they were intentionally included.
 */
export function isExplicitlyWhitelistedField(fieldName: string, componentType: string): boolean {
  const filter = getComponentFilter(componentType);
  if (!Array.isArray(filter.include)) return false;
  return filter.include.includes(fieldName);
}

/**
 * Rename a field if a mapping exists
 */
export function renameField(fieldName: string, componentType: string, abbreviate: boolean = false): string {
  const filter = getComponentFilter(componentType);
  
  let renamed = fieldName;
  
  if (filter.rename && filter.rename[fieldName]) {
    renamed = filter.rename[fieldName];
  } else if (fieldName.startsWith('m_')) {
    // Default: remove 'm_' prefix and lowercase first letter
    const stripped = fieldName.substring(2);
    renamed = stripped.charAt(0).toLowerCase() + stripped.slice(1);
  }
  
  // Apply abbreviation if enabled
  if (abbreviate && FIELD_ABBREVIATIONS[renamed]) {
    return FIELD_ABBREVIATIONS[renamed];
  }

  return renamed;
}
