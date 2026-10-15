import React, { useCallback, useRef, useState, useEffect } from 'react';

interface Rotation {
  x: number; // pitch (-180 ~ 180)
  y: number; // yaw (-180 ~ 180)
  z: number; // roll (-180 ~ 180)
}

interface TrackballWidgetProps {
  value: Rotation;
  onChange: (rotation: Rotation) => void;
  size?: number;
  disabled?: boolean;
}

// 3x3 matrix operations
type Mat3 = number[];

function identityMat3(): Mat3 {
  return [1, 0, 0, 0, 1, 0, 0, 0, 1];
}

function multiplyMat3(a: Mat3, b: Mat3): Mat3 {
  const r = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 3; k++) {
        r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
      }
    }
  }
  return r;
}

function rotationAxisAngle(axis: [number, number, number], angle: number): Mat3 {
  const [x, y, z] = axis;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  return [
    t * x * x + c,     t * x * y - s * z, t * x * z + s * y,
    t * x * y + s * z, t * y * y + c,     t * y * z - s * x,
    t * x * z - s * y, t * y * z + s * x, t * z * z + c,
  ];
}

function mat3ToEuler(m: Mat3): Rotation {
  // Extract Euler angles (XYZ order) from rotation matrix
  const sy = Math.sqrt(m[0] * m[0] + m[1] * m[1]);
  const singular = sy < 1e-6;
  let x: number, y: number, z: number;
  if (!singular) {
    x = Math.atan2(m[7], m[8]); // pitch
    y = Math.atan2(-m[6], sy);  // yaw
    z = Math.atan2(m[3], m[0]); // roll
  } else {
    x = Math.atan2(-m[5], m[4]);
    y = Math.atan2(-m[6], sy);
    z = 0;
  }
  return {
    x: Math.round((x * 180) / Math.PI) % 360,
    y: Math.round((y * 180) / Math.PI) % 360,
    z: Math.round((z * 180) / Math.PI) % 360,
  };
}

function eulerToMat3(r: Rotation): Mat3 {
  const rx = rotationAxisAngle([1, 0, 0], (r.x * Math.PI) / 180);
  const ry = rotationAxisAngle([0, 1, 0], (r.y * Math.PI) / 180);
  const rz = rotationAxisAngle([0, 0, 1], (r.z * Math.PI) / 180);
  return multiplyMat3(rz, multiplyMat3(ry, rx));
}

// Project a 3D point through rotation matrix onto 2D circle
function project(point: [number, number, number], matrix: Mat3, r: number): [number, number] {
  const [x, y, z] = point;
  const rx = matrix[0] * x + matrix[1] * y + matrix[2] * z;
  const ry = matrix[3] * x + matrix[4] * y + matrix[5] * z;
  const rz = matrix[6] * x + matrix[7] * y + matrix[8] * z;
  // Orthographic projection with depth fading
  const scale = r;
  return [rx * scale, -ry * scale]; // flip y for SVG
}

