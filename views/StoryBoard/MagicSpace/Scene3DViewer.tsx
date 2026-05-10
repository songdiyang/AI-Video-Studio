import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface SceneCamera {
  x: number; // pitch (-180~180)
  y: number; // yaw (-180~180)
  z: number; // roll (-180~180)
}

export interface SceneLighting {
  azimuth: number;   // 水平角度
  elevation: number; // 垂直角度
}

type SelectedObject = 'none' | 'camera' | 'light' | 'character';
type TransformMode = 'translate' | 'rotate';
type SelectedAxis = 'x' | 'y' | 'z' | 'none';

type CharacterModelType = 'male' | 'female' | 'child' | 'custom';

interface CharacterPose {
  id: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  scale: number;
  height: number;
  name: string;
  description: string;
  boundCharacterId?: number | null;
  modelType: CharacterModelType;
  modelUrl?: string;
}

const DEFAULT_CHARACTERS: CharacterPose[] = [];

interface Scene3DViewerProps {
  sourceImageUrl: string;
  camera: SceneCamera;
  lighting: SceneLighting;
  onCameraChange: (camera: SceneCamera) => void;
  onLightingChange: (lighting: SceneLighting) => void;
  disabled?: boolean;
  projectCharacters?: any[];
  onCharacterPanelOpen?: (isOpen: boolean) => void;
}

/**
 * 3D 场景查看器 - Blender风格交互
 * - 中心：参考图片（作为被拍摄对象）
 * - 摄影机：3D相机模型，表示拍摄角度
 * - 打光器：光源指示器，表示光照方向
 * 
 * 交互规范（参考Blender/Unity）：
 * - 左键点击对象 = 选中
 * - 选中后按 G = 移动模式 (Grab)
 * - 选中后按 R = 旋转模式 (Rotate)
 * - 左键点击空白处 = 取消选中
 * - 中键拖拽 = 旋转视角 (Orbit)
 * - Shift+中键拖拽 = 平移 (Pan)
 * - 滚轮 = 缩放 (Zoom)
 */
