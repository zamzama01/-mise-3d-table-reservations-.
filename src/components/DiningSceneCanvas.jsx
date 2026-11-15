import { Moon, Sun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  createDiningHallEnvironment,
  createDiningTableGroup,
} from '../three/diningModels.js';
import { createDiningMaterialLibrary } from '../three/materials.js';

const CAMERA_PRESETS = {
  overview: { pos: [7.4, 5.4, 8.2], target: [-0.2, 0.55, 0.2], label: 'Overview' },
  window: { pos: [0.2, 2.8, 2.2], target: [0.0, 0.75, -2.8], label: 'Windows' },
  counter: { pos: [-1.4, 2.9, 5.6], target: [-4.6, 0.85, 1.4], label: 'Bar' },
  top: { pos: [0.0, 11.4, 0.6], target: [0.0, 0.0, 0.2], label: 'Top View' },
};

const _desiredCamPos = new THREE.Vector3();
const _desiredTarget = new THREE.Vector3();
const _mouseVec = new THREE.Vector2();
const _dayBg = new THREE.Color(0xd5dee8);
const _nightBg = new THREE.Color(0x0d121a);
const _dayHemiSky = new THREE.Color(0xeef5fc);
const _dayHemiGround = new THREE.Color(0x8e7b68);
const _nightHemiSky = new THREE.Color(0xb8cbe8);
const _nightHemiGround = new THREE.Color(0x2d231b);

