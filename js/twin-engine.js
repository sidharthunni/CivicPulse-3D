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
        if (x >= 45 && x <= 170 && z >= -135 && z <= -35) continue;

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

  createCampusTag(label, x, y, z, color = "#38bdf8", targetGroup = null) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");

    // Rounded tag badge
    ctx.fillStyle = "rgba(11, 19, 41, 0.94)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(8, 8, 496, 112, 18);
    } else {
      ctx.rect(8, 8, 496, 112);
    }
    ctx.fill();
    ctx.stroke();

    // Text label
    ctx.font = "bold 30px 'JetBrains Mono', 'Segoe UI', monospace";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 256, 64);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.set(x, y, z);
    sprite.scale.set(16, 4, 1);

    const destGroup = targetGroup || this.campusGroup;
    destGroup.add(sprite);
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
    const asphaltMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8, metalness: 0.1 });
    const houseWallMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.6, metalness: 0.1 });
    const treeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
    const treeFoliageMat = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.8 });

    // 1. Campus Internal Road Network
    const roads = [
      { x: 75, z: -55, w: 42, l: 8 },
      { x: 105, z: -72, w: 8, l: 30 },
      { x: 130, z: -78, w: 44, l: 8 }
    ];
    roads.forEach(r => {
      const roadGeo = new THREE.PlaneGeometry(r.w, r.l);
      roadGeo.rotateX(-Math.PI / 2);
      const roadMesh = new THREE.Mesh(roadGeo, asphaltMat);
      const ry = this.getTerrainHeight(r.x, r.z) + 0.15;
      roadMesh.position.set(r.x, ry, r.z);
      roadMesh.receiveShadow = true;
      this.campusGroup.add(roadMesh);
    });

    // 2. Main Gate & Kattangal Entrance Arch
    const gateX = 55;
    const gateZ = -48;
    const gateY = this.getTerrainHeight(gateX, gateZ);

    const pGeo = new THREE.BoxGeometry(2, 7.5, 2);
    const leftP = new THREE.Mesh(pGeo, trimMat);
    leftP.position.set(gateX, gateY + 3.75, gateZ - 6);
    this.campusGroup.add(leftP);

    const rightP = new THREE.Mesh(pGeo, trimMat);
    rightP.position.set(gateX, gateY + 3.75, gateZ + 6);
    this.campusGroup.add(rightP);

    const archBeam = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 14.5), adminMat);
    archBeam.position.set(gateX, gateY + 7.5, gateZ);
    this.campusGroup.add(archBeam);

    const securityCabin = new THREE.Mesh(new THREE.BoxGeometry(4.5, 3.5, 4.5), houseWallMat);
    securityCabin.position.set(gateX - 5, gateY + 1.75, gateZ + 7);
    this.campusGroup.add(securityCabin);

    this.createCampusTag("MAIN GATE (KATTANGAL)", gateX, gateY + 11.5, gateZ, "#10b981");

    // 3. Gandhi Circle Roundabout & National Tricolour Flag Mast
    const circleX = 105;
    const circleZ = -58;
    const circleY = this.getTerrainHeight(circleX, circleZ);

    const circleLawn = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 0.4, 32), lawnMat);
    circleLawn.position.set(circleX, circleY + 0.2, circleZ);
    circleLawn.receiveShadow = true;
    this.campusGroup.add(circleLawn);

    const flagMast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 14, 16), pillarMat);
    flagMast.position.set(circleX, circleY + 7.2, circleZ);
    this.campusGroup.add(flagMast);

    const flagMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 2.2), new THREE.MeshBasicMaterial({ color: 0xf97316, side: THREE.DoubleSide }));
    flagMesh.position.set(circleX + 1.8, circleY + 13, circleZ);
    this.campusGroup.add(flagMesh);

    // 4. Main Administrative Block
    const adminX = 105;
    const adminZ = -85;
    const adminY = this.getTerrainHeight(adminX, adminZ);

    // Main 3-story Building (54m wide x 16m high x 22m deep)
    const adminBody = new THREE.Mesh(new THREE.BoxGeometry(54, 16, 22), adminMat);
    adminBody.position.set(adminX, adminY + 8, adminZ);
    adminBody.castShadow = true;
    adminBody.receiveShadow = true;
    this.campusGroup.add(adminBody);

    const adminRoof = new THREE.Mesh(new THREE.BoxGeometry(55, 1.2, 23), trimMat);
    adminRoof.position.set(adminX, adminY + 16.6, adminZ);
    this.campusGroup.add(adminRoof);

    // Front Window Strips
    [-3, 2].forEach(yOff => {
      const win = new THREE.Mesh(new THREE.BoxGeometry(50, 2.4, 0.4), glassCyanMat);
      win.position.set(adminX, adminY + 8 + yOff, adminZ + 11.2);
      this.campusGroup.add(win);
    });

    // Central Grand Portico
    const porticoZ = adminZ + 12;
    const porticoBody = new THREE.Mesh(new THREE.BoxGeometry(18, 18.5, 9), adminMat);
    porticoBody.position.set(adminX, adminY + 9.25, porticoZ);
    this.campusGroup.add(porticoBody);

    // 4 Grand Pillars
    [-6, -2, 2, 6].forEach(colX => {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 16.5, 16), pillarMat);
      col.position.set(adminX + colX, adminY + 8.25, porticoZ + 4.6);
      this.campusGroup.add(col);
    });

    // Clock & Administrative Crest Tower
    const towerBody = new THREE.Mesh(new THREE.BoxGeometry(7, 8, 7), adminMat);
    towerBody.position.set(adminX, adminY + 22.5, porticoZ);
    this.campusGroup.add(towerBody);

    const clockDial = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.4, 24), glassCyanMat);
    clockDial.rotateX(Math.PI / 2);
    clockDial.position.set(adminX, adminY + 23.5, porticoZ + 3.6);
    this.campusGroup.add(clockDial);

    this.createCampusTag("NIT CALICUT - ADMIN BLOCK", adminX, adminY + 28, adminZ, "#38bdf8");

    // 5. Central Computer Centre (CCC)
    const cccX = 72;
    const cccZ = -72;
    const cccY = this.getTerrainHeight(cccX, cccZ);

    const cccBody = new THREE.Mesh(new THREE.BoxGeometry(32, 15, 26), cccGlassMat);
    cccBody.position.set(cccX, cccY + 7.5, cccZ);
    cccBody.castShadow = true;
    this.campusGroup.add(cccBody);

    const cccFrame = new THREE.Mesh(new THREE.BoxGeometry(33, 15.2, 27), new THREE.MeshBasicMaterial({ color: 0x0f172a, wireframe: true }));
    cccFrame.position.set(cccX, cccY + 7.5, cccZ);
    this.campusGroup.add(cccFrame);

    const hvac = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 5), workshopMat);
    hvac.position.set(cccX + 6, cccY + 16.5, cccZ + 4);
    this.campusGroup.add(hvac);

    this.createCampusTag("CENTRAL COMPUTER CENTRE (CCC)", cccX, cccY + 21, cccZ, "#38bdf8");

    // 6. Central Library (Rotunda & Flanking Wings)
    const libX = 95;
    const libZ = -55;
    const libY = this.getTerrainHeight(libX, libZ);

    const rotunda = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 16, 32), adminMat);
    rotunda.position.set(libX, libY + 8, libZ);
    rotunda.castShadow = true;
    this.campusGroup.add(rotunda);

    const dome = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), glassCyanMat);
    dome.position.set(libX, libY + 16, libZ);
    this.campusGroup.add(dome);

    [-18, 18].forEach(xOffset => {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(18, 13, 18), academicMat);
      wing.position.set(libX + xOffset, libY + 6.5, libZ);
      this.campusGroup.add(wing);
    });

    this.createCampusTag("CENTRAL LIBRARY", libX, libY + 22, libZ, "#38bdf8");

    // 7. Department of CSE & ECE Complex
    const cseX = 135;
    const cseZ = -80;
    const cseY = this.getTerrainHeight(cseX, cseZ);

    const cseWing = new THREE.Mesh(new THREE.BoxGeometry(44, 16, 20), academicMat);
    cseWing.position.set(cseX, cseY + 8, cseZ);
    cseWing.castShadow = true;
    this.campusGroup.add(cseWing);

    [-3, 2].forEach(yOff => {
      const win = new THREE.Mesh(new THREE.BoxGeometry(40, 2.2, 0.3), glassCyanMat);
      win.position.set(cseX, cseY + 8 + yOff, cseZ + 10.2);
      this.campusGroup.add(win);
    });

    this.createCampusTag("DEPT OF CSE & ECE", cseX, cseY + 21, cseZ, "#38bdf8");

    // 8. Mechanical & Civil Engineering Complex
    const mechX = 110;
    const mechZ = -115;
    const mechY = this.getTerrainHeight(mechX, mechZ);

    const mechBlock = new THREE.Mesh(new THREE.BoxGeometry(50, 15, 26), workshopMat);
    mechBlock.position.set(mechX, mechY + 7.5, mechZ);
    mechBlock.castShadow = true;
    this.campusGroup.add(mechBlock);

    this.createCampusTag("MECHANICAL & CIVIL COMPLEX", mechX, mechY + 20, mechZ, "#38bdf8");

    // 9. Mega Hostel Towers (Residential Ridge)
    const host1X = 155;
    const host1Z = -60;
    const host1Y = this.getTerrainHeight(host1X, host1Z);
    const host1 = new THREE.Mesh(new THREE.BoxGeometry(26, 32, 26), hostelMat);
    host1.position.set(host1X, host1Y + 16, host1Z);
    host1.castShadow = true;
    this.campusGroup.add(host1);

    const host2X = 155;
    const host2Z = -98;
    const host2Y = this.getTerrainHeight(host2X, host2Z);
    const host2 = new THREE.Mesh(new THREE.BoxGeometry(26, 32, 26), hostelMat);
    host2.position.set(host2X, host2Y + 16, host2Z);
    host2.castShadow = true;
    this.campusGroup.add(host2);

    this.createCampusTag("MEGA HOSTEL TOWERS", 155, Math.max(host1Y, host2Y) + 38, -79, "#38bdf8");

    // 10. Open Air Theatre (OAT)
    const oatX = 62;
    const oatZ = -95;
    const oatY = this.getTerrainHeight(oatX, oatZ);

    [18, 14, 10].forEach((rad, idx) => {
      const tierGeo = new THREE.RingGeometry(rad - 2, rad, 24, 1, 0, Math.PI);
      tierGeo.rotateX(-Math.PI / 2);
      const tierMesh = new THREE.Mesh(tierGeo, adminMat);
      tierMesh.position.set(oatX, oatY + 0.6 + idx * 0.8, oatZ);
      this.campusGroup.add(tierMesh);
    });

    const oatStage = new THREE.Mesh(new THREE.BoxGeometry(14, 0.8, 8), workshopMat);
    oatStage.position.set(oatX, oatY + 0.4, oatZ + 2);
    this.campusGroup.add(oatStage);

    this.createCampusTag("OPEN AIR THEATRE (OAT)", oatX, oatY + 13, oatZ, "#38bdf8");

    // 11. Kattangal-Mukkam Road Corridor & Surrounding Kerala Dwellings
    const corridorRoadGeo = new THREE.PlaneGeometry(12, 130);
    corridorRoadGeo.rotateX(-Math.PI / 2);
    const corridorRoad = new THREE.Mesh(corridorRoadGeo, asphaltMat);
    corridorRoad.position.set(46, this.getTerrainHeight(46, -85) + 0.15, -85);
    corridorRoad.receiveShadow = true;
    this.campusGroup.add(corridorRoad);

    const dwellings = [
      { x: 36, z: -45, w: 8, d: 7, h: 4.5 },
      { x: 34, z: -65, w: 9, d: 8, h: 5.0 },
      { x: 35, z: -85, w: 8, d: 7, h: 4.5 },
      { x: 37, z: -105, w: 9, d: 8, h: 5.0 },
      { x: 34, z: -125, w: 8, d: 7, h: 4.5 },
      { x: 54, z: -35, w: 7, d: 6, h: 4.0 }, // Kattangal junction tea stall
      { x: 48, z: -68, w: 8, d: 6, h: 4.0 }  // Local grocery store
    ];

    dwellings.forEach(d => {
      const dy = this.getTerrainHeight(d.x, d.z);
      const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(d.w, d.h, d.d), houseWallMat);
      baseMesh.position.set(d.x, dy + d.h / 2, d.z);
      baseMesh.castShadow = true;
      this.campusGroup.add(baseMesh);

      const roofRadius = Math.max(d.w, d.d) * 0.72;
      const roofGeo = new THREE.ConeGeometry(roofRadius, 3.2, 4);
      roofGeo.rotateY(Math.PI / 4);
      const roofMesh = new THREE.Mesh(roofGeo, terracottaMat);
      roofMesh.position.set(d.x, dy + d.h + 1.6, d.z);
      this.campusGroup.add(roofMesh);
    });

    // 12. Tropical Trees along Campus Borders
    const treeCoords = [
      { x: 50, z: -42 }, { x: 50, z: -55 }, { x: 70, z: -46 }, { x: 85, z: -48 },
      { x: 105, z: -45 }, { x: 125, z: -50 }, { x: 60, z: -78 }, { x: 60, z: -110 },
      { x: 85, z: -105 }, { x: 135, z: -105 }, { x: 155, z: -120 }, { x: 42, z: -55 },
      { x: 40, z: -78 }, { x: 42, z: -98 }, { x: 40, z: -118 }, { x: 48, z: -80 }
    ];

    treeCoords.forEach(t => {
      const ty = this.getTerrainHeight(t.x, t.z);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 5, 8), treeTrunkMat);
      trunk.position.set(t.x, ty + 2.5, t.z);
      this.campusGroup.add(trunk);

      const foliage = new THREE.Mesh(new THREE.ConeGeometry(2.4, 3.8, 8), treeFoliageMat);
      foliage.position.set(t.x, ty + 5.5, t.z);
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

    // 1. Catmull-Rom Spline Curve from Flooded Terrain to Safe Haven Ridge
    const waypoints = [
      new THREE.Vector3(42, 1.8, -35),   // Flooded Mavoor corridor (Trapped Citizen Origin)
      new THREE.Vector3(48, 3.5, -42),   // Elevated Kattangal junction turn
      new THREE.Vector3(55, 6.2, -48),   // Safe passage through Main Gate
      new THREE.Vector3(75, 10.8, -60),  // Campus Avenue near CCC
      new THREE.Vector3(95, 14.5, -68),  // Gandhi Circle approach
      new THREE.Vector3(105, 21.0, -80)  // Destination Haven: Admin Block Ridge (+48.5m MSL)
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

        this.createCampusTag("SAFE REFUGE HAVEN (+48.5m MSL)", wp.x, wp.y + beamHeight + 7, wp.z, "#10b981", this.evacuationGroup);
      }
    });

    // 3. Submerged Road Barricades (Closing Flooded Routes)
    const barricades = [
      { x: 35, y: 0.8, z: -25, rot: 0.3 },
      { x: 25, y: 0.6, z: -45, rot: -0.4 }
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

      this.createCampusTag("ROAD CLOSED: INUNDATION HAZARD", b.x, b.y + 4.5, b.z, "#ef4444", this.evacuationGroup);
    });

    // Fly camera smoothly to reveal the evacuation path towards NIT Calicut
    this.smoothCameraTransition(new THREE.Vector3(145, 55, -45), new THREE.Vector3(105, 16, -85), 1400);

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
      case "nit_calicut":
        this.smoothCameraTransition(new THREE.Vector3(145, 52, -45), new THREE.Vector3(105, 16, -85));
        break;
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

    // Pulse evacuation route if active
    if (this.evacuationActive && this.evacTubeMesh) {
      this.evacTubeMesh.material.emissiveIntensity = 0.75 + Math.sin(this.animTime * 3.5) * 0.25;
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

window.TwinEngine = TwinEngine;
