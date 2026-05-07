/**
 * 程序化生成基础人体模型 GLB 文件
 * 使用 @gltf-transform 构建并导出
 *
 * 输出:
 *   public/models/human-male.glb
 *   public/models/human-female.glb
 *   public/models/human-child.glb
 */

const { Document, NodeIO } = require('@gltf-transform/core');
const { KHRONOS_EXTENSIONS } = require('@gltf-transform/extensions');
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'public', 'models');
fs.mkdirSync(outDir, { recursive: true });

const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);

// Color utilities
function hexToRgb(hex) {
  const r = ((hex >> 16) & 0xff) / 255;
  const g = ((hex >> 8) & 0xff) / 255;
  const b = (hex & 0xff) / 255;
  return [r, g, b];
}

// Generate sphere vertices
function createSphere(radius, segmentsW, segmentsH) {
  const positions = [];
  const normals = [];
  const indices = [];

  for (let j = 0; j <= segmentsH; j++) {
    const theta = (j / segmentsH) * Math.PI;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);
    for (let i = 0; i <= segmentsW; i++) {
      const phi = (i / segmentsW) * 2 * Math.PI;
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);
      const x = cosPhi * sinTheta;
      const y = cosTheta;
      const z = sinPhi * sinTheta;
      positions.push(x * radius, y * radius, z * radius);
      normals.push(x, y, z);
    }
  }

  for (let j = 0; j < segmentsH; j++) {
    for (let i = 0; i < segmentsW; i++) {
      const a = j * (segmentsW + 1) + i;
      const b = a + segmentsW + 1;
      indices.push(a, b, a + 1);
      indices.push(b, b + 1, a + 1);
    }
  }

  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint16Array(indices) };
}

// Generate cylinder vertices
function createCylinder(topR, bottomR, height, segments) {
  const positions = [];
  const normals = [];
  const indices = [];
  const halfH = height / 2;

  // Side vertices
  for (let j = 0; j <= 1; j++) {
    const r = j === 0 ? topR : bottomR;
    const y = j === 0 ? halfH : -halfH;
    for (let i = 0; i <= segments; i++) {
      const phi = (i / segments) * 2 * Math.PI;
      const cosP = Math.cos(phi);
      const sinP = Math.sin(phi);
      positions.push(cosP * r, y, sinP * r);
      // Approximate normal
      const ny = (bottomR - topR) / height;
      const len = Math.sqrt(cosP * cosP + sinP * sinP + ny * ny);
      normals.push(cosP / len, ny / len, sinP / len);
    }
  }

  // Side indices
  for (let i = 0; i < segments; i++) {
    const a = i;
    const b = a + segments + 1;
    indices.push(a, a + 1, b);
    indices.push(a + 1, b + 1, b);
  }

  // Top cap center
  const topCenterIdx = positions.length / 3;
  positions.push(0, halfH, 0);
  normals.push(0, 1, 0);
  for (let i = 0; i < segments; i++) {
    const phi = (i / segments) * 2 * Math.PI;
    positions.push(Math.cos(phi) * topR, halfH, Math.sin(phi) * topR);
    normals.push(0, 1, 0);
  }
  for (let i = 0; i < segments; i++) {
    indices.push(topCenterIdx, topCenterIdx + 1 + ((i + 1) % segments), topCenterIdx + 1 + i);
  }

  // Bottom cap center
  const botCenterIdx = positions.length / 3;
  positions.push(0, -halfH, 0);
  normals.push(0, -1, 0);
  for (let i = 0; i < segments; i++) {
    const phi = (i / segments) * 2 * Math.PI;
    positions.push(Math.cos(phi) * bottomR, -halfH, Math.sin(phi) * bottomR);
    normals.push(0, -1, 0);
  }
  for (let i = 0; i < segments; i++) {
    indices.push(botCenterIdx, botCenterIdx + 1 + i, botCenterIdx + 1 + ((i + 1) % segments));
  }

  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint16Array(indices) };
}

