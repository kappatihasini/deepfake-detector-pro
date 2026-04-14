/* =========================================
   DeepFake Shield – app.js
   Full interactive logic, mock AI engine,
   particle background, and dashboard.
   ========================================= */

'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  file: null,
  analysisType: 'auto',
  cameraStream: null,
  scans: [], // history
  stats: { uploads: 0, analyzed: 0, fakes: 0, authentic: 0 }
};

// ─── DOM Refs ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const navbar       = $('navbar');
const hamburger    = $('hamburger');
const navLinks     = $('nav-links');
const uploadZone   = $('upload-zone');
const fileInput    = $('file-input');
const uploadIdle   = $('upload-idle');
const uploadPreview= $('upload-preview');
const previewName  = $('preview-name');
const previewSize  = $('preview-size');
const previewType  = $('preview-type');
const previewIcon  = $('preview-icon');
const previewRemove= $('preview-remove');
const analyzeBtn   = $('analyze-btn');
const tabBtns      = document.querySelectorAll('.tab-btn');
const typeBtns     = document.querySelectorAll('.type-btn');
const loadingOverlay=$('loading-overlay');
const loadingStep  = $('loading-step');
const loadingBar   = $('loading-bar');
const loadingPct   = $('loading-pct');
const resultsSection=$('results-section');
const verdictBadge = $('verdict-badge');
const verdictFile  = $('verdict-file');
const verdictMeta  = $('verdict-meta');
const verdictPct   = $('verdict-pct');
const vringFill    = $('vring-fill');
const statUploads  = $('stat-uploads');
const statAnalyzed = $('stat-analyzed');
const statFakes    = $('stat-fakes');
const statAuthentic= $('stat-authentic');
const historyBody  = $('history-body');
const historyEmpty = $('history-empty');
const btnScanAnother=$('btn-scan-another');
const btnExport    = $('btn-export');
const barList      = $('bar-list');
const startCamBtn  = $('start-cam-btn');
const scanCamBtn   = $('scan-cam-btn');
const stopCamBtn   = $('stop-cam-btn');
const cameraFeed   = $('camera-feed');
const cameraOverlay= $('camera-overlay');
const scanOverlay  = $('scan-overlay');
const clearHistoryBtn=$('clear-history-btn');

// ─── Particle Canvas ─────────────────────────────────────────────────────────
(function initParticles() {
  const canvas = $('particle-canvas');
  const ctx = canvas.getContext('2d');
  let W, H, particles = [];

  class Particle {
    constructor() { this.reset(true); }
    reset(init) {
      this.x = Math.random() * W;
      this.y = init ? Math.random() * H : H + 10;
      this.r = Math.random() * 1.5 + 0.3;
      this.speed = Math.random() * 0.4 + 0.1;
      this.opacity = Math.random() * 0.5 + 0.1;
      this.hue = Math.random() < 0.5
        ? `rgba(99,102,241,${this.opacity})`
        : `rgba(6,182,212,${this.opacity})`;
    }
    update() {
      this.y -= this.speed;
      if (this.y < -10) this.reset(false);
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = this.hue;
      ctx.fill();
    }
  }

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function init() {
    particles = Array.from({ length: 80 }, () => new Particle());
  }

  function loop() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => { p.update(); p.draw(); });
    requestAnimationFrame(loop);
  }

  resize();
  init();
  loop();
  window.addEventListener('resize', () => { resize(); });
})();

// ─── Navbar scroll ────────────────────────────────────────────────────────────
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 10);
});
navbar.classList.toggle('scrolled', window.scrollY > 10);

// ─── Hamburger ───────────────────────────────────────────────────────────────
hamburger.addEventListener('click', () => {
  const open = hamburger.classList.toggle('open');
  navLinks.classList.toggle('open', open);
  hamburger.setAttribute('aria-expanded', open);
});
navLinks.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => {
    hamburger.classList.remove('open');
    navLinks.classList.remove('open');
    hamburger.setAttribute('aria-expanded', false);
  });
});

// ─── Tab switching ────────────────────────────────────────────────────────────
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    tabBtns.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', false); });
    btn.classList.add('active');
    btn.setAttribute('aria-selected', true);
    const target = btn.dataset.tab;
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`panel-${target}`).classList.add('active');
  });
});

// ─── Analysis type selector ───────────────────────────────────────────────────
typeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    typeBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.analysisType = btn.dataset.type;
  });
});

