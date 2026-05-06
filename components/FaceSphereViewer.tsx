/**
 * 8方位场景图球体查看器
 * - 将 6 张水平方位图 + 天顶 + 地面 共 8 张图拼接到球体内壁
 * - 水平 6 张按 60° 间隔放置在球体赤道圈，天顶/地面放置在上下
 * - 支持鼠标/触摸拖动旋转，滚轮缩放 FOV
 * - 自动旋转（用户拖动后停止）
 *
 * 原理：每张图是一个透视图视角，将它们作为平面贴图放在球体内部对应方位，
 * 从球心观看时还原出完整的 360° 场景。
 */
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface FaceSphereViewerProps {
  /** 8方位图 URL 映射 { front, right, back, left, right_front, left_front, top, bottom } */
  faces: Record<string, string>;
  className?: string;
  autoRotateSpeed?: number;
  fov?: number;
}

/** 水平方位布局定义 */
const HORIZONTAL_FACES = [
  { key: 'front',       azimuthDeg: 0   },
  { key: 'right',       azimuthDeg: 60  },
  { key: 'back',        azimuthDeg: 120 },
  { key: 'left',        azimuthDeg: 180 },
  { key: 'right_front', azimuthDeg: 240 },
  { key: 'left_front',  azimuthDeg: 300 },
];

const FaceSphereViewer: React.FC<FaceSphereViewerProps> = ({
  faces,
  className,
  autoRotateSpeed = 0.02,
  fov = 75,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const viewStateRef = useRef({ yaw: 0, pitch: 0, fovDeg: fov });
  const autoRotateRef = useRef(autoRotateSpeed);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const faceKeys = Object.keys(faces).filter(k => faces[k]);
    if (faceKeys.length === 0) return;

    const width = container.clientWidth || 640;
    const height = container.clientHeight || 360;

    // 场景 & 相机
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 1100);
    camera.position.set(0, 0, 0.01);

    // 渲染器
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);

    const R = 500;
    // 每张水平图覆盖约 90° FOV（确保 60° 间隔下有 ≥30% 重叠）
    // 90° FOV 在距离 R 处对应的平面尺寸 = 2R * tan(45°) = 2R
    const PLANE_SIZE = R * 2.2; // 稍微加大确保无接缝

    const textureLoader = new THREE.TextureLoader();
    const meshes: THREE.Mesh[] = [];

    /**
     * 加载纹理并创建平面贴图
     */
    const loadAndPlace = async () => {
      // 水平 6 张
      for (const hf of HORIZONTAL_FACES) {
        const url = faces[hf.key];
        if (!url) continue;

        const texture = await new Promise<THREE.Texture>((resolve) => {
          textureLoader.load(url, (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            resolve(tex);
          });
        });

        const geometry = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE);
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          side: THREE.FrontSide,
          depthWrite: true,
        });
        const mesh = new THREE.Mesh(geometry, material);

        // 将平面放在球体内壁对应方位
        const azRad = (hf.azimuthDeg * Math.PI) / 180;
        mesh.position.set(
          R * Math.sin(azRad),
          0,
          -R * Math.cos(azRad)
        );
        mesh.rotation.y = -azRad;

        scene.add(mesh);
        meshes.push(mesh);
      }

      // 天顶
      if (faces.top) {
        const texture = await new Promise<THREE.Texture>((resolve) => {
          textureLoader.load(faces.top!, (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            resolve(tex);
          });
        });
        const geometry = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE);
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          side: THREE.FrontSide,
          depthWrite: true,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(0, R, 0);
        mesh.rotation.x = Math.PI / 2;
        scene.add(mesh);
        meshes.push(mesh);
      }

      // 地面
      if (faces.bottom) {
        const texture = await new Promise<THREE.Texture>((resolve) => {
          textureLoader.load(faces.bottom!, (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            resolve(tex);
          });
        });
        const geometry = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE);
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          side: THREE.FrontSide,
          depthWrite: true,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(0, -R, 0);
        mesh.rotation.x = -Math.PI / 2;
        scene.add(mesh);
        meshes.push(mesh);
      }
    };

    loadAndPlace();

    // 相机朝向
    viewStateRef.current.yaw = 0;
    viewStateRef.current.pitch = 0;
    viewStateRef.current.fovDeg = fov;

    const updateCamera = () => {
      const { yaw, pitch } = viewStateRef.current;
      const clampedPitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
      const target = new THREE.Vector3(
        Math.cos(clampedPitch) * Math.sin(yaw),
        Math.sin(clampedPitch),
        -Math.cos(clampedPitch) * Math.cos(yaw)
      );
      camera.lookAt(target);
    };
    updateCamera();

    // 交互控制
    let isDragging = false;
    let lastX = 0;
    let lastY = 0;

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      (e.target as Element)?.setPointerCapture?.(e.pointerId);
      autoRotateRef.current = 0;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      viewStateRef.current.yaw -= dx * 0.005;
      viewStateRef.current.pitch += dy * 0.005;
      updateCamera();
    };
    const onPointerUp = (e: PointerEvent) => {
      isDragging = false;
      (e.target as Element)?.releasePointerCapture?.(e.pointerId);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const newFov = Math.max(30, Math.min(100, camera.fov + e.deltaY * 0.05));
      camera.fov = newFov;
      viewStateRef.current.fovDeg = newFov;
      camera.updateProjectionMatrix();
    };

    const canvas = renderer.domElement;
    canvas.style.cursor = 'grab';
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const resize = () => {
      const w = container.clientWidth || 640;
      const h = container.clientHeight || 360;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const clock = new THREE.Clock();
    const animate = () => {
      animationRef.current = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      if (autoRotateRef.current > 0) {
        viewStateRef.current.yaw += autoRotateRef.current * delta;
        updateCamera();
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      meshes.forEach(m => {
        m.geometry.dispose();
        const mat = m.material as THREE.MeshBasicMaterial;
        mat.map?.dispose();
        mat.dispose();
      });
      renderer.dispose();
      if (canvas.parentElement === container) container.removeChild(canvas);
    };
  }, [faces, fov]);

  useEffect(() => {
    autoRotateRef.current = autoRotateSpeed;
  }, [autoRotateSpeed]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '100%', height: '100%', minHeight: 280, background: '#000' }}
    />
  );
};

export default FaceSphereViewer;
