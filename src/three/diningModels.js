import * as THREE from 'three';
import { createTableLabelTexture } from './materials.js';

function createChairMesh(mats, isOccupied) {
  const chair = new THREE.Group();

  const legGeo = new THREE.CylinderGeometry(0.02, 0.015, 0.44, 10);
  const legOffsets = [
    [-0.17, -0.17],
    [0.17, -0.17],
    [-0.17, 0.17],
    [0.17, 0.17],
  ];
  for (const [lx, lz] of legOffsets) {
    const leg = new THREE.Mesh(legGeo, mats.walnutWood);
    leg.position.set(lx, 0.22, lz);
    leg.castShadow = true;
    chair.add(leg);
  }

  const ferruleGeo = new THREE.CylinderGeometry(0.017, 0.015, 0.05, 10);
  for (const [lx, lz] of legOffsets) {
    const ferrule = new THREE.Mesh(ferruleGeo, mats.brushedBrass);
    ferrule.position.set(lx, 0.025, lz);
    chair.add(ferrule);
  }

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.035, 0.4),
    mats.walnutWood,
  );
  frame.position.y = 0.44;
  frame.castShadow = true;
  chair.add(frame);

  const cushion = new THREE.Mesh(
    new THREE.BoxGeometry(0.37, 0.045, 0.37),
    isOccupied ? mats.chairVelvetOccupied : mats.chairVelvet,
  );
  cushion.position.y = 0.475;
  cushion.castShadow = true;
  chair.add(cushion);

  const postGeo = new THREE.CylinderGeometry(0.016, 0.018, 0.4, 10);
  for (const px of [-0.16, 0.16]) {
    const post = new THREE.Mesh(postGeo, mats.walnutWood);
    post.position.set(px, 0.64, -0.175);
    post.rotation.x = -0.08;
    post.castShadow = true;
    chair.add(post);
  }

  const topRail = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.09, 0.036),
    mats.walnutWood,
  );
  topRail.position.set(0, 0.82, -0.195);
  topRail.rotation.x = -0.08;
  topRail.castShadow = true;
  chair.add(topRail);

  return chair;
}

function createPlaceSetting(mats) {
  const setting = new THREE.Group();

  const napkin = new THREE.Mesh(
    new THREE.BoxGeometry(0.19, 0.008, 0.25),
    mats.linenFabric,
  );
  napkin.position.set(0, 0.004, 0);
  setting.add(napkin);

  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.125, 0.095, 0.016, 24),
    mats.porcelain,
  );
  plate.position.set(0, 0.014, 0.01);
  plate.castShadow = true;
  setting.add(plate);

  const glassPoints = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.028, 0.0),
    new THREE.Vector2(0.006, 0.01),
    new THREE.Vector2(0.005, 0.075),
    new THREE.Vector2(0.032, 0.105),
    new THREE.Vector2(0.035, 0.155),
    new THREE.Vector2(0.029, 0.175),
  ];
  const glassGeo = new THREE.LatheGeometry(glassPoints, 18);
  const wineGlass = new THREE.Mesh(glassGeo, mats.crystalGlass);
  wineGlass.position.set(0.145, 0.002, -0.08);
  setting.add(wineGlass);

  return setting;
}

