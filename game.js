/**
 * Velocity - Infinite First-Person Runner
 * Three.js + Pointer Lock Controls + Procedural Generation
 */

import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// ============ CONFIG ============
const CONFIG = {
  // Player
  playerHeight: 1.7,
  playerRadius: 0.4,
  moveSpeed: 18,
  sprintMultiplier: 1.0,
  jumpForce: 11,
  gravity: 28,
  slideHeight: 0.8,
  slideDuration: 0.6,
  slideCooldown: 1.0,

  // Camera
  fov: 75,
  near: 0.1,
  far: 500,

  // World
  segmentLength: 50,
  segmentsAhead: 6,
  laneCount: 3,
  laneWidth: 3.5,
  obstacleDensity: 0.35,
  powerupDensity: 0.08,

  // Visual
  fogColor: 0x0a0a0f,
  fogNear: 40,
  fogFar: 180,
  baseSpeed: 18,
  maxSpeed: 42,
  speedRampDistance: 3000,

  // Mobile
  touchSensitivity: 0.003,
  joystickDeadzone: 0.15,
};

// ============ STATE ============
let state = {
  // Game
  running: false,
  paused: false,
  gameOver: false,
  distance: 0,
  bestDistance: 0,
  speed: CONFIG.baseSpeed,
  time: 0,
  topSpeed: 0,

  // Player
  velocity: new THREE.Vector3(),
  canJump: true,
  isSliding: false,
  slideTimer: 0,
  slideCooldownTimer: 0,
  targetLane: 1,
  currentLane: 1,
  laneTransition: 0,

  // Input
  keys: { forward: false, backward: false, left: false, right: false, jump: false, slide: false },
  touchMove: { x: 0, y: 0, active: false },
  touchStart: { x: 0, y: 0 },

  // World
  segments: [],
  nextSegmentZ: 0,
  obstacles: [],
  powerups: [],

  // Three.js
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  clock: null,
  raycaster: null,

  // UI
  elements: {},
};

// ============ INIT ============
async function init() {
  cacheElements();
  loadBestDistance();
  setupRenderer();
  setupScene();
  setupCamera();
  setupControls();
  setupLighting();
  setupInput();
  setupMobileControls();
  generateInitialSegments();
  setupUI();
  hideLoading();
  showStartScreen();
  animate();
}

function cacheElements() {
  state.elements = {
    gameContainer: document.getElementById('game-container'),
    ui: document.getElementById('ui'),
    startScreen: document.getElementById('start-screen'),
    pauseMenu: document.getElementById('pause-menu'),
    gameoverScreen: document.getElementById('gameover-screen'),
    loading: document.getElementById('loading'),
    distanceEl: document.getElementById('distance'),
    speedEl: document.getElementById('speed'),
    bestEl: document.getElementById('best'),
    bestDisplay: document.getElementById('best-display'),
    bestValue: document.getElementById('best-value'),
    crosshair: document.getElementById('crosshair'),
    pauseBtn: document.getElementById('pause-btn'),
    startBtn: document.getElementById('start-btn'),
    resumeBtn: document.getElementById('resume-btn'),
    restartBtn: document.getElementById('restart-btn'),
    quitBtn: document.getElementById('quit-btn'),
    retryBtn: document.getElementById('retry-btn'),
    menuBtn: document.getElementById('menu-btn'),
    mobileControls: document.getElementById('mobile-controls'),
    moveJoystick: document.getElementById('move-joystick'),
    jumpBtn: document.getElementById('jump-btn'),
    slideBtn: document.getElementById('slide-btn'),
    controlsHint: document.getElementById('controls-hint'),
    mobileHint: document.getElementById('mobile-hint'),
    pauseDistance: document.getElementById('pause-distance'),
    finalDistance: document.getElementById('final-distance'),
    finalSpeed: document.getElementById('final-speed'),
    finalTime: document.getElementById('final-time'),
    newRecord: document.getElementById('new-record'),
  };
}

function loadBestDistance() {
  const saved = localStorage.getItem('velocity_best');
  state.bestDistance = saved ? parseInt(saved, 10) : 0;
  state.elements.bestValue.textContent = formatDistance(state.bestDistance);
  state.elements.bestDisplay.style.display = state.bestDistance > 0 ? 'inline-flex' : 'none';
}