export function DiningSceneCanvas({
  tables,
  selectedTableId,
  onSelectTable,
  restaurantName,
  theme = 'light',
  onToggleTheme,
  compact = false,
  className = '',
}) {
  const mountRef = useRef(null);
  const [hoveredTable, setHoveredTable] = useState(null);
  const [activePreset, setActivePreset] = useState('overview');
  const [controlsCollapsed, setControlsCollapsed] = useState(false);
  const [webglError, setWebglError] = useState(null);

  const tablesRef = useRef(tables);
  const selectedIdRef = useRef(selectedTableId);
  const hoveredIdRef = useRef(null);
  const onSelectRef = useRef(onSelectTable);
  const themeRef = useRef(theme);

  const cameraGlideRef = useRef({
    active: false,
    pos: new THREE.Vector3(...CAMERA_PRESETS.overview.pos),
    target: new THREE.Vector3(...CAMERA_PRESETS.overview.target),
  });

  const sceneRefs = useRef(null);

  tablesRef.current = tables;
  selectedIdRef.current = selectedTableId;
  onSelectRef.current = onSelectTable;
  themeRef.current = theme;

  const focusTableCamera = (table) => {
    cameraGlideRef.current.pos.set(table.posX + 2.4, 2.65, table.posZ + 2.9);
    cameraGlideRef.current.target.set(table.posX, 0.72, table.posZ);
    cameraGlideRef.current.active = true;
  };

  const applyPreset = (preset) => {
    setActivePreset(preset);
    const cfg = CAMERA_PRESETS[preset];
    cameraGlideRef.current.pos.set(...cfg.pos);
    cameraGlideRef.current.target.set(...cfg.target);
    cameraGlideRef.current.active = true;
  };

  useEffect(() => {
    if (!selectedTableId) return;
    const found = tablesRef.current.find((t) => t.id === selectedTableId);
    if (found) {
      focusTableCamera(found);
    }
  }, [selectedTableId]);

  useEffect(() => {
    const ctx = sceneRefs.current;
    if (!ctx) return;

    ctx.rigs.forEach((rig) => {
      ctx.scene.remove(rig.root);
      rig.dispose();
    });
    ctx.rigs.clear();
    ctx.hitMeshes.length = 0;

    for (const table of tables) {
      const rig = createDiningTableGroup(table, ctx.mats);
      ctx.scene.add(rig.root);
      ctx.rigs.set(table.id, rig);
      ctx.hitMeshes.push(rig.hitBox);
    }
  }, [tables]);

  useEffect(() => {
    const ctx = sceneRefs.current;
    if (!ctx) return;
    ctx.roomHandle.winPaneMat.map =
      theme === 'dark' ? ctx.mats.windowTwilightTexture : ctx.mats.windowDaylightTexture;
    ctx.roomHandle.winPaneMat.needsUpdate = true;
  }, [theme]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      try {
        const probeCanvas = document.createElement('canvas');
        const gl = probeCanvas.getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError('3D preview unavailable in this browser.');
      return;
    }

    const width = Math.max(container.clientWidth, 300);
    const height = Math.max(container.clientHeight, 260);
    const isDarkInit = themeRef.current === 'dark';

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isDarkInit ? 1.05 : 1.15;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const initialBg = isDarkInit ? _nightBg : _dayBg;
    scene.background = initialBg.clone();
    scene.fog = new THREE.FogExp2(initialBg.getHex(), isDarkInit ? 0.026 : 0.015);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 80);
    camera.position.set(...CAMERA_PRESETS.overview.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...CAMERA_PRESETS.overview.target);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 2.8;
    controls.maxDistance = 16.5;
    controls.minPolarAngle = 0.15;
    controls.maxPolarAngle = Math.PI / 2 - 0.08;
    controls.update();

    const cancelCameraGlide = () => {
      cameraGlideRef.current.active = false;
    };
    controls.addEventListener('start', cancelCameraGlide);

    const hemiLight = new THREE.HemisphereLight(
      isDarkInit ? _nightHemiSky : _dayHemiSky,
      isDarkInit ? _nightHemiGround : _dayHemiGround,
      isDarkInit ? 0.62 : 1.18,
    );
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(
      isDarkInit ? 0xffe6c7 : 0xfff8eb,
      isDarkInit ? 1.2 : 2.1,
    );
    keyLight.position.set(5.5, 9.5, 5.0);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -8;
    keyLight.shadow.camera.right = 8;
    keyLight.shadow.camera.top = 7;
    keyLight.shadow.camera.bottom = -7;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 24;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(
      0x8aa8d6,
      isDarkInit ? 0.48 : 0.62,
    );
    rimLight.position.set(-6, 5, -7);
    scene.add(rimLight);

    const warmPointA = new THREE.PointLight(
      0xffb45c,
      isDarkInit ? 1.65 : 0.35,
      12,
      1.6,
    );
    warmPointA.position.set(-2.5, 2.9, 0);
    scene.add(warmPointA);

    const warmPointB = new THREE.PointLight(
      0xffb45c,
      isDarkInit ? 1.65 : 0.35,
      12,
      1.6,
    );
    warmPointB.position.set(2.5, 2.9, 0.5);
    scene.add(warmPointB);

    const mats = createDiningMaterialLibrary(renderer, isSoftwareGl);
    const roomHandle = createDiningHallEnvironment(mats);
    roomHandle.winPaneMat.map = isDarkInit
      ? mats.windowTwilightTexture
      : mats.windowDaylightTexture;
    roomHandle.winPaneMat.needsUpdate = true;
    scene.add(roomHandle.group);

    const rigs = new Map();
    const hitMeshes = [];
    for (const table of tablesRef.current) {
      const rig = createDiningTableGroup(table, mats);
      scene.add(rig.root);
      rigs.set(table.id, rig);
      hitMeshes.push(rig.hitBox);
    }

    sceneRefs.current = { scene, mats, rigs, hitMeshes, roomHandle };

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);

    let lastHoverCheck = 0;
    let pointerDownPos = { x: 0, y: 0 };

    const updateMouseNDC = (clientX, clientY) => {
      const rect = renderer.domElement.getBoundingClientRect();
      _mouseVec.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _mouseVec.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerMove = (e) => {
      const now = performance.now();
      if (now - lastHoverCheck < 45) return;
      lastHoverCheck = now;

      updateMouseNDC(e.clientX, e.clientY);
      raycaster.setFromCamera(_mouseVec, camera);
      const hits = raycaster.intersectObjects(hitMeshes, false);

      if (hits.length > 0) {
        const hitId = hits[0].object.userData.tableId;
        if (hoveredIdRef.current !== hitId) {
          hoveredIdRef.current = hitId;
          const found = tablesRef.current.find((t) => t.id === hitId) || null;
          setHoveredTable(found);
        }
        renderer.domElement.style.cursor = 'pointer';
      } else {
        if (hoveredIdRef.current !== null) {
          hoveredIdRef.current = null;
          setHoveredTable(null);
        }
        renderer.domElement.style.cursor = 'grab';
      }
    };

    const onPointerDown = (e) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e) => {
      const dx = e.clientX - pointerDownPos.x;
      const dy = e.clientY - pointerDownPos.y;
      if (Math.hypot(dx, dy) > 6) return;

      updateMouseNDC(e.clientX, e.clientY);
      raycaster.setFromCamera(_mouseVec, camera);
      const hits = raycaster.intersectObjects(hitMeshes, false);
      if (hits.length > 0) {
        const hitId = hits[0].object.userData.tableId;
        onSelectRef.current(hitId);
      }
    };

    const onContextLost = (e) => {
      e.preventDefault();
      setWebglError('3D preview paused. Reload to restore.');
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(entry.contentRect.width, 280);
        const h = Math.max(entry.contentRect.height, 240);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    resizeObserver.observe(container);

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;

    const afterDraw = (cb) => {
      const gl = renderer.getContext();
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const tick = () => {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();
      const isDark = themeRef.current === 'dark';

      const targetBg = isDark ? _nightBg : _dayBg;
      scene.background.lerp(targetBg, Math.min(1, delta * 5.5));
      if (scene.fog) {
        scene.fog.color.copy(scene.background);
        scene.fog.density = THREE.MathUtils.damp(
          scene.fog.density,
          isDark ? 0.026 : 0.015,
          5.5,
          delta,
        );
      }

      renderer.toneMappingExposure = THREE.MathUtils.damp(
        renderer.toneMappingExposure,
        isDark ? 1.05 : 1.15,
        5.5,
        delta,
      );

      hemiLight.color.lerp(isDark ? _nightHemiSky : _dayHemiSky, Math.min(1, delta * 5.5));
      hemiLight.groundColor.lerp(
        isDark ? _nightHemiGround : _dayHemiGround,
        Math.min(1, delta * 5.5),
      );
      hemiLight.intensity = THREE.MathUtils.damp(
        hemiLight.intensity,
        isDark ? 0.62 : 1.18,
        5.5,
        delta,
      );
      keyLight.intensity = THREE.MathUtils.damp(
        keyLight.intensity,
        isDark ? 1.2 : 2.1,
        5.5,
        delta,
      );
      rimLight.intensity = THREE.MathUtils.damp(
        rimLight.intensity,
        isDark ? 0.48 : 0.62,
        5.5,
        delta,
      );
      const pointTarget = isDark ? 1.65 : 0.35;
      warmPointA.intensity = THREE.MathUtils.damp(warmPointA.intensity, pointTarget, 5.5, delta);
      warmPointB.intensity = THREE.MathUtils.damp(warmPointB.intensity, pointTarget, 5.5, delta);
      roomHandle.bulbMat.emissiveIntensity = THREE.MathUtils.damp(
        roomHandle.bulbMat.emissiveIntensity,
        isDark ? 2.6 : 0.6,
        5.5,
        delta,
      );

      for (let i = 0; i < roomHandle.pendants.length; i++) {
        const p = roomHandle.pendants[i];
        p.rotation.z = Math.sin(elapsed * 0.65 + i * 1.3) * 0.014;
        p.rotation.x = Math.cos(elapsed * 0.52 + i * 0.9) * 0.01;
      }

      const currentSelected = selectedIdRef.current;
      const currentHovered = hoveredIdRef.current;

      rigs.forEach((rig) => {
        const isSelected = rig.tableId === currentSelected;
        const isHovered = rig.tableId === currentHovered;
        const targetLift = isSelected ? 0.17 : isHovered ? 0.1 : 0;

        for (const ch of rig.chairs) {
          ch.currentOffset = THREE.MathUtils.damp(
            ch.currentOffset,
            targetLift,
            7.5,
            delta,
          );
          ch.group.position.set(
            ch.restPos.x + ch.outDir.x * ch.currentOffset,
            0,
            ch.restPos.z + ch.outDir.z * ch.currentOffset,
          );
        }

        if (isSelected) {
          rig.ringMat.color.setHex(0x0d9488);
          rig.ringMat.opacity = 0.96;
          rig.ringMesh.scale.setScalar(
            THREE.MathUtils.damp(rig.ringMesh.scale.x, 1.08, 8, delta),
          );
        } else if (isHovered) {
          rig.ringMat.color.setHex(rig.state === 'occupied' ? 0xdc2626 : 0x14b8a6);
          rig.ringMat.opacity = 0.88;
          rig.ringMesh.scale.setScalar(
            THREE.MathUtils.damp(rig.ringMesh.scale.x, 1.04, 8, delta),
          );
        } else {
          rig.ringMat.color.setHex(
            rig.state === 'occupied'
              ? 0xb91c1c
              : rig.state === 'small'
                ? 0x64748b
                : 0x15803d,
          );
          rig.ringMat.opacity =
            rig.state === 'occupied' ? 0.6 : rig.state === 'small' ? 0.3 : 0.72;
          rig.ringMesh.scale.setScalar(
            THREE.MathUtils.damp(rig.ringMesh.scale.x, 1.0, 8, delta),
          );
        }

        const flicker =
          1 +
          Math.sin(elapsed * 5.2 + rig.phaseOffset) * 0.08 +
          Math.sin(elapsed * 11.7 + rig.phaseOffset * 2) * 0.04;
        const dayFactor = isDark ? 1 : 0.38;

        if (rig.state === 'occupied') {
          rig.candleCoreMat.emissiveIntensity = 0.35 * dayFactor;
          rig.candleHaloMat.opacity = 0.05 * dayFactor;
        } else {
          const baseGlow = isSelected ? 3.1 : 2.1;
          rig.candleCoreMat.emissiveIntensity = baseGlow * flicker * dayFactor;
          rig.candleHaloMat.opacity = (isSelected ? 0.3 : 0.19) * flicker * dayFactor;
        }
      });

      if (cameraGlideRef.current.active) {
        _desiredCamPos.copy(cameraGlideRef.current.pos);
        _desiredTarget.copy(cameraGlideRef.current.target);

        camera.position.x = THREE.MathUtils.damp(camera.position.x, _desiredCamPos.x, 5.2, delta);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, _desiredCamPos.y, 5.2, delta);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, _desiredCamPos.z, 5.2, delta);

        controls.target.x = THREE.MathUtils.damp(controls.target.x, _desiredTarget.x, 5.2, delta);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, _desiredTarget.y, 5.2, delta);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, _desiredTarget.z, 5.2, delta);

        if (
          camera.position.distanceTo(_desiredCamPos) < 0.04 &&
          controls.target.distanceTo(_desiredTarget) < 0.04
        ) {
          cameraGlideRef.current.active = false;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      controls.removeEventListener('start', cancelCameraGlide);
      controls.dispose();
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);

      rigs.forEach((rig) => rig.dispose());
      roomHandle.dispose();
      mats.dispose();
      envTarget.dispose();
      renderer.dispose();
      sceneRefs.current = null;

      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl border border-[#0F172A]/12 dark:border-white/12 bg-[#D5DEE8] dark:bg-[#0D121A] shadow-sm transition-colors ${
        compact
          ? 'h-[350px] sm:h-[420px] lg:h-full min-h-[350px] lg:min-h-[455px]'
          : 'h-[370px] sm:h-[460px] lg:h-[540px]'
      } ${className}`}
    >
      <div ref={mountRef} className="w-full h-full" />

      {webglError && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#D5DEE8] dark:bg-[#0D121A] p-6 text-center text-sm text-[#0F172A] dark:text-[#F1F5F9]">
          {webglError}
        </div>
      )}

      <div className="pointer-events-none absolute top-3.5 left-3.5 right-3.5 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 rounded-xl border border-[#0F172A]/10 dark:border-white/15 bg-white/80 dark:bg-[#0B0E14]/75 backdrop-blur-md px-3.5 py-2 text-[#0F172A] dark:text-[#F1F5F9] shadow-sm">
          <p className="text-xs sm:text-sm font-semibold leading-snug truncate max-w-[190px] sm:max-w-[290px]">
            {restaurantName}
          </p>
          {onToggleTheme && (
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'Switch 3D to Day view' : 'Switch 3D to Night view'}
              className="pointer-events-auto inline-flex items-center gap-1 rounded-lg border border-[#0F172A]/12 dark:border-white/15 bg-[#F4F5F7]/90 dark:bg-[#1A2130]/90 px-2.5 py-1 text-[11px] font-medium text-[#334155] dark:text-[#CBD5E1] hover:border-[#0F766E] dark:hover:border-[#14B8A6] transition-colors whitespace-nowrap"
            >
              {theme === 'dark' ? (
                <>
                  <Moon className="h-3 w-3 text-[#14B8A6]" />
                  <span>Night</span>
                </>
              ) : (
                <>
                  <Sun className="h-3 w-3 text-[#D97706]" />
                  <span>Day</span>
                </>
              )}
            </button>
          )}
        </div>

        {hoveredTable ? (
          <div className="rounded-xl border border-[#0F172A]/10 dark:border-white/15 bg-white/85 dark:bg-[#0B0E14]/80 backdrop-blur-md px-3.5 py-2 text-right text-xs text-[#0F172A] dark:text-[#F1F5F9] shadow-sm">
            <p className="font-mono font-semibold tabular-nums">
              {hoveredTable.tableNumber} · {hoveredTable.capacity} seats
            </p>
            <p className="mt-0.5 text-[11px] text-[#475569] dark:text-[#94A3B8]">
              {hoveredTable.zone} ·{' '}
              <span
                className={`font-semibold ${
                  hoveredTable.isAvailable === false
                    ? 'text-[#B91C1C] dark:text-[#F87171]'
                    : hoveredTable.fitsParty === false
                      ? 'text-[#B45309] dark:text-[#FBBF24]'
                      : 'text-[#15803D] dark:text-[#4ADE80]'
                }`}
              >
                {hoveredTable.isAvailable === false
                  ? 'Reserved'
                  : hoveredTable.fitsParty === false
                    ? 'Too small'
                    : 'Open'}
              </span>
            </p>
          </div>
        ) : (
          <div className="hidden sm:block rounded-xl border border-[#0F172A]/10 dark:border-white/12 bg-white/70 dark:bg-[#0B0E14]/60 backdrop-blur-md px-3 py-1.5 text-[11px] font-medium text-[#334155] dark:text-[#CBD5E1]">
            Drag to orbit · Click any table
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute bottom-3.5 left-1/2 -translate-x-1/2 flex flex-col items-center max-w-[94%]">
        <button
          type="button"
          onClick={() => setControlsCollapsed((v) => !v)}
          className="pointer-events-auto mb-1.5 rounded-lg border border-[#0F172A]/12 dark:border-white/15 bg-white/82 dark:bg-[#0B0E14]/75 backdrop-blur-md px-3 py-1 text-[11px] font-medium text-[#334155] dark:text-[#CBD5E1] hover:border-[#0F766E] dark:hover:border-[#14B8A6] transition-colors whitespace-nowrap shadow-xs"
        >
          {controlsCollapsed ? 'Controls' : 'Hide controls'}
        </button>

        {!controlsCollapsed && (
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1 rounded-xl border border-[#0F172A]/10 dark:border-white/15 bg-white/82 dark:bg-[#0B0E14]/75 backdrop-blur-md px-2.5 py-1.5 text-xs text-[#334155] dark:text-[#CBD5E1] shadow-sm">
            {Object.keys(CAMERA_PRESETS).map((key) => {
              const active = activePreset === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyPreset(key)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#0F766E] dark:bg-[#14B8A6] text-white dark:text-[#0B0E14] font-semibold'
                      : 'text-[#475569] dark:text-[#CBD5E1] hover:bg-[#0F172A]/6 dark:hover:bg-white/10'
                  }`}
                >
                  {CAMERA_PRESETS[key].label}
                </button>
              );
            })}
            <span
              className="hidden sm:inline-block h-4 w-px bg-[#0F172A]/15 dark:bg-white/15 mx-1"
              aria-hidden="true"
            />
            <div className="hidden sm:flex items-center gap-3 px-1.5 text-[11px] text-[#334155] dark:text-[#CBD5E1] whitespace-nowrap">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <span className="h-2 w-2 rounded-xs bg-[#15803D] dark:bg-[#4ADE80]" aria-hidden="true" />
                Open
              </span>
              <span className="inline-flex items-center gap-1.5 font-medium">
                <span className="h-2 w-2 rounded-xs bg-[#B91C1C] dark:bg-[#F87171]" aria-hidden="true" />
                Reserved
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