export function createDiningTableGroup(table, mats) {
  const root = new THREE.Group();
  root.position.set(table.posX, 0, table.posZ);
  root.rotation.y = table.rotationY;

  const isOccupied = table.isAvailable === false;
  const fitsParty = table.fitsParty !== false;
  const initialState = isOccupied ? 'occupied' : !fitsParty ? 'small' : 'open';

  const disposableGeometries = [];
  const disposableMaterials = [];
  const disposableTextures = [];

  const tableHeight = 0.76;
  const isRound = table.shape === 'round';
  const topWidth = isRound
    ? table.capacity <= 2
      ? 0.92
      : 1.24
    : table.capacity >= 6
      ? 2.15
      : 1.38;
  const topDepth = isRound ? topWidth : table.capacity >= 6 ? 1.02 : 0.92;

  const shadowSize = Math.max(topWidth, topDepth) + 0.95;
  const shadowGeo = new THREE.PlaneGeometry(shadowSize, shadowSize);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: mats.contactShadowTexture,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  disposableGeometries.push(shadowGeo);
  disposableMaterials.push(shadowMat);

  const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.008;
  root.add(shadowPlane);

  const ringRadius = Math.max(topWidth, topDepth) * 0.68 + 0.22;
  const ringGeo = new THREE.RingGeometry(ringRadius - 0.055, ringRadius, 48);
  const ringMat = new THREE.MeshBasicMaterial({
    color: isOccupied ? 0xb91c1c : !fitsParty ? 0x78716c : 0x15803d,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: isOccupied ? 0.65 : !fitsParty ? 0.32 : 0.72,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    depthWrite: false,
  });
  disposableGeometries.push(ringGeo);
  disposableMaterials.push(ringMat);

  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.rotation.x = -Math.PI / 2;
  ringMesh.position.y = 0.018;
  root.add(ringMesh);

  if (isRound) {
    const baseGeo = new THREE.CylinderGeometry(0.14, 0.34, 0.07, 28);
    const colGeo = new THREE.CylinderGeometry(0.052, 0.064, tableHeight - 0.1, 20);
    const topGeo = new THREE.CylinderGeometry(topWidth / 2, topWidth / 2, 0.042, 40);
    const rimGeo = new THREE.TorusGeometry(topWidth / 2, 0.016, 10, 48);
    disposableGeometries.push(baseGeo, colGeo, topGeo, rimGeo);

    const base = new THREE.Mesh(baseGeo, mats.castIron);
    base.position.y = 0.035;
    base.castShadow = true;
    root.add(base);

    const col = new THREE.Mesh(colGeo, mats.brushedBrass);
    col.position.y = tableHeight / 2;
    col.castShadow = true;
    root.add(col);

    const top = new THREE.Mesh(topGeo, mats.marbleTop);
    top.position.y = tableHeight - 0.021;
    top.castShadow = true;
    top.receiveShadow = true;
    root.add(top);

    const rim = new THREE.Mesh(rimGeo, mats.brushedBrass);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = tableHeight - 0.021;
    root.add(rim);
  } else {
    const legGeo = new THREE.CylinderGeometry(0.034, 0.022, tableHeight - 0.04, 14);
    const topGeo = new THREE.BoxGeometry(topWidth, 0.046, topDepth);
    const runnerGeo = new THREE.BoxGeometry(topWidth * 0.86, 0.008, topDepth * 0.32);
    disposableGeometries.push(legGeo, topGeo, runnerGeo);

    const legX = topWidth / 2 - 0.12;
    const legZ = topDepth / 2 - 0.12;
    for (const [lx, lz] of [
      [-legX, -legZ],
      [legX, -legZ],
      [-legX, legZ],
      [legX, legZ],
    ]) {
      const leg = new THREE.Mesh(legGeo, mats.walnutWood);
      leg.position.set(lx, (tableHeight - 0.04) / 2, lz);
      leg.castShadow = true;
      root.add(leg);
    }

    const top = new THREE.Mesh(topGeo, mats.oakWood);
    top.position.y = tableHeight - 0.023;
    top.castShadow = true;
    top.receiveShadow = true;
    root.add(top);

    const runner = new THREE.Mesh(runnerGeo, mats.linenFabric);
    runner.position.y = tableHeight + 0.004;
    runner.receiveShadow = true;
    root.add(runner);
  }

  const candleBaseGeo = new THREE.CylinderGeometry(0.045, 0.055, 0.026, 16);
  const candleCoreGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.065, 12);
  const candleShadeGeo = new THREE.CylinderGeometry(0.042, 0.052, 0.12, 20, 1, true);
  const haloGeo = new THREE.SphereGeometry(0.09, 16, 12);
  disposableGeometries.push(candleBaseGeo, candleCoreGeo, candleShadeGeo, haloGeo);

  const candleCoreMat = new THREE.MeshStandardMaterial({
    color: 0xffd28a,
    emissive: 0xff8c24,
    emissiveIntensity: isOccupied ? 0.35 : 2.2,
    roughness: 0.3,
  });
  const candleHaloMat = new THREE.MeshBasicMaterial({
    color: 0xffb347,
    transparent: true,
    opacity: isOccupied ? 0.06 : 0.22,
    depthWrite: false,
  });
  const glassShadeMat = new THREE.MeshPhysicalMaterial({
    color: 0xd97706,
    roughness: 0.2,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  disposableMaterials.push(candleCoreMat, candleHaloMat, glassShadeMat);

  const lampGroup = new THREE.Group();
  lampGroup.position.set(-0.08, tableHeight + 0.01, 0);

  const lampBase = new THREE.Mesh(candleBaseGeo, mats.brushedBrass);
  lampBase.position.y = 0.013;
  lampGroup.add(lampBase);

  const candleCore = new THREE.Mesh(candleCoreGeo, candleCoreMat);
  candleCore.position.y = 0.055;
  lampGroup.add(candleCore);

  const candleShade = new THREE.Mesh(candleShadeGeo, glassShadeMat);
  candleShade.position.y = 0.08;
  candleShade.renderOrder = 4;
  lampGroup.add(candleShade);

  const candleHalo = new THREE.Mesh(haloGeo, candleHaloMat);
  candleHalo.position.y = 0.08;
  lampGroup.add(candleHalo);
  root.add(lampGroup);

  const plaqueTex = createTableLabelTexture(table.tableNumber, isOccupied);
  disposableTextures.push(plaqueTex);
  const plaqueMat = new THREE.MeshStandardMaterial({
    map: plaqueTex,
    roughness: 0.38,
    metalness: 0.15,
  });
  const plaqueGeo = new THREE.BoxGeometry(0.16, 0.085, 0.018);
  disposableMaterials.push(plaqueMat);
  disposableGeometries.push(plaqueGeo);

  const plaque = new THREE.Mesh(plaqueGeo, plaqueMat);
  plaque.position.set(0.11, tableHeight + 0.045, 0.03);
  plaque.rotation.y = 0.18;
  plaque.castShadow = true;
  root.add(plaque);

  const chairs = [];
  const seatCount = Math.min(table.capacity, 8);

  const seatSlots = [];
  if (isRound) {
    const r = topWidth / 2 + 0.24;
    for (let i = 0; i < seatCount; i++) {
      const angle = (i / seatCount) * Math.PI * 2 + 0.25;
      const sx = Math.sin(angle) * r;
      const sz = Math.cos(angle) * r;
      seatSlots.push({
        pos: new THREE.Vector3(sx, 0, sz),
        rotY: angle + Math.PI,
        out: new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)),
      });
    }
  } else {
    const perSide = Math.ceil(seatCount / 2);
    const hasEndSeats = seatCount >= 6 && seatCount % 2 === 0 && topWidth >= 1.9;
    const longSideCount = hasEndSeats ? (seatCount - 2) / 2 : perSide;

    for (let i = 0; i < longSideCount; i++) {
      const frac =
        longSideCount === 1
          ? 0
          : (i / (longSideCount - 1) - 0.5) * (topWidth - 0.72);
      seatSlots.push({
        pos: new THREE.Vector3(frac, 0, -(topDepth / 2 + 0.23)),
        rotY: 0,
        out: new THREE.Vector3(0, 0, -1),
      });
      if (seatSlots.length < seatCount) {
        seatSlots.push({
          pos: new THREE.Vector3(frac, 0, topDepth / 2 + 0.23),
          rotY: Math.PI,
          out: new THREE.Vector3(0, 0, 1),
        });
      }
    }
    if (hasEndSeats) {
      seatSlots.push({
        pos: new THREE.Vector3(-(topWidth / 2 + 0.25), 0, 0),
        rotY: Math.PI / 2,
        out: new THREE.Vector3(-1, 0, 0),
      });
      seatSlots.push({
        pos: new THREE.Vector3(topWidth / 2 + 0.25, 0, 0),
        rotY: -Math.PI / 2,
        out: new THREE.Vector3(1, 0, 0),
      });
    }
  }

  for (let i = 0; i < seatSlots.length; i++) {
    const slot = seatSlots[i];
    const chair = createChairMesh(mats, isOccupied);
    const jitterAngle = ((i % 3) - 1) * 0.045;
    chair.position.copy(slot.pos);
    chair.rotation.y = slot.rotY + jitterAngle;
    root.add(chair);

    chairs.push({
      group: chair,
      restPos: slot.pos.clone(),
      outDir: slot.out.clone(),
      currentOffset: 0,
    });

    const setting = createPlaceSetting(mats);
    const insetDist = 0.33;
    setting.position.set(
      slot.pos.x - slot.out.x * insetDist,
      tableHeight + 0.002,
      slot.pos.z - slot.out.z * insetDist,
    );
    setting.rotation.y = slot.rotY;
    root.add(setting);
  }

  const hitGeo = new THREE.BoxGeometry(topWidth + 0.8, 1.15, topDepth + 0.8);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  disposableGeometries.push(hitGeo);
  disposableMaterials.push(hitMat);

  const hitBox = new THREE.Mesh(hitGeo, hitMat);
  hitBox.position.y = 0.58;
  hitBox.layers.set(1);
  hitBox.userData.tableId = table.id;
  root.add(hitBox);

  return {
    tableId: table.id,
    tableNumber: table.tableNumber,
    root,
    hitBox,
    ringMesh,
    ringMat,
    candleCoreMat,
    candleHaloMat,
    plaqueMat,
    chairs,
    state: initialState,
    phaseOffset: (table.posX * 1.7 + table.posZ * 2.3) % (Math.PI * 2),
    dispose: () => {
      disposableGeometries.forEach((g) => g.dispose());
      disposableMaterials.forEach((m) => m.dispose());
      disposableTextures.forEach((t) => t.dispose());
    },
  };
}