function saveBestDistance() {
  if (state.distance > state.bestDistance) {
    state.bestDistance = state.distance;
    localStorage.setItem('velocity_best', state.bestDistance.toString());
    state.elements.bestValue.textContent = formatDistance(state.bestDistance);
    state.elements.bestDisplay.style.display = 'inline-flex';
  }
}

// ============ THREE.JS SETUP ============
function setupRenderer() {
  state.renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  state.renderer.setSize(window.innerWidth, window.innerHeight);
  state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  state.renderer.shadowMap.enabled = true;
  state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  state.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  state.renderer.toneMappingExposure = 1.1;
  state.elements.gameContainer.appendChild(state.renderer.domElement);

  window.addEventListener('resize', onResize);
}

function onResize() {
  state.camera.aspect = window.innerWidth / window.innerHeight;
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(window.innerWidth, window.innerHeight);
}

function setupScene() {
  state.scene = new THREE.Scene();
  state.scene.fog = new THREE.Fog(CONFIG.fogColor, CONFIG.fogNear, CONFIG.fogFar);
  state.scene.background = new THREE.Color(CONFIG.fogColor);

  // Sky gradient
  const skyGeo = new THREE.SphereGeometry(400, 32, 16);
  const skyMat = new THREE.MeshBasicMaterial({
    color: 0x1a1a2e,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.6,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  state.scene.add(sky);

  // Ground plane (visual only, collision handled separately)
  const groundGeo = new THREE.PlaneGeometry(2000, 2000);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x11111a,
    roughness: 0.9,
    metalness: 0.1,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  state.scene.add(ground);
  state.ground = ground;

  // Distant buildings silhouette
  createCitySilhouette();
}

function createCitySilhouette() {
  const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
  const buildingMat = new THREE.MeshBasicMaterial({
    color: 0x0d0d15,
    transparent: true,
    opacity: 0.5,
    side: THREE.BackSide,
  });

  for (let i = 0; i < 60; i++) {
    const w = 8 + Math.random() * 12;
    const h = 40 + Math.random() * 80;
    const d = 8 + Math.random() * 12;
    const mesh = new THREE.Mesh(buildingGeo, buildingMat);
    mesh.scale.set(w, h, d);
    const angle = (i / 60) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
    const radius = 180 + Math.random() * 60;
    mesh.position.set(
      Math.cos(angle) * radius,
      h / 2 - 20,
      Math.sin(angle) * radius - 200
    );
    mesh.rotation.y = angle + Math.PI / 2;
    state.scene.add(mesh);
  }
}

function setupCamera() {
  state.camera = new THREE.PerspectiveCamera(
    CONFIG.fov,
    window.innerWidth / window.innerHeight,
    CONFIG.near,
    CONFIG.far
  );
  state.camera.position.set(0, CONFIG.playerHeight, 10);
}

function setupControls() {
  state.controls = new PointerLockControls(state.camera, state.renderer.domElement);

  state.controls.addEventListener('lock', () => {
    state.elements.ui.classList.remove('ui-hidden');
    state.elements.crosshair.style.display = 'block';
  });

  state.controls.addEventListener('unlock', () => {
    if (state.running && !state.paused && !state.gameOver) {
      state.elements.ui.classList.add('ui-hidden');
      state.elements.crosshair.style.display = 'none';
    }
  });

  // Click to lock
  state.renderer.domElement.addEventListener('click', () => {
    if (!state.controls.isLocked && state.running && !state.paused && !state.gameOver) {
      state.controls.lock();
    }
  });
}

function setupLighting() {
  // Ambient
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  state.scene.add(ambient);

  // Sun
  const sun = new THREE.DirectionalLight(0xffffee, 1.2);
  sun.position.set(100, 200, 50);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 400;
  sun.shadow.camera.left = -80;
  sun.shadow.camera.right = 80;
  sun.shadow.camera.top = 80;
  sun.shadow.camera.bottom = -80;
  sun.shadow.bias = -0.001;
  sun.shadow.normalBias = 0.1;
  state.scene.add(sun);
  state.sun = sun;

  // Fill light
  const fill = new THREE.DirectionalLight(0x88aaff, 0.3);
  fill.position.set(-50, 50, -50);
  state.scene.add(fill);

  // Accent rim light
  const rim = new THREE.DirectionalLight(0x00ff88, 0.15);
  rim.position.set(0, 30, -100);
  state.scene.add(rim);
}

// ============ INPUT ============
function setupInput() {
  document.addEventListener('keydown', (e) => handleKey(e, true));
  document.addEventListener('keyup', (e) => handleKey(e, false));

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.running && !state.paused) {
      pauseGame();
    }
  });

  // Pause button
  state.elements.pauseBtn.addEventListener('click', () => {
    if (state.running && !state.gameOver) pauseGame();
  });

  // Menu buttons
  state.elements.startBtn.addEventListener('click', startGame);
  state.elements.resumeBtn.addEventListener('click', resumeGame);
  state.elements.restartBtn.addEventListener('click', () => { hidePauseMenu(); startGame(); });
  state.elements.quitBtn.addEventListener('click', () => { hidePauseMenu(); returnToMenu(); });
  state.elements.retryBtn.addEventListener('click', startGame);
  state.elements.menuBtn.addEventListener('click', returnToMenu);
}

