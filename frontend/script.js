// Common Utilities
const mockStation = {
  id: "st-04",
  name: "Fire Station 4",
  category: "fire",
  latitude: 13.048,
  longitude: 80.208,
  status: "available"
};

const generateMockAlert = (id, overrides = {}) => ({
  id: id || `mock-${Date.now()}`,
  type: "fire",
  severity: 5,
  summary: "Emergency reported in area",
  transcript: "Please help, there's a serious emergency and we need immediate assistance here!",
  status: "reported",
  latitude: 13.05 + (Math.random() * 0.02 - 0.01),
  longitude: 80.21 + (Math.random() * 0.02 - 0.01),
  created_at: new Date().toISOString(),
  ...overrides
});

async function fetchWithTimeout(resource, options = {}) {
  const { timeout = 5000 } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  const response = await fetch(resource, {
    ...options,
    signal: controller.signal  
  });
  clearTimeout(id);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

document.addEventListener('DOMContentLoaded', () => {
  const isReporter = document.getElementById('sosBtn') !== null;
  const isDashboard = document.getElementById('map') !== null;

  if (isReporter) initReporter();
  if (isDashboard) initDashboard();
});

// --- Reporter Logic ---
function initReporter() {
  const statusDot = document.querySelector('.status-dot');
  const statusText = document.querySelector('.connection-status span');
  const sosBtn = document.getElementById('sosBtn');
  const transcriptBox = document.getElementById('transcriptBox');
  const fallbackForm = document.getElementById('fallbackForm');
  const sosArea = document.getElementById('sosArea');
  const dispatchCard = document.getElementById('dispatchCard');
  const errorMessage = document.getElementById('errorMessage');
  
  let currentAlertId = null;
  let checkinInterval = null;

  // 1. Connectivity Check
  fetchWithTimeout('/api/stations', { timeout: 3000 })
    .then(() => {
      statusDot.classList.add('online');
      statusText.textContent = 'Connected';
    })
    .catch(() => {
      statusDot.classList.add('offline');
      statusText.textContent = 'Offline (Mock Mode)';
    });

  // Setup Speech
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let transcript = "";
  
  if (!SpeechRecognition) {
    sosBtn.style.display = 'none';
    fallbackForm.classList.add('active');
    document.querySelector('#sosArea > p').style.display = 'none';
    
    document.getElementById('fallbackSubmit').addEventListener('click', () => {
      const text = document.getElementById('fallbackText').value;
      if (!text) return;
      submitAlert(text);
    });
  } else {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-IN';
    
    recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      transcript += finalTranscript;
      transcriptBox.textContent = transcript + interimTranscript;
    };
    
    let isRecording = false;
    let holdStartTime = 0;
    
    recognition.onerror = (event) => {
      console.error("Speech error", event.error);
      if (event.error === 'not-allowed') {
        transcriptBox.textContent = "Microphone access denied. Please allow mic access.";
      } else {
        transcriptBox.textContent = "Speech recognition error: " + event.error;
      }
    };

    const startRecording = (e) => {
      if (e) e.preventDefault();
      if (isRecording) return;
      isRecording = true;
      holdStartTime = Date.now();
      transcript = "";
      transcriptBox.textContent = "Listening... (Keep holding)";
      transcriptBox.classList.add('active');
      sosBtn.classList.add('recording');
      try { recognition.start(); } catch(e) {}
    };
    
    const stopRecording = (e) => {
      if (e) e.preventDefault();
      if (!isRecording) return;
      isRecording = false;
      sosBtn.classList.remove('recording');
      try { recognition.stop(); } catch(e) {}
      
      const holdDuration = Date.now() - holdStartTime;
      const finalMsg = transcriptBox.textContent.replace('Listening... (Keep holding)', '').trim();
      
      if (holdDuration < 1000 && !finalMsg) {
        transcriptBox.textContent = "Hold the button down while speaking.";
        return;
      }
      
      if (finalMsg && !finalMsg.includes('Speech recognition error') && !finalMsg.includes('Microphone access denied')) {
        submitAlert(finalMsg);
      } else if (!finalMsg) {
        transcriptBox.textContent = "No speech detected. Hold and try again.";
      }
    };
    
    sosBtn.addEventListener('mousedown', startRecording);
    sosBtn.addEventListener('touchstart', startRecording);
    sosBtn.addEventListener('mouseup', stopRecording);
    sosBtn.addEventListener('mouseleave', stopRecording);
    sosBtn.addEventListener('touchend', stopRecording);
    sosBtn.addEventListener('touchcancel', stopRecording);
    
    sosBtn.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') startRecording(e);
    });
    sosBtn.addEventListener('keyup', (e) => {
      if (e.key === ' ' || e.key === 'Enter') stopRecording(e);
    });
  }

  async function submitAlert(text) {
    sosArea.style.display = 'none';
    
    let lat = 13.05, lng = 80.21;
    const locPromise = new Promise(resolve => {
      if (!navigator.geolocation) return resolve();
      navigator.geolocation.getCurrentPosition(
        pos => { lat = pos.coords.latitude; lng = pos.coords.longitude; resolve(); },
        () => resolve(),
        { timeout: 5000 }
      );
    });
    
    await locPromise;
    const payload = { transcript: text, latitude: lat, longitude: lng };
    
    try {
      const res = await fetchWithTimeout('/api/alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      renderDispatch(data);
    } catch (err) {
      console.log("Submit failed, triggering mock fallback");
      try {
        const mockData = {
          alert: generateMockAlert(null, { summary: text, transcript: text, latitude: lat, longitude: lng }),
          station: mockStation
        };
        // Add fake distance for mock fallback
        mockData.station.distance_km = getDistance(lat, lng, mockStation.latitude, mockStation.longitude);
        
        // Save to localStorage for Dashboard to see
        const savedAlerts = JSON.parse(localStorage.getItem('mockAlerts') || '[]');
        savedAlerts.push(mockData.alert);
        localStorage.setItem('mockAlerts', JSON.stringify(savedAlerts));
        
        renderDispatch(mockData);
      } catch (mockErr) {
        errorMessage.classList.add('active');
      }
    }
  }

  function renderDispatch(data) {
    const { alert, station } = data;
    currentAlertId = alert.id;
    
    document.getElementById('dispatchSeverity').textContent = `Severity ${alert.severity}`;
    document.getElementById('dispatchSeverity').className = `badge severity-${alert.severity}`;
    document.getElementById('dispatchSummary').textContent = alert.summary;
    document.getElementById('dispatchStationName').textContent = station.name;
    document.getElementById('dispatchStatusBadge').textContent = alert.status.toUpperCase();
    
    const dist = station.distance_km || 1.4;
    const etaMins = Math.max(1, Math.round((dist / 40) * 60));
    document.getElementById('dispatchEta').textContent = `${etaMins} min`;
    
    dispatchCard.classList.add('active');
    
    if (checkinInterval) clearInterval(checkinInterval);
    checkinInterval = setInterval(doCheckin, 30000);

    // Poll localStorage every 5s for status changes made by the dashboard operator
    // This gives near-real-time feedback without waiting 30s for the next check-in
    const lsStatusLabels = {
      reported: 'REPORTED — Waiting for dispatch',
      dispatched: 'DISPATCHED — Help is coming',
      monitoring: 'MONITORING — Operator acknowledged',
      escalated: 'ESCALATED — Situation is critical',
      resolved: 'RESOLVED — Emergency closed'
    };
    const statusBadge = document.getElementById('dispatchStatusBadge');
    const escalationNotice = document.getElementById('escalationNotice');

    const pollInterval = setInterval(() => {
      const saved = JSON.parse(localStorage.getItem('mockAlerts') || '[]');
      const synced = saved.find(a => a.id === currentAlertId);
      if (!synced) return;

      const label = lsStatusLabels[synced.status] || synced.status.toUpperCase();
      statusBadge.textContent = label;

      // Update severity badge if escalated
      if (synced.status === 'escalated') {
        document.getElementById('dispatchSeverity').textContent = `Severity ${synced.severity}`;
        document.getElementById('dispatchSeverity').className = `badge severity-${synced.severity}`;
        escalationNotice.style.display = 'block';
      }

      // Stop polling once resolved
      if (synced.status === 'resolved') {
        clearInterval(pollInterval);
        clearInterval(checkinInterval);
      }
    }, 5000);
  }
  
  async function doCheckin() {
    if (!currentAlertId) return;
    try {
      const res = await fetchWithTimeout(`/api/alerts/${currentAlertId}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motion_ok: true })
      });
      const data = await res.json();
      updateDispatchFromCheckin(data);
    } catch (err) {
      console.log("Checkin failed, retrying once...");
      try {
        const res2 = await fetchWithTimeout(`/api/alerts/${currentAlertId}/checkin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ motion_ok: true })
        });
        const data2 = await res2.json();
        updateDispatchFromCheckin(data2);
      } catch(err2) {
        console.log("Retry failed, silent backoff. Mock update.");
        
        // Pull updated status from localStorage if dashboard changed it
        const savedAlerts = JSON.parse(localStorage.getItem('mockAlerts') || '[]');
        const syncAlert = savedAlerts.find(a => a.id === currentAlertId);
        
        if (syncAlert) {
          updateDispatchFromCheckin({ alert: syncAlert, escalated: syncAlert.severity > 3 });
        } else {
          updateDispatchFromCheckin({ alert: generateMockAlert(currentAlertId, {status: 'monitoring'}), escalated: false });
        }
      }
    }
  }

  function updateDispatchFromCheckin(data) {
    if (data.escalated) {
      document.getElementById('escalationNotice').style.display = 'block';
      document.getElementById('dispatchSeverity').textContent = `Severity ${data.alert.severity}`;
      document.getElementById('dispatchSeverity').className = `badge severity-${data.alert.severity}`;
    }
    document.getElementById('dispatchStatusBadge').textContent = data.alert.status.toUpperCase();
  }
}

