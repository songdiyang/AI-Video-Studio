import React, { useCallback, useRef, useState, useEffect } from 'react';

export interface LightingDirection {
  azimuth: number;   // 水平角度 (-180 ~ 180), 0 = 从正面来
  elevation: number; // 垂直角度 (-90 ~ 90), 0 = 水平, 90 = 正上方
}

interface LightingWidgetProps {
  value: LightingDirection;
  onChange: (direction: LightingDirection) => void;
  size?: number;
  disabled?: boolean;
}

/**
 * 3D 打光器组件
 * - 显示一个球体，上面有一个光源指示点
 * - 用户可以通过拖拽旋转来改变光源方向
 * - 球体表面有明暗渐变来模拟光照效果
 */
const LightingWidget: React.FC<LightingWidgetProps> = ({
  value,
  onChange,
  size = 110,
  disabled = false,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const isDragging = useRef(false);
  const lastPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const currentValue = useRef<LightingDirection>(value);

  const r = size / 2 - 8;
  const cx = size / 2;
  const cy = size / 2;

  // Sync external value changes
  useEffect(() => {
    if (!isDragging.current) {
      currentValue.current = value;
    }
  }, [value.azimuth, value.elevation]);

  // Convert spherical to 3D cartesian (on unit sphere)
  const sphericalToCartesian = (az: number, el: number): [number, number, number] => {
    const azRad = (az * Math.PI) / 180;
    const elRad = (el * Math.PI) / 180;
    // azimuth: 0 = front (toward viewer, +z), 90 = right (+x), -90 = left (-x), 180 = back (-z)
    // elevation: 0 = horizontal, 90 = top (+y), -90 = bottom (-y)
    const x = Math.cos(elRad) * Math.sin(azRad);
    const y = Math.sin(elRad);
    const z = Math.cos(elRad) * Math.cos(azRad);
    return [x, y, z];
  };

  // Project 3D point to 2D (simple perspective projection)
  const project = (point: [number, number, number]): [number, number, number] => {
    const [x, y, z] = point;
    // Simple orthographic projection with slight perspective
    const scale = r;
    const depth = z; // z > 0 is front
    return [x * scale, -y * scale, depth];
  };

  // Calculate light position on the sphere surface
  const lightPos = sphericalToCartesian(currentValue.current.azimuth, currentValue.current.elevation);
  const [lightPx, lightPy, lightDepth] = project(lightPos);

  // Generate sphere shading gradient based on light direction
  const generateSphereGradient = () => {
    // The light direction determines the gradient center
    const gradCx = cx + lightPx * 0.5;
    const gradCy = cy + lightPy * 0.5;
    const gradId = `lighting-grad-${size}`;

    return (
      <defs>
        <radialGradient
          id={gradId}
          cx={gradCx}
          cy={gradCy}
          r={r * 1.2}
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="rgba(255, 230, 150, 0.5)" />
          <stop offset="30%" stopColor="rgba(255, 200, 100, 0.25)" />
          <stop offset="60%" stopColor="rgba(100, 100, 120, 0.15)" />
          <stop offset="100%" stopColor="rgba(30, 30, 40, 0.4)" />
        </radialGradient>
        <filter id={`light-glow-${size}`}>
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    );
  };

  // Generate latitude/longitude grid lines
  const generateGridLines = () => {
    const lines: React.ReactElement[] = [];
    const gridSteps = 4;

    // Latitude lines (horizontal circles)
    for (let i = 1; i < gridSteps; i++) {
      const el = (i / gridSteps) * 90;
      const cosEl = Math.cos((el * Math.PI) / 180);
      const sinEl = Math.sin((el * Math.PI) / 180);
      const ringR = r * cosEl;
      const ringY = -sinEl * r;

      // Only draw if visible (front hemisphere approximation)
      const d = `M ${cx - ringR} ${cy + ringY} A ${ringR} ${ringR} 0 0 1 ${cx + ringR} ${cy + ringY} A ${ringR} ${ringR} 0 0 1 ${cx - ringR} ${cy + ringY}`;
      lines.push(
        <path
          key={`lat-${i}`}
          d={d}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={0.5}
        />
      );

      // Bottom hemisphere
      const d2 = `M ${cx - ringR} ${cy - ringY} A ${ringR} ${ringR} 0 0 0 ${cx + ringR} ${cy - ringY} A ${ringR} ${ringR} 0 0 0 ${cx - ringR} ${cy - ringY}`;
      lines.push(
        <path
          key={`lat-neg-${i}`}
          d={d2}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={0.5}
        />
      );
    }

    // Longitude lines (vertical arcs)
    for (let i = 0; i < 8; i++) {
      const az = (i / 8) * Math.PI;
      const x1 = cx + Math.sin(az) * r;
      const y1 = cy - r;
      const x2 = cx + Math.sin(az) * r;
      const y2 = cy + r;

      lines.push(
        <line
          key={`lon-${i}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={0.5}
        />
      );
    }

    return lines;
  };

  // Handle mouse drag to rotate light
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    isDragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
    currentValue.current = { ...value };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = ev.clientX - lastPos.current.x;
      const dy = ev.clientY - lastPos.current.y;
      lastPos.current = { x: ev.clientX, y: ev.clientY };

      const sensitivity = 1.5;
      const newAzimuth = currentValue.current.azimuth + dx * sensitivity;
      const newElevation = Math.max(-89, Math.min(89, currentValue.current.elevation - dy * sensitivity));

      // Normalize azimuth to [-180, 180]
      const normalizedAzimuth = ((newAzimuth + 180) % 360 + 360) % 360 - 180;

      const newValue = { azimuth: normalizedAzimuth, elevation: newElevation };
      currentValue.current = newValue;
      onChange(newValue);
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [onChange, disabled, value]);

  // Light indicator style based on depth
  const isLightFront = lightDepth > 0;
  const lightOpacity = isLightFront ? 1 : 0.5;
  const lightScale = isLightFront ? 1 : 0.7;

  // Arrow indicator showing light direction
  const arrowLength = 12;
  const arrowEndX = cx + lightPx + (lightPos[0] * arrowLength);
  const arrowEndY = cy + lightPy - (lightPos[1] * arrowLength);

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[9px] text-white/40 uppercase tracking-wider">打光</span>
      <svg
        ref={svgRef}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className={disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'}
        onMouseDown={handleMouseDown}
        style={{ userSelect: 'none' }}
      >
        {generateSphereGradient()}

        {/* Background circle */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill={`url(#lighting-grad-${size})`}
          stroke="rgba(255,255,255,0.15)"
          strokeWidth={1}
        />

        {/* Grid lines */}
        {generateGridLines()}

        {/* Light direction arrow (from center outward) */}
        <line
          x1={cx}
          y1={cy}
          x2={arrowEndX}
          y2={arrowEndY}
          stroke="rgba(255, 220, 100, 0.4)"
          strokeWidth={1.5}
          strokeDasharray="3,2"
          opacity={lightOpacity}
        />

        {/* Light source indicator */}
        <circle
          cx={cx + lightPx}
          cy={cy + lightPy}
          r={5 * lightScale}
          fill="#ffd700"
          opacity={lightOpacity}
          filter={`url(#light-glow-${size})`}
        />
        <circle
          cx={cx + lightPx}
          cy={cy + lightPy}
          r={3 * lightScale}
          fill="#fff"
          opacity={lightOpacity}
        />

        {/* Center dot (object being lit) */}
        <circle
          cx={cx}
          cy={cy}
          r={2}
          fill="rgba(255,255,255,0.5)"
        />
      </svg>
      <div className="flex items-center gap-1 text-[9px] text-white/30">
        <span>{Math.round(currentValue.current.azimuth)}°</span>
        <span>/</span>
        <span>{Math.round(currentValue.current.elevation)}°</span>
      </div>
    </div>
  );
};

export default LightingWidget;