function handleKey(e, pressed) {
  const code = e.code;
  if (code === 'KeyW' || code === 'ArrowUp') state.keys.forward = pressed;
  else if (code === 'KeyS' || code === 'ArrowDown') state.keys.backward = pressed;
  else if (code === 'KeyA' || code === 'ArrowLeft') state.keys.left = pressed;
  else if (code === 'KeyD' || code === 'ArrowRight') state.keys.right = pressed;
  else if (code === 'Space') {
    e.preventDefault();
    state.keys.jump = pressed;
    if (pressed) tryJump();
  }
  else if (code === 'ShiftLeft' || code === 'ShiftRight') {
    state.keys.slide = pressed;
    if (pressed) trySlide();
  }
  else if (code === 'Escape') {
    if (state.running && !state.gameOver) {
      if (state.paused) resumeGame(); else pauseGame();
    }
  }
}

// ============ MOBILE CONTROLS ============
function setupMobileControls() {
  const joystick = state.elements.moveJoystick;
  const stick = joystick.querySelector('.joystick-stick');
  const baseRect = () => joystick.getBoundingClientRect();

  function updateStick(x, y) {
    const rect = baseRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = (x - cx) / (rect.width / 2);
    let dy = (y - cy) / (rect.height / 2);
    const dist = Math.hypot(dx, dy);
    if (dist > 1) { dx /= dist; dy /= dist; }
    if (dist < CONFIG.joystickDeadzone) { dx = 0; dy = 0; }
    stick.style.transform = `translate(-50%, -50%) translate(${dx * 36}px, ${dy * 36}px)`;
    state.touchMove.x = dx;
    state.touchMove.y = dy;
    state.touchMove.active = dist > CONFIG.joystickDeadzone;
  }

  // Touch events
  joystick.addEventListener('touchstart', (e) => {
    e.preventDefault();
    state.touchStart.x = e.touches[0].clientX;
    state.touchStart.y = e.touches[0].clientY;
    const touch = e.touches[0];
    updateStick(touch.clientX, touch.clientY);
  }, { passive: false });

  joystick.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    updateStick(touch.clientX, touch.clientY);
  }, { passive: false });

  joystick.addEventListener('touchend', () => {
    state.touchMove.x = 0;
    state.touchMove.y = 0;
    state.touchMove.active = false;
    stick.style.transform = 'translate(-50%, -50%)';
  });

  // Jump/Slide buttons
  state.elements.jumpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); tryJump(); }, { passive: false });
  state.elements.slideBtn.addEventListener('touchstart', (e) => { e.preventDefault(); trySlide(); }, { passive: false });

  // Visual feedback
  [state.elements.jumpBtn, state.elements.slideBtn].forEach(btn => {
    btn.addEventListener('touchstart', () => btn.classList.add('active'));
    btn.addEventListener('touchend', () => btn.classList.remove('active'));
  });
}

// ============ PLAYER ACTIONS ============
function tryJump() {
  if (state.canJump && !state.isSliding && state.running && !state.paused) {
    state.velocity.y = CONFIG.jumpForce;
    state.canJump = false;
    // Camera jump animation
    animateCameraJump();
  }
}