const TrackballWidget: React.FC<TrackballWidgetProps> = ({
  value,
  onChange,
  size = 120,
  disabled = false,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [matrix, setMatrix] = useState<Mat3>(eulerToMat3(value));
  const isDragging = useRef(false);
  const lastPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const currentMatrix = useRef<Mat3>(matrix);

  // Sync external value changes
  useEffect(() => {
    if (!isDragging.current) {
      const newMat = eulerToMat3(value);
      setMatrix(newMat);
      currentMatrix.current = newMat;
    }
  }, [value.x, value.y, value.z]);

  const r = size / 2 - 8; // sphere radius in pixels
  const cx = size / 2;
  const cy = size / 2;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    isDragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
    currentMatrix.current = [...matrix];

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = ev.clientX - lastPos.current.x;
      const dy = ev.clientY - lastPos.current.y;

      // Sensitivity factor
      const sensitivity = 0.5;
      const angleX = dy * sensitivity * (Math.PI / 180);
      const angleY = dx * sensitivity * (Math.PI / 180);

      // Rotate around X axis (vertical drag) and Y axis (horizontal drag)
      const rotX = rotationAxisAngle([1, 0, 0], angleX);
      const rotY = rotationAxisAngle([0, 1, 0], angleY);
      const newMatrix = multiplyMat3(rotY, multiplyMat3(rotX, currentMatrix.current));
      currentMatrix.current = newMatrix;

      const euler = mat3ToEuler(newMatrix);
      setMatrix(newMatrix);
      onChange(euler);
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [matrix, onChange, disabled]);

  // Generate circle points for a latitude or longitude line
  const generateCirclePoints = (
    axis: 'x' | 'y' | 'z',
    angle: number,
    steps: number = 48
  ): string => {
    const points: [number, number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      let pt: [number, number, number];
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      switch (axis) {
        case 'x': // latitude (rotation around x-axis)
          pt = [Math.cos(t) * cosA, Math.sin(t), Math.cos(t) * sinA];
          break;
        case 'y': // longitude (rotation around y-axis)
          pt = [Math.sin(t) * Math.cos(angle), Math.cos(t), Math.sin(t) * Math.sin(angle)];
          break;
        case 'z': // equator
        default:
          pt = [Math.cos(t), Math.sin(t), 0];
          break;
      }
      points.push(pt);
    }

    return points
      .map((pt) => {
        const [px, py] = project(pt, matrix, r);
        return `${cx + px},${cy + py}`;
      })
      .join(' ');
  };

  // Generate axis arrow
  const generateAxisLine = (axis: [number, number, number], color: string) => {
    const start: [number, number, number] = [0, 0, 0];
    const end = axis.map((v) => v * 0.9) as [number, number, number];
    const [sx, sy] = project(start, matrix, r);
    const [ex, ey] = project(end, matrix, r);
    // Depth-based opacity
    const endDepth = matrix[6] * end[0] + matrix[7] * end[1] + matrix[8] * end[2];
    const opacity = 0.4 + 0.6 * (0.5 + endDepth * 0.5);

    return (
      <line
        key={color}
        x1={cx + sx}
        y1={cy + sy}
        x2={cx + ex}
        y2={cy + ey}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        opacity={opacity}
      />
    );
  };

  // Generate polyline for a circle with depth-based opacity segments
  const generateDepthCircle = (
    axis: 'x' | 'y' | 'z',
    angle: number,
    color: string,
    steps: number = 48
  ) => {
    const points3D: { pt: [number, number, number]; depth: number }[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      let pt: [number, number, number];
      switch (axis) {
        case 'x':
          pt = [Math.cos(t) * Math.cos(angle), Math.sin(t), Math.cos(t) * Math.sin(angle)];
          break;
        case 'y':
          pt = [Math.sin(t) * Math.cos(angle), Math.cos(t), Math.sin(t) * Math.sin(angle)];
          break;
        case 'z':
        default:
          pt = [Math.cos(t), Math.sin(t), 0];
          break;
      }
      const depth = matrix[6] * pt[0] + matrix[7] * pt[1] + matrix[8] * pt[2];
      points3D.push({ pt, depth });
    }

    // Split into front (depth >= 0) and back (depth < 0) segments
    const segments: { points: string; isFront: boolean }[] = [];
    let currentPoints: string[] = [];
    let currentIsFront = points3D[0].depth >= 0;

    for (const { pt, depth } of points3D) {
      const [px, py] = project(pt, matrix, r);
      const isFront = depth >= 0;

      if (isFront !== currentIsFront && currentPoints.length > 0) {
        segments.push({ points: currentPoints.join(' '), isFront: currentIsFront });
        currentPoints = [currentPoints[currentPoints.length - 1]]; // overlap for continuity
      }
      currentIsFront = isFront;
      currentPoints.push(`${cx + px},${cy + py}`);
    }
    if (currentPoints.length > 0) {
      segments.push({ points: currentPoints.join(' '), isFront: currentIsFront });
    }

    return segments.map((seg, i) => (
      <polyline
        key={`${axis}-${angle}-${i}`}
        points={seg.points}
        fill="none"
        stroke={color}
        strokeWidth={seg.isFront ? 1.5 : 0.8}
        opacity={seg.isFront ? 0.8 : 0.25}
        strokeLinejoin="round"
      />
    ));
  };

  return (
    <svg
      ref={svgRef}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'}
      onMouseDown={handleMouseDown}
      style={{ userSelect: 'none' }}
    >
      {/* Background circle */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="rgba(0,0,0,0.3)"
        stroke="rgba(255,255,255,0.2)"
        strokeWidth={1}
      />

      {/* Grid lines (back half drawn first) */}
      {/* Equator (z-axis circle) */}
      {generateDepthCircle('z', 0, 'rgba(255,255,255,0.4)')}
      {/* Latitude lines */}
      {generateDepthCircle('x', Math.PI / 4, 'rgba(255,255,255,0.2)')}
      {generateDepthCircle('x', -Math.PI / 4, 'rgba(255,255,255,0.2)')}
      {/* Longitude lines */}
      {generateDepthCircle('y', Math.PI / 4, 'rgba(255,255,255,0.2)')}
      {generateDepthCircle('y', -Math.PI / 4, 'rgba(255,255,255,0.2)')}
      {generateDepthCircle('y', 0, 'rgba(255,255,255,0.2)')}

      {/* Axes */}
      {generateAxisLine([1, 0, 0], '#ef4444')}  {/* X - Red */}
      {generateAxisLine([0, 1, 0], '#22c55e')}  {/* Y - Green */}
      {generateAxisLine([0, 0, 1], '#3b82f6')}  {/* Z - Blue */}

      {/* Axis labels */}
      {(() => {
        const labelOffset = 1.05;
        const axes: { dir: [number, number, number]; label: string; color: string }[] = [
          { dir: [labelOffset, 0, 0], label: 'X', color: '#ef4444' },
          { dir: [0, labelOffset, 0], label: 'Y', color: '#22c55e' },
          { dir: [0, 0, labelOffset], label: 'Z', color: '#3b82f6' },
        ];
        return axes.map(({ dir, label, color }) => {
          const [px, py] = project(dir, matrix, r);
          const depth = matrix[6] * dir[0] + matrix[7] * dir[1] + matrix[8] * dir[2];
          const opacity = 0.4 + 0.6 * (0.5 + depth * 0.5);
          return (
            <text
              key={label}
              x={cx + px}
              y={cy + py}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={10}
              fontWeight="bold"
              fill={color}
              opacity={opacity}
            >
              {label}
            </text>
          );
        });
      })()}
    </svg>
  );
};

export default TrackballWidget;
export type { Rotation, TrackballWidgetProps };
