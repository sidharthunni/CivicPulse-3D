/**
 * CivicPulse 3D - 3D Urban Spatial Digital Twin Engine
 * Built with Three.js (WebGL)
 * Features procedural urban infrastructure, elevation topography,
 * dynamic flood plane, and interactive 3D incident beacons.
 */

class TwinEngine {
  constructor(canvasContainerId) {
    this.container = document.getElementById(canvasContainerId);
    if (!this.container) throw new Error("Container not found");

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.beacons = [];
    this.beaconGroup = new THREE.Group();
    this.buildingsGroup = new THREE.Group();
    this.roadsGroup = new THREE.Group();
    this.waterMesh = null;
    this.baseWaterLevel = -0.4;
    this.currentWaterRise = 0.0;

    this.animTime = 0;
    this.selectedIncidentId = null;
    this.isTransitioningCamera = false;

    this.init();
  }

  init() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    // 1. Scene & Atmosphere
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060913); // Deep cyber-navy
    this.scene.fog = new THREE.FogExp2(0x060913, 0.0035);

    // 2. Camera
    this.camera = new THREE.PerspectiveCamera(50, width / height, 1, 2000);
    this.camera.position.set(160, 140, 190);

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.container.appendChild(this.renderer.domElement);

    // 4. Orbit Controls
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05; // Prevent dipping below ground
    this.controls.minDistance = 25;
    this.controls.maxDistance = 550;
    this.controls.target.set(0, 5, 0);

    // 5. Lighting
    this.setupLighting();

    // 6. Terrain, Roads & Volumetric City
    this.buildTerrain();
    this.buildWaterway();
    this.buildRoadNetwork();
    this.buildProceduralCity();

    // 7. Beacons
    this.scene.add(this.beaconGroup);
    this.renderIncidentBeacons();

    // 8. Event Listeners
    window.addEventListener("resize", () => this.onWindowResize());
    this.renderer.domElement.addEventListener("click", (e) => this.onPointerClick(e));
    this.renderer.domElement.addEventListener("mousemove", (e) => this.onPointerMove(e));

    // Listen to store updates
    window.addEventListener("civicpulse:incidentAdded", () => this.renderIncidentBeacons());
    window.addEventListener("civicpulse:incidentUpdated", () => this.renderIncidentBeacons());

    // 9. Start Loop
    this.animate();
  }

  setupLighting() {
    // Ambient soft fill
    const ambient = new THREE.AmbientLight(0x1a263f, 1.4);
    this.scene.add(ambient);

    // Main directional sunlight / moonlight
    const dirLight = new THREE.DirectionalLight(0x7dd3fc, 1.8);
    dirLight.position.set(120, 200, 100);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 10;
    dirLight.shadow.camera.far = 600;
    dirLight.shadow.camera.left = -200;
    dirLight.shadow.camera.right = 200;
    dirLight.shadow.camera.top = 200;
    dirLight.shadow.camera.bottom = -200;
    this.scene.add(dirLight);

    // Warm municipal highlight light
    const municipalLight = new THREE.DirectionalLight(0x38bdf8, 0.9);
    municipalLight.position.set(-150, 100, -100);
    this.scene.add(municipalLight);

    // Under-glow for cyber spatial look
    const hemiLight = new THREE.HemisphereLight(0x0f172a, 0x0284c7, 0.6);
    this.scene.add(hemiLight);
  }

  buildTerrain() {
    // Topographical terrain with river depression & hillside elevation
    const size = 480;
    const segments = 120;
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);

      // River depression through center
      let y = 0;
      const riverDist = Math.abs(x * 0.4 + z * 0.9 - 10);
      if (riverDist < 35) {
        y -= Math.cos((riverDist / 35) * Math.PI * 0.5) * 4.5;
      }

      // Hillside elevation towards northeast (Kunnamangalam ridge)
      if (x > 30 && z < 20) {
        const hillFactor = ((x - 30) / 180) * ((20 - z) / 200);
        y += Math.max(0, hillFactor * 32);
      }

      // Subtle natural land undulation
      y += Math.sin(x * 0.03) * Math.cos(z * 0.03) * 1.2;
      pos.setY(i, y);
    }
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: 0x0b1329,
      roughness: 0.85,
      metalness: 0.15,
      wireframe: false,
      flatShading: true
    });

    const terrain = new THREE.Mesh(geometry, material);
    terrain.receiveShadow = true;
    this.scene.add(terrain);

    // Add secondary wireframe grid overlay for tactical digital twin aesthetic
    const gridHelper = new THREE.GridHelper(size, 48, 0x1e3a8a, 0x0f2757);
    gridHelper.position.y = 0.05;
    this.scene.add(gridHelper);
  }

  buildWaterway() {
    // Dynamic Inundation Water Plane
    const waterGeo = new THREE.PlaneGeometry(480, 480, 64, 64);
    waterGeo.rotateX(-Math.PI / 2);

    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.72,
      roughness: 0.1,
      metalness: 0.85
    });

    this.waterMesh = new THREE.Mesh(waterGeo, waterMat);
    this.waterMesh.position.y = this.baseWaterLevel;
    this.scene.add(this.waterMesh);
  }

  buildRoadNetwork() {
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.9,
      metalness: 0.1
    });

    const markingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.7
    });

    // 1. National Highway Arterial (West to East)
    const nhGeo = new THREE.PlaneGeometry(16, 440);
    nhGeo.rotateX(-Math.PI / 2);
    const nhRoad = new THREE.Mesh(nhGeo, roadMat);
    nhRoad.position.set(0, 0.15, 0);
    nhRoad.receiveShadow = true;
    this.roadsGroup.add(nhRoad);

    // Road dashed markings
    const lineGeo = new THREE.PlaneGeometry(0.8, 440);
    lineGeo.rotateX(-Math.PI / 2);
    const centerLine = new THREE.Mesh(lineGeo, markingMat);
    centerLine.position.set(0, 0.18, 0);
    this.roadsGroup.add(centerLine);

    // 2. Coastal Avenue (North to South along West coast)
    const coastGeo = new THREE.PlaneGeometry(440, 14);
    coastGeo.rotateX(-Math.PI / 2);
    const coastRoad = new THREE.Mesh(coastGeo, roadMat);
    coastRoad.position.set(0, 0.15, -80);
    coastRoad.receiveShadow = true;
    this.roadsGroup.add(coastRoad);

    // 3. Diagonal Connector (Mavoor Road corridor)
    const diagGeo = new THREE.PlaneGeometry(12, 380);
    diagGeo.rotateX(-Math.PI / 2);
    diagGeo.rotateY(Math.PI / 4);
    const diagRoad = new THREE.Mesh(diagGeo, roadMat);
    diagRoad.position.set(30, 0.16, 10);
    this.roadsGroup.add(diagRoad);

    this.scene.add(this.roadsGroup);
  }

  buildProceduralCity() {
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);

    // Base building materials with cyber windows
    const buildingPalette = [
      new THREE.MeshStandardMaterial({ color: 0x172554, roughness: 0.4, metalness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5, metalness: 0.6 }),
      new THREE.MeshStandardMaterial({ color: 0x1e1b4b, roughness: 0.3, metalness: 0.8 }),
      new THREE.MeshStandardMaterial({ color: 0x022c22, roughness: 0.4, metalness: 0.6 })
    ];

    // Seeded procedural buildings in urban grids
    const zones = [
      { startX: -140, endX: -40, startZ: -140, endZ: -40, heightRange: [12, 45], density: 36 }, // Commercial District
      { startX: 20, endX: 120, startZ: -40, endZ: 60, heightRange: [8, 28], density: 42 },     // Mixed Urban Corridor
      { startX: -130, endX: -30, startZ: 30, endZ: 130, heightRange: [6, 20], density: 30 },    // Residential / Harbor
      { startX: 70, endX: 150, startZ: -130, endZ: -60, heightRange: [14, 38], density: 24 }    // Tech / Institutional Zone
    ];

    zones.forEach(zone => {
      for (let i = 0; i < zone.density; i++) {
        const x = zone.startX + Math.random() * (zone.endX - zone.startX);
        const z = zone.startZ + Math.random() * (zone.endZ - zone.startZ);

        // Keep roads clear
        if (Math.abs(x) < 14 || Math.abs(z + 80) < 12) continue;

        const w = 6 + Math.random() * 8;
        const d = 6 + Math.random() * 8;
        const h = zone.heightRange[0] + Math.random() * (zone.heightRange[1] - zone.heightRange[0]);

        const mat = buildingPalette[Math.floor(Math.random() * buildingPalette.length)];
        const b = new THREE.Mesh(boxGeo, mat);
        b.scale.set(w, h, d);
        b.position.set(x, h / 2, z);
        b.castShadow = true;
        b.receiveShadow = true;
        this.buildingsGroup.add(b);

        // Roof antenna or beacon on tall buildings
        if (h > 30) {
          const beaconGeo = new THREE.CylinderGeometry(0.2, 0.4, 4, 8);
          const beaconMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
          const mast = new THREE.Mesh(beaconGeo, beaconMat);
          mast.position.set(x, h + 2, z);
          this.buildingsGroup.add(mast);
        }
      }
    });

    this.scene.add(this.buildingsGroup);
  }

  renderIncidentBeacons() {
    // Clear existing beacons
    while (this.beaconGroup.children.length > 0) {
      const obj = this.beaconGroup.children[0];
      this.beaconGroup.remove(obj);
    }
    this.beacons = [];

    const incidents = window.CivicStore.getAll();

    incidents.forEach(inc => {
      const color = this.getSeverityColor(inc.severity, inc.status);

      // Beacon parent container
      const group = new THREE.Group();
      group.position.set(inc.x, inc.y, inc.z);
      group.userData = { incident: inc };

      // 1. Floating Hologram Diamond / Octahedron
      const octaGeo = new THREE.OctahedronGeometry(2.4, 0);
      const octaMat = new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 0.8,
        roughness: 0.2,
        metalness: 0.9,
        wireframe: false
      });
      const diamond = new THREE.Mesh(octaGeo, octaMat);
      diamond.position.y = 8;
      group.add(diamond);

      // 2. Vertical Light Column / Beacon Ray
      const cylinderGeo = new THREE.CylinderGeometry(0.2, 0.6, 12, 12);
      const cylinderMat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.45
      });
      const beam = new THREE.Mesh(cylinderGeo, cylinderMat);
      beam.position.y = 4;
      group.add(beam);

      // 3. Ground Radar Pulse Ring
      const ringGeo = new THREE.RingGeometry(1.2, 3.2, 32);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.2;
      group.add(ring);

      this.beaconGroup.add(group);
      this.beacons.push({ group, diamond, ring, incident: inc, baseColor: color });
    });
  }

  getSeverityColor(severity, status) {
    if (status === "resolved") return 0x10b981; // Emerald
    switch (severity) {
      case "critical": return 0xef4444; // Crimson Red
      case "high": return 0xf59e0b;     // Amber
      case "medium": return 0x3b82f6;   // Royal Blue
      default: return 0x06b6d4;         // Cyan
    }
  }

  setFloodRise(meters) {
    this.currentWaterRise = meters;
    if (this.waterMesh) {
      // Dynamic water elevation: base level + meters scale
      this.waterMesh.position.y = this.baseWaterLevel + meters * 1.1;
      this.waterMesh.material.opacity = Math.min(0.88, 0.65 + meters * 0.03);
    }
  }

  flyToIncident(id) {
    const inc = window.CivicStore.getById(id);
    if (!inc) return;

    this.selectedIncidentId = id;

    // Smooth camera tween
    const targetPos = new THREE.Vector3(inc.x, inc.y + 4, inc.z);
    const cameraPos = new THREE.Vector3(inc.x + 35, inc.y + 28, inc.z + 40);

    this.smoothCameraTransition(cameraPos, targetPos, 1200);
    this.highlightBeacon(id);

    // Dispatch event for HUD to display inspector card
    window.dispatchEvent(new CustomEvent("civicpulse:selectIncident", { detail: inc }));
  }

  setCameraPreset(presetName) {
    switch (presetName) {
      case "overview":
        this.smoothCameraTransition(new THREE.Vector3(160, 140, 190), new THREE.Vector3(0, 5, 0));
        break;
      case "coastal":
        this.smoothCameraTransition(new THREE.Vector3(-140, 45, 60), new THREE.Vector3(-85, 4, 15));
        break;
      case "mavoor":
        this.smoothCameraTransition(new THREE.Vector3(65, 38, -10), new THREE.Vector3(42, 2, -35));
        break;
      case "kunnamangalam":
        this.smoothCameraTransition(new THREE.Vector3(150, 60, -40), new THREE.Vector3(110, 10, -80));
        break;
      case "pedestrian":
        this.smoothCameraTransition(new THREE.Vector3(15, 8, 25), new THREE.Vector3(10, 3, 5));
        break;
    }
  }

  smoothCameraTransition(targetCamPos, targetControlsTarget, duration = 1000) {
    const startCamPos = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    const startTime = performance.now();

    const animateTransition = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const ease = 1 - Math.pow(1 - progress, 3);

      this.camera.position.lerpVectors(startCamPos, targetCamPos, ease);
      this.controls.target.lerpVectors(startTarget, targetControlsTarget, ease);
      this.controls.update();

      if (progress < 1) {
        requestAnimationFrame(animateTransition);
      }
    };
    requestAnimationFrame(animateTransition);
  }

  highlightBeacon(id) {
    this.beacons.forEach(b => {
      if (b.incident.id === id) {
        b.diamond.scale.set(1.6, 1.6, 1.6);
        b.diamond.material.emissiveIntensity = 1.5;
      } else {
        b.diamond.scale.set(1, 1, 1);
        b.diamond.material.emissiveIntensity = 0.8;
      }
    });
  }

  onPointerClick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.beaconGroup.children, true);

    if (intersects.length > 0) {
      let topObj = intersects[0].object;
      while (topObj.parent && topObj.parent !== this.beaconGroup) {
        topObj = topObj.parent;
      }
      if (topObj.userData && topObj.userData.incident) {
        this.flyToIncident(topObj.userData.incident.id);
      }
    }
  }

  onPointerMove(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.beaconGroup.children, true);
    this.renderer.domElement.style.cursor = intersects.length > 0 ? "pointer" : "default";
  }

  triggerSubsurfaceScan(id) {
    const inc = window.CivicStore.getById(id);
    if (!inc) return;

    if (this.subsurfaceScanGroup) {
      this.scene.remove(this.subsurfaceScanGroup);
    }

    this.subsurfaceScanGroup = new THREE.Group();
    this.subsurfaceScanGroup.position.set(inc.x, inc.y, inc.z);

    // Subsurface inspection wireframe grid
    const boxGeo = new THREE.BoxGeometry(18, 14, 18);
    const wireframeMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.75
    });
    const scanBox = new THREE.Mesh(boxGeo, wireframeMat);
    scanBox.position.y = -7;
    this.subsurfaceScanGroup.add(scanBox);

    // Subterranean ruptured pipeline visual (KWA water main)
    const pipeGeo = new THREE.CylinderGeometry(1.4, 1.4, 20, 16);
    pipeGeo.rotateZ(Math.PI / 2);
    const pipeMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xef4444,
      emissiveIntensity: 0.9,
      roughness: 0.3
    });
    const subPipe = new THREE.Mesh(pipeGeo, pipeMat);
    subPipe.position.set(0, -6, 0);
    this.subsurfaceScanGroup.add(subPipe);

    this.scene.add(this.subsurfaceScanGroup);

    // Transition camera to subsurface perspective
    const targetCamPos = new THREE.Vector3(inc.x + 24, inc.y + 16, inc.z + 24);
    const targetLookAt = new THREE.Vector3(inc.x, inc.y - 4, inc.z);
    this.smoothCameraTransition(targetCamPos, targetLookAt, 900);
  }

  onWindowResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.animTime += 0.025;

    // Pulse and animate beacons
    this.beacons.forEach((b, idx) => {
      // Rotation
      b.diamond.rotation.y += 0.02;
      b.diamond.rotation.x = Math.sin(this.animTime + idx) * 0.15;

      // Bobbing floating motion
      b.diamond.position.y = 7.5 + Math.sin(this.animTime * 1.5 + idx) * 0.8;

      // Radar ring expansion
      const ringScale = 1.0 + ((this.animTime * 0.8 + idx * 0.5) % 2.0);
      b.ring.scale.set(ringScale, ringScale, ringScale);
      b.ring.material.opacity = Math.max(0, 0.8 - (ringScale - 1.0) * 0.7);
    });

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

window.TwinEngine = TwinEngine;