// Generate capsule vertices
function createCapsule(radius, length, segmentsR, segmentsC) {
  const positions = [];
  const normals = [];
  const indices = [];
  const halfLen = length / 2;

  for (let j = 0; j <= segmentsC; j++) {
    const v = j / segmentsC;
    let y, r;
    if (v < 0.25) {
      // Bottom hemisphere
      const theta = (v / 0.25) * Math.PI / 2;
      y = -halfLen - Math.cos(theta) * radius;
      r = Math.sin(theta) * radius;
    } else if (v > 0.75) {
      // Top hemisphere
      const theta = ((v - 0.75) / 0.25) * Math.PI / 2;
      y = halfLen + Math.sin(theta) * radius;
      r = Math.cos(theta) * radius;
    } else {
      // Cylinder
      y = -halfLen + (v - 0.25) / 0.5 * length;
      r = radius;
    }
    for (let i = 0; i <= segmentsR; i++) {
      const phi = (i / segmentsR) * 2 * Math.PI;
      const x = Math.cos(phi) * r;
      const z = Math.sin(phi) * r;
      positions.push(x, y, z);
      // Normal approximation
      const ny = (v < 0.25) ? -(y + halfLen) / radius : (v > 0.75) ? (y - halfLen) / radius : 0;
      const nr = (v < 0.25 || v > 0.75) ? r / radius : 1;
      const nx = Math.cos(phi) * nr;
      const nz = Math.sin(phi) * nr;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      normals.push(nx / len, ny / len, nz / len);
    }
  }

  for (let j = 0; j < segmentsC; j++) {
    for (let i = 0; i < segmentsR; i++) {
      const a = j * (segmentsR + 1) + i;
      const b = a + segmentsR + 1;
      indices.push(a, b, a + 1);
      indices.push(b, b + 1, a + 1);
    }
  }

  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint16Array(indices) };
}

// Generate box vertices
function createBox(w, h, d) {
  const hw = w / 2, hh = h / 2, hd = d / 2;
  const positions = new Float32Array([
    -hw, -hh, hd,  hw, -hh, hd,  hw, hh, hd,  -hw, hh, hd,  // front
    -hw, -hh, -hd,  -hw, hh, -hd,  hw, hh, -hd,  hw, -hh, -hd,  // back
    -hw, hh, -hd,  -hw, hh, hd,  hw, hh, hd,  hw, hh, -hd,  // top
    -hw, -hh, -hd,  hw, -hh, -hd,  hw, -hh, hd,  -hw, -hh, hd,  // bottom
    hw, -hh, -hd,  hw, hh, -hd,  hw, hh, hd,  hw, -hh, hd,  // right
    -hw, -hh, -hd,  -hw, -hh, hd,  -hw, hh, hd,  -hw, hh, -hd,  // left
  ]);
  const normals = new Float32Array([
    0,0,1, 0,0,1, 0,0,1, 0,0,1,
    0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1,
    0,1,0, 0,1,0, 0,1,0, 0,1,0,
    0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0,
    1,0,0, 1,0,0, 1,0,0, 1,0,0,
    -1,0,0, -1,0,0, -1,0,0, -1,0,0,
  ]);
  const indices = new Uint16Array([
    0,1,2, 0,2,3,
    4,5,6, 4,6,7,
    8,9,10, 8,10,11,
    12,13,14, 12,14,15,
    16,17,18, 16,18,19,
    20,21,22, 20,22,23,
  ]);
  return { positions, normals, indices };
}

// Generate torus vertices (for mouth)
function createTorus(radius, tube, radialSegments, tubularSegments, arc) {
  const positions = [];
  const normals = [];
  const indices = [];

  for (let j = 0; j <= radialSegments; j++) {
    for (let i = 0; i <= tubularSegments; i++) {
      const u = (i / tubularSegments) * arc;
      const v = (j / radialSegments) * Math.PI * 2;
      const cosU = Math.cos(u);
      const sinU = Math.sin(u);
      const cosV = Math.cos(v);
      const sinV = Math.sin(v);
      const x = (radius + tube * cosV) * cosU;
      const y = (radius + tube * cosV) * sinU;
      const z = tube * sinV;
      positions.push(x, y, z);
      const nx = cosV * cosU;
      const ny = cosV * sinU;
      const nz = sinV;
      normals.push(nx, ny, nz);
    }
  }

  for (let j = 0; j < radialSegments; j++) {
    for (let i = 0; i < tubularSegments; i++) {
      const a = j * (tubularSegments + 1) + i;
      const b = a + tubularSegments + 1;
      indices.push(a, b, a + 1);
      indices.push(b, b + 1, a + 1);
    }
  }

  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint16Array(indices) };
}