// ─── File Upload ──────────────────────────────────────────────────────────────
const FILE_ICONS = {
  video: '🎬',
  audio: '🎵',
  image: '🖼️',
  other: '📄'
};

function getFileCategory(file) {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('image/')) return 'image';
  return 'other';
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function setFile(file) {
  state.file = file;
  const cat = getFileCategory(file);
  previewIcon.textContent = FILE_ICONS[cat] || FILE_ICONS.other;
  previewName.textContent = file.name;
  previewSize.textContent = formatSize(file.size);
  previewType.textContent = file.type || 'unknown';
  uploadIdle.hidden = true;
  uploadPreview.hidden = false;
  analyzeBtn.disabled = false;

  // Auto-set type
  if (state.analysisType === 'auto') {
    typeBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.type === cat || (b.dataset.type === 'auto'));
      if (b.dataset.type === 'auto') b.classList.remove('active');
      if (b.dataset.type === cat) b.classList.add('active');
    });
  }

  state.stats.uploads++;
  updateStats();
}

function clearFile() {
  state.file = null;
  fileInput.value = '';
  uploadIdle.hidden = false;
  uploadPreview.hidden = true;
  analyzeBtn.disabled = true;
  typeBtns.forEach(b => b.classList.toggle('active', b.dataset.type === 'auto'));
  state.analysisType = 'auto';
}

uploadZone.addEventListener('click', e => {
  if (e.target === previewRemove || previewRemove.contains(e.target)) return;
  fileInput.click();
});
uploadZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) setFile(fileInput.files[0]);
});

previewRemove.addEventListener('click', e => { e.stopPropagation(); clearFile(); });

// Drag & Drop
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) setFile(file);
});

// ─── Random AI Result Generator ──────────────────────────────────────────────
// Produces a fully random result: Real/Fake verdict, 70–95% confidence,
// and contextual explanation text. Called on every Analyze click.

const LOADING_STEPS = [
  'Initializing AI engine...',
  'Loading detection models...',
  'Preprocessing media file...',
  'Running face analysis...',
  'Checking spectral patterns...',
  'GAN artifact detection...',
  'Cross-referencing voiceprint...',
  'Computing confidence scores...',
  'Finalizing results...'
];

// Random integer in [min, max] inclusive
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ── No-repeat picker ──────────────────────────────────────────────────────────
// Tracks the last-used index for each named pool so the same text is never
// shown twice in a row. Falls back to plain random for single-item arrays.
const _lastIndex = {};

function pickNoRepeat(key, arr) {
  if (arr.length === 1) return arr[0];
  let idx;
  do {
    idx = Math.floor(Math.random() * arr.length);
  } while (idx === _lastIndex[key]); // retry until different from last
  _lastIndex[key] = idx;
  return arr[idx];
}