export function createDiningHallEnvironment(mats) {
  const group = new THREE.Group();
  const pendants = [];
  const disposables = [];

  const floorGeo = new THREE.PlaneGeometry(17, 13);
  const floor = new THREE.Mesh(floorGeo, mats.woodFloor);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  disposables.push(floorGeo);

  const backWallGeo = new THREE.BoxGeometry(17, 4.8, 0.24);
  const backWall = new THREE.Mesh(backWallGeo, mats.plasterWall);
  backWall.position.set(0, 2.4, -5.2);
  backWall.receiveShadow = true;
  group.add(backWall);

  const wainscotGeo = new THREE.BoxGeometry(17, 1.15, 0.28);
  const backWainscot = new THREE.Mesh(wainscotGeo, mats.wainscotWood);
  backWainscot.position.set(0, 0.575, -5.18);
  backWainscot.receiveShadow = true;
  group.add(backWainscot);

  const railGeo = new THREE.BoxGeometry(17, 0.05, 0.31);
  const backRail = new THREE.Mesh(railGeo, mats.brushedBrass);
  backRail.position.set(0, 1.16, -5.17);
  group.add(backRail);

  const leftWallGeo = new THREE.BoxGeometry(0.24, 4.8, 13);
  const leftWall = new THREE.Mesh(leftWallGeo, mats.plasterWall);
  leftWall.position.set(-8.4, 2.4, 0);
  leftWall.receiveShadow = true;
  group.add(leftWall);

  const leftWainscotGeo = new THREE.BoxGeometry(0.28, 1.15, 13);
  const leftWainscot = new THREE.Mesh(leftWainscotGeo, mats.wainscotWood);
  leftWainscot.position.set(-8.38, 0.575, 0);
  group.add(leftWainscot);

  disposables.push(backWallGeo, wainscotGeo, railGeo, leftWallGeo, leftWainscotGeo);

  const winPaneMat = new THREE.MeshBasicMaterial({
    map: mats.windowTwilightTexture,
  });
  const frameGeo = new THREE.BoxGeometry(2.3, 2.8, 0.08);
  const paneGeo = new THREE.PlaneGeometry(2.05, 2.55);
  const mullionVGeo = new THREE.BoxGeometry(0.04, 2.55, 0.09);
  const mullionHGeo = new THREE.BoxGeometry(2.05, 0.04, 0.09);
  disposables.push(winPaneMat, frameGeo, paneGeo, mullionVGeo, mullionHGeo);

  for (const wx of [-4.5, 0, 4.5]) {
    const winGroup = new THREE.Group();
    winGroup.position.set(wx, 2.68, -5.06);

    const frame = new THREE.Mesh(frameGeo, mats.castIron);
    winGroup.add(frame);

    const pane = new THREE.Mesh(paneGeo, winPaneMat);
    pane.position.z = 0.045;
    winGroup.add(pane);

    const mv = new THREE.Mesh(mullionVGeo, mats.castIron);
    mv.position.z = 0.055;
    winGroup.add(mv);

    const mh = new THREE.Mesh(mullionHGeo, mats.castIron);
    mh.position.set(0, 0.25, 0.055);
    winGroup.add(mh);

    group.add(winGroup);
  }

  const beamGeo = new THREE.BoxGeometry(0.22, 0.26, 13);
  disposables.push(beamGeo);
  for (const bx of [-5.2, -1.7, 1.7, 5.2]) {
    const beam = new THREE.Mesh(beamGeo, mats.wainscotWood);
    beam.position.set(bx, 4.55, 0);
    group.add(beam);
  }

  const barGroup = new THREE.Group();
  barGroup.position.set(-7.1, 0, 1.4);

  const barBodyGeo = new THREE.BoxGeometry(1.1, 1.06, 4.2);
  const barTopGeo = new THREE.BoxGeometry(1.32, 0.06, 4.4);
  const barFootrailGeo = new THREE.CylinderGeometry(0.022, 0.022, 4.1, 12);
  disposables.push(barBodyGeo, barTopGeo, barFootrailGeo);

  const barBody = new THREE.Mesh(barBodyGeo, mats.wainscotWood);
  barBody.position.y = 0.53;
  barBody.castShadow = true;
  barBody.receiveShadow = true;
  barGroup.add(barBody);

  const barTop = new THREE.Mesh(barTopGeo, mats.marbleTop);
  barTop.position.set(0.06, 1.09, 0);
  barTop.castShadow = true;
  barGroup.add(barTop);

  const footRail = new THREE.Mesh(barFootrailGeo, mats.brushedBrass);
  footRail.rotation.x = Math.PI / 2;
  footRail.position.set(0.68, 0.2, 0);
  barGroup.add(footRail);

  const stoolSeatGeo = new THREE.CylinderGeometry(0.19, 0.17, 0.055, 20);
  const stoolStemGeo = new THREE.CylinderGeometry(0.032, 0.04, 0.72, 12);
  const stoolBaseGeo = new THREE.CylinderGeometry(0.18, 0.2, 0.03, 18);
  disposables.push(stoolSeatGeo, stoolStemGeo, stoolBaseGeo);

  for (const sz of [-1.2, 0, 1.2]) {
    const stool = new THREE.Group();
    stool.position.set(0.95, 0, sz);

    const sBase = new THREE.Mesh(stoolBaseGeo, mats.castIron);
    sBase.position.y = 0.015;
    stool.add(sBase);

    const sStem = new THREE.Mesh(stoolStemGeo, mats.brushedBrass);
    sStem.position.y = 0.38;
    stool.add(sStem);

    const sSeat = new THREE.Mesh(stoolSeatGeo, mats.chairVelvet);
    sSeat.position.y = 0.76;
    sSeat.castShadow = true;
    stool.add(sSeat);

    barGroup.add(stool);
  }
  group.add(barGroup);

  const podium = new THREE.Group();
  podium.position.set(6.2, 0, 4.1);
  const podBodyGeo = new THREE.BoxGeometry(0.75, 1.12, 0.52);
  const podTopGeo = new THREE.BoxGeometry(0.84, 0.04, 0.6);
  const ledgerGeo = new THREE.BoxGeometry(0.32, 0.025, 0.24);
  disposables.push(podBodyGeo, podTopGeo, ledgerGeo);

  const podBody = new THREE.Mesh(podBodyGeo, mats.walnutWood);
  podBody.position.y = 0.56;
  podBody.castShadow = true;
  podium.add(podBody);

  const podTop = new THREE.Mesh(podTopGeo, mats.brushedBrass);
  podTop.position.y = 1.14;
  podium.add(podTop);

  const ledger = new THREE.Mesh(ledgerGeo, mats.linenFabric);
  ledger.position.set(0, 1.17, 0);
  ledger.rotation.y = -0.15;
  podium.add(ledger);
  group.add(podium);

  const rodGeo = new THREE.CylinderGeometry(0.012, 0.012, 1.7, 8);
  const shadeGeo = new THREE.ConeGeometry(0.36, 0.22, 24, 1, true);
  const bulbGeo = new THREE.SphereGeometry(0.055, 12, 12);
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xffe4b5,
    emissive: 0xffa94d,
    emissiveIntensity: 2.5,
  });
  const shadeMat = new THREE.MeshPhysicalMaterial({
    color: 0xc99c4d,
    metalness: 0.9,
    roughness: 0.22,
    side: THREE.DoubleSide,
  });
  disposables.push(rodGeo, shadeGeo, bulbGeo, bulbMat, shadeMat);

  const pendantPositions = [
    [-2.8, -1.6],
    [2.2, -1.6],
    [-2.4, 1.5],
    [2.4, 1.5],
  ];

  for (const [px, pz] of pendantPositions) {
    const pendant = new THREE.Group();
    pendant.position.set(px, 4.5, pz);

    const rod = new THREE.Mesh(rodGeo, mats.castIron);
    rod.position.y = -0.85;
    pendant.add(rod);

    const shade = new THREE.Mesh(shadeGeo, shadeMat);
    shade.position.y = -1.72;
    pendant.add(shade);

    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.y = -1.78;
    pendant.add(bulb);

    group.add(pendant);
    pendants.push(pendant);
  }

  return {
    group,
    pendants,
    winPaneMat,
    bulbMat,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