function trySlide() {
  if (!state.isSliding && state.slideCooldownTimer <= 0 && state.running && !state.paused && !state.canJump) {
    // Can slide in air
    startSlide();
  } else if (!state.isSliding && state.slideCooldownTimer <= 0 && state.running && !state.paused && state.canJump) {
    startSlide();
  }
}

function startSlide() {
  state.isSliding = true;
  state.slideTimer = CONFIG.slideDuration;
  state.slideCooldownTimer = CONFIG.slideCooldown;
  // Camera slide animation
  animateCameraSlide();
}

function animateCameraJump() {
  const startHeight = state.camera.position.y;
  const peakHeight = startHeight + 0.4;
  const duration = 0.4;
  let elapsed = 0;

  function step(dt) {
    elapsed += dt;
    const t = Math.min(elapsed / duration, 1);
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    state.camera.position.y = startHeight + (peakHeight - startHeight) * ease * 2 * (1 - t);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function animateCameraSlide() {
  const startHeight = state.camera.position.y;
  const slideHeight = CONFIG.slideHeight;
  const duration = CONFIG.slideDuration;
  let elapsed = 0;

  function step(dt) {
    elapsed += dt;
    const t = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    state.camera.position.y = startHeight - (startHeight - slideHeight) * ease;
    if (t < 1) requestAnimationFrame(step);
    else {
      // Return to normal
      const returnStart = state.camera.position.y;
      let returnElapsed = 0;
      const returnDuration = 0.3;
      function returnStep(dt) {
        returnElapsed += dt;
        const rt = Math.min(returnElapsed / returnDuration, 1);
        const rease = 1 - Math.pow(1 - rt, 3);
        state.camera.position.y = returnStart + (CONFIG.playerHeight - returnStart) * rease;
        if (rt < 1) requestAnimationFrame(returnStep);
      }
      requestAnimationFrame(returnStep);
    }
  }
  requestAnimationFrame(step);
}

// ============ WORLD GENERATION ============
function generateInitialSegments() {
  state.nextSegmentZ = -CONFIG.segmentLength * 2;
  for (let i = 0; i < CONFIG.segmentsAhead; i++) {
    generateSegment();
  }
}

function generateSegment() {
  const z = state.nextSegmentZ;
  const segment = {
    z: z,
    obstacles: [],
    powerups: [],
    passed: false,
  };

  // Generate obstacles
  for (let lane = 0; lane < CONFIG.laneCount; lane++) {
    if (Math.random() < CONFIG.obstacleDensity) {
      const type = pickObstacleType();
      const obstacle = createObstacle(type, lane, z);
      segment.obstacles.push(obstacle);
      state.obstacles.push(obstacle);
    }
  }

  // Generate powerups
  for (let lane = 0; lane < CONFIG.laneCount; lane++) {
    if (Math.random() < CONFIG.powerupDensity) {
      const powerup = createPowerup(lane, z);
      segment.powerups.push(powerup);
      state.powerups.push(powerup);
    }
  }

  state.segments.push(segment);
  state.nextSegmentZ -= CONFIG.segmentLength;
}

function pickObstacleType() {
  const types = ['block', 'wall', 'gate', 'spike'];
  const weights = [0.4, 0.25, 0.2, 0.15];
  const r = Math.random();
  let sum = 0;
  for (let i = 0; i < types.length; i++) {
    sum += weights[i];
    if (r < sum) return types[i];
  }
  return 'block';
}

function createObstacle(type, lane, baseZ) {
  const x = (lane - 1) * CONFIG.laneWidth;
  const z = baseZ + (Math.random() - 0.5) * CONFIG.segmentLength * 0.8;

  let mesh, height, width, depth, canSlideUnder = false, canJumpOver = true;

  switch (type) {
    case 'block':
      width = 2.5; height = 2.0; depth = 2.5;
      mesh = createBlock(width, height, depth, 0xff3366);
      canJumpOver = true;
      break;
    case 'wall':
      width = CONFIG.laneWidth * 0.9; height = 2.5; depth = 0.5;
      mesh = createBlock(width, height, depth, 0xff6600);
      canJumpOver = false;
      break;
    case 'gate':
      // Two pillars with gap
      width = 0.4; height = 3.0; depth = 0.4;
      const left = createBlock(width, height, depth, 0x00ff88);
      const right = createBlock(width, height, depth, 0x00ff88);
      left.position.set(x - 1.2, height / 2, z);
      right.position.set(x + 1.2, height / 2, z);
      state.scene.add(left); state.scene.add(right);
      return { mesh: null, meshes: [left, right], x, z, type: 'gate', height, width: 2.4, canSlideUnder: false, canJumpOver: true, passed: false };
    case 'spike':
      width = 1.5; height = 1.2; depth = 1.5;
      mesh = createSpike(width, height, depth);
      canSlideUnder = false;
      canJumpOver = true;
      break;
  }

  if (mesh) {
    mesh.position.set(x, height / 2, z);
    state.scene.add(mesh);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }

  return { mesh, x, z, type, height, width, depth, canSlideUnder, canJumpOver, passed: false };
}

function createBlock(w, h, d, color) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.3,
    metalness: 0.4,
    emissive: color,
    emissiveIntensity: 0.15,
  });
  const mesh = new THREE.Mesh(geo, mat);
  // Add glow edges
  const edges = new THREE.EdgesGeometry(geo);
  const lineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 });
  const lines = new THREE.LineSegments(edges, lineMat);
  mesh.add(lines);
  return mesh;
}