// Build a mesh primitive and return mesh node
function buildMesh(doc, name, geoData, color, parent, transform = {}) {
  const { positions, normals, indices } = geoData;

  // Use the first buffer in the document (created in createHumanDocument)
  const buffer = doc.getRoot().listBuffers()[0];
  const accPos = doc.createAccessor()
    .setType('VEC3')
    .setBuffer(buffer)
    .setArray(positions);
  const accNorm = doc.createAccessor()
    .setType('VEC3')
    .setBuffer(buffer)
    .setArray(normals);
  const accIdx = doc.createAccessor()
    .setType('SCALAR')
    .setBuffer(buffer)
    .setArray(indices);

  const prim = doc.createPrimitive()
    .setAttribute('POSITION', accPos)
    .setAttribute('NORMAL', accNorm)
    .setIndices(accIdx);

  const mat = doc.createMaterial(name + '_mat')
    .setBaseColorFactor([...color, 1])
    .setRoughnessFactor(0.6)
    .setMetallicFactor(0.05);
  prim.setMaterial(mat);

  const mesh = doc.createMesh(name).addPrimitive(prim);
  const node = doc.createNode(name).setMesh(mesh);

  if (transform.translation) node.setTranslation(transform.translation);
  if (transform.rotation) node.setRotation(transform.rotation);
  if (transform.scale) node.setScale(transform.scale);

  parent.addChild(node);
  return node;
}

