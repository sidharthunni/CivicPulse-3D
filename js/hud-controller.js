/**
 * CivicPulse 3D - Municipal Spatial HUD Controller
 * Handles user interactions, real-time telemetry tickers, incident inspection,
 * camera fly-tos, category filters, and modal dialogues.
 * Strictly zero emojis
 */

class HUDController {
  constructor() {
    this.selectedIncident = null;
    this.currentCategoryFilter = 'all';

    this.initClock();
    this.initTelemetry();
    this.initCameraControls();
    this.initCategoryFilters();
    this.initInspector();
    this.initCarousel();
    this.initModals();
    this.initQuickActions();
    this.initSpatialNavigation();
    this.initLandmarkInspector();
    this.initCopernicusSideWidget();

    // Listen to custom store events
    window.addEventListener('civicpulse:incidentAdded', (e) => {
      this.updateTelemetry();
      this.renderCarousel();
      if (e.detail) {
        this.displayIncidentDetails(e.detail);
        if (window.twinEngine) {
          window.twinEngine.flyToIncident(e.detail.id);
        }
      }
    });

    window.addEventListener('civicpulse:incidentUpdated', (e) => {
      this.updateTelemetry();
      this.renderCarousel();
      if (this.selectedIncident && this.selectedIncident.id === e.detail.id) {
        this.displayIncidentDetails(e.detail);
      }
    });

    window.addEventListener('civicpulse:selectIncident', (e) => {
      if (e.detail) {
        this.displayIncidentDetails(e.detail);
      }
    });
  }

