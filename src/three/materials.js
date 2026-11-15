import * as THREE from 'three';

function createHerringboneTexture(maxAnisotropy) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#4b3423';
  ctx.fillRect(0, 0, 512, 512);

  const plankW = 64;
  const plankH = 32;
  const tones = ['#5a3e2a', '#4f3624', '#634630', '#48301f', '#573b27'];

  for (let row = 0; row < 512 / plankH; row++) {
    for (let col = 0; col < 512 / plankW; col++) {
      const x = col * plankW + (row % 2 === 0 ? 0 : plankW / 2) - plankW / 2;
      const y = row * plankH;
      const tone = tones[(row * 7 + col * 3) % tones.length];
      ctx.fillStyle = tone;
      ctx.fillRect(x + 1, y + 1, plankW - 2, plankH - 2);

      ctx.strokeStyle = 'rgba(28, 16, 8, 0.22)';
      ctx.lineWidth = 1;
      for (let g = 0; g < 4; g++) {
        const gy = y + 4 + g * 7;
        ctx.beginPath();
        ctx.moveTo(x + 2, gy);
        ctx.bezierCurveTo(
          x + plankW * 0.33,
          gy + ((row + g) % 2 === 0 ? 1.5 : -1.5),
          x + plankW * 0.66,
          gy + ((col + g) % 2 === 0 ? -1 : 1),
          x + plankW - 2,
          gy,
        );
        ctx.stroke();
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(7, 5);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createCarraraMarbleTexture(maxAnisotropy) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#f2efe9';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 16; i++) {
    const gx = (i * 97) % 512;
    const gy = (i * 151) % 512;
    const grad = ctx.createRadialGradient(gx, gy, 10, gx, gy, 140);
    grad.addColorStop(0, 'rgba(205, 198, 188, 0.22)');
    grad.addColorStop(1, 'rgba(242, 239, 233, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);
  }

  ctx.lineCap = 'round';
  for (let v = 0; v < 9; v++) {
    ctx.strokeStyle =
      v % 2 === 0 ? 'rgba(130, 123, 115, 0.24)' : 'rgba(165, 158, 148, 0.18)';
    ctx.lineWidth = v % 3 === 0 ? 2.2 : 1.1;
    ctx.beginPath();
    let x = (v * 67) % 512;
    let y = 0;
    ctx.moveTo(x, y);
    for (let step = 1; step <= 8; step++) {
      y = step * 64;
      x += Math.sin(step * 1.4 + v) * 36;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createPlasterTexture(maxAnisotropy) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#dfd8cc';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 180; i++) {
    const x = (i * 73) % 256;
    const y = (i * 137) % 256;
    const r = 12 + (i % 24);
    ctx.fillStyle =
      i % 2 === 0 ? 'rgba(195, 187, 174, 0.14)' : 'rgba(246, 242, 236, 0.16)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 2);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createContactShadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createRadialGradient(128, 128, 18, 128, 128, 126);
  grad.addColorStop(0, 'rgba(10, 8, 6, 0.65)');
  grad.addColorStop(0.55, 'rgba(10, 8, 6, 0.28)');
  grad.addColorStop(1, 'rgba(10, 8, 6, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createWindowTwilightTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  const sky = ctx.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, '#132038');
  sky.addColorStop(0.58, '#253c5e');
  sky.addColorStop(0.84, '#6d524c');
  sky.addColorStop(1, '#c4834b');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 256, 512);

  for (let i = 0; i < 18; i++) {
    const x = 16 + ((i * 41) % 224);
    const y = 395 + ((i * 19) % 95);
    const rad = 3 + (i % 4);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad * 2.5);
    g.addColorStop(0, 'rgba(255, 224, 170, 0.85)');
    g.addColorStop(1, 'rgba(255, 190, 110, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad * 3, y - rad * 3, rad * 6, rad * 6);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createWindowDaylightTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  const sky = ctx.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, '#7eb2dd');
  sky.addColorStop(0.55, '#b6d6ee');
  sky.addColorStop(0.85, '#e8eef2');
  sky.addColorStop(1, '#f4ede2');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 256, 512);

  for (let i = 0; i < 6; i++) {
    const cx = 40 + ((i * 53) % 180);
    const cy = 90 + ((i * 47) % 160);
    const g = ctx.createRadialGradient(cx, cy, 8, cx, cy, 68);
    g.addColorStop(0, 'rgba(255, 255, 255, 0.72)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 72, cy - 72, 144, 144);
  }

  ctx.fillStyle = 'rgba(130, 152, 134, 0.35)';
  ctx.fillRect(0, 415, 256, 97);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createTableLabelTexture(label, isOccupied) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = isOccupied ? '#291d1b' : '#1b1917';
  ctx.fillRect(0, 0, 256, 128);

  ctx.strokeStyle = isOccupied ? '#b91c1c' : '#c99a49';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 240, 112);

  ctx.fillStyle = isOccupied ? '#fca5a5' : '#f5e7cb';
  ctx.font = '600 54px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 128, 52);

  ctx.fillStyle = isOccupied ? '#f87171' : '#d6b47a';
  ctx.font = '500 22px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(isOccupied ? 'RESERVED' : 'OPEN', 128, 96);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createDiningMaterialLibrary(renderer, isSoftwareGl) {
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const floorTex = createHerringboneTexture(maxAniso);
  const marbleTex = createCarraraMarbleTexture(maxAniso);
  const plasterTex = createPlasterTexture(maxAniso);
  const contactShadowTexture = createContactShadowTexture();
  const windowTwilightTexture = createWindowTwilightTexture();
  const windowDaylightTexture = createWindowDaylightTexture();

  const woodFloor = new THREE.MeshStandardMaterial({
    map: floorTex,
    roughness: 0.56,
    metalness: 0.04,
  });

  const walnutWood = new THREE.MeshStandardMaterial({
    color: 0x4b3121,
    roughness: 0.44,
    metalness: 0.05,
  });

  const oakWood = new THREE.MeshStandardMaterial({
    color: 0x7a573a,
    roughness: 0.52,
    metalness: 0.04,
  });

  const marbleTop = new THREE.MeshStandardMaterial({
    map: marbleTex,
    roughness: 0.24,
    metalness: 0.02,
  });

  const plasterWall = new THREE.MeshStandardMaterial({
    map: plasterTex,
    roughness: 0.88,
    metalness: 0.0,
  });

  const wainscotWood = new THREE.MeshStandardMaterial({
    color: 0x2c241d,
    roughness: 0.6,
    metalness: 0.04,
  });

  const brushedBrass = new THREE.MeshPhysicalMaterial({
    color: 0xc99c4d,
    metalness: 0.92,
    roughness: 0.2,
    anisotropy: isSoftwareGl ? 0 : 0.75,
    clearcoat: 0.2,
  });

  const castIron = new THREE.MeshStandardMaterial({
    color: 0x22201e,
    metalness: 0.75,
    roughness: 0.48,
  });

  const linenFabric = new THREE.MeshStandardMaterial({
    color: 0xebe6dc,
    roughness: 0.92,
    metalness: 0.0,
  });

  const chairVelvet = new THREE.MeshStandardMaterial({
    color: 0x2f5249,
    roughness: 0.84,
    metalness: 0.02,
  });

  const chairVelvetOccupied = new THREE.MeshStandardMaterial({
    color: 0x6b3230,
    roughness: 0.84,
    metalness: 0.02,
  });

  const porcelain = new THREE.MeshPhysicalMaterial({
    color: 0xf7f4ee,
    roughness: 0.14,
    metalness: 0.0,
    clearcoat: 0.9,
    clearcoatRoughness: 0.08,
  });

  const crystalGlass = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.0,
    roughness: 0.06,
    transmission: isSoftwareGl ? 0 : 0.9,
    transparent: true,
    opacity: isSoftwareGl ? 0.38 : 1,
    ior: 1.52,
    thickness: 0.12,
    clearcoat: 1.0,
  });

  const allMaterials = [
    woodFloor,
    walnutWood,
    oakWood,
    marbleTop,
    plasterWall,
    wainscotWood,
    brushedBrass,
    castIron,
    linenFabric,
    chairVelvet,
    chairVelvetOccupied,
    porcelain,
    crystalGlass,
  ];
  const allTextures = [
    floorTex,
    marbleTex,
    plasterTex,
    contactShadowTexture,
    windowTwilightTexture,
    windowDaylightTexture,
  ];

  return {
    woodFloor,
    walnutWood,
    oakWood,
    marbleTop,
    plasterWall,
    wainscotWood,
    brushedBrass,
    castIron,
    linenFabric,
    chairVelvet,
    chairVelvetOccupied,
    porcelain,
    crystalGlass,
    contactShadowTexture,
    windowTwilightTexture,
    windowDaylightTexture,
    dispose: () => {
      allMaterials.forEach((m) => m.dispose());
      allTextures.forEach((t) => t.dispose());
    },
  };
}