// Simple unconstrained pick (still used for recommendations)
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Explanation text pools per verdict per media type
const EXPLANATIONS = {
  fake: {
    video: {
      primary: [
        'Face swap artifacts detected in multiple frames. Temporal inconsistencies suggest a GAN-generated synthetic face overlay.',
        'Lip-sync mismatch identified across 18% of analyzed frames, a strong indicator of AI-generated video manipulation.',
        'Blinking patterns and eye-movement trajectories deviate significantly from natural human motion baselines.'
      ],
      technical: [
        'DCT frequency analysis reveals pixel-level manipulation signatures. Compression blocks are inconsistent at facial boundaries.',
        'Optical flow vectors show unnatural discontinuities near the face region, consistent with post-processing insertion.',
        'Mel-frequency cepstral analysis detected audio-video phase drift of 320ms, indicating separate synthesis of audio and video.'
      ],
      recommendation: [
        'This video is highly likely to be a deepfake. Do not share or treat as authentic media without independent verification.',
        'Exercise extreme caution. The visual content appears AI-synthesized and should not be used as evidence or trusted as real.',
        'Flag this content for review. Multiple detection signals confirm synthetic media generation.'
      ]
    },
    audio: {
      primary: [
        'Voice cloning detected. Spectral voiceprint does not match natural human vocal biomarkers. Signs of TTS neural synthesis.',
        'Prosody patterns are statistically inconsistent with natural speech. Intonation rises are missing at clause boundaries.',
        'Unnatural silence segments and breath patterns detected — hallmarks of AI speech synthesis pipelines.'
      ],
      technical: [
        'F0 contour shows 8.3% deviation from natural prosody. Mel spectrogram reveals phase discontinuities at word boundaries.',
        'MFCC feature vectors cluster outside the human speech distribution space, confirming synthetic voice generation.',
        'Spectral envelope analysis detects missing vocal tract resonances typically present in authentic human recordings.'
      ],
      recommendation: [
        'This audio is highly likely AI-synthesized. Exercise extreme caution with any instructions or information from this source.',
        'Do not trust this voice recording. It shows multiple markers of neural voice cloning technology.',
        'Treat as fabricated audio. Verify the speaker\'s identity through an independent, trusted channel before acting on this.'
      ]
    },
    image: {
      primary: [
        'AI-generated image detected. Facial structure shows GAN-specific pixel repetition patterns and boundary artifacts.',
        'Inconsistencies around the hairline, ear geometry, and eye reflections are consistent with diffusion-model synthesis.',
        'Facial asymmetry and abnormal skin texture gradients indicate this image was not captured by a physical camera sensor.'
      ],
      technical: [
        'Error Level Analysis (ELA) reveals inconsistent compression across facial regions. Noise pattern matches Stable Diffusion output signatures.',
        'EXIF metadata is absent or spoofed. Sensor noise fingerprint does not match any known camera device profile.',
        'Frequency domain analysis via FFT reveals uniform noise distribution — characteristic of generative AI image synthesis.'
      ],
      recommendation: [
        'This image is almost certainly AI-generated or manipulated. Treat as synthetic media.',
        'Do not use this image as evidence or identity verification. Multiple forensic signals confirm AI generation.',
        'Exercise caution. Reverse image search and metadata verification are recommended before trusting this content.'
      ]
    }
  },
  authentic: {
    video: {
      primary: [
        'No face manipulation detected. All analyzed frames show consistent facial geometry and natural lighting patterns.',
        'Frame-by-frame consistency checks pass. Facial landmarks, skin tone, and temporal motion are all within natural ranges.',
        'No lip-sync anomalies found. Audio-visual correlation is within the expected window for authentic recordings.'
      ],
      technical: [
        'Spectral analysis confirms natural camera noise signatures. Audio-visual synchronization is within expected bounds.',
        'Optical flow vectors are smooth and continuous. No frame-injection or face-replacement artifacts detected.',
        'Compression analysis reveals consistent block patterns throughout — no region shows signs of post-editing manipulation.'
      ],
      recommendation: [
        'This video appears to be authentic. No synthetic content or tampering has been detected.',
        'Content passes all deepfake detection checks. Safe to treat as genuine media.',
        'No manipulation markers found. This video is consistent with authentic, unaltered footage.'
      ]
    },
    audio: {
      primary: [
        'Voice is authentic. All physiological vocal characteristics match expected natural human speech patterns.',
        'Voiceprint analysis confirms a consistent biological source throughout the recording. No synthesis markers found.',
        'Natural breath sounds, micro-pauses, and formant transitions confirm genuine human speech.'
      ],
      technical: [
        'Formant transitions, pitch variations, and micro-intonation are all within natural human vocal ranges.',
        'MFCC feature vectors fall within the expected human speech distribution. No TTS artifacts detected.',
        'Spectral envelope and vocal tract resonances are consistent with a real, physically produced voice.'
      ],
      recommendation: [
        'This audio appears to be authentic human speech. No voice cloning or synthesis detected.',
        'Voice recording passes all forensic checks. Safe to treat as genuine.',
        'No fabrication signals found. Audio is consistent with a real, unaltered human voice.'
      ]
    },
    image: {
      primary: [
        'Image appears authentic. Pixel-level analysis confirms consistent camera noise and valid device EXIF metadata.',
        'No AI generation artifacts detected. Facial geometry, skin texture, and lighting direction all appear natural.',
        'Lens distortion patterns and chromatic aberration are consistent with a genuine optical camera capture.'
      ],
      technical: [
        'ELA shows uniform compression throughout. No region-specific editing detected. EXIF device fingerprint is valid.',
        'Sensor noise fingerprint matches a known camera profile. Frequency domain analysis shows no synthesis artifacts.',
        'Metadata timestamps, GPS data, and device signatures are internally consistent and unmodified.'
      ],
      recommendation: [
        'This image shows no signs of AI generation or tampering. Likely authentic media.',
        'Content passes all forensic image checks. Safe to treat as a genuine, unaltered photograph.',
        'No manipulation detected. Image is consistent with authentic real-world capture.'
      ]
    }
  }
};