  // 1. Live IST Clock
  initClock() {
    const clockEl = document.getElementById('telemetry-clock');
    const updateTime = () => {
      if (clockEl) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-GB', { hour12: false }) + ' IST';
        clockEl.textContent = timeStr;
      }
    };
    updateTime();
    setInterval(updateTime, 1000);
  }

  // 2. Telemetry Counters
  initTelemetry() {
    this.updateTelemetry();
  }

  updateTelemetry() {
    const stats = window.CivicStore.getStats();
    const totalEl = document.getElementById('telemetry-total');
    const criticalEl = document.getElementById('telemetry-critical');
    const inProgressEl = document.getElementById('telemetry-progress');
    const resolvedEl = document.getElementById('telemetry-resolved');

    if (totalEl) totalEl.textContent = stats.total;
    if (criticalEl) criticalEl.textContent = stats.critical;
    if (inProgressEl) inProgressEl.textContent = stats.inProgress;
    if (resolvedEl) resolvedEl.textContent = stats.resolved;
  }

  // 3. Drone Camera Presets
  initCameraControls() {
    document.querySelectorAll('[data-cam-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = btn.getAttribute('data-cam-preset');
        if (window.twinEngine) {
          window.twinEngine.setCameraPreset(preset);
        }
        if (window.simController) {
          window.simController.playTacticalBeep(980, 'sine', 0.08);
        }

        document.querySelectorAll('[data-cam-preset]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const sectorSelect = document.getElementById('select-desired-sector');
        if (sectorSelect) {
          sectorSelect.value = preset;
        }
      });
    });
  }

  // 4. Hazard Category Filters
  initCategoryFilters() {
    document.querySelectorAll('[data-filter-category]').forEach(chip => {
      chip.addEventListener('click', () => {
        const cat = chip.getAttribute('data-filter-category');
        this.currentCategoryFilter = cat;

        document.querySelectorAll('[data-filter-category]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');

        this.renderCarousel();

        if (window.simController) {
          window.simController.playTacticalBeep(720, 'sine', 0.06);
        }
      });
    });
  }

  // 5. Incident Inspector Binding
  initInspector() {
    // Select first critical incident on initial load
    const incidents = window.CivicStore.getAll();
    if (incidents.length > 0) {
      this.displayIncidentDetails(incidents[0]);
    }
  }

  displayIncidentDetails(inc) {
    this.selectedIncident = inc;
    const container = document.getElementById('inspector-content');
    if (!container) return;

    const conflictHtml = inc.interAgencyConflict && inc.interAgencyConflict.length > 0
      ? `<div class="conflict-banner">
          <strong>Jurisdiction Conflict Protocol</strong>
          ${inc.interAgencyConflict}
        </div>`
      : '';

    const historyTimeline = inc.history.map(item => `
      <div class="timeline-entry">
        <div class="timeline-header">
          <span>${item.step}</span>
          <span class="timeline-time">${item.timestamp}</span>
        </div>
        <div class="timeline-note">${item.note}</div>
      </div>
    `).join('');

    container.innerHTML = `
      <div class="incident-card-detailed">
        <div class="incident-meta-top">
          <span class="incident-id-badge">${inc.id}</span>
          <span class="severity-pill ${inc.severity}">${inc.severity.toUpperCase()}</span>
        </div>

        <div class="incident-title-text">${inc.title}</div>

        <div class="incident-address">
          <span>Location:</span> ${inc.address} (WGS84: ${inc.lat.toFixed(4)}N, ${inc.lng.toFixed(4)}E)
        </div>

        ${conflictHtml}

        <div class="metric-row">
          <div class="metric-cell">
            <span class="label">Primary Agency</span>
            <span class="value">${inc.agency.split('&')[0].trim()}</span>
          </div>
          <div class="metric-cell">
            <span class="label">SLA Window</span>
            <span class="value">${inc.slaHours} Hours (${inc.elapsedHours}h elapsed)</span>
          </div>
          <div class="metric-cell">
            <span class="label">Cost Est.</span>
            <span class="value">${inc.budgetEstimate}</span>
          </div>
        </div>

        <div class="evidence-photo-box">
          <img src="${inc.photoUrl}" alt="${inc.title}" onerror="this.src='https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=800&q=80'" />
          <div class="evidence-badge">GEOTAGGED EVIDENCE PHOTOGRAPH</div>
        </div>

        <button class="btn-tactical primary" id="btn-open-gpr" style="width: 100%; margin-top: 6px; padding: 7px; justify-content: center; font-size: 10px;">
          RUN GPR SOIL & PIPE SCANNER
        </button>

        <div class="audit-hash-bar">
          <div>
            <div class="hash-label">Public Audit Ledger Hash</div>
            <div class="hash-code" id="audit-hash-text">${inc.auditHash}</div>
          </div>
          <button class="btn-tactical" id="btn-copy-hash" style="padding: 3px 8px; font-size: 9px;">COPY</button>
        </div>

        <div class="section-label" style="margin-top: 6px;">
          <span>Resolution Lifecycle Audit Trail</span>
          <span style="color: var(--accent-cyan); font-weight: 700;">${inc.status.toUpperCase()}</span>
        </div>

        <div class="workflow-timeline">
          ${historyTimeline}
        </div>

        <div class="status-actions-bar">
          <button class="btn-status progress" id="btn-action-progress" ${inc.status === 'in_progress' ? 'disabled style="opacity: 0.5;"' : ''}>
            MARK IN PROGRESS
          </button>
          <button class="btn-status resolve" id="btn-action-resolve" ${inc.status === 'resolved' ? 'disabled style="opacity: 0.5;"' : ''}>
            CERTIFY & RESOLVE
          </button>
        </div>
      </div>
    `;

    // Bind GPR Scanner Button
    const gprBtn = document.getElementById('btn-open-gpr');
    const gprModal = document.getElementById('gpr-modal');
    if (gprBtn && gprModal) {
      gprBtn.addEventListener('click', () => {
        gprModal.classList.add('active');
        if (window.simController) window.simController.playTacticalBeep(920, 'square', 0.12);
        if (window.twinEngine) window.twinEngine.triggerSubsurfaceScan(inc.id);
      });
    }

    const closeGprBtn = document.getElementById('btn-close-gpr');
    if (closeGprBtn && gprModal) {
      closeGprBtn.addEventListener('click', () => {
        gprModal.classList.remove('active');
      });
    }

    // Bind Copy Hash Button
    const copyBtn = document.getElementById('btn-copy-hash');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(inc.auditHash);
        copyBtn.textContent = 'COPIED';
        setTimeout(() => { copyBtn.textContent = 'COPY'; }, 1500);
      });
    }

    // Bind Status Actions
    const progBtn = document.getElementById('btn-action-progress');
    if (progBtn) {
      progBtn.addEventListener('click', () => {
        window.CivicStore.updateStatus(inc.id, 'in_progress', 'Dispatched municipal engineering unit on site.');
        if (window.simController) window.simController.playTacticalBeep(600, 'square', 0.1);
      });
    }

    const resolveBtn = document.getElementById('btn-action-resolve');
    if (resolveBtn) {
      resolveBtn.addEventListener('click', () => {
        window.CivicStore.updateStatus(inc.id, 'resolved', 'Audit verified by Municipal Ward Inspector with geo-clearance.');
        if (window.simController) window.simController.playTacticalBeep(880, 'sine', 0.15);
      });
    }

    // Update bottom carousel highlight
    document.querySelectorAll('.carousel-chip').forEach(chip => {
      chip.classList.toggle('active', chip.getAttribute('data-id') === inc.id);
    });
  }

  // 6. Bottom Incident Carousel
  initCarousel() {
    this.renderCarousel();
  }

  renderCarousel() {
    const container = document.getElementById('incident-carousel');
    if (!container) return;

    let incidents = window.CivicStore.getAll();
    if (this.currentCategoryFilter !== 'all') {
      incidents = incidents.filter(i => i.category === this.currentCategoryFilter);
    }

    if (incidents.length === 0) {
      container.innerHTML = '<span style="font-family: var(--font-mono); font-size: 10px; color: var(--text-muted);">No incidents found in this category filter.</span>';
      return;
    }

    container.innerHTML = incidents.map(inc => `
      <div class="carousel-chip ${this.selectedIncident && this.selectedIncident.id === inc.id ? 'active' : ''}" data-id="${inc.id}">
        <span class="status-dot ${inc.severity === 'critical' ? 'active' : ''}" style="background-color: ${this.getColorForSeverity(inc.severity, inc.status)}"></span>
        <strong>${inc.id}</strong>
        <span>${inc.title.substring(0, 24)}...</span>
      </div>
    `).join('');

    container.querySelectorAll('.carousel-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const id = chip.getAttribute('data-id');
        if (window.twinEngine) {
          window.twinEngine.flyToIncident(id);
        }
        if (window.simController) {
          window.simController.playTacticalBeep(840, 'triangle', 0.08);
        }
      });
    });
  }

  getColorForSeverity(sev, status) {
    if (status === 'resolved') return '#10b981';
    switch (sev) {
      case 'critical': return '#ef4444';
      case 'high': return '#f59e0b';
      case 'medium': return '#3b82f6';
      default: return '#06b6d4';
    }
  }

  // 7. Modals
  initModals() {
    const modal = document.getElementById('info-modal');
    const openBtn = document.getElementById('btn-open-modal');
    const closeBtn = document.getElementById('btn-close-modal');
    const gprModal = document.getElementById('gpr-modal');
    const closeGprBtn = document.getElementById('btn-close-gpr');

    const openGpr = () => {
      if (gprModal) {
        gprModal.classList.add('active');
        if (window.simController) window.simController.playTacticalBeep(920, 'square', 0.12);
        const inc = this.selectedIncident || window.CivicStore.getAll()[0];
        if (inc && window.twinEngine) {
          window.twinEngine.triggerSubsurfaceScan(inc.id);
        }
        const targetText = document.getElementById('gpr-target-display');
        if (targetText && inc) {
          targetText.textContent = `GROUND PENETRATING RADAR TRANSIT SLICE // TARGET: ${inc.id} (${inc.title.substring(0, 28).toUpperCase()})`;
        }
      }
    };

    const headerGprBtn = document.getElementById('btn-header-gpr');
    if (headerGprBtn) headerGprBtn.addEventListener('click', openGpr);

    const leftGprBtn = document.getElementById('btn-left-gpr');
    if (leftGprBtn) leftGprBtn.addEventListener('click', openGpr);

    if (closeGprBtn && gprModal) {
      closeGprBtn.addEventListener('click', () => {
        gprModal.classList.remove('active');
      });
    }

    if (openBtn && modal) {
      openBtn.addEventListener('click', () => {
        modal.classList.add('active');
        if (window.simController) window.simController.playTacticalBeep(700, 'sine', 0.08);
      });
    }

    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
      });
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
      });
    }

    if (gprModal) {
      gprModal.addEventListener('click', (e) => {
        if (e.target === gprModal) gprModal.classList.remove('active');
      });
    }
  }

  // 8. Quick Actions (Fullscreen, Sound Toggle, Civilian View)
  initQuickActions() {
    const civBtn = document.getElementById('btn-toggle-civ-mode');
    if (civBtn) {
      civBtn.addEventListener('click', () => {
        document.body.classList.toggle('civilian-mode');
        const isCiv = document.body.classList.contains('civilian-mode');
        civBtn.textContent = isCiv ? 'VIEW: CITIZEN FRIENDLY' : 'VIEW: MUNICIPAL COMMAND';
        const leftTitle = document.getElementById('left-panel-title');
        if (leftTitle) {
          leftTitle.textContent = isCiv ? 'CITY HAZARDS & RAIN STATUS' : 'SIMULATION & DRONE PATROL';
        }
        if (window.simController) window.simController.playTacticalBeep(780, 'sine', 0.08);
      });
    }

    const fsBtn = document.getElementById('btn-toggle-fs');
    if (fsBtn) {
      fsBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
          fsBtn.textContent = 'EXIT FULLSCREEN';
        } else {
          document.exitFullscreen().catch(() => {});
          fsBtn.textContent = 'FULLSCREEN';
        }
      });
    }

    const soundBtn = document.getElementById('btn-toggle-sound');
    if (soundBtn) {
      soundBtn.addEventListener('click', () => {
        if (window.simController) {
          window.simController.soundEnabled = !window.simController.soundEnabled;
          soundBtn.textContent = window.simController.soundEnabled ? 'AUDIO: ON' : 'AUDIO: MUTED';
        }
      });
    }
  }

  // 9. Floating Spatial Location & Evacuation Bar
  initSpatialNavigation() {
    const liveGpsBtn = document.getElementById('btn-live-gps');
    const sectorSelect = document.getElementById('select-desired-sector');
    const evacBtn = document.getElementById('btn-toggle-evacuation');
    const evacCard = document.getElementById('evacuation-overlay-card');

    if (liveGpsBtn) {
      liveGpsBtn.addEventListener('click', () => {
        if (window.twinEngine) {
          window.twinEngine.setCameraPreset('nit_admin');
        }
        if (sectorSelect) {
          sectorSelect.value = 'nit_admin';
        }
        document.querySelectorAll('[data-cam-preset]').forEach(b => {
          b.classList.toggle('active', b.getAttribute('data-cam-preset') === 'nit_admin');
        });
        if (window.simController) {
          window.simController.playTacticalBeep(880, 'sine', 0.1);
        }
      });
    }

    if (sectorSelect) {
      sectorSelect.addEventListener('change', () => {
        const sector = sectorSelect.value;
        if (window.twinEngine) {
          window.twinEngine.setCameraPreset(sector);
        }
        document.querySelectorAll('[data-cam-preset]').forEach(b => {
          b.classList.toggle('active', b.getAttribute('data-cam-preset') === sector);
        });
        if (window.simController) {
          window.simController.playTacticalBeep(720, 'sine', 0.08);
        }
      });
    }

    const dimToggleBtn = document.getElementById('btn-toggle-2d-3d');
    const dimLabel = document.getElementById('label-dimension-mode');
    let currentDimMode = '3d';

    if (dimToggleBtn && dimLabel) {
      dimToggleBtn.addEventListener('click', () => {
        if (window.twinEngine) {
          if (currentDimMode === '3d') {
            window.twinEngine.setPerspectiveMode('2d');
            dimLabel.textContent = 'TRANSFORM: 3D TERRAIN';
            dimToggleBtn.classList.add('active');
            currentDimMode = '2d';
          } else {
            window.twinEngine.setPerspectiveMode('3d');
            dimLabel.textContent = 'TRANSFORM: 2D SATELLITE';
            dimToggleBtn.classList.remove('active');
            currentDimMode = '3d';
          }
          if (window.simController) {
            window.simController.playTacticalBeep(currentDimMode === '2d' ? 640 : 880, 'sine', 0.1);
          }
        }
      });
    }

    if (evacBtn) {
      evacBtn.addEventListener('click', () => {
        if (window.twinEngine) {
          const active = window.twinEngine.toggleEvacuationRoute();
          evacBtn.classList.toggle('active', active);
          if (evacCard) {
            evacCard.classList.toggle('active', active);
          }
          if (window.simController) {
            window.simController.playTacticalBeep(active ? 950 : 520, 'sine', 0.12);
          }
        }
      });
    }
  }

  // 10. Landmark & Campus Monument Inspector
  initLandmarkInspector() {
    const card = document.getElementById('landmark-inspector-card');
    const closeBtn = document.getElementById('btn-close-landmark');

    const titleEl = document.getElementById('lm-title');
    const categoryEl = document.getElementById('lm-category');
    const descEl = document.getElementById('lm-desc');
    const dimsEl = document.getElementById('lm-dimensions');
    const storeysEl = document.getElementById('lm-storeys');
    const distEl = document.getElementById('lm-distance');
    const elevEl = document.getElementById('lm-elevation');
    const slopeEl = document.getElementById('lm-slope');
    const safetyPill = document.getElementById('lm-safety-pill');

    if (closeBtn && card) {
      closeBtn.addEventListener('click', () => {
        card.classList.remove('active');
        if (window.twinEngine) {
          window.twinEngine.clearLandmarkMeasurement();
        }
      });
    }

    window.addEventListener('civicpulse:selectBuilding', (e) => {
      if (!card || !e.detail) return;
      const d = e.detail;

      if (titleEl) titleEl.textContent = d.name.toUpperCase();
      if (categoryEl) categoryEl.textContent = d.category.toUpperCase();
      if (descEl) descEl.textContent = d.description;
      if (dimsEl) dimsEl.textContent = d.dimensions;
      if (storeysEl) storeysEl.textContent = d.storeys;
      if (distEl) distEl.textContent = `${d.horizontalDistance}m (${d.bearingDeg} deg ${d.bearingDirection})`;
      if (elevEl) elevEl.textContent = d.elevationMSL;
      if (slopeEl) slopeEl.textContent = d.slope;

      if (safetyPill) {
        safetyPill.textContent = d.floodSafety;
        if (d.floodSafety.includes('MAXIMUM') || d.floodSafety.includes('SAFE')) {
          safetyPill.className = 'landmark-status-pill safe';
        } else {
          safetyPill.className = 'landmark-status-pill warning';
        }
      }

      card.classList.add('active');
    });

    window.addEventListener('civicpulse:deselectBuilding', () => {
      if (card) {
        card.classList.remove('active');
      }
    });
  }

  // 11. Floating 2D Copernicus Satellite Radar Side-Widget
  initCopernicusSideWidget() {
    const widget = document.getElementById('copernicus-side-widget');
    const toggleBtn = document.getElementById('btn-toggle-copernicus-widget');
    const transformBtn = document.getElementById('btn-side-transform-3d');
    const inundationVal = document.getElementById('copernicus-inundation-val');
    const canvas = document.getElementById('copernicus-2d-canvas');

    if (toggleBtn && widget) {
      toggleBtn.addEventListener('click', () => {
        widget.classList.toggle('minimized');
        toggleBtn.textContent = widget.classList.contains('minimized') ? '+' : '_';
      });
    }

    if (transformBtn) {
      transformBtn.addEventListener('click', () => {
        if (window.twinEngine) {
          window.twinEngine.setPerspectiveMode('3d');
        }
        if (window.simController) {
          window.simController.playTacticalBeep(880, 'sine', 0.12);
        }
        const dimLabel = document.getElementById('label-dimension-mode');
        const dimToggleBtn = document.getElementById('btn-toggle-2d-3d');
        if (dimLabel) dimLabel.textContent = 'TRANSFORM: 2D SATELLITE';
        if (dimToggleBtn) dimToggleBtn.classList.remove('active');
      });
    }

    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let radarAngle = 0;

    const render2dRadar = () => {
      const w = canvas.width;
      const h = canvas.height;
      radarAngle = (radarAngle + 0.035) % (Math.PI * 2);

      // 1. Dark tactical base
      ctx.fillStyle = '#060913';
      ctx.fillRect(0, 0, w, h);

      // 2. Subtle coordinate grid
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 22) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += 22) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // 3. Concentric radar range rings centered at Gandhi Circle (135, 95)
      const centerX = 135;
      const centerY = 95;
      [30, 60, 95].forEach((rad, i) => {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.18)';
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.arc(centerX, centerY, rad, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
        ctx.font = '8px monospace';
        ctx.fillText(`${(i + 1) * 300}m`, centerX + rad + 2, centerY - 2);
      });

      // 4. Chaliyar / Iruvanjippuzha river corridor (West side)
      ctx.beginPath();
      ctx.moveTo(28, 0);
      ctx.bezierCurveTo(45, 50, 35, 110, 52, h);
      ctx.lineTo(15, h);
      ctx.bezierCurveTo(8, 110, 18, 50, 6, 0);
      ctx.closePath();
      ctx.fillStyle = 'rgba(2, 132, 199, 0.35)';
      ctx.fill();
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 1;
      ctx.stroke();

      // 5. Dynamic Flood Inundation Polygon synced with simulation
      const floodLevel = (window.simController ? window.simController.currentFloodLevel : 0) || 0;
      if (inundationVal) {
        inundationVal.textContent = floodLevel === 0 ? '0.0m (Normal)' : `+${floodLevel.toFixed(1)}m Inundation`;
        inundationVal.className = floodLevel === 0 ? 'emerald' : (floodLevel <= 2.0 ? 'cyan' : 'amber');
      }

      if (floodLevel > 0) {
        const spread = Math.min(85, floodLevel * 14);
        ctx.beginPath();
        ctx.moveTo(28, 0);
        ctx.bezierCurveTo(45 + spread * 0.8, 50, 35 + spread, 110, 52 + spread * 0.7, h);
        ctx.lineTo(0, h);
        ctx.lineTo(0, 0);
        ctx.closePath();
        ctx.fillStyle = `rgba(14, 165, 233, ${Math.min(0.55, 0.2 + floodLevel * 0.05)})`;
        ctx.fill();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // 6. Roads: Mukkam Highway SH 34 & Campus Rajpath
      // SH 34 East-West Highway
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.65)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, 128);
      ctx.lineTo(w, 128);
      ctx.stroke();

      // Highway label
      ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
      ctx.font = '7.5px monospace';
      ctx.fillText('SH 34 MUKKAM HWY', 6, 124);

      // Rajpath Avenue (Main Gate to Gandhi Circle to Admin)
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(centerX, 128);
      ctx.lineTo(centerX, centerY);
      ctx.lineTo(centerX, 60);
      ctx.stroke();

      // East-West Internal Avenues
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(90, centerY);
      ctx.lineTo(205, centerY);
      ctx.stroke();

      // 7. Campus Boundary (dashed cyan polygon)
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.rect(78, 25, 140, 105);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.6)';
      ctx.font = '8px monospace';
      ctx.fillText('NIT CALICUT PERIMETER', 82, 36);

      // 8. Key Landmark Nodes
      const nodes = [
        { name: 'ADMIN', x: centerX, y: 62, color: '#38bdf8' },
        { name: 'CCC', x: 104, y: 88, color: '#38bdf8' },
        { name: 'LIBRARY', x: 168, y: 92, color: '#38bdf8' },
        { name: 'HOSTELS (+48m)', x: 195, y: 72, color: '#10b981' },
        { name: 'GATE', x: centerX, y: 128, color: '#10b981' },
        { name: 'STADIUM', x: 105, y: 45, color: '#38bdf8' }
      ];

      nodes.forEach(n => {
        ctx.fillStyle = n.color;
        ctx.beginPath();
        ctx.arc(n.x, n.y, 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#cbd5e1';
        ctx.font = '7px monospace';
        ctx.fillText(n.name, n.x + 4, n.y + 2);
      });

      // 9. User Live GPS Origin (Gandhi Circle)
      const now = performance.now() * 0.003;
      const pulseRadius = 3 + (now % 1) * 9;
      const pulseOpacity = 1 - (now % 1);

      ctx.strokeStyle = `rgba(16, 185, 129, ${pulseOpacity})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(centerX, centerY, 3.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 7.5px monospace';
      ctx.fillText('YOU (GPS)', centerX - 38, centerY - 5);

      // 10. Rotating Sentinel-1 C-SAR Radar Sweep Beam
      const sweepLen = 110;
      const sweepX = centerX + Math.cos(radarAngle) * sweepLen;
      const sweepY = centerY + Math.sin(radarAngle) * sweepLen;

      const grad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, sweepLen);
      grad.addColorStop(0, 'rgba(56, 189, 248, 0.4)');
      grad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, sweepLen, radarAngle - 0.35, radarAngle);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(sweepX, sweepY);
      ctx.stroke();
      ctx.restore();

      // 11. North Indicator
      ctx.fillStyle = 'rgba(56, 189, 248, 0.8)';
      ctx.font = 'bold 8.5px monospace';
      ctx.fillText('[N ^]', w - 32, 14);

      requestAnimationFrame(render2dRadar);
    };

    render2dRadar();
  }
}

window.HUDController = HUDController;