function createHumanDocument(type = 'male') {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('Scene');
  const root = doc.createNode(`human_${type}`);
  scene.addChild(root);

  const isFemale = type === 'female';
  const isChild = type === 'child';
  const hScale = isChild ? 0.75 : 1.0;
  const wScale = isFemale ? 0.88 : (isChild ? 0.82 : 1.0);
  const h = 1.75 * hScale;

  const skinColor = hexToRgb(0xffdbac);
  const skinDarkColor = hexToRgb(0xeac096);
  const shirtColor = isFemale ? hexToRgb(0xe85d75) : (isChild ? hexToRgb(0x5dade2) : hexToRgb(0x3b82f6));
  const pantsColor = hexToRgb(0x2d3748);
  const shoesColor = hexToRgb(0x1a202c);
  const hairColor = isFemale ? hexToRgb(0x1a1a2e) : hexToRgb(0x2d1810);
  const eyeWhiteColor = hexToRgb(0xffffff);
  const eyePupilColor = hexToRgb(0x1a1a1a);
  const mouthColor = hexToRgb(0xc97b7b);

  // ========== HEAD ==========
  const headGroup = doc.createNode('head');
  headGroup.setTranslation([0, h - 0.13, 0]);
  root.addChild(headGroup);

  // Skull
  buildMesh(doc, 'skull', createSphere(0.11 * wScale, 20, 20), skinColor, headGroup);

  // Face (slightly flattened)
  buildMesh(doc, 'face', createSphere(0.10 * wScale, 20, 20), skinColor, headGroup, {
    translation: [0, 0, 0.01],
    scale: [1, 1, 0.85]
  });

  // Eyes
  buildMesh(doc, 'leftEye', createSphere(0.028 * wScale, 12, 12), eyeWhiteColor, headGroup, {
    translation: [-0.038 * wScale, 0.015, 0.085],
    scale: [1, 1, 0.5]
  });
  buildMesh(doc, 'rightEye', createSphere(0.028 * wScale, 12, 12), eyeWhiteColor, headGroup, {
    translation: [0.038 * wScale, 0.015, 0.085],
    scale: [1, 1, 0.5]
  });

  // Pupils
  buildMesh(doc, 'leftPupil', createSphere(0.015 * wScale, 10, 10), eyePupilColor, headGroup, {
    translation: [-0.038 * wScale, 0.015, 0.098]
  });
  buildMesh(doc, 'rightPupil', createSphere(0.015 * wScale, 10, 10), eyePupilColor, headGroup, {
    translation: [0.038 * wScale, 0.015, 0.098]
  });

  // Eyebrows
  buildMesh(doc, 'leftBrow', createCapsule(0.008 * wScale, 0.04 * wScale, 6, 6), hairColor, headGroup, {
    translation: [-0.038 * wScale, 0.045, 0.088],
    rotation: [0.1, 0, 0.1]
  });
  buildMesh(doc, 'rightBrow', createCapsule(0.008 * wScale, 0.04 * wScale, 6, 6), hairColor, headGroup, {
    translation: [0.038 * wScale, 0.045, 0.088],
    rotation: [0.1, 0, -0.1]
  });

  // Nose
  buildMesh(doc, 'nose', createCylinder(0, 0.018 * wScale, 0.04, 8), skinDarkColor, headGroup, {
    translation: [0, -0.008, 0.105],
    rotation: [-Math.PI / 2 + 0.3, 0, 0]
  });

  // Mouth
  buildMesh(doc, 'mouth', createTorus(0.02 * wScale, 0.006, 8, 16, Math.PI), mouthColor, headGroup, {
    translation: [0, -0.045, 0.092],
    rotation: [Math.PI, 0, 0]
  });

  // Ears
  buildMesh(doc, 'leftEar', createSphere(0.025 * wScale, 10, 10), skinColor, headGroup, {
    translation: [-0.105 * wScale, 0, 0],
    scale: [0.5, 1, 0.7]
  });
  buildMesh(doc, 'rightEar', createSphere(0.025 * wScale, 10, 10), skinColor, headGroup, {
    translation: [0.105 * wScale, 0, 0],
    scale: [0.5, 1, 0.7]
  });

  // Hair
  if (isFemale) {
    // Top hair
    buildMesh(doc, 'hairTop', createSphere(0.115 * wScale, 20, 20), hairColor, headGroup, {
      translation: [0, 0.01, 0],
      scale: [1, 0.55, 1]
    });
    // Back hair
    buildMesh(doc, 'hairBack', createCapsule(0.08 * wScale, 0.18 * hScale, 8, 12), hairColor, headGroup, {
      translation: [0, -0.08, -0.06],
      rotation: [0.2, 0, 0]
    });
  } else {
    buildMesh(doc, 'hairTop', createSphere(0.115 * wScale, 20, 20), hairColor, headGroup, {
      translation: [0, 0.01, 0],
      scale: [1, 0.5, 1]
    });
    buildMesh(doc, 'leftSideHair', createSphere(0.04 * wScale, 10, 10), hairColor, headGroup, {
      translation: [-0.09 * wScale, 0.02, -0.02]
    });
    buildMesh(doc, 'rightSideHair', createSphere(0.04 * wScale, 10, 10), hairColor, headGroup, {
      translation: [0.09 * wScale, 0.02, -0.02]
    });
  }

  // ========== NECK ==========
  buildMesh(doc, 'neck', createCylinder(0.05 * wScale, 0.055 * wScale, 0.08 * hScale, 12), skinColor, root, {
    translation: [0, h - 0.13 - 0.11 - 0.04, 0]
  });

  // ========== TORSO ==========
  // Upper chest
  buildMesh(doc, 'chest', createCylinder(0.21 * wScale, 0.18 * wScale, h * 0.12, 16), shirtColor, root, {
    translation: [0, h - 0.13 - 0.11 - 0.08 - h * 0.06, 0]
  });
  // Mid torso
  buildMesh(doc, 'midTorso', createCylinder(0.18 * wScale, isFemale ? 0.16 * wScale : 0.17 * wScale, h * 0.12, 16), shirtColor, root, {
    translation: [0, h - 0.13 - 0.11 - 0.08 - h * 0.18, 0]
  });
  // Hips
  buildMesh(doc, 'hips', createCylinder(isFemale ? 0.18 * wScale : 0.16 * wScale, isFemale ? 0.17 * wScale : 0.15 * wScale, h * 0.1, 16), pantsColor, root, {
    translation: [0, h - 0.13 - 0.11 - 0.08 - h * 0.29, 0]
  });

  // ========== ARMS ==========
  const armR = isFemale ? 0.032 : 0.038;

  // Left arm
  const leftArm = doc.createNode('leftArm');
  leftArm.setTranslation([-0.24 * wScale, h - 0.13 - 0.11 - 0.08 - h * 0.04, 0]);
  root.addChild(leftArm);

  buildMesh(doc, 'leftShoulder', createSphere(armR * 1.3 * wScale, 10, 10), shirtColor, leftArm);
  buildMesh(doc, 'leftUpperArm', createCapsule(armR * wScale, h * 0.13, 8, 10), skinColor, leftArm, {
    translation: [0, -h * 0.08, 0],
    rotation: [0, 0, 0.08]
  });
  buildMesh(doc, 'leftElbow', createSphere(armR * 1.1 * wScale, 10, 10), skinColor, leftArm, {
    translation: [-0.01, -h * 0.16, 0]
  });
  buildMesh(doc, 'leftLowerArm', createCapsule(armR * 0.85 * wScale, h * 0.11, 8, 10), skinColor, leftArm, {
    translation: [-0.02, -h * 0.23, 0],
    rotation: [0, 0, 0.05]
  });
  buildMesh(doc, 'leftHand', createBox(0.035 * wScale, 0.045 * wScale, 0.015 * wScale), skinColor, leftArm, {
    translation: [-0.025, -h * 0.3, 0]
  });

  // Right arm
  const rightArm = doc.createNode('rightArm');
  rightArm.setTranslation([0.24 * wScale, h - 0.13 - 0.11 - 0.08 - h * 0.04, 0]);
  root.addChild(rightArm);

  buildMesh(doc, 'rightShoulder', createSphere(armR * 1.3 * wScale, 10, 10), shirtColor, rightArm);
  buildMesh(doc, 'rightUpperArm', createCapsule(armR * wScale, h * 0.13, 8, 10), skinColor, rightArm, {
    translation: [0, -h * 0.08, 0],
    rotation: [0, 0, -0.08]
  });
  buildMesh(doc, 'rightElbow', createSphere(armR * 1.1 * wScale, 10, 10), skinColor, rightArm, {
    translation: [0.01, -h * 0.16, 0]
  });
  buildMesh(doc, 'rightLowerArm', createCapsule(armR * 0.85 * wScale, h * 0.11, 8, 10), skinColor, rightArm, {
    translation: [0.02, -h * 0.23, 0],
    rotation: [0, 0, -0.05]
  });
  buildMesh(doc, 'rightHand', createBox(0.035 * wScale, 0.045 * wScale, 0.015 * wScale), skinColor, rightArm, {
    translation: [0.025, -h * 0.3, 0]
  });

  // ========== LEGS ==========
  const legR = isFemale ? 0.055 : 0.065;

  // Left leg
  const leftLeg = doc.createNode('leftLeg');
  leftLeg.setTranslation([-0.09 * wScale, h * 0.35, 0]);
  root.addChild(leftLeg);

  buildMesh(doc, 'leftUpperLeg', createCapsule(legR * wScale, h * 0.16, 8, 10), pantsColor, leftLeg, {
    translation: [0, -h * 0.1, 0]
  });
  buildMesh(doc, 'leftKnee', createSphere(legR * 1.15 * wScale, 10, 10), pantsColor, leftLeg, {
    translation: [0, -h * 0.2, 0]
  });
  buildMesh(doc, 'leftLowerLeg', createCapsule(legR * 0.8 * wScale, h * 0.16, 8, 10), skinColor, leftLeg, {
    translation: [0, -h * 0.3, 0]
  });
  buildMesh(doc, 'leftAnkle', createCylinder(0.03 * wScale, 0.035 * wScale, 0.04, 10), skinColor, leftLeg, {
    translation: [0, -h * 0.39, 0]
  });
  buildMesh(doc, 'leftFoot', createBox(0.07 * wScale, 0.04, 0.16 * wScale), shoesColor, leftLeg, {
    translation: [0, -h * 0.42, 0.03]
  });

  // Right leg
  const rightLeg = doc.createNode('rightLeg');
  rightLeg.setTranslation([0.09 * wScale, h * 0.35, 0]);
  root.addChild(rightLeg);

  buildMesh(doc, 'rightUpperLeg', createCapsule(legR * wScale, h * 0.16, 8, 10), pantsColor, rightLeg, {
    translation: [0, -h * 0.1, 0]
  });
  buildMesh(doc, 'rightKnee', createSphere(legR * 1.15 * wScale, 10, 10), pantsColor, rightLeg, {
    translation: [0, -h * 0.2, 0]
  });
  buildMesh(doc, 'rightLowerLeg', createCapsule(legR * 0.8 * wScale, h * 0.16, 8, 10), skinColor, rightLeg, {
    translation: [0, -h * 0.3, 0]
  });
  buildMesh(doc, 'rightAnkle', createCylinder(0.03 * wScale, 0.035 * wScale, 0.04, 10), skinColor, rightLeg, {
    translation: [0, -h * 0.39, 0]
  });
  buildMesh(doc, 'rightFoot', createBox(0.07 * wScale, 0.04, 0.16 * wScale), shoesColor, rightLeg, {
    translation: [0, -h * 0.42, 0.03]
  });

  return doc;
}

async function main() {
  console.log('Generating human models...\n');

  const maleDoc = createHumanDocument('male');
  await io.write(path.join(outDir, 'human-male.glb'), maleDoc);
  console.log('✓ Generated: public/models/human-male.glb');

  const femaleDoc = createHumanDocument('female');
  await io.write(path.join(outDir, 'human-female.glb'), femaleDoc);
  console.log('✓ Generated: public/models/human-female.glb');

  const childDoc = createHumanDocument('child');
  await io.write(path.join(outDir, 'human-child.glb'), childDoc);
  console.log('✓ Generated: public/models/human-child.glb');

  // Print file sizes
  ['human-male.glb', 'human-female.glb', 'human-child.glb'].forEach(f => {
    const stat = fs.statSync(path.join(outDir, f));
    console.log(`  ${f}: ${(stat.size / 1024).toFixed(1)}KB`);
  });

  console.log('\n✓ All models generated successfully!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