const Scene3DViewer: React.FC<Scene3DViewerProps> = ({
  sourceImageUrl,
  camera,
  lighting,
  onCameraChange,
  onLightingChange,
  disabled = false,
  projectCharacters = [],
  onCharacterPanelOpen,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const camera3dRef = useRef<THREE.PerspectiveCamera | null>(null);
  const cameraObjRef = useRef<THREE.Group | null>(null);
  const lightObjRef = useRef<THREE.Group | null>(null);
  const imagePlaneRef = useRef<THREE.Mesh | null>(null);
  const frameRef = useRef<number>(0);
  const isInitializedRef = useRef(false);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());

  // Selection & transform state
  const [selectedObject, setSelectedObject] = useState<SelectedObject>('none');
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [transformMode, setTransformMode] = useState<TransformMode>('translate');
  const [isTransforming, setIsTransforming] = useState(false);
  const [isOrbiting, setIsOrbiting] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [selectedAxis, setSelectedAxis] = useState<SelectedAxis>('none');
  const dragStartRef = useRef({ x: 0, y: 0, camX: 0, camY: 0, lightAz: 0, lightEl: 0, charX: 0, charY: 0, charZ: 0, charRotY: 0 });

  // Notify parent when character panel opens/closes
  useEffect(() => {
    onCharacterPanelOpen?.(selectedObject === 'character' && selectedCharacterId !== null);
  }, [selectedObject, selectedCharacterId, onCharacterPanelOpen]);

  // Characters state
  const [characters, setCharacters] = useState<CharacterPose[]>(DEFAULT_CHARACTERS);
  const characterRefs = useRef<Map<string, THREE.Group>>(new Map());
  const characterGizmoRefs = useRef<Map<string, THREE.Group>>(new Map());

  // Load preset GLB model
  const loadPresetModel = useCallback((modelType: CharacterModelType, defaultName: string, defaultHeight: number) => {
    if (!sceneRef.current) return;
    const newId = `char_${Date.now()}`;
    const modelUrl = `/models/human-${modelType}.glb`;
    const loader = new GLTFLoader();
    loader.load(modelUrl, (gltf) => {
      const model = gltf.scene;
      model.position.set(0, 0, 0);
      model.userData = { type: 'character', id: newId };
      // Auto-scale to standard height
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const targetScale = defaultHeight / size.y;
      model.scale.setScalar(targetScale);
      // Selection ring
      const ringGeo = new THREE.RingGeometry(0.35, 0.4, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02;
      model.add(ring);
      // Gizmo
      const gizmo = new THREE.Group();
      const axisLength = 0.6;
      const axisThickness = 0.015;
      ['#ff3333', '#33ff33', '#3333ff'].forEach((col, i) => {
        const axisGeo = new THREE.CylinderGeometry(axisThickness, axisThickness, axisLength, 8);
        const axisMat = new THREE.MeshBasicMaterial({ color: col });
        const axis = new THREE.Mesh(axisGeo, axisMat);
        if (i === 0) { axis.rotation.z = -Math.PI / 2; axis.position.x = axisLength / 2; }
        else if (i === 1) { axis.position.y = axisLength / 2; }
        else { axis.rotation.x = Math.PI / 2; axis.position.z = axisLength / 2; }
        gizmo.add(axis);
        const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 8), new THREE.MeshBasicMaterial({ color: col }));
        if (i === 0) { arrow.rotation.z = -Math.PI / 2; arrow.position.x = axisLength; }
        else if (i === 1) { arrow.position.y = axisLength; }
        else { arrow.rotation.x = Math.PI / 2; arrow.position.z = axisLength; }
        gizmo.add(arrow);
      });
      gizmo.visible = false;
      gizmo.position.y = defaultHeight / 2;
      model.add(gizmo);
      characterGizmoRefs.current.set(newId, gizmo);
      sceneRef.current!.add(model);
      characterRefs.current.set(newId, model);
      const newChar: CharacterPose = {
        id: newId,
        x: 0, y: 0, z: 0,
        rotationY: 0,
        scale: targetScale,
        height: defaultHeight,
        name: defaultName,
        description: '',
        modelType,
        modelUrl,
      };
      setCharacters(prev => [...prev, newChar]);
    }, undefined, (err) => {
      console.error('[Preset Load Error]', err);
      // Fallback to procedural model
      const fallbackChar: CharacterPose = {
        id: newId,
        x: 0, y: 0, z: 0,
        rotationY: 0,
        scale: 1,
        height: defaultHeight,
        name: defaultName,
        description: '',
        modelType,
      };
      setCharacters(prev => [...prev, fallbackChar]);
      if (sceneRef.current) buildCharacterModel(fallbackChar, sceneRef.current);
    });
  }, []);

  // Shared character model builder (fallback)
  const buildCharacterModel = useCallback((char: CharacterPose, targetScene: THREE.Scene) => {
    const group = new THREE.Group();
    group.position.set(char.x, char.y, char.z);
    group.rotation.y = (char.rotationY * Math.PI) / 180;
    group.scale.setScalar(char.scale);
    group.userData = { type: 'character', id: char.id };

    const h = char.height;
    const skinColor = new THREE.Color(0xffdbac);
    const shirtColor = new THREE.Color(char.modelType === 'female' ? 0xe85d75 : char.modelType === 'child' ? 0x5dade2 : 0x3b82f6);
    const pantsColor = new THREE.Color(0x2d3748);

    // Head
    const headGeo = new THREE.SphereGeometry(0.11, 20, 20);
    const headMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.5, metalness: 0.1 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = h - 0.11;
    head.castShadow = true;
    group.add(head);

    // Neck
    const neckGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.08, 12);
    const neckMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.5 });
    const neck = new THREE.Mesh(neckGeo, neckMat);
    neck.position.y = h - 0.11 - 0.11 - 0.04;
    neck.castShadow = true;
    group.add(neck);

    // Torso
    const upperTorsoGeo = new THREE.CylinderGeometry(0.2, 0.16, h * 0.2, 16);
    const torsoMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.6 });
    const upperTorso = new THREE.Mesh(upperTorsoGeo, torsoMat);
    upperTorso.position.y = h - 0.11 - 0.11 - 0.08 - h * 0.1;
    upperTorso.castShadow = true;
    group.add(upperTorso);

    const lowerTorsoGeo = new THREE.CylinderGeometry(0.16, 0.14, h * 0.15, 16);
    const lowerTorso = new THREE.Mesh(lowerTorsoGeo, torsoMat);
    lowerTorso.position.y = h - 0.11 - 0.11 - 0.08 - h * 0.2 - h * 0.075;
    lowerTorso.castShadow = true;
    group.add(lowerTorso);

    // Arms
    const armRadius = char.modelType === 'female' ? 0.032 : 0.038;
    const armMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.5 });
    const sleeveMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.6 });

    const lUpperArmGeo = new THREE.CapsuleGeometry(armRadius, h * 0.14, 8, 16);
    const lUpperArm = new THREE.Mesh(lUpperArmGeo, sleeveMat);
    lUpperArm.position.set(-0.24, h - 0.11 - 0.11 - 0.08 - h * 0.05, 0);
    lUpperArm.rotation.z = 0.12;
    lUpperArm.castShadow = true;
    group.add(lUpperArm);

    const lLowerArmGeo = new THREE.CapsuleGeometry(armRadius * 0.85, h * 0.12, 8, 16);
    const lLowerArm = new THREE.Mesh(lLowerArmGeo, armMat);
    lLowerArm.position.set(-0.28, h - 0.11 - 0.11 - 0.08 - h * 0.18, 0);
    lLowerArm.rotation.z = 0.08;
    lLowerArm.castShadow = true;
    group.add(lLowerArm);

    const rUpperArmGeo = new THREE.CapsuleGeometry(armRadius, h * 0.14, 8, 16);
    const rUpperArm = new THREE.Mesh(rUpperArmGeo, sleeveMat);
    rUpperArm.position.set(0.24, h - 0.11 - 0.11 - 0.08 - h * 0.05, 0);
    rUpperArm.rotation.z = -0.12;
    rUpperArm.castShadow = true;
    group.add(rUpperArm);

    const rLowerArmGeo = new THREE.CapsuleGeometry(armRadius * 0.85, h * 0.12, 8, 16);
    const rLowerArm = new THREE.Mesh(rLowerArmGeo, armMat);
    rLowerArm.position.set(0.28, h - 0.11 - 0.11 - 0.08 - h * 0.18, 0);
    rLowerArm.rotation.z = -0.08;
    rLowerArm.castShadow = true;
    group.add(rLowerArm);

    // Hands
    const handGeo = new THREE.SphereGeometry(armRadius * 1.2, 10, 10);
    const lHand = new THREE.Mesh(handGeo, armMat);
    lHand.position.set(-0.3, h - 0.11 - 0.11 - 0.08 - h * 0.28, 0);
    lHand.castShadow = true;
    group.add(lHand);

    const rHand = new THREE.Mesh(handGeo, armMat);
    rHand.position.set(0.3, h - 0.11 - 0.11 - 0.08 - h * 0.28, 0);
    rHand.castShadow = true;
    group.add(rHand);

    // Legs
    const legRadius = char.modelType === 'female' ? 0.055 : 0.065;
    const legMat = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.7 });
    const skinLegMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.5 });

    const lUpperLegGeo = new THREE.CapsuleGeometry(legRadius, h * 0.18, 8, 16);
    const lUpperLeg = new THREE.Mesh(lUpperLegGeo, legMat);
    lUpperLeg.position.set(-0.1, h * 0.32, 0);
    lUpperLeg.castShadow = true;
    group.add(lUpperLeg);

    const lLowerLegGeo = new THREE.CapsuleGeometry(legRadius * 0.8, h * 0.18, 8, 16);
    const lLowerLeg = new THREE.Mesh(lLowerLegGeo, skinLegMat);
    lLowerLeg.position.set(-0.1, h * 0.12, 0);
    lLowerLeg.castShadow = true;
    group.add(lLowerLeg);

    const rUpperLegGeo = new THREE.CapsuleGeometry(legRadius, h * 0.18, 8, 16);
    const rUpperLeg = new THREE.Mesh(rUpperLegGeo, legMat);
    rUpperLeg.position.set(0.1, h * 0.32, 0);
    rUpperLeg.castShadow = true;
    group.add(rUpperLeg);

    const rLowerLegGeo = new THREE.CapsuleGeometry(legRadius * 0.8, h * 0.18, 8, 16);
    const rLowerLeg = new THREE.Mesh(rLowerLegGeo, skinLegMat);
    rLowerLeg.position.set(0.1, h * 0.12, 0);
    rLowerLeg.castShadow = true;
    group.add(rLowerLeg);

    // Feet
    const footGeo = new THREE.BoxGeometry(0.08, 0.05, 0.14);
    const footMat = new THREE.MeshStandardMaterial({ color: 0x1a202c, roughness: 0.8 });
    const lFoot = new THREE.Mesh(footGeo, footMat);
    lFoot.position.set(-0.1, 0.025, 0.03);
    lFoot.castShadow = true;
    group.add(lFoot);

    const rFoot = new THREE.Mesh(footGeo, footMat);
    rFoot.position.set(0.1, 0.025, 0.03);
    rFoot.castShadow = true;
    group.add(rFoot);

    // Selection ring
    const ringGeo = new THREE.RingGeometry(0.35, 0.4, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    group.add(ring);

    // Transform gizmo
    const gizmo = new THREE.Group();
    const axisLength = 0.6;
    const axisThickness = 0.015;

    ['#ff3333', '#33ff33', '#3333ff'].forEach((col, i) => {
      const axisGeo = new THREE.CylinderGeometry(axisThickness, axisThickness, axisLength, 8);
      const axisMat = new THREE.MeshBasicMaterial({ color: col });
      const axis = new THREE.Mesh(axisGeo, axisMat);
      if (i === 0) { axis.rotation.z = -Math.PI / 2; axis.position.x = axisLength / 2; }
      else if (i === 1) { axis.position.y = axisLength / 2; }
      else { axis.rotation.x = Math.PI / 2; axis.position.z = axisLength / 2; }
      gizmo.add(axis);

      const arrow = new THREE.Mesh(
        new THREE.ConeGeometry(0.04, 0.08, 8),
        new THREE.MeshBasicMaterial({ color: col })
      );
      if (i === 0) { arrow.rotation.z = -Math.PI / 2; arrow.position.x = axisLength; }
      else if (i === 1) { arrow.position.y = axisLength; }
      else { arrow.rotation.x = Math.PI / 2; arrow.position.z = axisLength; }
      gizmo.add(arrow);
    });

    gizmo.visible = false;
    gizmo.position.y = h / 2;
    group.add(gizmo);
    characterGizmoRefs.current.set(char.id, gizmo);

    targetScene.add(group);
    characterRefs.current.set(char.id, group);
  }, []);

  // Blender-style orbit controls
  const orbitStateRef = useRef({
    theta: Math.PI / 4,
    phi: Math.PI / 3,
    radius: 8,
    target: new THREE.Vector3(0, 1.5, 0),
  });

  // Selection highlight rings
  const cameraRingRef = useRef<THREE.Mesh | null>(null);
  const lightRingRef = useRef<THREE.Mesh | null>(null);

  // Transform gizmos (XYZ axes)
  const cameraGizmoRef = useRef<THREE.Group | null>(null);
  const lightGizmoRef = useRef<THREE.Group | null>(null);

  // Initialize Three.js scene - only once
  useEffect(() => {
    if (isInitializedRef.current) return;
    const container = containerRef.current;
    if (!container) return;
    isInitializedRef.current = true;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 400;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;

    // Camera - positioned to look at center
    const camera3d = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    const orbit = orbitStateRef.current;
    camera3d.position.set(
      orbit.target.x + orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta),
      orbit.target.y + orbit.radius * Math.cos(orbit.phi),
      orbit.target.z + orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta)
    );
    camera3d.lookAt(orbit.target);
    camera3dRef.current = camera3d;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Grid floor
    const gridHelper = new THREE.GridHelper(10, 10, 0x444466, 0x2a2a3e);
    scene.add(gridHelper);

    // Ambient light - brighter for better visibility
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    // Additional hemisphere light for natural illumination
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    // Directional light from above
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);

    // Create Camera Model (3D camera indicator)
    const cameraGroup = new THREE.Group();

    // Camera body
    const bodyGeo = new THREE.BoxGeometry(0.4, 0.25, 0.5);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, metalness: 0.3, roughness: 0.4 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0, 0, 0.1);
    cameraGroup.add(body);

    // Camera lens
    const lensGeo = new THREE.CylinderGeometry(0.12, 0.15, 0.2, 16);
    const lensMat = new THREE.MeshStandardMaterial({ color: 0x111122, metalness: 0.8, roughness: 0.2 });
    const lens = new THREE.Mesh(lensGeo, lensMat);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 0, 0.4);
    cameraGroup.add(lens);

    // Camera label
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 128;
    labelCanvas.height = 64;
    const ctx = labelCanvas.getContext('2d')!;
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(0, 0, 128, 64);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CAM', 64, 32);
    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    const labelGeo = new THREE.PlaneGeometry(0.5, 0.25);
    const labelMat = new THREE.MeshBasicMaterial({ map: labelTexture, transparent: true });
    const labelMesh = new THREE.Mesh(labelGeo, labelMat);
    labelMesh.position.set(0, 0.3, 0);
    labelMesh.rotation.x = -Math.PI / 6;
    cameraGroup.add(labelMesh);

    // Connection line to center
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -2),
    ]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x3b82f6, opacity: 0.3, transparent: true });
    const line = new THREE.Line(lineGeo, lineMat);
    cameraGroup.add(line);

    // Selection ring for camera
    const camRingGeo = new THREE.RingGeometry(0.4, 0.45, 32);
    const camRingMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0, side: THREE.DoubleSide });
    const camRing = new THREE.Mesh(camRingGeo, camRingMat);
    camRing.rotation.x = -Math.PI / 2;
    camRing.position.y = -0.15;
    cameraGroup.add(camRing);
    cameraRingRef.current = camRing;

    // Transform gizmo for camera (XYZ axes)
    const camGizmo = new THREE.Group();
    const axisLength = 0.8;
    const axisThickness = 0.02;

    // X axis - Red
    const xAxisGeo = new THREE.CylinderGeometry(axisThickness, axisThickness, axisLength, 8);
    const xAxisMat = new THREE.MeshBasicMaterial({ color: 0xff3333 });
    const xAxis = new THREE.Mesh(xAxisGeo, xAxisMat);
    xAxis.rotation.z = -Math.PI / 2;
    xAxis.position.x = axisLength / 2;
    camGizmo.add(xAxis);

    // Y axis - Green
    const yAxisGeo = new THREE.CylinderGeometry(axisThickness, axisThickness, axisLength, 8);
    const yAxisMat = new THREE.MeshBasicMaterial({ color: 0x33ff33 });
    const yAxis = new THREE.Mesh(yAxisGeo, yAxisMat);
    yAxis.position.y = axisLength / 2;
    camGizmo.add(yAxis);

    // Z axis - Blue
    const zAxisGeo = new THREE.CylinderGeometry(axisThickness, axisThickness, axisLength, 8);
    const zAxisMat = new THREE.MeshBasicMaterial({ color: 0x3333ff });
    const zAxis = new THREE.Mesh(zAxisGeo, zAxisMat);
    zAxis.rotation.x = Math.PI / 2;
    zAxis.position.z = axisLength / 2;
    camGizmo.add(zAxis);

    // Axis arrow heads (cones)
    const arrowSize = 0.08;
    const xArrow = new THREE.Mesh(
      new THREE.ConeGeometry(arrowSize, arrowSize * 2, 8),
      new THREE.MeshBasicMaterial({ color: 0xff3333 })
    );
    xArrow.rotation.z = -Math.PI / 2;
    xArrow.position.x = axisLength;
    camGizmo.add(xArrow);

    const yArrow = new THREE.Mesh(
      new THREE.ConeGeometry(arrowSize, arrowSize * 2, 8),
      new THREE.MeshBasicMaterial({ color: 0x33ff33 })
    );
    yArrow.position.y = axisLength;
    camGizmo.add(yArrow);

    const zArrow = new THREE.Mesh(
      new THREE.ConeGeometry(arrowSize, arrowSize * 2, 8),
      new THREE.MeshBasicMaterial({ color: 0x3333ff })
    );
    zArrow.rotation.x = Math.PI / 2;
    zArrow.position.z = axisLength;
    camGizmo.add(zArrow);

    camGizmo.visible = false;
    cameraGroup.add(camGizmo);
    cameraGizmoRef.current = camGizmo;

    scene.add(cameraGroup);
    cameraObjRef.current = cameraGroup;

    // Create Light Model (lighting indicator)
    const lightGroup = new THREE.Group();

    // Light bulb/sphere
    const bulbGeo = new THREE.SphereGeometry(0.15, 16, 16);
    const bulbMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      emissive: 0xffaa00,
      emissiveIntensity: 0.5,
      metalness: 0.1,
      roughness: 0.2,
    });
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    lightGroup.add(bulb);

    // Light glow
    const glowGeo = new THREE.SphereGeometry(0.25, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xffd700,
      transparent: true,
      opacity: 0.2,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    lightGroup.add(glow);

    // Light rays (cone)
    const rayGeo = new THREE.ConeGeometry(0.2, 0.6, 8, 1, true);
    const rayMat = new THREE.MeshBasicMaterial({
      color: 0xffd700,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
    });
    const ray = new THREE.Mesh(rayGeo, rayMat);
    ray.rotation.x = -Math.PI / 2;
    ray.position.set(0, 0, 0.3);
    lightGroup.add(ray);

    // Light label
    const lightLabelCanvas = document.createElement('canvas');
    lightLabelCanvas.width = 128;
    lightLabelCanvas.height = 64;
    const lctx = lightLabelCanvas.getContext('2d')!;
    lctx.fillStyle = '#ffd700';
    lctx.fillRect(0, 0, 128, 64);
    lctx.fillStyle = '#000000';
    lctx.font = 'bold 24px sans-serif';
    lctx.textAlign = 'center';
    lctx.textBaseline = 'middle';
    lctx.fillText('LIGHT', 64, 32);
    const lightLabelTexture = new THREE.CanvasTexture(lightLabelCanvas);
    const lightLabelGeo = new THREE.PlaneGeometry(0.5, 0.25);
    const lightLabelMat = new THREE.MeshBasicMaterial({ map: lightLabelTexture, transparent: true });
    const lightLabelMesh = new THREE.Mesh(lightLabelGeo, lightLabelMat);
    lightLabelMesh.position.set(0, 0.3, 0);
    lightLabelMesh.rotation.x = -Math.PI / 6;
    lightGroup.add(lightLabelMesh);

    // Connection line to center
    const lightLineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -2),
    ]);
    const lightLineMat = new THREE.LineBasicMaterial({ color: 0xffd700, opacity: 0.3, transparent: true });
    const lightLine = new THREE.Line(lightLineGeo, lightLineMat);
    lightGroup.add(lightLine);

    // Selection ring for light
    const lightRingGeo = new THREE.RingGeometry(0.3, 0.35, 32);
    const lightRingMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0, side: THREE.DoubleSide });
    const lightRing = new THREE.Mesh(lightRingGeo, lightRingMat);
    lightRing.rotation.x = -Math.PI / 2;
    lightRing.position.y = -0.15;
    lightGroup.add(lightRing);
    lightRingRef.current = lightRing;

    // Transform gizmo for light (XYZ axes)
    const lightGizmo = new THREE.Group();
    const lAxisLength = 0.6;
    const lAxisThickness = 0.015;

    // X axis - Red
    const lxAxisGeo = new THREE.CylinderGeometry(lAxisThickness, lAxisThickness, lAxisLength, 8);
    const lxAxisMat = new THREE.MeshBasicMaterial({ color: 0xff3333 });
    const lxAxis = new THREE.Mesh(lxAxisGeo, lxAxisMat);
    lxAxis.rotation.z = -Math.PI / 2;
    lxAxis.position.x = lAxisLength / 2;
    lightGizmo.add(lxAxis);

    // Y axis - Green
    const lyAxisGeo = new THREE.CylinderGeometry(lAxisThickness, lAxisThickness, lAxisLength, 8);
    const lyAxisMat = new THREE.MeshBasicMaterial({ color: 0x33ff33 });
    const lyAxis = new THREE.Mesh(lyAxisGeo, lyAxisMat);
    lyAxis.position.y = lAxisLength / 2;
    lightGizmo.add(lyAxis);

    // Z axis - Blue
    const lzAxisGeo = new THREE.CylinderGeometry(lAxisThickness, lAxisThickness, lAxisLength, 8);
    const lzAxisMat = new THREE.MeshBasicMaterial({ color: 0x3333ff });
    const lzAxis = new THREE.Mesh(lzAxisGeo, lzAxisMat);
    lzAxis.rotation.x = Math.PI / 2;
    lzAxis.position.z = lAxisLength / 2;
    lightGizmo.add(lzAxis);

    // Arrow heads
    const lArrowSize = 0.06;
    const lxArrow = new THREE.Mesh(
      new THREE.ConeGeometry(lArrowSize, lArrowSize * 2, 8),
      new THREE.MeshBasicMaterial({ color: 0xff3333 })
    );
    lxArrow.rotation.z = -Math.PI / 2;
    lxArrow.position.x = lAxisLength;
    lightGizmo.add(lxArrow);

    const lyArrow = new THREE.Mesh(
      new THREE.ConeGeometry(lArrowSize, lArrowSize * 2, 8),
      new THREE.MeshBasicMaterial({ color: 0x33ff33 })
    );
    lyArrow.position.y = lAxisLength;
    lightGizmo.add(lyArrow);

    const lzArrow = new THREE.Mesh(
      new THREE.ConeGeometry(lArrowSize, lArrowSize * 2, 8),
      new THREE.MeshBasicMaterial({ color: 0x3333ff })
    );
    lzArrow.rotation.x = Math.PI / 2;
    lzArrow.position.z = lAxisLength;
    lightGizmo.add(lzArrow);

    lightGizmo.visible = false;
    lightGroup.add(lightGizmo);
    lightGizmoRef.current = lightGizmo;

    scene.add(lightGroup);
    lightObjRef.current = lightGroup;

    // Actual light source
    const spotLight = new THREE.SpotLight(0xffd700, 2);
    spotLight.angle = Math.PI / 6;
    spotLight.penumbra = 0.3;
    spotLight.castShadow = true;
    lightGroup.add(spotLight);
    lightGroup.userData.spotLight = spotLight;

    DEFAULT_CHARACTERS.forEach(char => buildCharacterModel(char, scene));

    // Update camera from orbit state
    const updateOrbitCamera = () => {
      const orbit = orbitStateRef.current;
      camera3d.position.set(
        orbit.target.x + orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta),
        orbit.target.y + orbit.radius * Math.cos(orbit.phi),
        orbit.target.z + orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta)
      );
      camera3d.lookAt(orbit.target);
    };

    // Animation loop
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      updateOrbitCamera();
      renderer.render(scene, camera3d);
    };
    animate();

    // Resize handler
    const handleResize = () => {
      const w = container.clientWidth || 600;
      const h = container.clientHeight || 400;
      camera3d.aspect = w / h;
      camera3d.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(container);

    return () => {
      cancelAnimationFrame(frameRef.current);
      ro.disconnect();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      isInitializedRef.current = false;
    };
  }, []);

  // Load/update source image texture separately
  useEffect(() => {
    if (!sceneRef.current || !sourceImageUrl) return;
    const scene = sceneRef.current;

    // Remove old image plane if exists
    if (imagePlaneRef.current) {
      scene.remove(imagePlaneRef.current);
      imagePlaneRef.current.geometry.dispose();
      (imagePlaneRef.current.material as THREE.MeshStandardMaterial).map?.dispose();
      (imagePlaneRef.current.material as THREE.MeshStandardMaterial).dispose();
      imagePlaneRef.current = null;
    }

    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(sourceImageUrl, (texture) => {
      if (!sceneRef.current) return;
      texture.colorSpace = THREE.SRGBColorSpace;
      const imgAspect = texture.image.width / texture.image.height;
      const planeWidth = 3;
      const planeHeight = planeWidth / imgAspect;

      const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.DoubleSide,
      });
      const plane = new THREE.Mesh(geometry, material);
      plane.position.set(0, planeHeight / 2, 0);
      plane.castShadow = true;
      plane.receiveShadow = true;
      sceneRef.current!.add(plane);
      imagePlaneRef.current = plane;

      // Frame around the image
      const frameGeo = new THREE.BoxGeometry(planeWidth + 0.1, planeHeight + 0.1, 0.05);
      const frameMat = new THREE.MeshStandardMaterial({ color: 0x888899, metalness: 0.5, roughness: 0.3 });
      const frame = new THREE.Mesh(frameGeo, frameMat);
      frame.position.set(0, planeHeight / 2, -0.03);
      sceneRef.current!.add(frame);
    });
  }, [sourceImageUrl]);

  // Update camera position based on rotation values
  useEffect(() => {
    if (!cameraObjRef.current) return;

    const radius = 3.5;
    const pitchRad = (camera.x * Math.PI) / 180;
    const yawRad = (camera.y * Math.PI) / 180;

    // Position camera around the center
    const x = radius * Math.cos(pitchRad) * Math.sin(yawRad);
    const y = radius * Math.sin(pitchRad) + 1.5; // +1.5 to be above ground
    const z = radius * Math.cos(pitchRad) * Math.cos(yawRad);

    cameraObjRef.current.position.set(x, y, z);
    cameraObjRef.current.lookAt(0, 1.5, 0);

    // Update roll
    cameraObjRef.current.rotation.z = (camera.z * Math.PI) / 180;
  }, [camera]);

  // Update light position based on lighting direction
  useEffect(() => {
    if (!lightObjRef.current) return;

    const radius = 4;
    const azRad = (lighting.azimuth * Math.PI) / 180;
    const elRad = (lighting.elevation * Math.PI) / 180;

    const x = radius * Math.cos(elRad) * Math.sin(azRad);
    const y = radius * Math.sin(elRad) + 1.5;
    const z = radius * Math.cos(elRad) * Math.cos(azRad);

    lightObjRef.current.position.set(x, y, z);
    lightObjRef.current.lookAt(0, 1.5, 0);

    // Update spotlight target
    if (lightObjRef.current.userData.spotLight) {
      lightObjRef.current.userData.spotLight.target.position.set(0, 1.5, 0);
      lightObjRef.current.userData.spotLight.target.updateMatrixWorld();
    }
  }, [lighting]);

  // Raycasting to detect clicks on objects and gizmo axes
  const getIntersectedObject = useCallback((clientX: number, clientY: number): { type: SelectedObject; charId?: string; axis?: SelectedAxis } => {
    const container = containerRef.current;
    const scene = sceneRef.current;
    const camera3d = camera3dRef.current;
    if (!container || !scene || !camera3d) return { type: 'none' };

    const rect = container.getBoundingClientRect();
    mouseRef.current.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(mouseRef.current, camera3d);

    // Check gizmo axes first (when object is selected)
    if (selectedObject === 'camera' && cameraGizmoRef.current) {
      const axisNames: SelectedAxis[] = ['x', 'y', 'z'];
      for (let i = 0; i < cameraGizmoRef.current.children.length; i++) {
        const child = cameraGizmoRef.current.children[i];
        const intersects = raycasterRef.current.intersectObject(child, false);
        if (intersects.length > 0) {
          // Axis objects: 0=xAxis, 1=yAxis, 2=zAxis, 3=xArrow, 4=yArrow, 5=zArrow
          const axisIdx = i % 3;
          return { type: 'camera', axis: axisNames[axisIdx] };
        }
      }
    }
    if (selectedObject === 'light' && lightGizmoRef.current) {
      const axisNames: SelectedAxis[] = ['x', 'y', 'z'];
      for (let i = 0; i < lightGizmoRef.current.children.length; i++) {
        const child = lightGizmoRef.current.children[i];
        const intersects = raycasterRef.current.intersectObject(child, false);
        if (intersects.length > 0) {
          const axisIdx = i % 3;
          return { type: 'light', axis: axisNames[axisIdx] };
        }
      }
    }
    if (selectedObject === 'character' && selectedCharacterId) {
      const gizmo = characterGizmoRefs.current.get(selectedCharacterId);
      if (gizmo) {
        const axisNames: SelectedAxis[] = ['x', 'y', 'z'];
        for (let i = 0; i < gizmo.children.length; i++) {
          const child = gizmo.children[i];
          const intersects = raycasterRef.current.intersectObject(child, false);
          if (intersects.length > 0) {
            const axisIdx = i % 3;
            return { type: 'character', charId: selectedCharacterId, axis: axisNames[axisIdx] };
          }
        }
      }
    }

    // Check camera object
    if (cameraObjRef.current) {
      const camIntersects = raycasterRef.current.intersectObjects(cameraObjRef.current.children, true);
      if (camIntersects.length > 0) return { type: 'camera' };
    }

    // Check light object
    if (lightObjRef.current) {
      const lightIntersects = raycasterRef.current.intersectObjects(lightObjRef.current.children, true);
      if (lightIntersects.length > 0) return { type: 'light' };
    }

    // Check character objects
    for (const [id, charGroup] of characterRefs.current.entries()) {
      const charIntersects = raycasterRef.current.intersectObjects(charGroup.children, true);
      if (charIntersects.length > 0) return { type: 'character', charId: id };
    }

    return { type: 'none' };
  }, [selectedObject, selectedCharacterId]);

  // Update selection highlight rings and gizmos
  useEffect(() => {
    if (cameraRingRef.current) {
      (cameraRingRef.current.material as THREE.MeshBasicMaterial).opacity = selectedObject === 'camera' ? 0.8 : 0;
    }
    if (lightRingRef.current) {
      (lightRingRef.current.material as THREE.MeshBasicMaterial).opacity = selectedObject === 'light' ? 0.8 : 0;
    }
    if (cameraGizmoRef.current) {
      cameraGizmoRef.current.visible = selectedObject === 'camera';
    }
    if (lightGizmoRef.current) {
      lightGizmoRef.current.visible = selectedObject === 'light';
    }

    // Update character selections
    characterRefs.current.forEach((group, id) => {
      const ring = group.children.find(c => c instanceof THREE.Mesh && c.geometry.type === 'RingGeometry') as THREE.Mesh | undefined;
      if (ring) {
        (ring.material as THREE.MeshBasicMaterial).opacity = (selectedObject === 'character' && selectedCharacterId === id) ? 0.8 : 0;
      }
    });

    characterGizmoRefs.current.forEach((gizmo, id) => {
      gizmo.visible = (selectedObject === 'character' && selectedCharacterId === id);
    });
  }, [selectedObject, selectedCharacterId]);

  // Keyboard shortcuts for transform modes (Blender style)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (disabled || selectedObject === 'none') return;
      if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        setTransformMode('translate');
        setIsTransforming(true);
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        setTransformMode('rotate');
        setIsTransforming(true);
      } else if (e.key === 'Escape') {
        setIsTransforming(false);
        setSelectedObject('none');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [disabled, selectedObject]);

  // Blender-style mouse interactions
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled) return;

    // Middle mouse button = orbit / pan (Blender style)
    if (e.button === 1) {
      e.preventDefault();
      if (e.shiftKey) {
        setIsPanning(true);
      } else {
        setIsOrbiting(true);
      }
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        camX: camera.x,
        camY: camera.y,
        lightAz: lighting.azimuth,
        lightEl: lighting.elevation,
        charX: 0,
        charY: 0,
        charZ: 0,
        charRotY: 0,
      };
      return;
    }

    // Left click
    if (e.button === 0) {
      const clickedObj = getIntersectedObject(e.clientX, e.clientY);

      if (clickedObj.type !== 'none') {
        e.preventDefault();
        e.stopPropagation();

        // Clicked on a gizmo axis
        if (clickedObj.axis && clickedObj.axis !== 'none') {
          setSelectedAxis(clickedObj.axis);
          setIsTransforming(true);
          const char = clickedObj.charId ? characters.find(c => c.id === clickedObj.charId) : null;
          dragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            camX: camera.x,
            camY: camera.y,
            lightAz: lighting.azimuth,
            lightEl: lighting.elevation,
            charX: char?.x ?? 0,
            charY: char?.y ?? 0,
            charZ: char?.z ?? 0,
            charRotY: char?.rotationY ?? 0,
          };
          return;
        }

        // Clicked on an object body
        if (clickedObj.type === 'character') {
          const charId = clickedObj.charId!;
          if (selectedObject === 'character' && selectedCharacterId === charId && !isTransforming) {
            setIsTransforming(true);
          } else {
            setSelectedObject('character');
            setSelectedCharacterId(charId);
            setTransformMode('translate');
            setSelectedAxis('none');
            setIsTransforming(true);
          }
          const char = characters.find(c => c.id === charId);
          dragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            camX: camera.x,
            camY: camera.y,
            lightAz: lighting.azimuth,
            lightEl: lighting.elevation,
            charX: char?.x ?? 0,
            charY: char?.y ?? 0,
            charZ: char?.z ?? 0,
            charRotY: char?.rotationY ?? 0,
          };
        } else {
          setSelectedCharacterId(null);
          if (selectedObject === clickedObj.type && !isTransforming) {
            setIsTransforming(true);
          } else {
            setSelectedObject(clickedObj.type);
            setTransformMode('translate');
            setSelectedAxis('none');
            setIsTransforming(true);
          }
          dragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            camX: camera.x,
            camY: camera.y,
            lightAz: lighting.azimuth,
            lightEl: lighting.elevation,
            charX: 0,
            charY: 0,
            charZ: 0,
            charRotY: 0,
          };
        }
      } else {
        // Clicked on empty space - deselect
        setSelectedObject('none');
        setSelectedCharacterId(null);
        setSelectedAxis('none');
        setIsTransforming(false);
      }
    }

    // Right click = switch transform mode (Translate <-> Rotate)
    if (e.button === 2) {
      e.preventDefault();
      if (selectedObject !== 'none') {
        setTransformMode(prev => prev === 'translate' ? 'rotate' : 'translate');
      }
    }
  }, [disabled, camera, lighting, selectedObject, isTransforming, getIntersectedObject]);

  // Wheel zoom (Blender style)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomSpeed = 0.1;
      const delta = e.deltaY > 0 ? 1 + zoomSpeed : 1 - zoomSpeed;
      orbitStateRef.current.radius = Math.max(2, Math.min(30, orbitStateRef.current.radius * delta));
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isOrbiting) {
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        const sensitivity = 0.008;

        orbitStateRef.current.theta -= dx * sensitivity;
        orbitStateRef.current.phi = Math.max(0.1, Math.min(Math.PI - 0.1, orbitStateRef.current.phi + dy * sensitivity));

        dragStartRef.current.x = e.clientX;
        dragStartRef.current.y = e.clientY;
        return;
      }

      if (isPanning) {
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        const sensitivity = 0.01;

        const right = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);
        if (camera3dRef.current) {
          camera3dRef.current.getWorldDirection(right);
          right.cross(up).normalize();
        }

        orbitStateRef.current.target.x -= right.x * dx * sensitivity * orbitStateRef.current.radius;
        orbitStateRef.current.target.z -= right.z * dx * sensitivity * orbitStateRef.current.radius;
        orbitStateRef.current.target.y += dy * sensitivity * orbitStateRef.current.radius;

        dragStartRef.current.x = e.clientX;
        dragStartRef.current.y = e.clientY;
        return;
      }

      // Camera transform with axis constraint
      if (isTransforming && selectedObject === 'camera') {
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        const sensitivity = 0.5;

        if (transformMode === 'translate') {
          // Free movement when no axis selected, axis-constrained when axis selected
          const newCam = { ...camera };
          if (selectedAxis === 'none' || selectedAxis === 'x') {
            newCam.x = Math.max(-80, Math.min(80, dragStartRef.current.camX + dy * sensitivity));
          }
          if (selectedAxis === 'none' || selectedAxis === 'y') {
            const newY = dragStartRef.current.camY - dx * sensitivity;
            newCam.y = ((newY + 180) % 360 + 360) % 360 - 180;
          }
          if (selectedAxis === 'z') {
            const newZ = dragStartRef.current.camX + dx * sensitivity;
            newCam.z = ((newZ + 180) % 360 + 360) % 360 - 180;
          }
          onCameraChange(newCam);
        } else {
          // Rotate mode - change roll (Z) or axis-specific
          if (selectedAxis === 'x') {
            const newX = Math.max(-80, Math.min(80, dragStartRef.current.camX + dy * sensitivity));
            onCameraChange({ ...camera, x: newX });
          } else if (selectedAxis === 'y') {
            const newY = dragStartRef.current.camY - dx * sensitivity;
            onCameraChange({ ...camera, y: ((newY + 180) % 360 + 360) % 360 - 180 });
          } else {
            const newZ = dragStartRef.current.camX + dx * sensitivity;
            onCameraChange({ ...camera, z: ((newZ + 180) % 360 + 360) % 360 - 180 });
          }
        }
      }

      // Light transform with axis constraint
      if (isTransforming && selectedObject === 'light') {
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        const sensitivity = 0.8;

        if (selectedAxis === 'none' || selectedAxis === 'x') {
          const newAz = dragStartRef.current.lightAz + dx * sensitivity;
          onLightingChange({
            azimuth: ((newAz + 180) % 360 + 360) % 360 - 180,
            elevation: lighting.elevation,
          });
        } else if (selectedAxis === 'y') {
          const newEl = Math.max(-89, Math.min(89, dragStartRef.current.lightEl - dy * sensitivity));
          onLightingChange({
            azimuth: lighting.azimuth,
            elevation: newEl,
          });
        } else {
          // Z axis - combined movement
          const newAz = dragStartRef.current.lightAz + dx * sensitivity;
          const newEl = Math.max(-89, Math.min(89, dragStartRef.current.lightEl - dy * sensitivity));
          onLightingChange({
            azimuth: ((newAz + 180) % 360 + 360) % 360 - 180,
            elevation: newEl,
          });
        }
      }

      // Character transform with axis constraint
      if (isTransforming && selectedObject === 'character' && selectedCharacterId) {
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        const charGroup = characterRefs.current.get(selectedCharacterId);
        if (!charGroup) return;

        if (transformMode === 'translate') {
          const sensitivity = 0.01;
          const newX = selectedAxis === 'none' || selectedAxis === 'x' ? dragStartRef.current.charX + dx * sensitivity : charGroup.position.x;
          const newY = selectedAxis === 'y' ? dragStartRef.current.charY - dy * sensitivity : charGroup.position.y;
          const newZ = selectedAxis === 'none' || selectedAxis === 'z' ? dragStartRef.current.charZ - dy * sensitivity : charGroup.position.z;

          charGroup.position.set(newX, newY, newZ);
          setCharacters(prev => prev.map(c =>
            c.id === selectedCharacterId ? { ...c, x: newX, y: newY, z: newZ } : c
          ));
        } else {
          // Rotate mode - axis-specific rotation
          const sensitivity = 0.5;
          if (selectedAxis === 'y' || selectedAxis === 'none') {
            const newRotY = dragStartRef.current.charRotY + dx * sensitivity;
            const rotRad = (newRotY * Math.PI) / 180;
            charGroup.rotation.y = rotRad;
            setCharacters(prev => prev.map(c =>
              c.id === selectedCharacterId ? { ...c, rotationY: newRotY } : c
            ));
          }
        }
      }
    };

    const handleMouseUp = () => {
      setIsTransforming(false);
      setIsOrbiting(false);
      setIsPanning(false);
      setSelectedAxis('none');
    };

    if (isTransforming || isOrbiting || isPanning) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isTransforming, isOrbiting, isPanning, selectedObject, selectedCharacterId, transformMode, camera, lighting, characters, onCameraChange, onLightingChange]);

  return (
    <div className="relative w-full h-full flex">
      {/* 3D Scene */}
      <div
        ref={containerRef}
        className={`flex-1 h-full ${
          isOrbiting ? 'cursor-move' :
          isPanning ? 'cursor-grabbing' :
          isTransforming ? 'cursor-crosshair' :
          selectedObject !== 'none' ? 'cursor-pointer' :
          'cursor-grab'
        }`}
        onMouseDown={handleMouseDown}
        onContextMenu={(e) => e.preventDefault()}
        style={{ userSelect: 'none' }}
      />

      {/* Overlay controls - Left side only */}
      <div className="absolute top-2 left-2 z-10 flex flex-col gap-2">
        {/* Camera info */}
        <div className={`bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 border ${selectedObject === 'camera' ? 'border-blue-400' : 'border-white/10'}`}>
          <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1 flex items-center gap-1">
            摄影机
            {selectedObject === 'camera' && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/30 text-blue-300">
                {transformMode === 'translate' ? '移动' : '旋转'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span style={{ color: '#ef4444' }}>X:{Math.round(camera.x)}°</span>
            <span style={{ color: '#22c55e' }}>Y:{Math.round(camera.y)}°</span>
            <span style={{ color: '#3b82f6' }}>Z:{Math.round(camera.z)}°</span>
          </div>
        </div>

        {/* Lighting info */}
        <div className={`bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 border ${selectedObject === 'light' ? 'border-amber-400' : 'border-white/10'}`}>
          <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1 flex items-center gap-1">
            打光器
            {selectedObject === 'light' && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/30 text-amber-300">
                {transformMode === 'translate' ? '移动' : '旋转'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-amber-300">
            <span>{Math.round(lighting.azimuth)}°</span>
            <span className="text-white/30">/</span>
            <span>{Math.round(lighting.elevation)}°</span>
          </div>
        </div>

        {/* Characters info */}
        {characters.map((char, idx) => (
          <div
            key={char.id}
            className={`bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 border ${
              selectedObject === 'character' && selectedCharacterId === char.id ? 'border-pink-400' : 'border-white/10'
            }`}
          >
            <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1 flex items-center gap-1">
              <span style={{ color: char.modelType === 'female' ? '#e85d75' : char.modelType === 'child' ? '#5dade2' : '#3b82f6' }}>●</span>
              {char.name || `人物 ${idx + 1}`}
              {selectedObject === 'character' && selectedCharacterId === char.id && (
                <span className="text-[9px] px-1 py-0.5 rounded bg-pink-500/30 text-pink-300">
                  {transformMode === 'translate' ? '移动' : '旋转'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-white/60">X:{char.x.toFixed(1)}</span>
              <span className="text-white/60">Z:{char.z.toFixed(1)}</span>
              <span className="text-white/40">R:{Math.round(char.rotationY)}°</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setCharacters(prev => prev.filter(c => c.id !== char.id));
                  if (selectedCharacterId === char.id) {
                    setSelectedCharacterId(null);
                    setSelectedObject('none');
                  }
                  // Remove 3D model
                  const group = characterRefs.current.get(char.id);
                  if (group && sceneRef.current) {
                    sceneRef.current.remove(group);
                    group.traverse(child => {
                      if (child instanceof THREE.Mesh) {
                        child.geometry.dispose();
                        if (Array.isArray(child.material)) {
                          child.material.forEach(m => m.dispose());
                        } else {
                          child.material.dispose();
                        }
                      }
                    });
                  }
                  characterRefs.current.delete(char.id);
                  characterGizmoRefs.current.delete(char.id);
                }}
                className="ml-auto text-white/20 hover:text-red-400 transition-colors text-[10px] leading-none"
                title="删除"
              >
                ✕
              </button>
            </div>
          </div>
        ))}

        {/* Add character buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => loadPresetModel('male', `男性${characters.length + 1}`, 1.7)}
            className="bg-black/60 backdrop-blur-sm rounded-lg px-2 py-1.5 border border-dashed border-white/20 text-white/40 hover:text-white/70 hover:border-white/40 transition-colors text-[11px] flex items-center gap-1"
            title="添加男性模型"
          >
            <span>+</span> 男
          </button>
          <button
            onClick={() => loadPresetModel('female', `女性${characters.length + 1}`, 1.6)}
            className="bg-black/60 backdrop-blur-sm rounded-lg px-2 py-1.5 border border-dashed border-white/20 text-white/40 hover:text-white/70 hover:border-white/40 transition-colors text-[11px] flex items-center gap-1"
            title="添加女性模型"
          >
            <span>+</span> 女
          </button>
          <button
            onClick={() => loadPresetModel('child', `儿童${characters.length + 1}`, 1.3)}
            className="bg-black/60 backdrop-blur-sm rounded-lg px-2 py-1.5 border border-dashed border-white/20 text-white/40 hover:text-white/70 hover:border-white/40 transition-colors text-[11px] flex items-center gap-1"
            title="添加儿童模型"
          >
            <span>+</span> 童
          </button>
          <button
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.glb,.gltf';
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file || !sceneRef.current) return;
                const url = URL.createObjectURL(file);
                const loader = new GLTFLoader();
                loader.load(url, (gltf) => {
                  const newId = `char_${Date.now()}`;
                  const model = gltf.scene;
                  model.position.set(0, 0, 0);
                  model.userData = { type: 'character', id: newId };
                  // Auto-scale to standard height
                  const box = new THREE.Box3().setFromObject(model);
                  const size = box.getSize(new THREE.Vector3());
                  const targetHeight = 1.7;
                  const scale = targetHeight / size.y;
                  model.scale.setScalar(scale);
                  // Selection ring
                  const ringGeo = new THREE.RingGeometry(0.35, 0.4, 32);
                  const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0, side: THREE.DoubleSide });
                  const ring = new THREE.Mesh(ringGeo, ringMat);
                  ring.rotation.x = -Math.PI / 2;
                  ring.position.y = 0.02;
                  model.add(ring);
                  // Gizmo
                  const gizmo = new THREE.Group();
                  const axisLength = 0.6;
                  const axisThickness = 0.015;
                  ['#ff3333', '#33ff33', '#3333ff'].forEach((col, i) => {
                    const axisGeo = new THREE.CylinderGeometry(axisThickness, axisThickness, axisLength, 8);
                    const axisMat = new THREE.MeshBasicMaterial({ color: col });
                    const axis = new THREE.Mesh(axisGeo, axisMat);
                    if (i === 0) { axis.rotation.z = -Math.PI / 2; axis.position.x = axisLength / 2; }
                    else if (i === 1) { axis.position.y = axisLength / 2; }
                    else { axis.rotation.x = Math.PI / 2; axis.position.z = axisLength / 2; }
                    gizmo.add(axis);
                    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 8), new THREE.MeshBasicMaterial({ color: col }));
                    if (i === 0) { arrow.rotation.z = -Math.PI / 2; arrow.position.x = axisLength; }
                    else if (i === 1) { arrow.position.y = axisLength; }
                    else { arrow.rotation.x = Math.PI / 2; arrow.position.z = axisLength; }
                    gizmo.add(arrow);
                  });
                  gizmo.visible = false;
                  gizmo.position.y = targetHeight / 2;
                  model.add(gizmo);
                  characterGizmoRefs.current.set(newId, gizmo);
                  sceneRef.current!.add(model);
                  characterRefs.current.set(newId, model);
                  const newChar: CharacterPose = {
                    id: newId,
                    x: 0, y: 0, z: 0,
                    rotationY: 0,
                    scale,
                    height: targetHeight,
                    name: file.name.replace(/\.[^/.]+$/, ''),
                    description: '',
                    modelType: 'custom',
                    modelUrl: url,
                  };
                  setCharacters(prev => [...prev, newChar]);
                }, undefined, (err) => {
                  console.error('[GLB Load Error]', err);
                  alert('模型加载失败，请检查文件格式');
                });
              };
              input.click();
            }}
            className="bg-black/60 backdrop-blur-sm rounded-lg px-2 py-1.5 border border-dashed border-white/20 text-white/40 hover:text-white/70 hover:border-white/40 transition-colors text-[11px] flex items-center gap-1"
            title="导入GLB/GLTF模型"
          >
            <span>+</span> 导入
          </button>
        </div>

        {/* Transform mode indicator */}
        {selectedObject !== 'none' && (
          <div className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 border border-green-400/50">
            <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">变换模式</div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className={transformMode === 'translate' ? 'text-green-400 font-bold' : 'text-white/30'}>
                G-移动
              </span>
              <span className="text-white/20">|</span>
              <span className={transformMode === 'rotate' ? 'text-green-400 font-bold' : 'text-white/30'}>
                R-旋转
              </span>
              <span className="text-white/20">|</span>
              <span className="text-white/30">右键切换</span>
            </div>
          </div>
        )}
      </div>

      {/* Character Config Panel - Right side as sidebar panel */}
      {selectedObject === 'character' && selectedCharacterId && (
        <div className="absolute top-2 right-2 z-20 w-56 bg-black/90 backdrop-blur-sm rounded-lg border border-pink-400/30 p-3 shadow-xl max-h-[calc(100%-70px)] overflow-y-auto">
          <div className="text-[11px] text-white/60 uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>角色配置</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  const char = characters.find(c => c.id === selectedCharacterId);
                  if (!char) return;
                  setCharacters(prev => prev.filter(c => c.id !== selectedCharacterId));
                  setSelectedObject('none');
                  setSelectedCharacterId(null);
                  const group = characterRefs.current.get(selectedCharacterId);
                  if (group && sceneRef.current) {
                    sceneRef.current.remove(group);
                    group.traverse(child => {
                      if (child instanceof THREE.Mesh) {
                        child.geometry.dispose();
                        if (Array.isArray(child.material)) {
                          child.material.forEach(m => m.dispose());
                        } else {
                          child.material.dispose();
                        }
                      }
                    });
                  }
                  characterRefs.current.delete(selectedCharacterId);
                  characterGizmoRefs.current.delete(selectedCharacterId);
                }}
                className="text-white/30 hover:text-red-400 text-xs px-1"
                title="删除角色"
              >
                🗑
              </button>
              <button
                onClick={() => {
                  setSelectedObject('none');
                  setSelectedCharacterId(null);
                }}
                className="text-white/40 hover:text-white/80 text-xs"
              >
                ✕
              </button>
            </div>
          </div>
          {(() => {
            const char = characters.find(c => c.id === selectedCharacterId);
            if (!char) return null;
            return (
              <div className="flex flex-col gap-2">
                {/* Name */}
                <div>
                  <label className="text-[10px] text-white/40 block mb-0.5">角色名称</label>
                  <input
                    type="text"
                    value={char.name}
                    onChange={(e) => {
                      setCharacters(prev => prev.map(c =>
                        c.id === selectedCharacterId ? { ...c, name: e.target.value } : c
                      ));
                    }}
                    className="w-full bg-white/10 border border-white/20 rounded px-2 py-1 text-[11px] text-white outline-none focus:border-pink-400"
                  />
                </div>

                {/* Bind to Project Character */}
                {projectCharacters.length > 0 && (
                  <div>
                    <label className="text-[10px] text-white/40 block mb-0.5">绑定项目角色</label>
                    <select
                      value={char.boundCharacterId || ''}
                      onChange={(e) => {
                        const charId = e.target.value ? parseInt(e.target.value) : null;
                        const boundChar = charId ? projectCharacters.find(c => c.id === charId) : null;
                        setCharacters(prev => prev.map(c =>
                          c.id === selectedCharacterId ? {
                            ...c,
                            boundCharacterId: charId,
                            name: boundChar?.name || c.name,
                            description: boundChar
                              ? `${boundChar.base_appearance || boundChar.appearance || ''}${boundChar.active_state_outfit || boundChar.outfit_appearance ? '，' + (boundChar.active_state_outfit || boundChar.outfit_appearance) : ''}`
                              : c.description,
                            modelType: c.modelType,
                          } : c
                        ));
                      }}
                      className="w-full bg-white/10 border border-white/20 rounded px-2 py-1 text-[11px] text-white outline-none focus:border-pink-400"
                    >
                      <option value="">-- 选择角色 --</option>
                      {projectCharacters.map(pc => (
                        <option key={pc.id} value={pc.id}>
                          {pc.name}
                          {pc.active_state_name ? ` (${pc.active_state_name})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Description */}
                <div>
                  <label className="text-[10px] text-white/40 block mb-0.5">外观描述（用于AI生成）</label>
                  <textarea
                    value={char.description}
                    onChange={(e) => {
                      setCharacters(prev => prev.map(c =>
                        c.id === selectedCharacterId ? { ...c, description: e.target.value } : c
                      ));
                    }}
                    placeholder="例如：穿着红色连衣裙的少女，黑色长发..."
                    rows={3}
                    className="w-full bg-white/10 border border-white/20 rounded px-2 py-1 text-[11px] text-white outline-none focus:border-pink-400 resize-none"
                  />
                </div>

                {/* Model Type */}
                <div>
                  <label className="text-[10px] text-white/40 block mb-0.5">模型类型</label>
                  <select
                    value={char.modelType}
                    onChange={(e) => {
                      const newType = e.target.value as CharacterModelType;
                      setCharacters(prev => prev.map(c =>
                        c.id === selectedCharacterId ? { ...c, modelType: newType } : c
                      ));
                      // Rebuild model with new type
                      const group = characterRefs.current.get(selectedCharacterId);
                      if (group && sceneRef.current) {
                        sceneRef.current.remove(group);
                        group.traverse(child => {
                          if (child instanceof THREE.Mesh) {
                            child.geometry.dispose();
                            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                            else child.material.dispose();
                          }
                        });
                        characterRefs.current.delete(selectedCharacterId);
                        characterGizmoRefs.current.delete(selectedCharacterId);
                        buildCharacterModel({ ...char, modelType: newType }, sceneRef.current);
                      }
                    }}
                    className="w-full bg-white/10 border border-white/20 rounded px-2 py-1 text-[11px] text-white outline-none focus:border-pink-400"
                  >
                    <option value="male">男性</option>
                    <option value="female">女性</option>
                    <option value="child">儿童</option>
                    {char.modelType === 'custom' && <option value="custom">自定义模型</option>}
                  </select>
                </div>

                {/* Scale */}
                <div>
                  <label className="text-[10px] text-white/40 block mb-0.5">缩放: {char.scale.toFixed(2)}x</label>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.05"
                    value={char.scale}
                    onChange={(e) => {
                      const newScale = parseFloat(e.target.value);
                      setCharacters(prev => prev.map(c =>
                        c.id === selectedCharacterId ? { ...c, scale: newScale } : c
                      ));
                      const group = characterRefs.current.get(selectedCharacterId);
                      if (group) group.scale.setScalar(newScale);
                    }}
                    className="w-full accent-pink-400"
                  />
                </div>

                {/* Position X/Y/Z sliders */}
                <div className="space-y-1.5">
                  {[
                    { key: 'x' as const, label: 'X', color: '#ef4444', min: -5, max: 5, step: 0.1 },
                    { key: 'y' as const, label: 'Y', color: '#22c55e', min: 0, max: 3, step: 0.1 },
                    { key: 'z' as const, label: 'Z', color: '#3b82f6', min: -5, max: 5, step: 0.1 },
                  ].map(({ key, label, color, min, max, step }) => (
                    <div key={key} className="flex items-center gap-1.5">
                      <span className="text-[9px] font-bold shrink-0 w-3 text-center" style={{ color }}>{label}</span>
                      <input
                        type="range"
                        min={min}
                        max={max}
                        step={step}
                        value={char[key]}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setCharacters(prev => prev.map(c =>
                            c.id === selectedCharacterId ? { ...c, [key]: val } : c
                          ));
                          const group = characterRefs.current.get(selectedCharacterId);
                          if (group) {
                            if (key === 'x') group.position.x = val;
                            else if (key === 'y') group.position.y = val;
                            else if (key === 'z') group.position.z = val;
                          }
                        }}
                        className="flex-1 h-1 appearance-none bg-white/20 rounded-full outline-none cursor-pointer
                          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2
                          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
                      />
                      <input
                        type="number"
                        min={min}
                        max={max}
                        step={step}
                        value={char[key].toFixed(1)}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setCharacters(prev => prev.map(c =>
                            c.id === selectedCharacterId ? { ...c, [key]: val } : c
                          ));
                          const group = characterRefs.current.get(selectedCharacterId);
                          if (group) {
                            if (key === 'x') group.position.x = val;
                            else if (key === 'y') group.position.y = val;
                            else if (key === 'z') group.position.z = val;
                          }
                        }}
                        className="w-10 h-5 bg-white/10 border border-white/20 rounded text-[9px] text-white text-center outline-none focus:border-pink-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                  ))}
                </div>

                {/* Rotation Y */}
                <div>
                  <label className="text-[10px] text-white/40 block mb-0.5">旋转 Y: {Math.round(char.rotationY)}°</label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-bold shrink-0 w-3 text-center" style={{ color: '#a855f7' }}>R</span>
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      step="5"
                      value={char.rotationY}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setCharacters(prev => prev.map(c =>
                          c.id === selectedCharacterId ? { ...c, rotationY: val } : c
                        ));
                        const group = characterRefs.current.get(selectedCharacterId);
                        if (group) group.rotation.y = (val * Math.PI) / 180;
                      }}
                      className="flex-1 h-1 appearance-none bg-white/20 rounded-full outline-none cursor-pointer
                        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2
                        [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
                    />
                    <input
                      type="number"
                      min="-180"
                      max="180"
                      value={char.rotationY}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10) || 0;
                        setCharacters(prev => prev.map(c =>
                          c.id === selectedCharacterId ? { ...c, rotationY: val } : c
                        ));
                        const group = characterRefs.current.get(selectedCharacterId);
                        if (group) group.rotation.y = (val * Math.PI) / 180;
                      }}
                      className="w-10 h-5 bg-white/10 border border-white/20 rounded text-[9px] text-white text-center outline-none focus:border-pink-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                </div>

                {/* Generate Prompt Preview */}
                <div className="mt-1 pt-2 border-t border-white/10">
                  <label className="text-[10px] text-white/40 block mb-0.5">AI提示词预览</label>
                  <div className="bg-white/5 rounded p-2 text-[10px] text-white/70 leading-relaxed">
                    {char.description
                      ? `${char.description}，站在画面${char.z > 0 ? '前' : char.z < 0 ? '后' : '中'}方${char.x > 0 ? '右侧' : char.x < 0 ? '左侧' : '中央'}，面向${char.rotationY > 20 ? '左侧' : char.rotationY < -20 ? '右侧' : '前方'}`
                      : '请先填写外观描述...'
                    }
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Blender-style controls hint */}
      <div className="absolute bottom-2 left-2 z-10 text-[10px] text-white/30">
        左键点击选中 | G移动 R旋转 | 右键切换模式 | 中键旋转视角 | Shift+中键平移 | 滚轮缩放
      </div>
    </div>
  );
};

export default Scene3DViewer;