// Signal bar definitions per verdict
function buildSignals(verdict, type) {
  const isFake = verdict === 'fake';
  const fakeColor = '#ef4444';
  const realColor = '#22c55e';
  const midColor  = '#f59e0b';
  const accentColor = '#6366f1';

  const signalSets = {
    video: [
      { label: 'Facial Identity Consistency', fake: randInt(5, 22),  real: randInt(88, 99) },
      { label: 'Lip Sync Accuracy',           fake: randInt(4, 20),  real: randInt(90, 99) },
      { label: 'Temporal Frame Coherence',    fake: randInt(10, 28), real: randInt(85, 98) },
      { label: 'GAN Artifact Score',          fake: randInt(80, 96), real: randInt(2, 8)   },
      { label: 'Compression Anomalies',       fake: randInt(72, 92), real: randInt(3, 12)  },
    ],
    audio: [
      { label: 'Voiceprint Authenticity',    fake: randInt(4, 18),  real: randInt(92, 99) },
      { label: 'Prosody Naturalness',        fake: randInt(8, 22),  real: randInt(90, 99) },
      { label: 'Spectral Coherence',         fake: randInt(6, 20),  real: randInt(88, 99) },
      { label: 'TTS Artifact Score',         fake: randInt(78, 95), real: randInt(1, 7)   },
      { label: 'Background Noise Pattern',   fake: randInt(55, 78), real: randInt(86, 97) },
    ],
    image: [
      { label: 'ELA Consistency',            fake: randInt(6, 22),  real: randInt(88, 99) },
      { label: 'Facial Geometry Validity',   fake: randInt(10, 28), real: randInt(90, 99) },
      { label: 'EXIF Metadata Integrity',    fake: randInt(0, 15),  real: randInt(92, 100)},
      { label: 'GAN Fingerprint Score',      fake: randInt(80, 97), real: randInt(1, 6)   },
      { label: 'Pixel Noise Naturalness',    fake: randInt(8, 25),  real: randInt(88, 98) },
    ],
  };

  const set = signalSets[type] || signalSets.image;
  return set.map(s => {
    const pct = isFake ? s.fake : s.real;
    // Color: GAN Artifact Score is always accent-colored regardless of verdict
    let color;
    if (s.label.includes('GAN') || s.label.includes('TTS')) {
      color = isFake ? accentColor : accentColor;
    } else {
      color = isFake
        ? (pct < 30 ? fakeColor : midColor)
        : realColor;
    }
    return { label: s.label, pct, color };
  });
}

/**
 * generateRandomResult(mediaType)
 * Returns a fully randomized detection result:
 *   - verdict : 'fake' | 'authentic'  (50 / 50)
 *   - confidence:
 *       REAL  → 70–90 %  (authentic media tends to score a bit lower)
 *       FAKE  → 75–95 %  (model is more confident when flagging fakes)
 *   - primary & technical texts use no-repeat picking (never same text twice
 *     in a row for each field independently)
 *   - recommendation uses plain random (less noticeable if repeated)
 */
function generateRandomResult(mediaType) {
  const type    = (mediaType === 'other' || !EXPLANATIONS.fake[mediaType])
                  ? 'image'
                  : mediaType;

  const verdict = Math.random() < 0.5 ? 'fake' : 'authentic';

  // Verdict-specific confidence ranges
  const confidence = verdict === 'fake'
    ? randInt(75, 95)   // FAKE  → 75–95%
    : randInt(70, 90);  // REAL  → 70–90%

  const pool = EXPLANATIONS[verdict][type];

  // Unique keys per verdict+type+field so each field's history is independent
  const keyPrimary   = `${verdict}.${type}.primary`;
  const keyTechnical = `${verdict}.${type}.technical`;

  return {
    verdict,
    confidence,
    primary: {
      icon:  verdict === 'fake' ? '🔴' : '✅',
      title: 'Primary Finding',
      text:  pickNoRepeat(keyPrimary, pool.primary)
    },
    technical: {
      icon:  verdict === 'fake' ? '⚙️' : '🔬',
      title: 'Technical Analysis',
      text:  pickNoRepeat(keyTechnical, pool.technical)
    },
    recommendation: {
      icon:  verdict === 'fake' ? '⚠️' : '✔️',
      title: 'Recommendation',
      text:  pick(pool.recommendation)
    },
    signals: buildSignals(verdict, type)
  };
}

