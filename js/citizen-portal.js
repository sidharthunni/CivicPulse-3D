/**
 * CivicPulse 3D - Citizen Reporting Portal Logic
 * Implements 1-Click GPS detection, Web Speech voice input,
 * AI damage classification simulation, and LocalStorage/Store synchronization.
 * Strictly zero emojis
 */

document.addEventListener('DOMContentLoaded', () => {
  let selectedCategory = 'drainage';
  let detectedCoords = { lat: 11.2588, lng: 75.7804, x: 25, z: -20, y: 0.5 };
  let uploadedPhotoUrl = 'https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=800&q=80';
  let aiClassifiedSeverity = 'high';
  let isSpeechRecognizing = false;

  // 1. Category Selection
  const categoryCards = document.querySelectorAll('.category-option');
  categoryCards.forEach(card => {
    card.addEventListener('click', () => {
      categoryCards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedCategory = card.getAttribute('data-category');
      runAITriageSimulation();
    });
  });

  // 2. Connectivity & Offline Disaster Resilience Detection
  const netDot = document.getElementById('net-status-dot');
  const netText = document.getElementById('net-status-text');
  const netBadge = document.getElementById('net-offline-badge');

  function updateNetworkStatus() {
    const isOnline = navigator.onLine;
    if (netDot) {
      netDot.className = isOnline ? 'net-status-dot' : 'net-status-dot offline';
    }
    if (netText) {
      netText.textContent = isOnline
        ? 'NETWORK: ONLINE // DIRECT MUNICIPAL DISPATCH ACTIVE'
        : 'NETWORK: OFFLINE // SATELLITE GPS & LOCAL DISASTER QUEUE ACTIVE';
    }
    if (netBadge) {
      netBadge.textContent = isOnline
        ? '100% OFFLINE READY VIA SATELLITE GPS'
        : 'OFFLINE MODE: QUEUED TO DEVICE LEDGER';
    }
  }

  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);
  updateNetworkStatus();

  // 3. Location Mode Selection (Live GPS vs Desired Location)
  const modeGpsBtn = document.getElementById('btn-mode-gps');
  const modeDesiredBtn = document.getElementById('btn-mode-desired');
  const quickLandmarks = document.getElementById('quick-landmarks');
  const gpsBtn = document.getElementById('btn-get-gps');
  const locationInput = document.getElementById('input-location');

  if (modeGpsBtn && modeDesiredBtn) {
    modeGpsBtn.addEventListener('click', () => {
      modeGpsBtn.classList.add('active');
      modeDesiredBtn.classList.remove('active');
      if (quickLandmarks) quickLandmarks.style.display = 'none';
      if (gpsBtn) gpsBtn.style.display = 'inline-block';
    });

    modeDesiredBtn.addEventListener('click', () => {
      modeDesiredBtn.classList.add('active');
      modeGpsBtn.classList.remove('active');
      if (quickLandmarks) quickLandmarks.style.display = 'flex';
      if (gpsBtn) gpsBtn.style.display = 'none';
    });
  }

  // Quick Landmark Button Selection
  const landmarkButtons = document.querySelectorAll('.btn-landmark');
  landmarkButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      landmarkButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const lat = parseFloat(btn.getAttribute('data-lat'));
      const lng = parseFloat(btn.getAttribute('data-lng'));
      const name = btn.getAttribute('data-name');

      detectedCoords.lat = lat;
      detectedCoords.lng = lng;
      detectedCoords.x = ((lng - 75.7804) * 2000).toFixed(1);
      detectedCoords.z = ((11.2588 - lat) * 2000).toFixed(1);
      detectedCoords.y = 0.5;

      if (locationInput) {
        locationInput.value = name;
      }
    });
  });

  // Hardware Satellite GPS Detection
  if (gpsBtn && locationInput) {
    gpsBtn.addEventListener('click', () => {
      gpsBtn.textContent = 'LOCKING SATELLITES...';

      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            detectedCoords.lat = lat;
            detectedCoords.lng = lng;
            // Map lat/long delta relative to Calicut center to 3D twin space
            detectedCoords.x = ((lng - 75.7804) * 2000).toFixed(1);
            detectedCoords.z = ((11.2588 - lat) * 2000).toFixed(1);
            detectedCoords.y = 0.5;

            locationInput.value = `Live Satellite GPS (${lat.toFixed(4)} N, ${lng.toFixed(4)} E) - Calicut Sector`;
            gpsBtn.textContent = 'GPS LOCKED';
          },
          (err) => {
            // Realistic Calicut municipal coordinate fallback
            detectedCoords.lat = 11.2588;
            detectedCoords.lng = 75.7804;
            detectedCoords.x = 25;
            detectedCoords.z = -20;
            detectedCoords.y = 0.5;
            locationInput.value = 'Mavoor Road Sector 4, Kozhikode (Ward 22)';
            gpsBtn.textContent = 'DEFAULT PIN LOCKED';
          },
          { enableHighAccuracy: true, timeout: 6000 }
        );
      } else {
        locationInput.value = 'Mavoor Road Sector 4, Kozhikode (Ward 22)';
        gpsBtn.textContent = 'MANUAL PIN';
      }
    });
  }

  // 3. Voice-to-Text Input via Web Speech API
  const voiceBtn = document.getElementById('btn-voice-input');
  const descTextarea = document.getElementById('input-description');

  if (voiceBtn && descTextarea) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-IN';

      voiceBtn.addEventListener('click', () => {
        if (!isSpeechRecognizing) {
          try {
            recognition.start();
            isSpeechRecognizing = true;
            voiceBtn.textContent = 'LISTENING...';
            voiceBtn.classList.add('listening');
          } catch (e) {}
        } else {
          recognition.stop();
          isSpeechRecognizing = false;
          voiceBtn.textContent = 'VOICE NOTE';
          voiceBtn.classList.remove('listening');
        }
      });

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        descTextarea.value = (descTextarea.value ? descTextarea.value + ' ' : '') + transcript;
        voiceBtn.textContent = 'VOICE NOTE';
        voiceBtn.classList.remove('listening');
        isSpeechRecognizing = false;
      };

      recognition.onerror = () => {
        voiceBtn.textContent = 'VOICE NOTE';
        voiceBtn.classList.remove('listening');
        isSpeechRecognizing = false;
      };

      recognition.onend = () => {
        voiceBtn.textContent = 'VOICE NOTE';
        voiceBtn.classList.remove('listening');
        isSpeechRecognizing = false;
      };
    } else {
      voiceBtn.addEventListener('click', () => {
        alert('Web Speech API is not supported in this browser. Please type your description.');
      });
    }
  }

  // 4. Photo Upload & AI Triage Scanner Simulation
  const fileInput = document.getElementById('file-upload');
  const photoUploader = document.getElementById('photo-dropzone');
  const aiTriageBox = document.getElementById('ai-triage-box');
  const aiTriageDetail = document.getElementById('ai-triage-detail');

  if (photoUploader && fileInput) {
    photoUploader.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (uploadEvent) => {
          uploadedPhotoUrl = uploadEvent.target.result;
          document.querySelector('.uploader-title').textContent = file.name;
          document.querySelector('.uploader-subtitle').textContent = 'Image verified. Running AI triage scanner...';
          runAITriageSimulation();
        };
        reader.readAsDataURL(file);
      }
    });
  }

  function runAITriageSimulation() {
    if (!aiTriageBox) return;
    aiTriageBox.style.display = 'block';

    const agencyMap = {
      drainage: { agency: 'Kerala Water Authority (KWA)', severity: 'critical', confidence: '96.2%', issue: 'Stormwater Culvert Blockage' },
      road: { agency: 'Public Works Department (PWD)', severity: 'high', confidence: '94.8%', issue: 'Asphalt Subsidence & Pothole' },
      waste: { agency: 'Suchitwa Mission & KSPCB', severity: 'high', confidence: '91.5%', issue: 'Canal Non-Biodegradable Waste Dump' },
      electrical: { agency: 'Kerala State Electricity Board (KSEB)', severity: 'critical', confidence: '98.1%', issue: 'High-Tension Sagging Hazard' },
      slope: { agency: 'District Disaster Management Authority (DDMA)', severity: 'critical', confidence: '95.4%', issue: 'Hillside Geotechnical Crack' }
    };

    const target = agencyMap[selectedCategory] || agencyMap.drainage;
    aiClassifiedSeverity = target.severity;

    aiTriageDetail.innerHTML = `
      Detected Pattern: <strong>${target.issue}</strong><br>
      Computer Vision Confidence: <strong>${target.confidence}</strong><br>
      Autonomous Priority: <strong style="color: ${target.severity === 'critical' ? '#ef4444' : '#f59e0b'}">${target.severity.toUpperCase()}</strong><br>
      Routing Agency: <strong>${target.agency}</strong>
    `;
  }

  // Initial AI triage preview
  runAITriageSimulation();

  // 5. Form Submission
  const reportForm = document.getElementById('citizen-report-form');
  const receiptCard = document.getElementById('receipt-card');
  const receiptId = document.getElementById('receipt-id');
  const receiptHash = document.getElementById('receipt-hash');

  if (reportForm) {
    reportForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const title = document.getElementById('input-title').value.trim();
      const address = document.getElementById('input-location').value.trim() || 'Kozhikode Municipal Sector';
      const description = document.getElementById('input-description').value.trim();
      const citizenName = document.getElementById('input-name').value.trim() || 'Verified Citizen';

      const agencyMap = {
        drainage: { agency: 'Kerala Water Authority (KWA) & Kozhikode Municipal Corp', label: 'Drainage & Flooding' },
        road: { agency: 'Public Works Department (PWD - Roads Wing)', label: 'Road & Potholes' },
        waste: { agency: 'Suchitwa Mission & Kerala State Pollution Control Board', label: 'Waste Management' },
        electrical: { agency: 'Kerala State Electricity Board (KSEB)', label: 'Electrical Hazard' },
        slope: { agency: 'District Disaster Management Authority (DDMA) & PWD', label: 'Landslide & Slope Risk' }
      };

      const agencyData = agencyMap[selectedCategory] || agencyMap.drainage;

      const newIncident = {
        title: title,
        category: selectedCategory,
        categoryLabel: agencyData.label,
        severity: aiClassifiedSeverity,
        status: 'reported',
        address: address,
        lat: Number(detectedCoords.lat),
        lng: Number(detectedCoords.lng),
        x: Number(detectedCoords.x),
        z: Number(detectedCoords.z),
        y: Number(detectedCoords.y),
        reportedBy: citizenName,
        reportedAt: new Date().toLocaleTimeString('en-US', { hour12: false }) + ' IST (Today)',
        agency: agencyData.agency,
        slaHours: aiClassifiedSeverity === 'critical' ? 6 : 24,
        elapsedHours: 0.1,
        budgetEstimate: 'Under Evaluation',
        interAgencyConflict: 'Pending initial site survey inspection.',
        description: description,
        photoUrl: uploadedPhotoUrl
      };

      // Store into window.CivicStore
      const created = window.CivicStore.add(newIncident);

      // Display Receipt Card
      if (receiptCard) {
        receiptCard.style.display = 'block';
        if (receiptId) receiptId.textContent = created.id;
        if (receiptHash) receiptHash.textContent = created.auditHash;
        receiptCard.scrollIntoView({ behavior: 'smooth' });
      }

      // Hide or disable submit button
      const submitBtn = document.getElementById('btn-submit-report');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'REPORT LODGED ON PUBLIC LEDGER';
        submitBtn.style.opacity = '0.6';
      }

      // Refresh recent public ledger list
      renderLedgerList();
    });
  }

  // 6. Render Transparency Ledger List
  function renderLedgerList() {
    const listContainer = document.getElementById('public-ledger-list');
    if (!listContainer) return;

    const incidents = window.CivicStore.getAll();
    listContainer.innerHTML = incidents.slice(0, 5).map(inc => `
      <div class="ledger-card">
        <div class="ledger-meta">
          <span class="ledger-id">${inc.id} // ${inc.categoryLabel}</span>
          <span class="ledger-issue">${inc.title}</span>
          <span style="font-size: 10px; color: var(--text-dim); margin-top: 2px;">
            ${inc.address} &bull; ${inc.reportedAt}
          </span>
        </div>
        <span class="ledger-status ${inc.status}">${inc.status.toUpperCase()}</span>
      </div>
    `).join('');
  }

  renderLedgerList();

  // 7. Bilingual Malayalam / English Language Switcher
  let currentLanguage = 'en';
  const langToggleBtn = document.getElementById('btn-toggle-lang');

  const translations = {
    en: {
      btnLang: 'മലയാളം (MALAYALAM)',
      brandTitle: 'CIVICPULSE CITIZEN',
      heroTitle: 'Report Municipal Hazard or Infrastructure Breach',
      heroDesc: 'Your submission is geocoded, triaged via autonomous computer vision, assigned to responsible public works agencies, and stamped onto an immutable public audit ledger.',
      step1: 'CHOOSE HAZARD CATEGORY',
      step2: 'WHERE IS THE HAZARD LOCATED?',
      step3: 'EXPLAIN THE ISSUE (VOICE / TEXT)',
      step4: 'SITE PHOTOGRAPH & AI DEFECT CHECK',
      step5: 'YOUR DETAILS & SUBMISSION',
      lblCategory: 'Hazard Category',
      lblLocation: 'Geographic Location',
      lblLandmarks: 'QUICK DESIRED CORRIDOR:',
      lblTitle: 'Title / Summary',
      lblDesc: 'Detailed Description',
      lblPhoto: 'Photographic Evidence',
      lblCitizenName: 'Citizen Full Name / Ward Resident ID',
      btnGps: 'LOCK SATELLITE GPS',
      btnVoice: 'VOICE NOTE',
      btnSubmit: 'LODGE INCIDENT TO SPATIAL LEDGER',
      catDrainageName: 'Drainage & Flooding',
      catDrainageDesc: 'Culvert breach, stormwater backflow',
      catRoadName: 'Roads & Potholes',
      catRoadDesc: 'Asphalt crater, base layer subsidence',
      catWasteName: 'Waste Management',
      catWasteDesc: 'Illegal dumping, canal choking debris',
      catElectricalName: 'Electrical Hazard',
      catElectricalDesc: 'Sagging 11kV cable, sparking transformer',
      catSlopeName: 'Landslide & Slope',
      catSlopeDesc: 'Hillside tension crack, mudslide risk'
    },
    ml: {
      btnLang: 'ENGLISH (ഇംഗ്ലീഷ്)',
      brandTitle: 'സിവിക്പൾസ് പൗരസേവനം',
      heroTitle: 'റോഡ്, വെള്ളക്കെട്ട് തകരാറുകൾ അറിയിക്കുക',
      heroDesc: 'നിങ്ങൾ നൽകുന്ന പരാതി നേരിട്ട് ബന്ധപ്പെട്ട വകുപ്പുകൾക്ക് (PWD, KWA, KSEB) ലഭിക്കുകയും അതിവേഗം പരിഹരിക്കപ്പെടുകയും ചെയ്യുന്നു.',
      step1: 'ഘട്ടം 1: പ്രശ്നത്തിന്റെ തരം തിരഞ്ഞെടുക്കുക',
      step2: 'ഘട്ടം 2: സ്ഥലം എവിടെയാണ്? (ജി.പി.എസ്)',
      step3: 'ഘട്ടം 3: വിശദാംശങ്ങൾ പറയുക / എഴുതുക',
      step4: 'ഘട്ടം 4: ഫോട്ടോ എടുക്കുക (AI പരിശോധന)',
      step5: 'ഘട്ടം 5: നിങ്ങളുടെ പേരും സമർപ്പണവും',
      lblCategory: 'പ്രശ്നത്തിന്റെ തരം',
      lblLocation: 'സ്ഥലം / റോഡ്',
      lblLandmarks: 'പ്രധാന സ്ഥലങ്ങൾ:',
      lblTitle: 'പരാതിയുടെ തലക്കെട്ട്',
      lblDesc: 'വിശദമായ വിവരങ്ങൾ',
      lblPhoto: 'സ്ഥലത്തിന്റെ ഫോട്ടോ',
      lblCitizenName: 'നിങ്ങളുടെ പേര് / വാർഡ് നമ്പർ',
      btnGps: 'എന്റെ ലൊക്കേഷൻ രേഖപ്പെടുത്തുക',
      btnVoice: 'ശബ്ദ സന്ദേശം നൽകുക',
      btnSubmit: 'പരാതി സമർപ്പിക്കുക',
      catDrainageName: 'വെള്ളക്കെട്ട് / ഓവുചാൽ',
      catDrainageDesc: 'ഡ്രെയിനേജ് ബ്ലോക്ക്, വെള്ളപ്പൊക്ക സാധ്യത',
      catRoadName: 'തകർന്ന റോഡുകൾ / കുഴികൾ',
      catRoadDesc: 'റോഡിലെ വലിയ കുഴികൾ, ടാർ ഇളകൽ',
      catWasteName: 'മാലിന്യ നിക്ഷേപം',
      catWasteDesc: 'തോട്ടിലോ റോഡിലോ തള്ളിയ മാലിന്യം',
      catElectricalName: 'വൈദ്യുതി ലൈൻ തകരാർ',
      catElectricalDesc: 'താഴ്ന്നു കിടക്കുന്ന കേബിളുകൾ, ട്രാൻസ്ഫോർമർ',
      catSlopeName: 'മണ്ണിടിച്ചിൽ ഭീഷണി',
      catSlopeDesc: 'റോഡിന്റെ വശം ഇടിയൽ, വിള്ളലുകൾ'
    }
  };

  function applyLanguage(lang) {
    const t = translations[lang];
    if (!t) return;
    if (langToggleBtn) langToggleBtn.textContent = t.btnLang;
    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setTxt('brand-title-text', t.brandTitle);
    setTxt('hero-title', t.heroTitle);
    setTxt('hero-desc', t.heroDesc);
    setTxt('lbl-step1', t.step1);
    setTxt('lbl-step2', t.step2);
    setTxt('lbl-step3', t.step3);
    setTxt('lbl-step4', t.step4);
    setTxt('lbl-step5', t.step5);
    setTxt('lbl-category', t.lblCategory);
    setTxt('lbl-location', t.lblLocation);
    setTxt('lbl-landmarks', t.lblLandmarks);
    setTxt('lbl-title', t.lblTitle);
    setTxt('lbl-desc', t.lblDesc);
    setTxt('lbl-photo', t.lblPhoto);
    setTxt('lbl-citizen-name', t.lblCitizenName);
    setTxt('btn-get-gps', t.btnGps);
    setTxt('btn-voice-input', t.btnVoice);
    setTxt('btn-submit-report', t.btnSubmit);
    setTxt('cat-drainage-name', t.catDrainageName);
    setTxt('cat-drainage-desc', t.catDrainageDesc);
    setTxt('cat-road-name', t.catRoadName);
    setTxt('cat-road-desc', t.catRoadDesc);
    setTxt('cat-waste-name', t.catWasteName);
    setTxt('cat-waste-desc', t.catWasteDesc);
    setTxt('cat-electrical-name', t.catElectricalName);
    setTxt('cat-electrical-desc', t.catElectricalDesc);
    setTxt('cat-slope-name', t.catSlopeName);
    setTxt('cat-slope-desc', t.catSlopeDesc);
  }

  if (langToggleBtn) {
    langToggleBtn.addEventListener('click', () => {
      currentLanguage = currentLanguage === 'en' ? 'ml' : 'en';
      applyLanguage(currentLanguage);
    });
  }
});
