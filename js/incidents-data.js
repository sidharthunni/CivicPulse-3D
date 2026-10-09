/**
 * CivicPulse 3D - Geo-Spatial Incident Dataset & State Store
 * Synchronizes incidents across LocalStorage, 3D Twin Viewport, and REST API.
 */

const DEFAULT_INCIDENTS = [
  {
    id: "CP-2026-101",
    title: "Severe Stormwater Drain Rupture & Street Inundation",
    category: "drainage",
    categoryLabel: "Drainage & Flooding",
    severity: "critical",
    status: "in_progress",
    address: "Mavoor Road Commercial Corridor, Kozhikode",
    lat: 11.2588,
    lng: 75.7804,
    x: 42,
    z: -35,
    y: 0.5,
    reportedBy: "K. Radhakrishnan (Citizen #4819)",
    reportedAt: "2026-10-09 08:30 IST",
    agency: "Kerala Water Authority (KWA) & Kozhikode Municipal Corp",
    slaHours: 8,
    elapsedHours: 3.5,
    budgetEstimate: "INR 1,45,000",
    interAgencyConflict: "HOLD NOTICE: PWD road resurfacing paused until KWA repairs subterranean pipe breach.",
    description: "Primary stormwater culvert ruptured following monsoon downpour. Waterlogging level at 0.65m obstructing traffic on national highway link.",
    photoUrl: "https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=800&q=80",
    auditHash: "0x8f72a49b6d81e012c448bb652b1139e8a5b23d9a",
    history: [
      { step: "Report Ingested", timestamp: "08:30 IST", note: "Citizen geotagged pin with photograph." },
      { step: "AI Triage Verified", timestamp: "08:32 IST", note: "Computer vision classified structural drain failure (94.2% confidence). Priority: Critical." },
      { step: "Inter-Agency Route", timestamp: "08:35 IST", note: "Dispatched to KWA Drainage Division & Municipal Disaster Cell." },
      { step: "Field Team On-Site", timestamp: "09:45 IST", note: "Pump deployment team initiated suction ops." }
    ]
  },
  {
    id: "CP-2026-102",
    title: "Major Asphalt Crater & Base Layer Subsidence",
    category: "road",
    categoryLabel: "Road & Potholes",
    severity: "high",
    status: "assigned",
    address: "South Beach Road, Near Old Pier",
    lat: 11.2467,
    lng: 75.7725,
    x: -85,
    z: 20,
    y: 0.3,
    reportedBy: "Fathima Zahra (Ward 14 Councillor)",
    reportedAt: "2026-10-09 09:15 IST",
    agency: "Public Works Department (PWD - Roads Wing)",
    slaHours: 24,
    elapsedHours: 2.7,
    budgetEstimate: "INR 68,000",
    interAgencyConflict: "None. Direct PWD jurisdiction.",
    description: "Continuous tidal moisture and heavy freight traffic created a 1.2m diameter road crater. Severe skidding hazard for two-wheelers.",
    photoUrl: "https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=800&q=80",
    auditHash: "0x3c99f120aa54b72381e09923cd481093ee9108a7",
    history: [
      { step: "Report Ingested", timestamp: "09:15 IST", note: "Geolocated via CivicPulse Mobile." },
      { step: "AI Triage Verified", timestamp: "09:16 IST", note: "Assessed severity index: High (Depth: 18cm)." },
      { step: "Work Order Dispatched", timestamp: "09:20 IST", note: "Assigned to Central Sub-Division Contractor (PWD)." }
    ]
  },
  {
    id: "CP-2026-103",
    title: "Unregulated Industrial Waste Dump Choking Estuary",
    category: "waste",
    categoryLabel: "Waste Management",
    severity: "high",
    status: "in_progress",
    address: "Kallai River Bank, Industrial Sector",
    lat: 11.2319,
    lng: 75.7952,
    x: -25,
    z: 95,
    y: 0.2,
    reportedBy: "Environment Action Committee",
    reportedAt: "2026-10-09 07:10 IST",
    agency: "Suchitwa Mission & Kerala State Pollution Control Board",
    slaHours: 12,
    elapsedHours: 4.8,
    budgetEstimate: "INR 92,000",
    interAgencyConflict: "Joint police notice issued to adjacent scrap warehouse.",
    description: "Over 3 metric tons of mixed plastic and non-biodegradable debris illegally dumped into canal buffer zone, threatening tidal water discharge.",
    photoUrl: "https://images.unsplash.com/photo-1605600659873-d808a13e4d2a?auto=format&fit=crop&w=800&q=80",
    auditHash: "0x712a884ef980bb29124da09153cc14b8a2e10988",
    history: [
      { step: "Report Ingested", timestamp: "07:10 IST", note: "Multi-image submission by local residents." },
      { step: "AI Triage Verified", timestamp: "07:12 IST", note: "Waste volume estimated at 3.2 cubic meters. Environmental risk: Critical." },
      { step: "Enforcement Notice", timestamp: "08:00 IST", note: "Sanitation inspectors mobilized with bobcat excavator." }
    ]
  },
  {
    id: "CP-2026-104",
    title: "High-Tension Power Cable Sagging Across Transit Corridor",
    category: "electrical",
    categoryLabel: "Electrical Hazard",
    severity: "critical",
    status: "resolved",
    address: "Palayam Junction Near Bus Terminal",
    lat: 11.2512,
    lng: 75.7844,
    x: 10,
    z: 5,
    y: 1.2,
    reportedBy: "Traffic Patrol Unit 4",
    reportedAt: "2026-10-09 06:40 IST",
    agency: "Kerala State Electricity Board (KSEB)",
    slaHours: 4,
    elapsedHours: 3.8,
    budgetEstimate: "INR 25,000",
    interAgencyConflict: "Traffic rerouted via Court Road during line repair.",
    description: "Heavy bough snapped during overnight storm, pulling 11kV overhead cable down to 2.2 meters clearance from asphalt surface.",
    photoUrl: "https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=800&q=80",
    auditHash: "0x9b11e2f7acb109553a1097e3cd9281a8fb102377",
    history: [
      { step: "Report Ingested", timestamp: "06:40 IST", note: "Emergency alert received from traffic unit." },
      { step: "Line De-energized", timestamp: "06:45 IST", note: "Substation remote feeder trip executed." },
      { step: "Repair & Re-tensioning", timestamp: "08:15 IST", note: "KSEB linesmen pole tension restored." },
      { step: "Publicly Verified & Closed", timestamp: "09:30 IST", note: "Safety clearance certificate submitted with geo-photo proof." }
    ]
  },
  {
    id: "CP-2026-105",
    title: "Hillside Terraced Slope Tension Crack & Landslide Risk",
    category: "slope",
    categoryLabel: "Landslide & Slope Risk",
    severity: "critical",
    status: "in_progress",
    address: "Kunnamangalam Ridge - NIT Calicut Transit Spur",
    lat: 11.3215,
    lng: 75.9341,
    x: 110,
    z: -80,
    y: 8.5,
    reportedBy: "NIT Campus Security Alert",
    reportedAt: "2026-10-09 08:00 IST",
    agency: "District Disaster Management Authority (DDMA) & PWD",
    slaHours: 6,
    elapsedHours: 3.9,
    budgetEstimate: "INR 3,20,000",
    interAgencyConflict: "Geological Survey inspection mandated before retaining wall construction.",
    description: "Continuous saturation of laterite soil has caused a 25-meter lateral tension crack along road embankment slope. High risk of mudslide.",
    photoUrl: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=800&q=80",
    auditHash: "0x5e44a98b7121c00994ee8812bf701955cc231189",
    history: [
      { step: "Sensor & Visual Flag", timestamp: "08:00 IST", note: "Slope movement detected via inclinometer simulation." },
      { step: "Perimeter Sealed", timestamp: "08:30 IST", note: "Warning barricades placed along outer lane." },
      { step: "Geotechnical Assessment", timestamp: "09:50 IST", note: "DDMA field engineers on site evaluating shotcrete stabilization." }
    ]
  },
  {
    id: "CP-2026-106",
    title: "Mananchira Waterbody Inflow Channel Sediment Blockage",
    category: "drainage",
    categoryLabel: "Urban Hydrology",
    severity: "medium",
    status: "assigned",
    address: "Mananchira Square North Conduit",
    lat: 11.2530,
    lng: 75.7790,
    x: -15,
    z: -18,
    y: 0.4,
    reportedBy: "Heritage Preservation Trust",
    reportedAt: "2026-10-09 10:10 IST",
    agency: "Minor Irrigation Department & Municipal Heritage Wing",
    slaHours: 48,
    elapsedHours: 1.8,
    budgetEstimate: "INR 45,000",
    interAgencyConflict: "None.",
    description: "Silt and debris buildup choking gravity-fed feeder channel of historical urban freshwater reservoir during pre-monsoon flow.",
    photoUrl: "https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&w=800&q=80",
    auditHash: "0x12a9bc77de88012354aa0988cc719054ee410099",
    history: [
      { step: "Report Ingested", timestamp: "10:10 IST", note: "Logged via Citizen Portal." },
      { step: "Scheduled", timestamp: "10:35 IST", note: "Desilting excavator scheduled for low-traffic night shift." }
    ]
  }
];

