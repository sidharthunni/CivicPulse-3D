/**
 * CivicPulse 3D - Monsoon Inundation & Hydrological Simulation Controller
 * Calculates spatial impact metrics, flooded arterial roads, and affected municipal wards.
 * Strictly zero emojis
 */

class SimulationController {
  constructor() {
    this.currentFloodLevel = 0.0;
    this.slopeHazardActive = false;
    this.drainChokeActive = false;

    // Audio synthesizer for tactical auditory feedback
    this.audioCtx = null;
    this.soundEnabled = true;

    this.initElements();
    this.bindEvents();
  }

  initAudio() {
    if (!this.audioCtx && typeof window.AudioContext !== 'undefined') {
      try {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {}
    }
  }

  playTacticalBeep(freq = 880, type = 'sine', duration = 0.08) {
    if (!this.soundEnabled) return;
    this.initAudio();
    if (!this.audioCtx) return;

    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(0.04, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch (e) {}
  }

  initElements() {
    this.floodSlider = document.getElementById('flood-slider');
    this.floodReadout = document.getElementById('flood-val-display');
    this.floodHeaderBadge = document.getElementById('telemetry-flood-status');
    this.impactSubmergedKm = document.getElementById('impact-submerged-km');
    this.impactAffectedPop = document.getElementById('impact-affected-pop');
    this.slopeToggleBtn = document.getElementById('toggle-slope-hazard');
    this.drainToggleBtn = document.getElementById('toggle-drain-choke');
  }

  bindEvents() {
    if (this.floodSlider) {
      this.floodSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.setFloodRise(val);
      });
    }

    // Preset flood scenarios
    document.querySelectorAll('[data-flood-preset]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const level = parseFloat(btn.getAttribute('data-flood-preset'));
        if (this.floodSlider) this.floodSlider.value = level;
        this.setFloodRise(level);
        this.playTacticalBeep(1100, 'triangle', 0.12);

        // Highlight active preset button
        document.querySelectorAll('[data-flood-preset]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Slope Hazard Toggle
    if (this.slopeToggleBtn) {
      this.slopeToggleBtn.addEventListener('click', () => {
        this.slopeHazardActive = !this.slopeHazardActive;
        this.slopeToggleBtn.classList.toggle('active', this.slopeHazardActive);
        this.playTacticalBeep(650, 'sawtooth', 0.1);
        if (this.slopeHazardActive && window.twinEngine) {
          window.twinEngine.setCameraPreset('kunnamangalam');
        }
      });
    }

    // Drainage Choke Toggle
    if (this.drainToggleBtn) {
      this.drainToggleBtn.addEventListener('click', () => {
        this.drainChokeActive = !this.drainChokeActive;
        this.drainToggleBtn.classList.toggle('active', this.drainChokeActive);
        this.playTacticalBeep(520, 'square', 0.1);
        if (this.drainChokeActive && window.twinEngine) {
          window.twinEngine.setCameraPreset('mavoor');
        }
      });
    }
  }

  setFloodRise(meters) {
    this.currentFloodLevel = meters;

    // Update 3D twin water mesh
    if (window.twinEngine) {
      window.twinEngine.setFloodRise(meters);
    }

    // Update readouts
    if (this.floodReadout) {
      this.floodReadout.textContent = meters.toFixed(1) + ' m';
    }

    // Calculate dynamic impact statistics
    const submergedKm = (meters * 2.85).toFixed(1);
    const affectedCount = meters === 0 ? 0 : Math.round(meters * 1480 + 350);

    if (this.impactSubmergedKm) {
      this.impactSubmergedKm.textContent = submergedKm + ' km';
    }
    if (this.impactAffectedPop) {
      this.impactAffectedPop.textContent = affectedCount.toLocaleString('en-IN') + ' units';
    }

    // Update header telemetry banner
    if (this.floodHeaderBadge) {
      if (meters === 0) {
        this.floodHeaderBadge.textContent = 'NORMAL (0.0m)';
        this.floodHeaderBadge.className = 'telemetry-value emerald';
      } else if (meters <= 1.5) {
        this.floodHeaderBadge.textContent = 'MONSOON WATCH (+' + meters.toFixed(1) + 'm)';
        this.floodHeaderBadge.className = 'telemetry-value cyan';
      } else if (meters <= 3.5) {
        this.floodHeaderBadge.textContent = 'FLASH FLOOD ALERT (+' + meters.toFixed(1) + 'm)';
        this.floodHeaderBadge.className = 'telemetry-value amber';
      } else {
        this.floodHeaderBadge.textContent = 'CATASTROPHIC INUNDATION (+' + meters.toFixed(1) + 'm)';
        this.floodHeaderBadge.className = 'telemetry-value critical';
      }
    }
  }
}

window.SimulationController = SimulationController;