// ─── Loading animation (exactly 2 000ms) ─────────────────────────────────────
function runLoadingAnimation() {
  return new Promise(resolve => {
    const TOTAL = 2000;           // ← strict 2-second analysis window
    const FINISH_PAUSE = 300;     // brief pause on "Analysis complete!" before hiding

    loadingOverlay.hidden = false;
    loadingBar.style.width = '0%';
    loadingPct.textContent = '0%';

    // Distribute step labels evenly across the 2s window
    const stepInterval = TOTAL / LOADING_STEPS.length;
    let stepIdx = 0;
    loadingStep.textContent = LOADING_STEPS[0];

    const stepTimer = setInterval(() => {
      stepIdx = Math.min(stepIdx + 1, LOADING_STEPS.length - 1);
      loadingStep.textContent = LOADING_STEPS[stepIdx];
    }, stepInterval);

    // Smooth progress bar — nudges toward 95% then jumps to 100% at the end
    let pct = 0;
    const pctTimer = setInterval(() => {
      // Ease toward 95% asymptotically during the 2s window
      pct += (95 - pct) * 0.06;
      loadingBar.style.width = pct.toFixed(1) + '%';
      loadingPct.textContent = Math.round(pct) + '%';
    }, 40);

    // At exactly 2 000ms: complete and resolve
    setTimeout(() => {
      clearInterval(stepTimer);
      clearInterval(pctTimer);
      loadingStep.textContent = 'Analysis complete! ✓';
      loadingBar.style.width = '100%';
      loadingPct.textContent = '100%';
      setTimeout(() => {
        loadingOverlay.hidden = true;
        resolve();
      }, FINISH_PAUSE);
    }, TOTAL);
  });
}

// ─── Show Results ─────────────────────────────────────────────────────────────
const verdictColorMap = {
  authentic: '#22c55e',
  suspicious: '#f59e0b',
  fake: '#ef4444'
};
const verdictLabelMap = {
  authentic: '✓ Authentic',
  suspicious: '⚠ Suspicious',
  fake: '✗ DeepFake Detected'
};

function showResults(result, fileName, fileType) {
  resultsSection.hidden = false;
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Badge
  verdictBadge.textContent = verdictLabelMap[result.verdict];
  verdictBadge.className = `verdict-status-badge ${result.verdict}`;
  verdictFile.textContent = fileName;

  const now = new Date();
  verdictMeta.textContent = `Type: ${fileType.toUpperCase()} · Analyzed: ${now.toLocaleTimeString()}`;

  // Ring animation
  const circumference = 2 * Math.PI * 50; // r=50
  const offset = circumference - (result.confidence / 100) * circumference;
  vringFill.style.stroke = verdictColorMap[result.verdict];
  // Reset then animate
  vringFill.style.strokeDashoffset = circumference;
  setTimeout(() => { vringFill.style.strokeDashoffset = offset; }, 100);

  // Counter animation
  animateCount(verdictPct, 0, result.confidence, 1200, v => v + '%');

  // Explanation cards
  $('expl-icon-1').textContent = result.primary.icon;
  $('expl-title-1').textContent = result.primary.title;
  $('expl-text-1').textContent = result.primary.text;
  $('expl-icon-2').textContent = result.technical.icon;
  $('expl-title-2').textContent = result.technical.title;
  $('expl-text-2').textContent = result.technical.text;
  $('expl-icon-3').textContent = result.recommendation.icon;
  $('expl-title-3').textContent = result.recommendation.title;
  $('expl-text-3').textContent = result.recommendation.text;

  // Signal bars
  barList.innerHTML = '';
  result.signals.forEach(sig => {
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `
      <span class="bar-label">${sig.label}</span>
      <div class="bar-track">
        <div class="bar-fill" style="width:0%;background:${sig.color}"></div>
      </div>
      <span class="bar-pct">${sig.pct}%</span>`;
    barList.appendChild(row);
    setTimeout(() => { row.querySelector('.bar-fill').style.width = sig.pct + '%'; }, 200);
  });
}

