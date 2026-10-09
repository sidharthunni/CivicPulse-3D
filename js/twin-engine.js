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
    this.campusGroup = new THREE.Group();
    this.evacuationGroup = new THREE.Group();
    this.roadsGroup = new THREE.Group();
    this.waterMesh = null;
    this.baseWaterLevel = -0.4;
    this.currentWaterRise = 0.0;
    this.evacuationActive = false;
    this.evacTubeMesh = null;

    this.animTime = 0;
    this.selectedIncidentId = null;
    this.isTransitioningCamera = false;
    this.landmarkMeshes = [];
    this.landmarkMeasurementGroup = new THREE.Group();
    this.liveGpsMesh = null;

    this.init();
  }

  init() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    // 1. Scene & Atmosphere
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060913); // Deep cyber-navy
    // Linear distant fog starting at 600m ensures zero dimming when orbiting or zooming
    this.scene.fog = new THREE.Fog(0x060913, 600, 1800);

    // 2. Camera (Initially focused directly on NIT Calicut Campus)
    this.camera = new THREE.PerspectiveCamera(50, width / height, 1, 2000);
    this.camera.position.set(130, 44, -22);

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.container.appendChild(this.renderer.domElement);

    // 4. Orbit Controls (Targeting NIT Calicut Admin & Gandhi Circle)
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05; // Prevent dipping below ground
    this.controls.minDistance = 25;
    this.controls.maxDistance = 550;
    this.controls.target.set(105, 14, -75);

    // 5. Lighting
    this.setupLighting();

    // 6. Terrain, Roads & Volumetric City
    this.buildTerrain();
    this.buildWaterway();
    this.buildRoadNetwork();
    this.buildProceduralCity();
    this.buildNITCalicutCampus();

    // 7. Beacons & Spatial Overlays
    this.scene.add(this.campusGroup);
    this.scene.add(this.evacuationGroup);
    this.scene.add(this.beaconGroup);
    this.scene.add(this.landmarkMeasurementGroup);
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
    // 1. Crisp balanced ambient fill (illuminates all shadow sides cleanly)
    const ambient = new THREE.AmbientLight(0xffffff, 1.25);
    this.scene.add(ambient);

    // 2. Sky-Ground Hemisphere Light
    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x1e293b, 0.95);
    this.scene.add(hemiLight);

    // 3. Primary Key Sunlight
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.6);
    dirLight.position.set(160, 240, 130);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 10;
    dirLight.shadow.camera.far = 800;
    dirLight.shadow.camera.left = -320;
    dirLight.shadow.camera.right = 320;
    dirLight.shadow.camera.top = 320;
    dirLight.shadow.camera.bottom = -320;
    this.scene.add(dirLight);

    // 4. Fill Directional Light (illuminates opposing faces so rotation never dims)
    const fillLight = new THREE.DirectionalLight(0x93c5fd, 1.1);
    fillLight.position.set(-160, 160, -140);
    this.scene.add(fillLight);

    // 5. Frontal Accent / Rim Light
    const accentLight = new THREE.DirectionalLight(0x38bdf8, 0.7);
    accentLight.position.set(0, 150, 200);
    this.scene.add(accentLight);
  }

  getTerrainHeight(x, z) {
    let y = 0;
    const riverDist = Math.abs(x * 0.4 + z * 0.9 - 10);
    if (riverDist < 35) {
      y -= Math.cos((riverDist / 35) * Math.PI * 0.5) * 4.5;
    }
    if (x > 30 && z < 20) {
      const hillFactor = ((x - 30) / 180) * ((20 - z) / 200);
      y += Math.max(0, hillFactor * 32);
    }
    y += Math.sin(x * 0.03) * Math.cos(z * 0.03) * 1.2;
    return y;
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
      pos.setY(i, this.getTerrainHeight(x, z));
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
    // Dynamic Topographical Floodwater Mesh conforming to river valley & low-lying basins
    const size = 520;
    const segments = 100;
    this.waterGeo = new THREE.PlaneGeometry(size, size, segments, segments);
    this.waterGeo.rotateX(-Math.PI / 2);

    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.15,
      metalness: 0.75,
      transparent: true,
      opacity: 0.85
    });

    this.waterMesh = new THREE.Mesh(this.waterGeo, waterMat);
    this.scene.add(this.waterMesh);

    this.baseWaterLevel = -1.2;
    this.currentWaterRise = 0.0;
    this.updateWaterGeometry(0);
  }

  updateWaterGeometry(time = 0) {
    if (!this.waterMesh || !this.waterGeo) return;
    const pos = this.waterGeo.attributes.position;
    // Physical flood elevation: starts within natural river gorge (-1.2m), overflows with monsoon inundation
    const waterSurfaceY = this.baseWaterLevel + this.currentWaterRise * 0.95;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      // Fluid wave oscillation
      const wave = Math.sin(x * 0.06 + time * 1.8) * 0.12 + Math.cos(z * 0.06 + time * 1.4) * 0.09;
      pos.setY(i, waterSurfaceY + wave);
    }
    pos.needsUpdate = true;
    this.waterGeo.computeVertexNormals();
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

    // Kerala low-rise regional materials (white wash, laterite trim, terracotta accents, slate grey)
    const buildingPalette = [
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.7, metalness: 0.1 }),
      new THREE.MeshStandardMaterial({ color: 0xcfd8dc, roughness: 0.65, metalness: 0.1 }),
      new THREE.MeshStandardMaterial({ color: 0xd7ccc8, roughness: 0.8, metalness: 0.05 }),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.6, metalness: 0.15 })
    ];

    // Seeded procedural buildings in western Chathamangalam / suburban sector (x <= -55)
    // Authentic minimal Kerala heights: 1-2 storeys (3.5m to 8.5m), zero skyscrapers!
    const zones = [
      { startX: -140, endX: -55, startZ: -140, endZ: -40, heightRange: [4.0, 8.5], density: 22 }, // Western Town / Local Commercial (1-2 storeys)
      { startX: -130, endX: -55, startZ: 30, endZ: 130, heightRange: [3.2, 6.8], density: 18 }     // Lowland Village Dwellings (1-2 storeys)
    ];

    zones.forEach(zone => {
      for (let i = 0; i < zone.density; i++) {
        const x = zone.startX + Math.random() * (zone.endX - zone.startX);
        const z = zone.startZ + Math.random() * (zone.endZ - zone.startZ);

        // Keep roads clear
        if (Math.abs(x) < 14 || Math.abs(z + 80) < 12) continue;
        if (x >= -50) continue; // Guarantee eastern campus sector has zero procedural buildings

        const w = 5 + Math.random() * 6;
        const d = 5 + Math.random() * 6;
        const h = zone.heightRange[0] + Math.random() * (zone.heightRange[1] - zone.heightRange[0]);
        const y = this.getTerrainHeight(x, z);

        const mat = buildingPalette[Math.floor(Math.random() * buildingPalette.length)];
        const b = new THREE.Mesh(boxGeo, mat);
        b.scale.set(w, h, d);
        b.position.set(x, y + h / 2, z);
        b.castShadow = true;
        b.receiveShadow = true;
        this.buildingsGroup.add(b);

        // Subtle pitched terracotta roof for authentic Kerala regional architecture
        const roofGeo = new THREE.ConeGeometry(Math.max(w, d) * 0.7, 1.8, 4);
        roofGeo.rotateY(Math.PI / 4);
        const roofMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.75 });
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.position.set(x, y + h + 0.9, z);
        roof.castShadow = true;
        this.buildingsGroup.add(roof);
      }
    });

    this.scene.add(this.buildingsGroup);
  }

  registerLandmarkMesh(mesh, landmarkData) {
    if (!mesh) return;
    mesh.userData = mesh.userData || {};
    mesh.userData.landmark = landmarkData;
    this.landmarkMeshes.push(mesh);
  }

  createCampusTag(label, x, y, z, color = "#38bdf8", targetGroup = null, stemHeight = 4.5) {
    const group = targetGroup || this.campusGroup;

    // Anchor stem line from apex up to floating badge
    if (stemHeight > 0) {
      const stemGeo = new THREE.CylinderGeometry(0.08, 0.08, stemHeight, 6);
      const stemMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.7 });
      const stemMesh = new THREE.Mesh(stemGeo, stemMat);
      stemMesh.position.set(x, y - stemHeight / 2, z);
      group.add(stemMesh);

      // Apex anchor dot
      const dotGeo = new THREE.SphereGeometry(0.35, 8, 8);
      const dotMat = new THREE.MeshBasicMaterial({ color: color });
      const dotMesh = new THREE.Mesh(dotGeo, dotMat);
      dotMesh.position.set(x, y - stemHeight, z);
      group.add(dotMesh);
    }

    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 110;
    const ctx = canvas.getContext("2d");

    // Sleek modern GIS pill badge
    ctx.fillStyle = "rgba(11, 19, 41, 0.92)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(8, 8, 496, 94, 20);
    } else {
      ctx.rect(8, 8, 496, 94);
    }
    ctx.fill();
    ctx.stroke();

    // Text label
    ctx.font = "bold 26px 'JetBrains Mono', 'Segoe UI', monospace";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 256, 55);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: true
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.set(x, y, z);
    sprite.scale.set(11, 2.6, 1);
    group.add(sprite);
    return sprite;
  }

  buildNITCalicutCampus() {
    // Clear previous campus objects & landmarks
    while (this.campusGroup.children.length > 0) {
      this.campusGroup.remove(this.campusGroup.children[0]);
    }
    this.landmarkMeshes = [];

    // High quality authentic architectural materials
    const adminMat = new THREE.MeshStandardMaterial({ color: 0xd6cfc4, roughness: 0.65, metalness: 0.1 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.4 });
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25, metalness: 0.1 });
    const glassCyanMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.15, metalness: 0.85, transparent: true, opacity: 0.82 });
    const cccGlassMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.15, metalness: 0.9, transparent: true, opacity: 0.88 });
    const academicMat = new THREE.MeshStandardMaterial({ color: 0xc8c3ba, roughness: 0.7, metalness: 0.15 });
    const workshopMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.6, metalness: 0.4 });
    const hostelMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.5, metalness: 0.2 });
    const lawnMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.85, metalness: 0.05 });
    const trackMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.8, metalness: 0.1 });
    const asphaltMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8, metalness: 0.1 });
    const houseWallMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.6, metalness: 0.1 });
    const boundaryWallMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.7, metalness: 0.15 });
    const treeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
    const treeFoliageMat = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.8 });

    // 1. Campus Internal Road Network (Straight Axial Rajpath & Link Avenues)
    const roads = [
      { x: 105, z: -40, w: 12, l: 44 },   // Main Entrance Avenue (Rajpath) straight from Gate (z=-18) to Gandhi Circle (z=-62)
      { x: 105, z: -62, w: 32, l: 32, isRoundabout: true }, // Gandhi Circle roundabout
      { x: 105, z: -75, w: 10, l: 24 },   // Admin Block approach driveway
      { x: 138, z: -62, w: 52, l: 9 },    // East avenue to Central Library & Mega Hostels
      { x: 72, z: -62, w: 50, l: 9 },     // West avenue to CCC & Sports Ground
      { x: 140, z: -98, w: 9, l: 64 },    // North-East avenue to Engineering Quadrangle (CSE/Mech/Civil)
      { x: 65, z: -98, w: 9, l: 64 }      // North-West avenue to Athletic Ground & OAT
    ];

    roads.forEach(r => {
      const ry = this.getTerrainHeight(r.x, r.z) + 0.15;
      if (r.isRoundabout) {
        const ringGeo = new THREE.RingGeometry(11.5, 17, 32);
        ringGeo.rotateX(-Math.PI / 2);
        const ringMesh = new THREE.Mesh(ringGeo, asphaltMat);
        ringMesh.position.set(r.x, ry, r.z);
        ringMesh.receiveShadow = true;
        this.campusGroup.add(ringMesh);
      } else {
        const roadGeo = new THREE.PlaneGeometry(r.w, r.l);
        roadGeo.rotateX(-Math.PI / 2);
        const roadMesh = new THREE.Mesh(roadGeo, asphaltMat);
        roadMesh.position.set(r.x, ry, r.z);
        roadMesh.receiveShadow = true;
        this.campusGroup.add(roadMesh);
      }
    });

    // 2. Main Gate & Kattangal Entrance Arch (Directly on the Central Axis x = 105, z = -18)
    const gateX = 105;
    const gateZ = -18;
    const gateY = this.getTerrainHeight(gateX, gateZ);

    const gateLandmark = {
      id: "main_gate",
      name: "NIT Calicut Main Gate & Kattangal Entrance",
      category: "Perimeter Security & Transit Gate",
      dimensions: "17.5m Span x 2.4m Depth x 6.8m Height",
      storeys: "Entrance Gateway & Dual Security Lodges",
      height: 6.8,
      coords: { x: gateX, y: gateY, z: gateZ },
      elevationMSL: "+12.2m MSL",
      slope: "2.4 deg (Gradual Incline)",
      floodSafety: "ACCESSIBLE // +7.2m above 100-Yr Flood Level",
      description: "Primary campus entrance gateway connecting to Mukkam Highway (SH 34) and Kattangal junction."
    };

    const pGeo = new THREE.BoxGeometry(2.2, 6.8, 2.2);
    // Left Pillar (Western side)
    const leftP = new THREE.Mesh(pGeo, trimMat);
    leftP.position.set(gateX - 7.5, gateY + 3.4, gateZ);
    this.campusGroup.add(leftP);
    this.registerLandmarkMesh(leftP, gateLandmark);

    // Right Pillar (Eastern side)
    const rightP = new THREE.Mesh(pGeo, trimMat);
    rightP.position.set(gateX + 7.5, gateY + 3.4, gateZ);
    this.campusGroup.add(rightP);
    this.registerLandmarkMesh(rightP, gateLandmark);

    // Grand Arch Spanning the Gate across East-West
    const archBeam = new THREE.Mesh(new THREE.BoxGeometry(17.5, 1.4, 2.4), adminMat);
    archBeam.position.set(gateX, gateY + 7.2, gateZ);
    this.campusGroup.add(archBeam);
    this.registerLandmarkMesh(archBeam, gateLandmark);

    // West Security Gate Cabin
    const securityCabinWest = new THREE.Mesh(new THREE.BoxGeometry(4.5, 3.4, 4.5), houseWallMat);
    securityCabinWest.position.set(gateX - 11.5, gateY + 1.7, gateZ);
    this.campusGroup.add(securityCabinWest);
    this.registerLandmarkMesh(securityCabinWest, gateLandmark);

    // East Security Gate Cabin
    const securityCabinEast = new THREE.Mesh(new THREE.BoxGeometry(4.5, 3.4, 4.5), houseWallMat);
    securityCabinEast.position.set(gateX + 11.5, gateY + 1.7, gateZ);
    this.campusGroup.add(securityCabinEast);
    this.registerLandmarkMesh(securityCabinEast, gateLandmark);

    // Formal NIT Calicut Perimeter Boundary Walls (replacing cluttered toy stalls)
    const wallWest = new THREE.Mesh(new THREE.BoxGeometry(75, 2.2, 0.6), boundaryWallMat);
    wallWest.position.set(gateX - 51.5, gateY + 1.1, gateZ);
    this.campusGroup.add(wallWest);

    const wallEast = new THREE.Mesh(new THREE.BoxGeometry(75, 2.2, 0.6), boundaryWallMat);
    wallEast.position.set(gateX + 51.5, gateY + 1.1, gateZ);
    this.campusGroup.add(wallEast);

    // Decorative coping on boundary walls
    const copingWest = new THREE.Mesh(new THREE.BoxGeometry(75.2, 0.25, 0.85), trimMat);
    copingWest.position.set(gateX - 51.5, gateY + 2.3, gateZ);
    this.campusGroup.add(copingWest);

    const copingEast = new THREE.Mesh(new THREE.BoxGeometry(75.2, 0.25, 0.85), trimMat);
    copingEast.position.set(gateX + 51.5, gateY + 2.3, gateZ);
    this.campusGroup.add(copingEast);

    this.createCampusTag("MAIN GATE & KATTANGAL ENTRANCE", gateX, gateY + 10, gateZ, "#10b981", null, 3.5);

    // 3. Gandhi Circle Roundabout, National Flagpole & Live Civilian GPS Hub
    const circleX = 105;
    const circleZ = -62;
    const circleY = this.getTerrainHeight(circleX, circleZ);

    const circleLandmark = {
      id: "gandhi_circle",
      name: "Gandhi Circle & National Flagpole",
      category: "Campus Monument / Ceremonial Hub",
      dimensions: "22.0m Diameter Roundabout // 14.0m Mast",
      storeys: "Monumental Apex (Your Live GPS Location)",
      height: 14.0,
      coords: { x: circleX, y: circleY, z: circleZ },
      elevationMSL: "+14.8m MSL",
      slope: "0.5 deg (Flat Roundabout)",
      floodSafety: "SAFE // +9.8m above 100-Yr Flood Level",
      description: "Ceremonial core of NIT Calicut with the national tricolour flagpole. Your Live GPS location."
    };

    const circleLawn = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 0.4, 32), lawnMat);
    circleLawn.position.set(circleX, circleY + 0.2, circleZ);
    circleLawn.receiveShadow = true;
    this.campusGroup.add(circleLawn);
    this.registerLandmarkMesh(circleLawn, circleLandmark);

    const flagMast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 14, 16), pillarMat);
    flagMast.position.set(circleX, circleY + 7.2, circleZ);
    flagMast.castShadow = true;
    this.campusGroup.add(flagMast);
    this.registerLandmarkMesh(flagMast, circleLandmark);

    const flagMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 2.2), new THREE.MeshBasicMaterial({ color: 0xf97316, side: THREE.DoubleSide }));
    flagMesh.position.set(circleX + 1.8, circleY + 13, circleZ);
    this.campusGroup.add(flagMesh);
    this.registerLandmarkMesh(flagMesh, circleLandmark);

    // Dedicated Live GPS Civilian Pin Indicator at Gandhi Circle
    const gpsDiscGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.2, 24);
    const gpsDiscMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
    const gpsDisc = new THREE.Mesh(gpsDiscGeo, gpsDiscMat);
    gpsDisc.position.set(circleX, circleY + 0.35, circleZ);
    this.campusGroup.add(gpsDisc);

    const gpsPulseGeo = new THREE.RingGeometry(1.6, 2.8, 32);
    gpsPulseGeo.rotateX(-Math.PI / 2);
    const gpsPulseMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    const gpsPulse = new THREE.Mesh(gpsPulseGeo, gpsPulseMat);
    gpsPulse.position.set(circleX, circleY + 0.38, circleZ);
    this.campusGroup.add(gpsPulse);
    this.liveGpsMesh = { dot: gpsDisc, ring: gpsPulse };

    this.createCampusTag("YOU ARE HERE (LIVE GPS)", circleX, circleY + 8.5, circleZ, "#10b981", null, 3.5);

    // 3b. Open Administrative Front Lawn & Ceremonial Approach
    const lawnX = 105;
    const lawnZ = -74;
    const lawnY = this.getTerrainHeight(lawnX, lawnZ);

    [-18, 18].forEach(xOffset => {
      const lawnGeo = new THREE.PlaneGeometry(16, 18);
      lawnGeo.rotateX(-Math.PI / 2);
      const lawnMesh = new THREE.Mesh(lawnGeo, lawnMat);
      lawnMesh.position.set(lawnX + xOffset, lawnY + 0.18, lawnZ);
      lawnMesh.receiveShadow = true;
      this.campusGroup.add(lawnMesh);

      const borderGeo = new THREE.BoxGeometry(16.2, 0.25, 0.35);
      const borderMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0 });
      const borderMesh = new THREE.Mesh(borderGeo, borderMat);
      borderMesh.position.set(lawnX + xOffset, lawnY + 0.25, lawnZ + 9);
      this.campusGroup.add(borderMesh);
    });

    // 4. Main Administrative Block (Authentic 3-Storey Height: 12.0m)
    const adminX = 105;
    const adminZ = -88;
    const adminY = this.getTerrainHeight(adminX, adminZ);

    const adminLandmark = {
      id: "admin_block",
      name: "NIT Calicut - Administrative Block",
      category: "Administrative Core",
      dimensions: "60.0m x 22.0m x 12.0m",
      storeys: "3 Floors (Ground + 2 Storeys)",
      height: 12.0,
      coords: { x: adminX, y: adminY, z: adminZ },
      elevationMSL: "+16.2m MSL",
      slope: "1.8 deg (Graded Apron)",
      floodSafety: "SAFE // +11.2m above 100-Yr Flood Level",
      description: "Director's Secretariat, Registrar Office, Senate Hall, and Central Academic Administration."
    };

    // Main 3-story Building (60m wide x 12m high x 22m deep)
    const adminBody = new THREE.Mesh(new THREE.BoxGeometry(60, 12, 22), adminMat);
    adminBody.position.set(adminX, adminY + 6, adminZ);
    adminBody.castShadow = true;
    adminBody.receiveShadow = true;
    this.campusGroup.add(adminBody);
    this.registerLandmarkMesh(adminBody, adminLandmark);

    const adminRoof = new THREE.Mesh(new THREE.BoxGeometry(61, 1.0, 23), trimMat);
    adminRoof.position.set(adminX, adminY + 12.5, adminZ);
    this.campusGroup.add(adminRoof);
    this.registerLandmarkMesh(adminRoof, adminLandmark);

    // Front Window Strips
    [-2, 2].forEach(yOff => {
      const win = new THREE.Mesh(new THREE.BoxGeometry(54, 2.0, 0.4), glassCyanMat);
      win.position.set(adminX, adminY + 6 + yOff, adminZ + 11.2);
      this.campusGroup.add(win);
    });

    // Central Grand Portico
    const porticoZ = adminZ + 12;
    const porticoBody = new THREE.Mesh(new THREE.BoxGeometry(20, 13.5, 10), adminMat);
    porticoBody.position.set(adminX, adminY + 6.75, porticoZ);
    this.campusGroup.add(porticoBody);
    this.registerLandmarkMesh(porticoBody, adminLandmark);

    // 4 Grand Pillars
    [-7, -2.5, 2.5, 7].forEach(colX => {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 12, 16), pillarMat);
      col.position.set(adminX + colX, adminY + 6, porticoZ + 5.2);
      this.campusGroup.add(col);
      this.registerLandmarkMesh(col, adminLandmark);
    });

    // Clock & Administrative Crest Tower
    const towerBody = new THREE.Mesh(new THREE.BoxGeometry(7, 4.5, 7), adminMat);
    towerBody.position.set(adminX, adminY + 14.5, porticoZ);
    this.campusGroup.add(towerBody);
    this.registerLandmarkMesh(towerBody, adminLandmark);

    const clockDial = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.4, 24), glassCyanMat);
    clockDial.rotateX(Math.PI / 2);
    clockDial.position.set(adminX, adminY + 15, porticoZ + 3.6);
    this.campusGroup.add(clockDial);

    this.createCampusTag("NIT CALICUT - ADMIN BLOCK", adminX, adminY + 20, adminZ, "#38bdf8", null, 3.5);

    // 5. Central Computer Centre (CCC) (Authentic 2-Storey Height: 8.5m)
    const cccX = 75;
    const cccZ = -70;
    const cccY = this.getTerrainHeight(cccX, cccZ);

    const cccLandmark = {
      id: "ccc",
      name: "Central Computer Centre (CCC)",
      category: "IT Infrastructure & Computing Hub",
      dimensions: "34.0m x 26.0m x 8.5m",
      storeys: "2 Floors (High-Density Server Facility)",
      height: 8.5,
      coords: { x: cccX, y: cccY, z: cccZ },
      elevationMSL: "+15.0m MSL",
      slope: "1.2 deg (Graded)",
      floodSafety: "SAFE // +10.0m above 100-Yr Flood Level",
      description: "Central computing facility, optical fiber campus backbone NOC, HPC cluster, and student labs."
    };

    const cccBody = new THREE.Mesh(new THREE.BoxGeometry(34, 8.5, 26), cccGlassMat);
    cccBody.position.set(cccX, cccY + 4.25, cccZ);
    cccBody.castShadow = true;
    this.campusGroup.add(cccBody);
    this.registerLandmarkMesh(cccBody, cccLandmark);

    const cccFrame = new THREE.Mesh(new THREE.BoxGeometry(34.6, 8.7, 26.6), new THREE.MeshBasicMaterial({ color: 0x0f172a, wireframe: true }));
    cccFrame.position.set(cccX, cccY + 4.25, cccZ);
    this.campusGroup.add(cccFrame);

    const hvac = new THREE.Mesh(new THREE.BoxGeometry(6, 2, 4), workshopMat);
    hvac.position.set(cccX + 6, cccY + 9.5, cccZ + 4);
    this.campusGroup.add(hvac);

    this.createCampusTag("CENTRAL COMPUTER CENTRE (CCC)", cccX, cccY + 13, cccZ, "#38bdf8", null, 3.5);

    // 6. Central Library (Academic East Wing) (Authentic 2-Storey Height: 9.0m)
    const libX = 142;
    const libZ = -58;
    const libY = this.getTerrainHeight(libX, libZ);

    const libLandmark = {
      id: "central_library",
      name: "NIT Calicut Central Library",
      category: "Academic & Research Repository",
      dimensions: "38.0m x 26.0m x 9.0m",
      storeys: "2 Floors (Reading Halls & Digital Archives)",
      height: 9.0,
      coords: { x: libX, y: libY, z: libZ },
      elevationMSL: "+15.8m MSL",
      slope: "1.9 deg (Slight Incline)",
      floodSafety: "SAFE // +10.8m above 100-Yr Flood Level",
      description: "Houses over 150,000 volumes, e-resource consortium, digital archival centre, and conference halls."
    };

    const libBody = new THREE.Mesh(new THREE.BoxGeometry(38, 9.0, 26), academicMat);
    libBody.position.set(libX, libY + 4.5, libZ);
    libBody.castShadow = true;
    libBody.receiveShadow = true;
    this.campusGroup.add(libBody);
    this.registerLandmarkMesh(libBody, libLandmark);

    [-1.8, 1.8].forEach(yOff => {
      const libWin = new THREE.Mesh(new THREE.BoxGeometry(34, 1.8, 0.4), glassCyanMat);
      libWin.position.set(libX, libY + 4.5 + yOff, libZ + 13.2);
      this.campusGroup.add(libWin);
    });

    const libPorch = new THREE.Mesh(new THREE.BoxGeometry(14, 7.5, 8), adminMat);
    libPorch.position.set(libX - 10, libY + 3.75, libZ + 14);
    this.campusGroup.add(libPorch);
    this.registerLandmarkMesh(libPorch, libLandmark);

    const libRoof = new THREE.Mesh(new THREE.BoxGeometry(39, 0.9, 27), trimMat);
    libRoof.position.set(libX, libY + 9.45, libZ);
    this.campusGroup.add(libRoof);

    this.createCampusTag("CENTRAL LIBRARY (ACADEMIC EAST)", libX, libY + 13.5, libZ, "#38bdf8", null, 3.5);

    // 7. North Academic Quadrangle (CSED, ECED, MED Workshops, Civil, Arch)
    const cseX = 140;
    const cseZ = -88;
    const cseY = this.getTerrainHeight(cseX, cseZ);

    const cseLandmark = {
      id: "csed",
      name: "Computer Science & Engineering (CSED)",
      category: "Academic Quadrangle",
      dimensions: "46.0m x 22.0m x 10.5m",
      storeys: "3 Floors (Department Labs & Classrooms)",
      height: 10.5,
      coords: { x: cseX, y: cseY, z: cseZ },
      elevationMSL: "+17.2m MSL",
      slope: "2.8 deg (Gentle Terrace)",
      floodSafety: "SAFE // +12.2m above 100-Yr Flood Level",
      description: "Department of CSE, AI & ML Research labs, Software Systems labs, and seminar halls."
    };

    const cseWing = new THREE.Mesh(new THREE.BoxGeometry(46, 10.5, 22), academicMat);
    cseWing.position.set(cseX, cseY + 5.25, cseZ);
    cseWing.castShadow = true;
    this.campusGroup.add(cseWing);
    this.registerLandmarkMesh(cseWing, cseLandmark);

    [-2, 2].forEach(yOff => {
      const win = new THREE.Mesh(new THREE.BoxGeometry(42, 1.8, 0.4), glassCyanMat);
      win.position.set(cseX, cseY + 5.25 + yOff, cseZ + 11.2);
      this.campusGroup.add(win);
    });

    // Mechanical Labs & Central Workshops
    const mechX = 125;
    const mechZ = -128;
    const mechY = this.getTerrainHeight(mechX, mechZ);

    const mechLandmark = {
      id: "mech_workshops",
      name: "Mechanical Engineering & Central Workshops",
      category: "Engineering Labs & Fabrication",
      dimensions: "52.0m x 28.0m x 8.5m",
      storeys: "2 Floors (Heavy Machinery & Fabrication Bays)",
      height: 8.5,
      coords: { x: mechX, y: mechY, z: mechZ },
      elevationMSL: "+18.5m MSL",
      slope: "3.1 deg (Terraced Ridge)",
      floodSafety: "SAFE // +13.5m above 100-Yr Flood Level",
      description: "Central manufacturing labs, CAD/CAM centre, thermal science labs, and heavy mechanical fabrication."
    };

    const mechBlock = new THREE.Mesh(new THREE.BoxGeometry(52, 8.5, 28), workshopMat);
    mechBlock.position.set(mechX, mechY + 4.25, mechZ);
    mechBlock.castShadow = true;
    this.campusGroup.add(mechBlock);
    this.registerLandmarkMesh(mechBlock, mechLandmark);

    // Civil Engineering Complex
    const civX = 155;
    const civZ = -128;
    const civY = this.getTerrainHeight(civX, civZ);

    const civLandmark = {
      id: "civil_complex",
      name: "Civil Engineering Department Complex",
      category: "Academic & Structural Testing",
      dimensions: "44.0m x 24.0m x 10.0m",
      storeys: "3 Floors (Structural & Geotech Labs)",
      height: 10.0,
      coords: { x: civX, y: civY, z: civZ },
      elevationMSL: "+19.0m MSL",
      slope: "3.5 deg (Graded Ridge)",
      floodSafety: "SAFE // +14.0m above 100-Yr Flood Level",
      description: "Geotechnical investigation labs, hydraulics flume, structural testing floor, and environmental engineering."
    };

    const civBlock = new THREE.Mesh(new THREE.BoxGeometry(44, 10.0, 24), academicMat);
    civBlock.position.set(civX, civY + 5.0, civZ);
    civBlock.castShadow = true;
    this.campusGroup.add(civBlock);
    this.registerLandmarkMesh(civBlock, civLandmark);

    // Architecture Department (DAP)
    const dapX = 138;
    const dapZ = -155;
    const dapY = this.getTerrainHeight(dapX, dapZ);

    const dapLandmark = {
      id: "architecture_dap",
      name: "Department of Architecture & Planning (DAP)",
      category: "Design Studios & Planning",
      dimensions: "38.0m x 20.0m x 8.5m",
      storeys: "2 Floors (Architectural Studios & Exhibition Hall)",
      height: 8.5,
      coords: { x: dapX, y: dapY, z: dapZ },
      elevationMSL: "+20.4m MSL",
      slope: "4.2 deg (Hillside Ridge)",
      floodSafety: "SAFE // +15.4m above 100-Yr Flood Level",
      description: "Architecture design studios, urban planning labs, climatology lab, and model fabrication facilities."
    };

    const dapBlock = new THREE.Mesh(new THREE.BoxGeometry(38, 8.5, 20), academicMat);
    dapBlock.position.set(dapX, dapY + 4.25, dapZ);
    this.campusGroup.add(dapBlock);
    this.registerLandmarkMesh(dapBlock, dapLandmark);

    this.createCampusTag("ENGINEERING DEPARTMENTS (CSE/ECE/MECH/CIVIL)", 140, this.getTerrainHeight(140, -110) + 16, -110, "#38bdf8", null, 4.0);

    // 8. East Ridge Mega Hostels & Safe Refuge Haven (+48.5m MSL) (Authentic 4-Storey Height: 16.0m)
    const host1X = 172;
    const host1Z = -62;
    const host1Y = this.getTerrainHeight(host1X, host1Z);

    const host2X = 172;
    const host2Z = -98;
    const host2Y = this.getTerrainHeight(host2X, host2Z);

    const hostelLandmark = {
      id: "mega_hostels",
      name: "Mega Hostels & Designated Safe Refuge Haven",
      category: "High-Elevation Evacuation Haven",
      dimensions: "28.0m x 28.0m x 16.0m (Per Block)",
      storeys: "4 Floors (+48.5m MSL Elevated Ridge)",
      height: 16.0,
      coords: { x: host1X, y: host1Y, z: -80 },
      elevationMSL: "+48.5m MSL (Highest Inhabited Campus Ridge)",
      slope: "14.8 deg (Hillside Gradient)",
      floodSafety: "MAXIMUM SAFETY // +43.5m above 100-Yr Flood Level",
      description: "Mass residential complex on the eastern granite ridge, equipped with backup solar power, water storage, and designated disaster refuge."
    };

    const host1 = new THREE.Mesh(new THREE.BoxGeometry(28, 16, 28), hostelMat);
    host1.position.set(host1X, host1Y + 8, host1Z);
    host1.castShadow = true;
    this.campusGroup.add(host1);
    this.registerLandmarkMesh(host1, hostelLandmark);

    const host2 = new THREE.Mesh(new THREE.BoxGeometry(28, 16, 28), hostelMat);
    host2.position.set(host2X, host2Y + 8, host2Z);
    host2.castShadow = true;
    this.campusGroup.add(host2);
    this.registerLandmarkMesh(host2, hostelLandmark);

    const hostQuad = new THREE.Mesh(new THREE.BoxGeometry(34, 10, 34), academicMat);
    hostQuad.position.set(190, this.getTerrainHeight(190, -80) + 5, -80);
    this.campusGroup.add(hostQuad);
    this.registerLandmarkMesh(hostQuad, hostelLandmark);

    // Emergency Refuge Beacon on the ridge
    const refugeBeacon = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.8, 18, 16), new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.65 }));
    refugeBeacon.position.set(172, Math.max(host1Y, host2Y) + 12, -80);
    this.campusGroup.add(refugeBeacon);

    this.createCampusTag("MEGA HOSTELS & SAFE HAVEN (+48.5m MSL)", 172, Math.max(host1Y, host2Y) + 26, -80, "#10b981", null, 4.5);

    // 9. Main Athletic Ground, Spectator Pavilion & Open Air Theatre (OAT)
    const groundX = 75;
    const groundZ = -130;
    const groundY = this.getTerrainHeight(groundX, groundZ);

    const groundLandmark = {
      id: "athletic_ground",
      name: "Main Athletic Stadium & Sports Pavilion",
      category: "Recreational & Assembly Ground",
      dimensions: "400m Oval Track // 44.0m x 44.0m Pitch // 32.0m Pavilion",
      storeys: "Ground Level Stadium & 4.5m Grandstand",
      height: 4.5,
      coords: { x: groundX, y: groundY, z: groundZ },
      elevationMSL: "+14.0m MSL",
      slope: "0.4 deg (Leveled Arena)",
      floodSafety: "SAFE // +9.0m above 100-Yr Flood Level",
      description: "400-meter synthetic athletics track, football pitch, cricket ground, and spectator grandstand."
    };

    const trackGeo = new THREE.RingGeometry(24, 32, 32);
    trackGeo.rotateX(-Math.PI / 2);
    const trackMesh = new THREE.Mesh(trackGeo, trackMat);
    trackMesh.position.set(groundX, groundY + 0.18, groundZ);
    this.campusGroup.add(trackMesh);
    this.registerLandmarkMesh(trackMesh, groundLandmark);

    const turfGeo = new THREE.PlaneGeometry(44, 44);
    turfGeo.rotateX(-Math.PI / 2);
    const turfMesh = new THREE.Mesh(turfGeo, lawnMat);
    turfMesh.position.set(groundX, groundY + 0.22, groundZ);
    this.campusGroup.add(turfMesh);
    this.registerLandmarkMesh(turfMesh, groundLandmark);

    const pavMesh = new THREE.Mesh(new THREE.BoxGeometry(32, 4.5, 12), trimMat);
    pavMesh.position.set(groundX + 28, groundY + 2.25, groundZ);
    this.campusGroup.add(pavMesh);
    this.registerLandmarkMesh(pavMesh, groundLandmark);

    // Open Air Theatre (OAT)
    const oatX = 60;
    const oatZ = -95;
    const oatY = this.getTerrainHeight(oatX, oatZ);

    const oatLandmark = {
      id: "oat",
      name: "Open Air Theatre (OAT)",
      category: "Cultural & Assembly Amphitheatre",
      dimensions: "20.0m Tier Radius // 14.0m Raised Stage",
      storeys: "Terraced Amphitheatre Seating",
      height: 3.5,
      coords: { x: oatX, y: oatY, z: oatZ },
      elevationMSL: "+14.5m MSL",
      slope: "6.8 deg (Natural Sloped Amphitheatre)",
      floodSafety: "SAFE // +9.5m above 100-Yr Flood Level",
      description: "Naturally sloped hillside open-air amphitheatre hosting institute cultural festivals (Ragam) and technical summits."
    };

    [20, 16, 12, 8].forEach((rad, idx) => {
      const tierGeo = new THREE.RingGeometry(rad - 2, rad, 24, 1, 0, Math.PI);
      tierGeo.rotateX(-Math.PI / 2);
      const tierMesh = new THREE.Mesh(tierGeo, adminMat);
      tierMesh.position.set(oatX, oatY + 0.5 + idx * 0.75, oatZ);
      this.campusGroup.add(tierMesh);
      this.registerLandmarkMesh(tierMesh, oatLandmark);
    });

    const oatStage = new THREE.Mesh(new THREE.BoxGeometry(14, 0.8, 8), workshopMat);
    oatStage.position.set(oatX, oatY + 0.4, oatZ + 2);
    this.campusGroup.add(oatStage);
    this.registerLandmarkMesh(oatStage, oatLandmark);

    this.createCampusTag("MAIN ATHLETIC GROUND & OAT", groundX, groundY + 12, groundZ, "#38bdf8", null, 3.5);

    // 10. Kattangal Junction Mukkam Highway (SH 34)
    const highwayGeo = new THREE.PlaneGeometry(240, 14);
    highwayGeo.rotateX(-Math.PI / 2);
    const highwayRoad = new THREE.Mesh(highwayGeo, asphaltMat);
    highwayRoad.position.set(105, this.getTerrainHeight(105, -10) + 0.15, -10);
    highwayRoad.receiveShadow = true;
    this.campusGroup.add(highwayRoad);

    const hwLineGeo = new THREE.PlaneGeometry(240, 0.8);
    hwLineGeo.rotateX(-Math.PI / 2);
    const hwLine = new THREE.Mesh(hwLineGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
    hwLine.position.set(105, this.getTerrainHeight(105, -10) + 0.18, -10);
    this.campusGroup.add(hwLine);

    // Clean formal transit shelters along highway
    const busShelter = new THREE.Mesh(new THREE.BoxGeometry(8, 3.2, 4), trimMat);
    busShelter.position.set(125, this.getTerrainHeight(125, -4) + 1.6, -4);
    this.campusGroup.add(busShelter);

    const autoStand = new THREE.Mesh(new THREE.BoxGeometry(8, 3.2, 4), trimMat);
    autoStand.position.set(85, this.getTerrainHeight(85, -4) + 1.6, -4);
    this.campusGroup.add(autoStand);

    // 11. Avenue Trees symmetrically lining Rajpath Avenue & Perimeter
    const treeCoords = [
      { x: 96, z: -22 }, { x: 96, z: -32 }, { x: 96, z: -42 }, { x: 96, z: -52 },
      { x: 114, z: -22 }, { x: 114, z: -32 }, { x: 114, z: -42 }, { x: 114, z: -52 },
      { x: 85, z: -55 }, { x: 125, z: -55 }, { x: 75, z: -85 }, { x: 135, z: -85 },
      { x: 60, z: -110 }, { x: 155, z: -115 }, { x: 50, z: -130 }, { x: 160, z: -70 }
    ];

    treeCoords.forEach(t => {
      const ty = this.getTerrainHeight(t.x, t.z);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 4.5, 8), treeTrunkMat);
      trunk.position.set(t.x, ty + 2.25, t.z);
      trunk.castShadow = true;
      this.campusGroup.add(trunk);

      const foliage = new THREE.Mesh(new THREE.ConeGeometry(2.2, 3.5, 8), treeFoliageMat);
      foliage.position.set(t.x, ty + 5.0, t.z);
      foliage.castShadow = true;
      this.campusGroup.add(foliage);
    });
  }

  toggleEvacuationRoute(forceState) {
    if (forceState !== undefined) {
      this.evacuationActive = forceState;
    } else {
      this.evacuationActive = !this.evacuationActive;
    }

    // Clear previous evacuation elements
    while (this.evacuationGroup.children.length > 0) {
      this.evacuationGroup.remove(this.evacuationGroup.children[0]);
    }

    if (!this.evacuationActive) {
      return false;
    }

    // 1. Catmull-Rom Spline Curve from Flooded Terrain to East Ridge Safe Haven
    const waypoints = [
      new THREE.Vector3(45, 1.2, -10),   // Flooded low-lying Mukkam Highway section (Origin)
      new THREE.Vector3(75, 2.5, -12),   // Approaching Kattangal Bazaar
      new THREE.Vector3(105, 4.2, -18),  // Safe entry through Main Gate
      new THREE.Vector3(105, 8.5, -40),  // Straight along Central Rajpath Avenue
      new THREE.Vector3(105, 14.8, -62), // Gandhi Circle Roundabout
      new THREE.Vector3(138, 19.2, -62), // East Ridge ascending road
      new THREE.Vector3(172, 24.5, -82)  // Mega Hostels Safe Haven Plateau (+48.5m MSL)
    ];

    const curve = new THREE.CatmullRomCurve3(waypoints);

    // Glowing Green Evacuation Tube Mesh
    const tubeGeo = new THREE.TubeGeometry(curve, 64, 0.75, 8, false);
    const tubeMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 0.95,
      roughness: 0.2,
      transparent: true,
      opacity: 0.88
    });
    this.evacTubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
    this.evacuationGroup.add(this.evacTubeMesh);

    // 2. Pulsing Waypoint Rings & Pillars at Nodes
    waypoints.forEach((wp, idx) => {
      const isDestination = idx === waypoints.length - 1;
      const isOrigin = idx === 0;

      const ringColor = isDestination ? 0x10b981 : (isOrigin ? 0xef4444 : 0x38bdf8);

      // Ground beacon ring
      const ringGeo = new THREE.RingGeometry(1.2, 2.5, 24);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: ringColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.set(wp.x, wp.y + 0.1, wp.z);
      this.evacuationGroup.add(ringMesh);

      // Vertical guide pillar
      const beamHeight = isDestination ? 24 : 8;
      const beamGeo = new THREE.CylinderGeometry(0.2, 0.4, beamHeight, 12);
      const beamMat = new THREE.MeshBasicMaterial({
        color: ringColor,
        transparent: true,
        opacity: 0.45
      });
      const beamMesh = new THREE.Mesh(beamGeo, beamMat);
      beamMesh.position.set(wp.x, wp.y + beamHeight / 2, wp.z);
      this.evacuationGroup.add(beamMesh);

      if (isDestination) {
        // Destination haven diamond
        const diaGeo = new THREE.OctahedronGeometry(2.2, 0);
        const diaMat = new THREE.MeshStandardMaterial({
          color: 0x10b981,
          emissive: 0x10b981,
          emissiveIntensity: 1.2
        });
        const diamond = new THREE.Mesh(diaGeo, diaMat);
        diamond.position.set(wp.x, wp.y + beamHeight + 2, wp.z);
        this.evacuationGroup.add(diamond);

        this.createCampusTag("SAFE REFUGE HAVEN (+48.5m MSL)", wp.x, wp.y + beamHeight + 7, wp.z, "#10b981", this.evacuationGroup, 5.0);
      }
    });

    // 3. Submerged Road Barricades (Closing Flooded Routes)
    const barricades = [
      { x: 35, y: 0.8, z: -10, rot: 0 },
      { x: 25, y: 0.6, z: -35, rot: -0.4 }
    ];

    barricades.forEach((b) => {
      const bGroup = new THREE.Group();
      bGroup.position.set(b.x, b.y, b.z);
      bGroup.rotation.y = b.rot;

      // Barrier Beam (Red & White hazard)
      const beamGeo = new THREE.BoxGeometry(9, 1.2, 0.4);
      const beamMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xb91c1c, emissiveIntensity: 0.5 });
      const barMesh = new THREE.Mesh(beamGeo, beamMat);
      barMesh.position.y = 1.2;
      bGroup.add(barMesh);

      // 2 Stanchions
      [-3.8, 3.8].forEach(sx => {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.2, 8), new THREE.MeshStandardMaterial({ color: 0x0f172a }));
        post.position.set(sx, 1.1, 0);
        bGroup.add(post);
      });

      // Warning Strobe on top
      const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 12), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
      strobe.position.set(0, 2.1, 0);
      bGroup.add(strobe);

      this.evacuationGroup.add(bGroup);

      this.createCampusTag("ROAD CLOSED: INUNDATION HAZARD", b.x, b.y + 4.5, b.z, "#ef4444", this.evacuationGroup, 3.5);
    });

    // Fly camera smoothly to reveal the evacuation path towards NIT Calicut
    this.smoothCameraTransition(new THREE.Vector3(160, 65, -30), new THREE.Vector3(105, 15, -70), 1400);

    return true;
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
      this.updateWaterGeometry(this.animTime);
      this.waterMesh.material.opacity = Math.min(0.9, 0.72 + meters * 0.035);
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
      case "nit_admin":
      case "nit_calicut":
        this.smoothCameraTransition(new THREE.Vector3(130, 44, -22), new THREE.Vector3(105, 14, -75));
        break;
      case "nit_academic":
        this.smoothCameraTransition(new THREE.Vector3(180, 50, -80), new THREE.Vector3(138, 16, -115));
        break;
      case "nit_hostels":
        this.smoothCameraTransition(new THREE.Vector3(210, 58, -45), new THREE.Vector3(170, 26, -80));
        break;
      case "nit_ground":
        this.smoothCameraTransition(new THREE.Vector3(45, 42, -95), new THREE.Vector3(75, 10, -125));
        break;
      case "kattangal":
        this.smoothCameraTransition(new THREE.Vector3(105, 28, 22), new THREE.Vector3(105, 10, -35));
        break;
      case "kunnamangalam":
        this.smoothCameraTransition(new THREE.Vector3(15, 34, 15), new THREE.Vector3(30, 4, -20));
        break;
      case "chathamangalam_basin":
      case "mavoor":
        this.smoothCameraTransition(new THREE.Vector3(68, 28, -10), new THREE.Vector3(38, 2, -35));
        break;
      case "coastal":
        this.smoothCameraTransition(new THREE.Vector3(-140, 45, 60), new THREE.Vector3(-85, 4, 15));
        break;
      case "pedestrian":
        this.smoothCameraTransition(new THREE.Vector3(95, 10, -60), new THREE.Vector3(105, 14, -85));
        break;
      case "overview":
      default:
        this.smoothCameraTransition(new THREE.Vector3(175, 140, 185), new THREE.Vector3(50, 5, -40));
        break;
    }
  }

  setPerspectiveMode(mode) {
    if (mode === "2d") {
      // Nadir Top-down 2D Copernicus Earth Observation view
      this.smoothCameraTransition(new THREE.Vector3(105, 330, -55), new THREE.Vector3(105, 0, -55), 1100);
      return "2d";
    } else {
      // 3D Oblique Isometric Elevation Mesh
      this.smoothCameraTransition(new THREE.Vector3(130, 44, -22), new THREE.Vector3(105, 14, -75), 1100);
      return "3d";
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

  measureDistanceToLandmark(landmark) {
    if (!this.landmarkMeasurementGroup) return;

    // Clear previous measurement
    while (this.landmarkMeasurementGroup.children.length > 0) {
      this.landmarkMeasurementGroup.remove(this.landmarkMeasurementGroup.children[0]);
    }

    const gpsOrigin = new THREE.Vector3(105, 12.5, -62);
    const targetApex = new THREE.Vector3(landmark.coords.x, landmark.coords.y + landmark.height / 2, landmark.coords.z);

    // Calculate metrics
    const dx = landmark.coords.x - 105;
    const dz = landmark.coords.z - (-62);
    const dy = landmark.coords.y - 12.5;
    const horizDist = Math.sqrt(dx * dx + dz * dz);
    const directDist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Bearing calculation (Three.js -Z is North)
    let bearingDeg = Math.atan2(dx, -dz) * (180 / Math.PI);
    if (bearingDeg < 0) bearingDeg += 360;
    const compassDirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW', 'N'];
    const compassDir = compassDirs[Math.round(bearingDeg / 22.5)];

    // 1. Vibrant laser beam line
    const points = [gpsOrigin.clone().add(new THREE.Vector3(0, 0.6, 0)), targetApex.clone()];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineDashedMaterial({
      color: 0x38bdf8,
      linewidth: 3,
      scale: 1,
      dashSize: 2,
      gapSize: 1
    });
    const laserLine = new THREE.Line(lineGeo, lineMat);
    laserLine.computeLineDistances();
    this.landmarkMeasurementGroup.add(laserLine);

    // 2. Solid glowing core cylinder
    const curve = new THREE.LineCurve3(points[0], points[1]);
    const tubeGeo = new THREE.TubeGeometry(curve, 20, 0.18, 8, false);
    const tubeMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85
    });
    const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
    this.landmarkMeasurementGroup.add(tubeMesh);

    // 3. Target bounding indicator ring on target apex
    const ringGeo = new THREE.RingGeometry(2.5, 3.8, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.set(landmark.coords.x, landmark.coords.y + landmark.height + 0.5, landmark.coords.z);
    this.landmarkMeasurementGroup.add(ringMesh);

    // 4. Floating 3D distance readout billboard at midpoint
    const midPoint = new THREE.Vector3().addVectors(points[0], points[1]).multiplyScalar(0.5);
    const distCanvas = document.createElement('canvas');
    distCanvas.width = 256;
    distCanvas.height = 64;
    const ctx = distCanvas.getContext('2d');
    ctx.fillStyle = 'rgba(11, 19, 41, 0.9)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    if (ctx.roundRect) {
      ctx.roundRect(4, 4, 248, 56, 8);
    } else {
      ctx.rect(4, 4, 248, 56);
    }
    ctx.fill();
    ctx.stroke();

    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${horizDist.toFixed(1)}m // ${Math.round(bearingDeg)}° ${compassDir}`, 128, 32);

    const texture = new THREE.CanvasTexture(distCanvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.set(midPoint.x, midPoint.y + 3.5, midPoint.z);
    sprite.scale.set(16, 4, 1);
    this.landmarkMeasurementGroup.add(sprite);

    // Dispatch event for HUD to display inspector card
    window.dispatchEvent(new CustomEvent('civicpulse:selectBuilding', {
      detail: {
        ...landmark,
        horizontalDistance: horizDist.toFixed(1),
        directDistance: directDist.toFixed(1),
        elevationDiff: (dy >= 0 ? '+' : '') + dy.toFixed(1),
        bearingDeg: Math.round(bearingDeg),
        bearingDirection: compassDir
      }
    }));
  }

  clearLandmarkMeasurement() {
    if (this.landmarkMeasurementGroup) {
      while (this.landmarkMeasurementGroup.children.length > 0) {
        this.landmarkMeasurementGroup.remove(this.landmarkMeasurementGroup.children[0]);
      }
    }
    window.dispatchEvent(new CustomEvent('civicpulse:deselectBuilding'));
  }

  onPointerClick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    // 1. Raycast incident beacons first
    const beaconIntersects = this.raycaster.intersectObjects(this.beaconGroup.children, true);
    if (beaconIntersects.length > 0) {
      let topObj = beaconIntersects[0].object;
      while (topObj.parent && topObj.parent !== this.beaconGroup) {
        topObj = topObj.parent;
      }
      if (topObj.userData && topObj.userData.incident) {
        this.flyToIncident(topObj.userData.incident.id);
        return;
      }
    }

    // 2. Raycast campus landmarks & monuments
    if (this.landmarkMeshes && this.landmarkMeshes.length > 0) {
      const landmarkIntersects = this.raycaster.intersectObjects(this.landmarkMeshes, true);
      if (landmarkIntersects.length > 0) {
        let hitObj = landmarkIntersects[0].object;
        let landmarkData = (hitObj.userData && hitObj.userData.landmark) ? hitObj.userData.landmark : null;
        if (!landmarkData && hitObj.parent && hitObj.parent.userData && hitObj.parent.userData.landmark) {
          landmarkData = hitObj.parent.userData.landmark;
        }

        if (landmarkData) {
          this.measureDistanceToLandmark(landmarkData);
          if (window.simController) {
            window.simController.playTacticalBeep(1020, 'sine', 0.1);
          }
          return;
        }
      }
    }

    // 3. Clicked empty terrain/sky: clear measurement overlay
    this.clearLandmarkMeasurement();
  }

  onPointerMove(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const beaconIntersects = this.raycaster.intersectObjects(this.beaconGroup.children, true);
    const landmarkIntersects = (this.landmarkMeshes && this.landmarkMeshes.length > 0) 
      ? this.raycaster.intersectObjects(this.landmarkMeshes, true) 
      : [];

    this.renderer.domElement.style.cursor = (beaconIntersects.length > 0 || landmarkIntersects.length > 0) ? "pointer" : "default";
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

    // Pulse Live GPS civilian beacon ring
    if (this.liveGpsMesh && this.liveGpsMesh.ring) {
      const gpsScale = 1.0 + ((this.animTime * 1.2) % 2.0);
      this.liveGpsMesh.ring.scale.set(gpsScale, gpsScale, gpsScale);
      this.liveGpsMesh.ring.material.opacity = Math.max(0, 0.85 - (gpsScale - 1.0) * 0.7);
    }

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

    // Pulse evacuation route if active
    if (this.evacuationActive && this.evacTubeMesh) {
      this.evacTubeMesh.material.emissiveIntensity = 0.75 + Math.sin(this.animTime * 3.5) * 0.25;
    }

    // Dynamic hydrological wave motion
    if (this.waterMesh) {
      this.updateWaterGeometry(this.animTime);
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

window.TwinEngine = TwinEngine;
