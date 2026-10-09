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
}

window.HUDController = HUDController;
