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
    this.renderer.toneMappingExposure = 1.25;
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
    this.buildNITCalicutCampus();

    // 7. Beacons & Spatial Overlays
    this.scene.add(this.campusGroup);
    this.scene.add(this.evacuationGroup);
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

    // Base building materials with clean architectural palettes
    const buildingPalette = [
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.4 }),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6, metalness: 0.3 }),
      new THREE.MeshStandardMaterial({ color: 0x273549, roughness: 0.4, metalness: 0.5 }),
      new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.5, metalness: 0.4 })
    ];

    // Seeded procedural buildings in urban grids (excluding NIT Calicut campus quadrant)
    const zones = [
      { startX: -140, endX: -40, startZ: -140, endZ: -40, heightRange: [12, 45], density: 36 }, // Commercial District
      { startX: 20, endX: 120, startZ: -40, endZ: 60, heightRange: [8, 28], density: 42 },     // Mixed Urban Corridor
      { startX: -130, endX: -30, startZ: 30, endZ: 130, heightRange: [6, 20], density: 30 }     // Residential / Harbor
    ];

    zones.forEach(zone => {
      for (let i = 0; i < zone.density; i++) {
        const x = zone.startX + Math.random() * (zone.endX - zone.startX);
        const z = zone.startZ + Math.random() * (zone.endZ - zone.startZ);

        // Keep roads and NIT Calicut campus quadrant clear
        if (Math.abs(x) < 14 || Math.abs(z + 80) < 12) continue;
        if (x >= 35 && x <= 200 && z >= -170 && z <= -30) continue;

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
    // Clear previous campus objects
    while (this.campusGroup.children.length > 0) {
      this.campusGroup.remove(this.campusGroup.children[0]);
    }

    // High quality architectural materials
    const adminMat = new THREE.MeshStandardMaterial({ color: 0xd6cfc4, roughness: 0.65, metalness: 0.1 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.4 });
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25, metalness: 0.1 });
    const glassCyanMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.15, metalness: 0.85, transparent: true, opacity: 0.82 });
    const cccGlassMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.15, metalness: 0.9, transparent: true, opacity: 0.88 });
    const academicMat = new THREE.MeshStandardMaterial({ color: 0xc8c3ba, roughness: 0.7, metalness: 0.15 });
    const workshopMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.6, metalness: 0.4 });
    const hostelMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.5, metalness: 0.2 });
    const terracottaMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.75, metalness: 0.1 });
    const lawnMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.85, metalness: 0.05 });
    const trackMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.8, metalness: 0.1 });
    const asphaltMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8, metalness: 0.1 });
    const shopWallMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.7, metalness: 0.05 });
    const houseWallMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.6, metalness: 0.1 });
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

    // 2. Main Gate & Kattangal Entrance Arch (Directly on the Central Axis x = 105)
    const gateX = 105;
    const gateZ = -18;
    const gateY = this.getTerrainHeight(gateX, gateZ);

    const pGeo = new THREE.BoxGeometry(2.2, 7.5, 2.2);
    // Left Pillar (Western side of gate opening)
    const leftP = new THREE.Mesh(pGeo, trimMat);
    leftP.position.set(gateX - 7.5, gateY + 3.75, gateZ);
    this.campusGroup.add(leftP);

    // Right Pillar (Eastern side of gate opening)
    const rightP = new THREE.Mesh(pGeo, trimMat);
    rightP.position.set(gateX + 7.5, gateY + 3.75, gateZ);
    this.campusGroup.add(rightP);

    // Grand Arch Spanning the Gate across East-West
    const archBeam = new THREE.Mesh(new THREE.BoxGeometry(17.5, 1.8, 2.4), adminMat);
    archBeam.position.set(gateX, gateY + 7.5, gateZ);
    this.campusGroup.add(archBeam);

    // Security Gate Cabin
    const securityCabin = new THREE.Mesh(new THREE.BoxGeometry(4.5, 3.5, 4.5), houseWallMat);
    securityCabin.position.set(gateX - 11.5, gateY + 1.75, gateZ);
    this.campusGroup.add(securityCabin);

    this.createCampusTag("MAIN GATE & KATTANGAL ENTRANCE", gateX, gateY + 13, gateZ, "#10b981", null, 4.0);

    // 3. Gandhi Circle Roundabout & National Tricolour Flagpole
    const circleX = 105;
    const circleZ = -62;
    const circleY = this.getTerrainHeight(circleX, circleZ);

    const circleLawn = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 0.4, 32), lawnMat);
    circleLawn.position.set(circleX, circleY + 0.2, circleZ);
    circleLawn.receiveShadow = true;
    this.campusGroup.add(circleLawn);

    const flagMast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 14, 16), pillarMat);
    flagMast.position.set(circleX, circleY + 7.2, circleZ);
    flagMast.castShadow = true;
    this.campusGroup.add(flagMast);

    const flagMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 2.2), new THREE.MeshBasicMaterial({ color: 0xf97316, side: THREE.DoubleSide }));
    flagMesh.position.set(circleX + 1.8, circleY + 13, circleZ);
    this.campusGroup.add(flagMesh);

    // 3b. Open Administrative Front Lawn & Ceremonial Approach (No Obstructions!)
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

    // 4. Main Administrative Block (Administrative Core)
    const adminX = 105;
    const adminZ = -88;
    const adminY = this.getTerrainHeight(adminX, adminZ);

    // Main 3-story Building (60m wide x 16m high x 22m deep)
    const adminBody = new THREE.Mesh(new THREE.BoxGeometry(60, 16, 22), adminMat);
    adminBody.position.set(adminX, adminY + 8, adminZ);
    adminBody.castShadow = true;
    adminBody.receiveShadow = true;
    this.campusGroup.add(adminBody);

    const adminRoof = new THREE.Mesh(new THREE.BoxGeometry(61, 1.2, 23), trimMat);
    adminRoof.position.set(adminX, adminY + 16.6, adminZ);
    this.campusGroup.add(adminRoof);

    // Front Window Strips
    [-3, 2].forEach(yOff => {
      const win = new THREE.Mesh(new THREE.BoxGeometry(54, 2.4, 0.4), glassCyanMat);
      win.position.set(adminX, adminY + 8 + yOff, adminZ + 11.2);
      this.campusGroup.add(win);
    });

    // Central Grand Portico
    const porticoZ = adminZ + 12;
    const porticoBody = new THREE.Mesh(new THREE.BoxGeometry(20, 18.5, 10), adminMat);
    porticoBody.position.set(adminX, adminY + 9.25, porticoZ);
    this.campusGroup.add(porticoBody);

    // 4 Grand Pillars
    [-7, -2.5, 2.5, 7].forEach(colX => {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 16.5, 16), pillarMat);
      col.position.set(adminX + colX, adminY + 8.25, porticoZ + 5.2);
      this.campusGroup.add(col);
    });

    // Clock & Administrative Crest Tower
    const towerBody = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 8), adminMat);
    towerBody.position.set(adminX, adminY + 22.5, porticoZ);
    this.campusGroup.add(towerBody);

    const clockDial = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.4, 24), glassCyanMat);
    clockDial.rotateX(Math.PI / 2);
    clockDial.position.set(adminX, adminY + 23.5, porticoZ + 4.1);
    this.campusGroup.add(clockDial);

    this.createCampusTag("NIT CALICUT - ADMIN BLOCK", adminX, adminY + 29.5, adminZ, "#38bdf8", null, 4.0);

    // 5. Central Computer Centre (CCC)
    const cccX = 75;
    const cccZ = -70;
    const cccY = this.getTerrainHeight(cccX, cccZ);

    const cccBody = new THREE.Mesh(new THREE.BoxGeometry(34, 15, 26), cccGlassMat);
    cccBody.position.set(cccX, cccY + 7.5, cccZ);
    cccBody.castShadow = true;
    this.campusGroup.add(cccBody);

    const cccFrame = new THREE.Mesh(new THREE.BoxGeometry(34.8, 15.2, 26.8), new THREE.MeshBasicMaterial({ color: 0x0f172a, wireframe: true }));
    cccFrame.position.set(cccX, cccY + 7.5, cccZ);
    this.campusGroup.add(cccFrame);

    const hvac = new THREE.Mesh(new THREE.BoxGeometry(7, 3, 5), workshopMat);
    hvac.position.set(cccX + 6, cccY + 16.5, cccZ + 4);
    this.campusGroup.add(hvac);

    this.createCampusTag("CENTRAL COMPUTER CENTRE (CCC)", cccX, cccY + 21, cccZ, "#38bdf8", null, 4.0);

    // 6. Central Library (Academic East Wing - Authentic NIT Calicut Location)
    const libX = 142;
    const libZ = -58;
    const libY = this.getTerrainHeight(libX, libZ);

    const libBody = new THREE.Mesh(new THREE.BoxGeometry(38, 14, 26), academicMat);
    libBody.position.set(libX, libY + 7, libZ);
    libBody.castShadow = true;
    libBody.receiveShadow = true;
    this.campusGroup.add(libBody);

    [-2.5, 2.5].forEach(yOff => {
      const libWin = new THREE.Mesh(new THREE.BoxGeometry(34, 2.2, 0.4), glassCyanMat);
      libWin.position.set(libX, libY + 7 + yOff, libZ + 13.2);
      this.campusGroup.add(libWin);
    });

    const libPorch = new THREE.Mesh(new THREE.BoxGeometry(14, 11, 8), adminMat);
    libPorch.position.set(libX - 10, libY + 5.5, libZ + 14);
    this.campusGroup.add(libPorch);

    const libRoof = new THREE.Mesh(new THREE.BoxGeometry(36, 1.2, 24), trimMat);
    libRoof.position.set(libX, libY + 14.6, libZ);
    this.campusGroup.add(libRoof);

    this.createCampusTag("CENTRAL LIBRARY (ACADEMIC EAST)", libX, libY + 20, libZ, "#38bdf8", null, 4.0);

    // 7. North Academic Quadrangle (CSED, ECED, MED Workshops, Civil, Arch)
    const cseX = 140;
    const cseZ = -88;
    const cseY = this.getTerrainHeight(cseX, cseZ);

    const cseWing = new THREE.Mesh(new THREE.BoxGeometry(46, 16, 22), academicMat);
    cseWing.position.set(cseX, cseY + 8, cseZ);
    cseWing.castShadow = true;
    this.campusGroup.add(cseWing);

    // Window bands
    [-3, 2].forEach(yOff => {
      const win = new THREE.Mesh(new THREE.BoxGeometry(42, 2.2, 0.4), glassCyanMat);
      win.position.set(cseX, cseY + 8 + yOff, cseZ + 11.2);
      this.campusGroup.add(win);
    });

    // Mechanical Labs & Central Workshops
    const mechX = 125;
    const mechZ = -128;
    const mechY = this.getTerrainHeight(mechX, mechZ);

    const mechBlock = new THREE.Mesh(new THREE.BoxGeometry(52, 15, 28), workshopMat);
    mechBlock.position.set(mechX, mechY + 7.5, mechZ);
    mechBlock.castShadow = true;
    this.campusGroup.add(mechBlock);

    // Civil Engineering Complex
    const civX = 155;
    const civZ = -128;
    const civY = this.getTerrainHeight(civX, civZ);

    const civBlock = new THREE.Mesh(new THREE.BoxGeometry(44, 15, 24), academicMat);
    civBlock.position.set(civX, civY + 7.5, civZ);
    civBlock.castShadow = true;
    this.campusGroup.add(civBlock);

    // Architecture Department (DAP)
    const dapX = 138;
    const dapZ = -155;
    const dapY = this.getTerrainHeight(dapX, dapZ);

    const dapBlock = new THREE.Mesh(new THREE.BoxGeometry(38, 14, 20), academicMat);
    dapBlock.position.set(dapX, dapY + 7, dapZ);
    this.campusGroup.add(dapBlock);

    // Single well-positioned tag for the entire Academic Departments Quadrangle
    this.createCampusTag("ENGINEERING DEPARTMENTS (CSE/ECE/MECH/CIVIL)", 140, this.getTerrainHeight(140, -110) + 24, -110, "#38bdf8", null, 5.0);

    // 8. East Ridge Mega Hostels & Safe Refuge Haven (+48.5m MSL)
    const host1X = 172;
    const host1Z = -62;
    const host1Y = this.getTerrainHeight(host1X, host1Z);
    const host1 = new THREE.Mesh(new THREE.BoxGeometry(28, 36, 28), hostelMat);
    host1.position.set(host1X, host1Y + 18, host1Z);
    host1.castShadow = true;
    this.campusGroup.add(host1);

    const host2X = 172;
    const host2Z = -98;
    const host2Y = this.getTerrainHeight(host2X, host2Z);
    const host2 = new THREE.Mesh(new THREE.BoxGeometry(28, 36, 28), hostelMat);
    host2.position.set(host2X, host2Y + 18, host2Z);
    host2.castShadow = true;
    this.campusGroup.add(host2);

    // Quadrangle hostel blocks
    const hostQuad = new THREE.Mesh(new THREE.BoxGeometry(34, 12, 34), academicMat);
    hostQuad.position.set(190, this.getTerrainHeight(190, -80) + 6, -80);
    this.campusGroup.add(hostQuad);

    // Emergency Refuge Beacon on the ridge
    const refugeBeacon = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 1.0, 30, 16), new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.55 }));
    refugeBeacon.position.set(172, Math.max(host1Y, host2Y) + 15, -80);
    this.campusGroup.add(refugeBeacon);

    this.createCampusTag("MEGA HOSTELS & SAFE HAVEN (+48.5m MSL)", 172, Math.max(host1Y, host2Y) + 44, -80, "#10b981", null, 5.5);

    // 9. Main Athletic Ground, Spectator Pavilion & Open Air Theatre (OAT)
    const groundX = 75;
    const groundZ = -130;
    const groundY = this.getTerrainHeight(groundX, groundZ);

    // 400m Running Track Oval
    const trackGeo = new THREE.RingGeometry(24, 32, 32);
    trackGeo.rotateX(-Math.PI / 2);
    const trackMesh = new THREE.Mesh(trackGeo, trackMat);
    trackMesh.position.set(groundX, groundY + 0.18, groundZ);
    this.campusGroup.add(trackMesh);

    // Football / Cricket Green Turf
    const turfGeo = new THREE.PlaneGeometry(44, 44);
    turfGeo.rotateX(-Math.PI / 2);
    const turfMesh = new THREE.Mesh(turfGeo, lawnMat);
    turfMesh.position.set(groundX, groundY + 0.22, groundZ);
    this.campusGroup.add(turfMesh);

    // Covered Grandstand Pavilion
    const pavMesh = new THREE.Mesh(new THREE.BoxGeometry(32, 6, 12), trimMat);
    pavMesh.position.set(groundX + 28, groundY + 3, groundZ);
    this.campusGroup.add(pavMesh);

    // Open Air Theatre (OAT) on the natural hillside slope
    const oatX = 60;
    const oatZ = -95;
    const oatY = this.getTerrainHeight(oatX, oatZ);

    [20, 16, 12, 8].forEach((rad, idx) => {
      const tierGeo = new THREE.RingGeometry(rad - 2, rad, 24, 1, 0, Math.PI);
      tierGeo.rotateX(-Math.PI / 2);
      const tierMesh = new THREE.Mesh(tierGeo, adminMat);
      tierMesh.position.set(oatX, oatY + 0.5 + idx * 0.75, oatZ);
      this.campusGroup.add(tierMesh);
    });

    const oatStage = new THREE.Mesh(new THREE.BoxGeometry(14, 0.8, 8), workshopMat);
    oatStage.position.set(oatX, oatY + 0.4, oatZ + 2);
    this.campusGroup.add(oatStage);

    this.createCampusTag("MAIN ATHLETIC GROUND & OAT", groundX, groundY + 18, groundZ, "#38bdf8", null, 4.0);

    // 10. Kattangal Junction & Commercial Bazaar (Mukkam Highway SH 34)
    // Highway running East-West outside the gate
    const highwayGeo = new THREE.PlaneGeometry(240, 14);
    highwayGeo.rotateX(-Math.PI / 2);
    const highwayRoad = new THREE.Mesh(highwayGeo, asphaltMat);
    highwayRoad.position.set(105, this.getTerrainHeight(105, -10) + 0.15, -10);
    highwayRoad.receiveShadow = true;
    this.campusGroup.add(highwayRoad);

    // Highway Center White Line
    const hwLineGeo = new THREE.PlaneGeometry(240, 0.8);
    hwLineGeo.rotateX(-Math.PI / 2);
    const hwLine = new THREE.Mesh(hwLineGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
    hwLine.position.set(105, this.getTerrainHeight(105, -10) + 0.18, -10);
    this.campusGroup.add(hwLine);

    // 8 Authentic Kerala Commercial Shops & Residential Houses (South of Highway, facing North towards Gate)
    const bazaarShops = [
      { x: 70, z: 2, w: 9, d: 7, h: 4.8, isShop: true },   // Calicut Bakery & Hot Chips
      { x: 86, z: 2, w: 8, d: 6, h: 4.2, isShop: true },   // Chaya Kada (Tea & Snacks)
      { x: 124, z: 2, w: 9, d: 7, h: 4.8, isShop: true },  // University Stationery & Xerox
      { x: 140, z: 2, w: 8, d: 7, h: 4.5, isShop: true },  // Campus Pharmacy & Clinic
      { x: 156, z: 2, w: 8, d: 6, h: 4.2, isShop: true },  // Fresh Fruit & Juice Bar
      { x: 54, z: 2, w: 9, d: 8, h: 5.0, isShop: true },   // Local Provision & Grocery
      { x: 121, z: -4, w: 7, d: 4, h: 3.5, isShop: true }, // Bus Waiting Passenger Shelter
      { x: 89, z: -4, w: 7, d: 4, h: 3.5, isShop: true }   // Auto-Rickshaw Stand Shelter
    ];

    bazaarShops.forEach(s => {
      const sy = this.getTerrainHeight(s.x, s.z);
      const wallMat = s.isShop ? shopWallMat : houseWallMat;
      const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, s.d), wallMat);
      baseMesh.position.set(s.x, sy + s.h / 2, s.z);
      baseMesh.castShadow = true;
      baseMesh.receiveShadow = true;
      this.campusGroup.add(baseMesh);

      // Pitched terracotta roof
      const roofRadius = Math.max(s.w, s.d) * 0.72;
      const roofGeo = new THREE.ConeGeometry(roofRadius, 3.2, 4);
      roofGeo.rotateY(Math.PI / 4);
      const roofMesh = new THREE.Mesh(roofGeo, terracottaMat);
      roofMesh.position.set(s.x, sy + s.h + 1.6, s.z);
      roofMesh.castShadow = true;
      this.campusGroup.add(roofMesh);

      // Front awning over shop counter (facing North toward highway)
      const awningGeo = new THREE.BoxGeometry(s.w * 0.9, 0.3, 2.2);
      const awningMat = new THREE.MeshStandardMaterial({ color: 0x0284c7 });
      const awningMesh = new THREE.Mesh(awningGeo, awningMat);
      awningMesh.position.set(s.x, sy + s.h * 0.75, s.z - s.d / 2 - 1);
      this.campusGroup.add(awningMesh);
    });

    // 11. Avenue Trees symmetrically lining Rajpath Avenue & Perimeter
    const treeCoords = [
      // Left side of Rajpath Avenue (x = 96)
      { x: 96, z: -22 }, { x: 96, z: -32 }, { x: 96, z: -42 }, { x: 96, z: -52 },
      // Right side of Rajpath Avenue (x = 114)
      { x: 114, z: -22 }, { x: 114, z: -32 }, { x: 114, z: -42 }, { x: 114, z: -52 },
      // Perimeter & Gandhi Circle flanks
      { x: 85, z: -55 }, { x: 125, z: -55 }, { x: 75, z: -85 }, { x: 135, z: -85 },
      { x: 60, z: -110 }, { x: 155, z: -115 }, { x: 50, z: -130 }, { x: 160, z: -70 }
    ];

    treeCoords.forEach(t => {
      const ty = this.getTerrainHeight(t.x, t.z);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 5, 8), treeTrunkMat);
      trunk.position.set(t.x, ty + 2.5, t.z);
      trunk.castShadow = true;
      this.campusGroup.add(trunk);

      const foliage = new THREE.Mesh(new THREE.ConeGeometry(2.4, 3.8, 8), treeFoliageMat);
      foliage.position.set(t.x, ty + 5.5, t.z);
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