function animateCount(el, from, to, duration, format = v => v) {
  const start = performance.now();
  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    el.textContent = format(Math.round(from + (to - from) * ease));
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ─── History table ────────────────────────────────────────────────────────────
function addHistoryRow(scan) {
  historyEmpty.hidden = true;
  const tr = document.createElement('tr');
  const badgeClass = scan.verdict;
  const badgeText = { authentic: 'Authentic', suspicious: 'Suspicious', fake: 'DeepFake' }[scan.verdict];
  tr.innerHTML = `
    <td>${state.scans.length}</td>
    <td title="${scan.name}" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;">${scan.name}</td>
    <td>${scan.type}</td>
    <td><span class="badge-sm ${badgeClass}">${badgeText}</span></td>
    <td>${scan.confidence}%</td>
    <td>${scan.time}</td>`;
  historyBody.insertBefore(tr, historyBody.firstChild);
}

// ─── Stats update ─────────────────────────────────────────────────────────────
function updateStats() {
  statUploads.textContent = state.stats.uploads;
  statAnalyzed.textContent = state.stats.analyzed;
  statFakes.textContent = state.stats.fakes;
  statAuthentic.textContent = state.stats.authentic;
}

// ─── Simple 2-second wait ────────────────────────────────────────────────────
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// ─── Analyze button ───────────────────────────────────────────────────────────
analyzeBtn.addEventListener('click', async () => {
  if (!state.file) return;

  const file = state.file;
  const cat  = getFileCategory(file);
  const type = state.analysisType === 'auto' ? cat : state.analysisType;

  // 1. Disable button + show "Analyzing..." label
  analyzeBtn.disabled = true;
  analyzeBtn.classList.add('analyzing');
  analyzeBtn.innerHTML = `
    <span class="btn-spinner"></span>
    Analyzing...`;

  // 2. Hide previous results and clear file preview
  clearFile();
  resultsSection.hidden = true;

  // 3. Wait exactly 2 seconds
  await wait(2000);

  // 4. Generate random result
  const result = generateRandomResult(type);

  // 5. Re-enable button and restore original label
  analyzeBtn.classList.remove('analyzing');
  analyzeBtn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>
    Analyze File`;
  // stays disabled until a new file is chosen
  analyzeBtn.disabled = true;

  // 6. Update session stats
  state.stats.analyzed++;
  if (result.verdict === 'fake')      state.stats.fakes++;
  if (result.verdict === 'authentic') state.stats.authentic++;
  updateStats();

  // 7. Log to history
  const now = new Date();
  const scan = {
    name:       file.name,
    type:       type.toUpperCase(),
    verdict:    result.verdict,
    confidence: result.confidence,
    time:       now.toLocaleTimeString()
  };
  state.scans.push(scan);
  addHistoryRow(scan);

  // 8. Show results
  showResults(result, file.name, type);
});

// ─── Scan Another ─────────────────────────────────────────────────────────────
btnScanAnother.addEventListener('click', () => {
  resultsSection.hidden = true;
  document.getElementById('detect').scrollIntoView({ behavior: 'smooth' });
});

// ─── Export Report ────────────────────────────────────────────────────────────
btnExport.addEventListener('click', () => {
  const last = state.scans[state.scans.length - 1];
  if (!last) return;
  const report = [
    '=== DeepFake Shield Forensic Report ===',
    `File: ${last.name}`,
    `Type: ${last.type}`,
    `Result: ${last.verdict.toUpperCase()}`,
    `Confidence: ${last.confidence}%`,
    `Time: ${last.time}`,
    '',
    'Generated by DeepFake Shield – AI Forensics Platform',
    '© 2026 DeepFake Shield'
  ].join('\n');

  const blob = new Blob([report], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `deepfake-shield-report-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
});

// ─── Clear History ────────────────────────────────────────────────────────────
clearHistoryBtn.addEventListener('click', () => {
  state.scans = [];
  historyBody.innerHTML = '';
  historyBody.appendChild(historyEmpty);
  historyEmpty.hidden = false;
});

// ─── Camera ───────────────────────────────────────────────────────────────────

// Helper: update the camera overlay message and icon
function setCameraMessage(msg, isError = false) {
  const p = cameraOverlay.querySelector('p');
  if (p) {
    p.textContent = msg;
    p.style.color = isError ? 'var(--clr-red)' : '';
  }
}

// Helper: fully reset camera UI to idle state
function resetCameraUI() {
  cameraFeed.srcObject = null;
  cameraOverlay.style.display = 'flex';
  startCamBtn.disabled = false;
  scanCamBtn.disabled  = true;
  stopCamBtn.disabled  = true;
  scanOverlay.hidden   = true;
}

// On page load: check if getUserMedia is even available on this device/browser.
// If not, hide Scan and Stop buttons and show a clear fallback message.
(function checkCameraAvailability() {
  const hasAPI = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  if (!hasAPI) {
    setCameraMessage('Camera not available on this device or browser.', true);
    startCamBtn.hidden = true;
    scanCamBtn.hidden  = true;
    stopCamBtn.hidden  = true;
  }
})();

// ── Start Camera ──
startCamBtn.addEventListener('click', async () => {
  setCameraMessage('Requesting camera permission…');

  try {
    // Explicitly request video only (no audio needed for visual analysis)
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: false
    });

    // Success — attach stream and show live feed
    state.cameraStream = stream;
    cameraFeed.srcObject = stream;
    cameraFeed.play().catch(() => {}); // safe for autoplay policies
    cameraOverlay.style.display = 'none';
    startCamBtn.disabled = true;
    scanCamBtn.disabled  = false;
    stopCamBtn.disabled  = false;

  } catch (err) {
    // Map known DOMException names to user-friendly messages
    let msg;
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      msg = 'Camera access denied. Please allow permission in your browser settings.';
    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      msg = 'No camera found. Connect a camera and try again.';
      // Hide scan controls since there's no hardware
      scanCamBtn.hidden = true;
      stopCamBtn.hidden = true;
    } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      msg = 'Camera is in use by another app. Please close it and try again.';
    } else if (err.name === 'OverconstrainedError') {
      msg = 'Camera does not meet requirements. Try a different device.';
    } else {
      msg = 'Could not access camera. Please check your browser permissions.';
    }

    setCameraMessage(msg, true);
    console.warn('[DeepFake Shield] Camera error:', err.name, err.message);
  }
});