class IncidentStore {
  constructor() {
    this.storageKey = 'civicpulse_incidents_v1';
    this.incidents = this.load();
  }

  load() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('LocalStorage unavailable, using default incidents dataset');
    }
    this.save(DEFAULT_INCIDENTS);
    return JSON.parse(JSON.stringify(DEFAULT_INCIDENTS));
  }

  save(data) {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (e) {}
  }

  getAll() {
    return this.incidents;
  }

  getById(id) {
    return this.incidents.find(i => i.id === id);
  }

  add(incident) {
    const randomId = "CP-2026-" + Math.floor(100 + Math.random() * 900);
    const newIncident = Object.assign({
      id: randomId,
      status: 'reported',
      reportedAt: new Date().toLocaleTimeString('en-US', { hour12: false }) + ' IST (Today)',
      elapsedHours: 0.1,
      auditHash: '0x' + Array.from({length: 40}, () => Math.floor(Math.random()*16).toString(16)).join(''),
      history: [
        { step: 'Report Ingested', timestamp: 'Just now', note: 'Logged via CivicPulse Ultra-Accessible Portal.' },
        { step: 'Autonomous AI Triage', timestamp: 'Just now', note: 'Routing assigned to ' + (incident.agency || 'Municipal Corp') + '. Priority: ' + (incident.severity || 'Medium').toUpperCase() + '.' }
      ]
    }, incident);

    this.incidents.unshift(newIncident);
    this.save(this.incidents);
    window.dispatchEvent(new CustomEvent('civicpulse:incidentAdded', { detail: newIncident }));
    return newIncident;
  }

  updateStatus(id, newStatus, note = 'Status updated by Municipal Authority') {
    const inc = this.getById(id);
    if (!inc) return null;
    inc.status = newStatus;
    inc.history.push({
      step: 'Status: ' + newStatus.toUpperCase(),
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }) + ' IST',
      note: note
    });
    this.save(this.incidents);
    window.dispatchEvent(new CustomEvent('civicpulse:incidentUpdated', { detail: inc }));
    return inc;
  }

  getStats() {
    const total = this.incidents.length;
    const critical = this.incidents.filter(i => i.severity === 'critical').length;
    const inProgress = this.incidents.filter(i => i.status === 'in_progress').length;
    const resolved = this.incidents.filter(i => i.status === 'resolved').length;
    return { total, critical, inProgress, resolved };
  }
}

window.CivicStore = new IncidentStore();