// --- Dashboard Logic ---
function initDashboard() {
  const map = L.map('map').setView([13.05, 80.21], 12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
  }).addTo(map);

  const markers = {};
  const alertLayers = L.layerGroup().addTo(map);
  const stationLayers = L.layerGroup().addTo(map);
  
  let alertsData = {};
  let stationsData = [];
  
  const stationIcon = L.divIcon({
    className: 'custom-div-icon',
    html: `<div style="background-color: var(--color-info); width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
  
  function getAlertIcon(severity) {
    let color = 'var(--color-safe)';
    if (severity === 5) color = 'var(--color-critical)';
    else if (severity >= 3) color = 'var(--color-warning)';
    else if (severity === 2) color = 'var(--color-info)';
    
    return L.divIcon({
      className: 'custom-div-icon',
      html: `<div style="background-color: ${color}; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });
  }

  function getClosestStation(lat, lng) {
    if (!stationsData.length) return null;
    let closest = stationsData[0];
    let minD = getDistance(lat, lng, closest.latitude, closest.longitude);
    for (let i=1; i<stationsData.length; i++) {
      let d = getDistance(lat, lng, stationsData[i].latitude, stationsData[i].longitude);
      if (d < minD) { minD = d; closest = stationsData[i]; }
    }
    return { station: closest, distance: minD };
  }

  Promise.all([
    fetchWithTimeout('/api/stations').then(r => r.json()).catch(() => ({ stations: [mockStation] })),
    fetchWithTimeout('/api/alerts').then(r => r.json()).catch(() => ({ alerts: [generateMockAlert('m1', { status: 'reported', severity: 4 })] }))
  ]).then(([stationsRes, alertsRes]) => {
    stationsData = stationsRes.stations || [];
    
    stationsData.forEach(st => {
      L.marker([st.latitude, st.longitude], { icon: stationIcon }).bindPopup(st.name).addTo(stationLayers);
    });
    
    const alerts = alertsRes.alerts || [];
    alerts.forEach(processAlert);
    
    setupRealtimeSubscription();
  });
  
  function playCriticalAudio() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch(e) {
      console.warn("Web Audio API not supported for critical tone");
    }
  }

  function processAlert(alert) {
    const isNew = !alertsData[alert.id];
    alertsData[alert.id] = alert;
    
    if (isNew && alert.severity === 5 && alert.status !== 'resolved') {
      playCriticalAudio();
    }
    
    renderAlertsList();
    updateMapMarkers();
  }

  function renderAlertsList() {
    const list = document.getElementById('alertsList');
    const resolvedList = document.getElementById('resolvedList');
    list.innerHTML = '';
    resolvedList.innerHTML = '';
    
    let resolvedCount = 0;
    const sorted = Object.values(alertsData).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    
    sorted.forEach(alert => {
      const ageMins = Math.floor((new Date() - new Date(alert.created_at)) / 60000);
      const ageStr = ageMins < 1 ? 'Just now' : `${ageMins}m ago`;
      
      if (alert.status === 'resolved') {
        resolvedCount++;
        const div = document.createElement('div');
        div.className = 'resolved-item';
        div.innerHTML = `<strong style="text-transform:uppercase">${alert.type}</strong> - ${alert.summary} <span style="float:right">${ageStr}</span>`;
        resolvedList.appendChild(div);
        return;
      }
      
      let distanceStr = '';
      const closest = getClosestStation(alert.latitude, alert.longitude);
      if (closest) {
        distanceStr = `${closest.distance.toFixed(1)} km`;
      }
      
      const div = document.createElement('div');
      div.className = `alert-item severity-${alert.severity}`;
      if (selectedAlertId === alert.id) div.classList.add('selected');
      div.dataset.id = alert.id;
      div.innerHTML = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
          <span class="badge severity-${alert.severity}">SEV ${alert.severity}</span>
          <span class="text-secondary mono" style="font-size: 0.75rem;">${ageStr}</span>
        </div>
        <div style="font-weight: 500; margin-bottom: 0.25rem;">${alert.summary}</div>
        <div class="alert-meta">
          <span>${alert.status.toUpperCase()}</span>
          <span>${distanceStr}</span>
        </div>
      `;
      
      div.addEventListener('click', () => selectAlert(alert.id));
      list.appendChild(div);
    });
    
    document.getElementById('resolvedCount').textContent = resolvedCount;

    // FR6: empty-state — visually distinct from connection-loss
    if (list.childElementCount === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding: 2rem 1rem; text-align: center; color: var(--text-secondary); font-size: 0.875rem;';
      empty.textContent = 'No active alerts.';
      list.appendChild(empty);
    }
  }
  
  function updateMapMarkers() {
    // Clear both the layer group AND the markers lookup so references stay fresh
    alertLayers.clearLayers();
    Object.keys(markers).forEach(k => delete markers[k]);

    Object.values(alertsData).forEach(alert => {
      if (alert.status === 'resolved') return;
      
      const marker = L.marker([alert.latitude, alert.longitude], {
        icon: getAlertIcon(alert.severity)
      });
      
      marker.bindPopup(`<strong>${alert.type.toUpperCase()}</strong><br>${alert.summary}`);
      marker.on('click', () => selectAlert(alert.id));
      marker.addTo(alertLayers);
      markers[alert.id] = marker;
    });
  }
  
  let selectedAlertId = null;
  function selectAlert(id) {
    selectedAlertId = id;
    const alert = alertsData[id];
    if (!alert) return;
    
    document.querySelectorAll('.alert-item').forEach(el => {
      el.classList.toggle('selected', el.dataset.id === id);
    });
    
    const detailPanel = document.getElementById('detailPanel');
    const content = document.getElementById('detailContent');
    
    let distanceStr = 'Unknown';
    const closest = getClosestStation(alert.latitude, alert.longitude);
    if (closest) distanceStr = `${closest.distance.toFixed(1)} km from ${closest.station.name}`;
    
    content.innerHTML = `
      <div style="margin-bottom: 1rem;">
        <span class="badge severity-${alert.severity}">SEV ${alert.severity}</span>
        <span class="badge" style="background: var(--border-color); color: var(--text-primary); margin-left: 0.5rem;">${alert.type.toUpperCase()}</span>
      </div>
      <p style="font-size: 1.125rem; font-weight: 500; margin-bottom: 1rem;">${alert.summary}</p>
      
      <div style="background: var(--bg-color); padding: 0.75rem; border-radius: 6px; border: 1px solid var(--border-color); margin-bottom: 1rem;">
        <p style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Original Transcript</p>
        <p style="font-style: italic; font-size: 0.875rem;">"${alert.transcript || 'No transcript available.'}"</p>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 1rem;">
        <div>
          <p>Status</p>
          <p class="text-primary" style="font-weight: 500;">${alert.status.toUpperCase()}</p>
        </div>
        <div>
          <p>Created</p>
          <p class="text-primary mono">${new Date(alert.created_at).toLocaleTimeString()}</p>
        </div>
      </div>
      <div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 1rem;">
        <p>Location</p>
        <p class="text-primary">${distanceStr}</p>
      </div>
      
      <div style="border-top: 1px solid var(--border-color); padding-top: 1rem; margin-top: 1rem;">
        <p style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Override AI Dispatch</p>
        <div style="display: flex; gap: 0.5rem;">
          <select id="reDispatchType" style="flex: 1; padding: 0.5rem; border-radius: 4px; background: var(--bg-color); border: 1px solid var(--border-color); color: var(--text-primary); font-family: var(--font-body);">
            <option value="fire" ${alert.type === 'fire' ? 'selected' : ''}>Fire Department</option>
            <option value="medical" ${alert.type === 'medical' ? 'selected' : ''}>Medical / Ambulance</option>
            <option value="police" ${alert.type === 'police' ? 'selected' : ''}>Police</option>
            <option value="accident" ${alert.type === 'accident' ? 'selected' : ''}>Accident Response</option>
            <option value="other" ${alert.type === 'other' ? 'selected' : ''}>Other</option>
          </select>
          <button class="btn-action" id="btnRedispatch" style="background: var(--border-color); color: var(--text-primary); padding: 0.5rem 1rem;">Change Option</button>
        </div>
      </div>
    `;
    
    detailPanel.classList.add('active');
    map.setView([alert.latitude, alert.longitude], 15);
    // markers[] is always fresh after updateMapMarkers; open popup if marker exists
    if (markers[id]) markers[id].openPopup();
  }

  // Wire btnRedispatch via delegation on detailContent — avoids listener accumulation
  document.getElementById('detailContent').addEventListener('click', async (e) => {
    if (e.target.id !== 'btnRedispatch') return;
    if (!selectedAlertId) return;
    const newType = document.getElementById('reDispatchType')?.value;
    if (!newType) return;
    const currentType = alertsData[selectedAlertId]?.type;
    if (newType === currentType) return;

    try {
      const res = await fetchWithTimeout(`/api/alerts/${selectedAlertId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: newType })
      });
      const updated = await res.json();
      processAlert(updated);
      selectAlert(updated.id);
    } catch (err) {
      // Mock fallback
      alertsData[selectedAlertId].type = newType;
      // Sync to localStorage so Reporter can see it too
      const savedAlerts = JSON.parse(localStorage.getItem('mockAlerts') || '[]');
      const idx = savedAlerts.findIndex(a => a.id === selectedAlertId);
      if (idx !== -1) { savedAlerts[idx].type = newType; localStorage.setItem('mockAlerts', JSON.stringify(savedAlerts)); }
      processAlert(alertsData[selectedAlertId]);
      selectAlert(selectedAlertId);
    }
  });
  
  document.getElementById('closeDetail').addEventListener('click', () => {
    document.getElementById('detailPanel').classList.remove('active');
    selectedAlertId = null;
    document.querySelectorAll('.alert-item').forEach(el => el.classList.remove('selected'));
  });
  
  document.getElementById('btnDispatch')?.addEventListener('click', () => updateStatus('dispatched'));
  document.getElementById('btnAcknowledge').addEventListener('click', () => updateStatus('monitoring'));
  document.getElementById('btnResolve').addEventListener('click', () => updateStatus('resolved'));
  
  async function updateStatus(newStatus) {
    if (!selectedAlertId) return;
    const idToUpdate = selectedAlertId; // capture before any async/null
    
    try {
      const res = await fetchWithTimeout(`/api/alerts/${idToUpdate}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      const updated = await res.json();
      processAlert(updated);
      if (newStatus === 'resolved') {
        document.getElementById('detailPanel').classList.remove('active');
        selectedAlertId = null;
      } else {
        selectAlert(updated.id);
      }
    } catch (err) {
      alertsData[idToUpdate].status = newStatus;
      processAlert(alertsData[idToUpdate]);
      
      // Sync to localStorage so Reporter sees the status change
      const savedAlerts = JSON.parse(localStorage.getItem('mockAlerts') || '[]');
      const idx = savedAlerts.findIndex(a => a.id === idToUpdate);
      if (idx !== -1) {
        savedAlerts[idx].status = newStatus;
        localStorage.setItem('mockAlerts', JSON.stringify(savedAlerts));
      }
      
      if (newStatus === 'resolved') {
        document.getElementById('detailPanel').classList.remove('active');
        selectedAlertId = null;
      } else {
        selectAlert(idToUpdate);
      }
    }
  }
  
  document.getElementById('resolvedHeader').addEventListener('click', () => {
    document.getElementById('resolvedList').classList.toggle('expanded');
  });
  
  function setupRealtimeSubscription() {
    const connText = document.getElementById('connectionText');
    const liveInd = document.getElementById('liveIndicator');
    
    // Simulate failure to connect to Supabase and fall back to Mock Mode
    console.log("Realtime subscription credentials not found, falling back to mock mode");
    connText.textContent = 'Offline (Mock Mode)';
    liveInd.style.background = 'var(--color-warning)';
    liveInd.style.animation = 'none'; // Disable scan animation when offline
    
    let mockCounter = 2;
    setInterval(() => {
      // 1. Sync from localStorage (Reporter)
      const savedAlerts = JSON.parse(localStorage.getItem('mockAlerts') || '[]');
      savedAlerts.forEach(a => {
        if (!alertsData[a.id] || alertsData[a.id].status !== a.status || alertsData[a.id].type !== a.type) {
          processAlert(a);
        }
      });
    
      // 2. Generate random mock alerts occasionally
      if (Math.random() > 0.5) {
        const severityRoll = Math.random();
        const severity = severityRoll > 0.8 ? 5 : (severityRoll > 0.5 ? 4 : (severityRoll > 0.2 ? 3 : 2));
        const newAlert = generateMockAlert(`mock-${mockCounter++}`, {
          summary: `Simulated incoming emergency (${Math.random().toString(36).substr(2, 5)})`,
          severity: severity,
          status: "reported"
        });
        processAlert(newAlert);
      }
    }, 5000);
  }
}