// ── Stop Camera ──
stopCamBtn.addEventListener('click', () => {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach(track => track.stop());
    state.cameraStream = null;
  }
  resetCameraUI();
  setCameraMessage('Camera stopped. Click "Start Camera" to begin again.');
});

// ── Scan Live Feed ──
scanCamBtn.addEventListener('click', async () => {
  // Guard: must have an active stream
  if (!state.cameraStream) {
    setCameraMessage('No active camera stream. Please start the camera first.', true);
    return;
  }

  scanCamBtn.disabled  = true;
  scanOverlay.hidden   = false;

  // 2-second loading then random result
  await runLoadingAnimation();
  const result = generateRandomResult('image');

  scanOverlay.hidden  = true;
  scanCamBtn.disabled = false;

  // Update stats
  state.stats.analyzed++;
  if (result.verdict === 'fake')      state.stats.fakes++;
  if (result.verdict === 'authentic') state.stats.authentic++;
  updateStats();

  // Log to history
  const now = new Date();
  const scan = {
    name:       'Live Camera Feed',
    type:       'LIVE',
    verdict:    result.verdict,
    confidence: result.confidence,
    time:       now.toLocaleTimeString()
  };
  state.scans.push(scan);
  addHistoryRow(scan);
  showResults(result, 'Live Camera Feed', 'live');
});

// ─── Scroll-based entrance animations ─────────────────────────────────────────
(function initScrollAnimations() {
  const targets = document.querySelectorAll('.feature-card, .dash-card, .expl-card');
  if (!('IntersectionObserver' in window)) return;

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        setTimeout(() => entry.target.classList.add('fade-in'), i * 70);
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  targets.forEach(t => {
    t.style.opacity = '0';
    t.style.transform = 'translateY(20px)';
    io.observe(t);
  });
  // Override fade-in to also reset transform
  document.head.insertAdjacentHTML('beforeend', `<style>
    .fade-in { opacity: 1 !important; transform: translateY(0) !important; transition: opacity 0.55s ease, transform 0.55s ease !important; }
  </style>`);
})();

// ─── Active nav highlight on scroll ─────────────────────────────────────────
(function initScrollSpy() {
  const sections = ['hero', 'features', 'detect', 'dashboard']
    .map(id => document.getElementById(id)).filter(Boolean);
  const links = document.querySelectorAll('.nav-link');

  window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(sec => {
      if (window.scrollY >= sec.offsetTop - 120) current = sec.id;
    });
    links.forEach(a => {
      const href = a.getAttribute('href').replace('#', '');
      a.style.color = href === current ? 'var(--text-1)' : '';
    });
  });
})();

// ─── Initial stats render ─────────────────────────────────────────────────────
updateStats();
