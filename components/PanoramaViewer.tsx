/**
 * 全景图球体查看器
 * - 将 equirectangular 2:1 全景图贴在球体内壁（BackSide 材质）
 * - 支持鼠标/触摸拖动旋转相机（OrbitControls 手写简版，避免额外依赖）
 * - 禁平移、禁缩放，防止相机穿出球壳
 * - 对外暴露 ref：获取当前 yaw/pitch/fov，用于后端裁切分镜 A/B 面
 */
import React, { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import * as THREE from 'three';

export interface PanoramaViewerHandle {
  /** 获取当前 yaw/pitch/fov（度） */
  getView(): { yawDeg: number; pitchDeg: number; fovDeg: number };
  /** 设置自旋速度（0 = 停止） */
  setAutoRotate(speed: number): void;
}

interface PanoramaViewerProps {
  src: string;
  className?: string;
  /** 自动旋转速度，0 表示不旋转；默认 0.05 rad/s */
  autoRotateSpeed?: number;
  /** 初始水平/垂直角度（弧度） */
  initialYaw?: number;
  initialPitch?: number;
  /** 视场角 deg */
  fov?: number;
  onLoaded?: () => void;
  onError?: (err: Error) => void;
}

const PanoramaViewer = forwardRef<PanoramaViewerHandle, PanoramaViewerProps>(function PanoramaViewer({
  src,
  className,
  autoRotateSpeed = 0.05,
  initialYaw = 0,
  initialPitch = 0,
  fov = 75,
  onLoaded,
  onError,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);

  // 用 ref 保存实时视角状态，方便父级读取
  const viewStateRef = useRef({ yaw: initialYaw, pitch: initialPitch, fovDeg: fov });
  const autoRotateRef = useRef(autoRotateSpeed);

  useImperativeHandle(ref, () => ({
    getView() {
      const { yaw, pitch, fovDeg } = viewStateRef.current;
      return {
        yawDeg: (yaw * 180) / Math.PI,
        pitchDeg: (pitch * 180) / Math.PI,
        fovDeg,
      };
    },
    setAutoRotate(speed: number) {
      autoRotateRef.current = speed;
    },
  }), []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !src) return;

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

    // 球体 + 内壁贴图
    const geometry = new THREE.SphereGeometry(500, 64, 32);
    geometry.scale(-1, 1, 1);

    const texture = new THREE.TextureLoader().load(
      src,
      () => onLoaded?.(),
      undefined,
      (err) => onError?.(err as unknown as Error)
    );
    texture.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.MeshBasicMaterial({ map: texture });
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    // 相机朝向状态（同步到 viewStateRef）
    viewStateRef.current.yaw = initialYaw;
    viewStateRef.current.pitch = initialPitch;
    viewStateRef.current.fovDeg = fov;

    let isDragging = false;
    let lastX = 0;
    let lastY = 0;

    const updateCamera = () => {
      const { yaw, pitch } = viewStateRef.current;
      const clampedPitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
      // 与后端 panoramaCut 的坐标约定一致：
      //   yaw=0 朝前（-Z），yaw>0 向右；pitch>0 向上
      const target = new THREE.Vector3(
        Math.cos(clampedPitch) * Math.sin(yaw),
        Math.sin(clampedPitch),
        -Math.cos(clampedPitch) * Math.cos(yaw)
      );
      camera.lookAt(target);
    };
    updateCamera();

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      (e.target as Element)?.setPointerCapture?.(e.pointerId);
      // 用户开始拖动 -> 停止自旋
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
      geometry.dispose();
      material.dispose();
      texture.dispose();
      renderer.dispose();
      if (canvas.parentElement === container) container.removeChild(canvas);
    };
  }, [src, initialYaw, initialPitch, fov, onLoaded, onError]);

  // 属性变化时同步自旋速度
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
});

export default PanoramaViewer;