function createSpike(w, h, d) {
  const geo = new THREE.ConeGeometry(w / 2, h, 4);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xff1133,
    roughness: 0.2,
    metalness: 0.6,
    emissive: 0xff1133,
    emissiveIntensity: 0.3,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = Math.PI; // Point down
  return mesh;
}

function createPowerup(lane, baseZ) {
  const x = (lane - 1) * CONFIG.laneWidth;
  const z = baseZ + (Math.random() - 0.5) * CONFIG.segmentLength * 0.8;

  const geo = new THREE.OctahedronGeometry(0.5, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x00ff88,
    roughness: 0.1,
    metalness: 0.8,
    emissive: 0x00ff88,
    emissiveIntensity: 0.8,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, 1.5, z);
  state.scene.add(mesh);
  mesh.castShadow = true;

  // Float animation
  mesh.userData = { baseY: 1.5, phase: Math.random() * Math.PI * 2 };

  return { mesh, x, z, collected: false, type: 'speed' };
}

// ============ UPDATE LOOP ============
function animate() {
  requestAnimationFrame(animate);

  const dt = state.clock.getDelta();
  state.time += dt;

  if (state.running && !state.paused && !state.gameOver) {
    updateGame(dt);
  }

  // Always animate powerups
  animatePowerups(dt);

  // Render
  state.renderer.render(state.scene, state.camera);
}

function updateGame(dt) {
  // Update speed based on distance
  state.speed = Math.min(
    CONFIG.baseSpeed + (state.distance / CONFIG.speedRampDistance) * (CONFIG.maxSpeed - CONFIG.baseSpeed),
    CONFIG.maxSpeed
  );
  state.topSpeed = Math.max(state.topSpeed, state.speed);

  // Move player forward (world moves backward)
  const moveDist = state.speed * dt;
  state.distance += moveDist;
  state.camera.position.z -= moveDist;
  state.sun.position.z -= moveDist;

  // Lane switching
  updateLane(dt);

  // Physics
  updatePhysics(dt);

  // World management
  updateWorld(dt);

  // Collision detection
  checkCollisions();

  // Update UI
  updateHUD();
}

function updateLane(dt) {
  const targetX = (state.targetLane - 1) * CONFIG.laneWidth;
  const lerpSpeed = 12;
  state.camera.position.x += (targetX - state.camera.position.x) * lerpSpeed * dt;
}

function updatePhysics(dt) {
  // Gravity
  state.velocity.y -= CONFIG.gravity * dt;
  state.camera.position.y += state.velocity.y * dt;

  // Ground collision
  const groundY = state.isSliding ? CONFIG.slideHeight : CONFIG.playerHeight;
  if (state.camera.position.y <= groundY) {
    state.camera.position.y = groundY;
    state.velocity.y = 0;
    state.canJump = true;
  }

  // Slide timer
  if (state.isSliding) {
    state.slideTimer -= dt;
    if (state.slideTimer <= 0) {
      state.isSliding = false;
    }
  }

  // Slide cooldown
  if (state.slideCooldownTimer > 0) {
    state.slideCooldownTimer -= dt;
  }
}

function updateWorld(dt) {
  // Move obstacles and powerups with world
  const moveDist = state.speed * dt;

  // Obstacles
  for (let i = state.obstacles.length - 1; i >= 0; i--) {
    const obs = state.obstacles[i];
    obs.z += moveDist;
    if (obs.mesh) obs.mesh.position.z = obs.z;
    else if (obs.meshes) {
      obs.meshes.forEach(m => m.position.z = obs.z);
    }
    // Remove behind player
    if (obs.z > state.camera.position.z + 20) {
      removeObstacle(i);
    }
  }

  // Powerups
  for (let i = state.powerups.length - 1; i >= 0; i--) {
    const pup = state.powerups[i];
    pup.z += moveDist;
    pup.mesh.position.z = pup.z;
    if (pup.z > state.camera.position.z + 20) {
      state.scene.remove(pup.mesh);
      state.powerups.splice(i, 1);
    }
  }

  // Segments - recycle
  for (let i = state.segments.length - 1; i >= 0; i--) {
    const seg = state.segments[i];
    if (seg.z > state.camera.position.z + CONFIG.segmentLength) {
      state.segments.splice(i, 1);
      generateSegment();
    }
  }
}

function animatePowerups(dt) {
  state.powerups.forEach(pup => {
    if (pup.mesh && !pup.collected) {
      pup.mesh.rotation.y += dt * 2;
      pup.mesh.rotation.x += dt * 1.5;
      pup.mesh.position.y = pup.userData.baseY + Math.sin(state.time * 3 + pup.userData.phase) * 0.3;
    }
  });
}

function removeObstacle(index) {
  const obs = state.obstacles[index];
  if (obs.mesh) {
    state.scene.remove(obs.mesh);
    obs.mesh.geometry.dispose();
    obs.mesh.material.dispose();
  } else if (obs.meshes) {
    obs.meshes.forEach(m => {
      state.scene.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    });
  }
  state.obstacles.splice(index, 1);
}

function checkCollisions() {
  const playerBox = new THREE.Box3().setFromCenterAndSize(
    new THREE.Vector3(state.camera.position.x, state.camera.position.y / 2, state.camera.position.z),
    new THREE.Vector3(state.playerRadius * 2, state.camera.position.y, state.playerRadius * 2)
  );

  // Obstacles
  for (const obs of state.obstacles) {
    if (obs.passed) continue;

    let obsBox;
    if (obs.mesh) {
      obsBox = new THREE.Box3().setFromObject(obs.mesh);
    } else if (obs.meshes) {
      // Gate - check both pillars
      for (const m of obs.meshes) {
        const box = new THREE.Box3().setFromObject(m);
        if (playerBox.intersectsBox(box)) {
          hitObstacle(obs);
          return;
        }
      }
      continue;
    }

    if (obsBox && playerBox.intersectsBox(obsBox)) {
      hitObstacle(obs);
      return;
    }

    // Mark as passed
    if (obs.z > state.camera.position.z + 2) {
      obs.passed = true;
    }
  }

  // Powerups
  for (const pup of state.powerups) {
    if (pup.collected) continue;
    const pupBox = new THREE.Box3().setFromObject(pup.mesh);
    if (playerBox.intersectsBox(pupBox)) {
      collectPowerup(pup);
    }
  }
}

function hitObstacle(obs) {
  // Check if we jumped over or slid under
  const playerTop = state.camera.position.y + state.camera.position.y / 2;
  const playerBottom = state.camera.position.y - state.camera.position.y / 2;

  const canClear = (obs.canJumpOver && state.velocity.y > 0 && playerBottom > obs.height * 0.8) ||
                   (obs.canSlideUnder && state.isSliding && playerTop < obs.height * 0.5);

  if (!canClear) {
    gameOver();
  }
}

function collectPowerup(pup) {
  pup.collected = true;
  state.scene.remove(pup.mesh);
  pup.mesh.geometry.dispose();
  pup.mesh.material.dispose();
  // Speed boost
  state.speed = Math.min(state.speed * 1.3, CONFIG.maxSpeed);
  // Visual feedback
  state.elements.crosshair.style.boxShadow = '0 0 24px var(--accent-glow)';
  setTimeout(() => {
    state.elements.crosshair.style.boxShadow = '0 0 8px var(--accent-glow)';
  }, 200);
}

function gameOver() {
  state.running = false;
  state.gameOver = true;
  state.controls.unlock();
  saveBestDistance();

  const isNewRecord = state.distance > state.bestDistance;

  state.elements.finalDistance.textContent = formatDistance(state.distance);
  state.elements.finalSpeed.textContent = state.topSpeed.toFixed(1);
  state.elements.finalTime.textContent = formatTime(state.time);
  state.elements.newRecord.hidden = !isNewRecord;

  showScreen(state.elements.gameoverScreen);
}

function formatDistance(m) {
  if (m < 1000) return `${Math.floor(m)}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

function formatTime(s) {
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ============ UI ============
function setupUI() {
  state.clock = new THREE.Clock();
  state.raycaster = new THREE.Raycaster();
}

function hideLoading() {
  state.elements.loading.classList.add('hidden');
}

function showStartScreen() {
  state.elements.bestDisplay.style.display = state.bestDistance > 0 ? 'inline-flex' : 'none';
  state.elements.controlsHint.style.display = 'grid';
  state.elements.mobileHint.style.display = 'block';
  showScreen(state.elements.startScreen);
}

function startGame() {
  hideAllScreens();
  resetGame();
  state.running = true;
  state.paused = false;
  state.gameOver = false;
  state.clock.start();
  state.controls.lock();
}

function resetGame() {
  state.distance = 0;
  state.speed = CONFIG.baseSpeed;
  state.time = 0;
  state.topSpeed = 0;
  state.velocity.set(0, 0, 0);
  state.canJump = true;
  state.isSliding = false;
  state.slideTimer = 0;
  state.slideCooldownTimer = 0;
  state.targetLane = 1;
  state.currentLane = 1;
  state.camera.position.set(0, CONFIG.playerHeight, 10);
  state.camera.rotation.set(0, 0, 0);

  // Clear obstacles/powerups
  state.obstacles.forEach(obs => {
    if (obs.mesh) { state.scene.remove(obs.mesh); obs.mesh.geometry.dispose(); obs.mesh.material.dispose(); }
    else if (obs.meshes) { obs.meshes.forEach(m => { state.scene.remove(m); m.geometry.dispose(); m.material.dispose(); }); }
  });
  state.powerups.forEach(pup => {
    state.scene.remove(pup.mesh);
    pup.mesh.geometry.dispose();
    pup.mesh.material.dispose();
  });
  state.obstacles = [];
  state.powerups = [];
  state.segments = [];
  state.nextSegmentZ = -CONFIG.segmentLength * 2;
  generateInitialSegments();

  updateHUD();
}

function pauseGame() {
  state.paused = true;
  state.running = false;
  state.controls.unlock();
  state.elements.pauseDistance.textContent = `Distance: ${formatDistance(state.distance)}`;
  showScreen(state.elements.pauseMenu);
}

function resumeGame() {
  hideScreen(state.elements.pauseMenu);
  state.paused = false;
  state.running = true;
  state.clock.start();
  state.controls.lock();
}

function returnToMenu() {
  hideAllScreens();
  state.running = false;
  state.paused = false;
  state.gameOver = false;
  state.controls.unlock();
  resetGame();
  showStartScreen();
}

function showScreen(screen) {
  screen.classList.remove('hidden');
}

function hideScreen(screen) {
  screen.classList.add('hidden');
}

function hideAllScreens() {
  [state.elements.startScreen, state.elements.pauseMenu, state.elements.gameoverScreen].forEach(s => s.classList.add('hidden'));
}

function updateHUD() {
  state.elements.distanceEl.textContent = formatDistance(state.distance);
  state.elements.speedEl.textContent = state.speed.toFixed(1);
  state.elements.bestEl.textContent = formatDistance(state.bestDistance);
}

// ============ INIT ============
init().catch(console.error);