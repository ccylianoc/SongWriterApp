/* =====================================================================
   Songwriter Studio — main.js
   Organized by feature area. Each block is self-contained.
   ===================================================================== */
//============================== Version =================================
const APP_VERSION = '1.4.2';
/* ============================== STATE ============================== */


let currentKey = 'C';
const CHORD_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const CHORD_FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
let useFlats = false;

let savedRange = null;          // caret position saved when editor loses focus
let mediaRecorder, chunks = [], timerInterval, seconds = 0;

let projects = [];
try { projects = JSON.parse(localStorage.getItem('sw_projects') || '[]'); } catch (e) { projects = []; }
let currentProject = null;

const settings = JSON.parse(localStorage.getItem('sw_settings') || '{}');

/* ============================== MOBILE DETECTION ============================== */
function detectMobile() {
  const mobile = window.matchMedia('(max-width: 768px)').matches;
  document.body.classList.toggle('mobile', mobile);
  document.getElementById('mobileNav').classList.toggle('hidden', !mobile);
  return mobile;
}
window.addEventListener('resize', detectMobile);
detectMobile();

// Bottom nav tab switching (skeleton — just toggles active state for now)
document.querySelectorAll('.mnav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mnav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

/*============================MOBILE SHEET==================================*/ 
const sheet = document.getElementById('sheet');
const sheetOverlay = document.getElementById('sheetOverlay');
const sheetContent = document.getElementById('sheetContent');

function openSheet(html) {
  sheetContent.innerHTML = html;
  sheet.classList.add('visible');
  sheetOverlay.classList.remove('hidden');
  requestAnimationFrame(() => sheetOverlay.classList.add('visible'));
}
function closeSheet() {
  sheet.classList.remove('visible');
  sheetOverlay.classList.remove('visible');
  setTimeout(() => sheetOverlay.classList.add('hidden'), 200);
}

sheetOverlay.addEventListener('click', closeSheet);

// Map each bottom tab to the side-panel content it should show
const PANEL_CONTENT = {
  chords: () => document.getElementById('side-chords').innerHTML,
  recordings: () => document.getElementById('side-recordings').innerHTML
};


document.querySelectorAll('.mnav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mnav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const panel = btn.dataset.panel;
    if (panel === 'lyrics') {
      closeSheet();
      return;
    }
    const getContent = PANEL_CONTENT[panel];
    if (getContent) openSheet(getContent());
  });
});


/* ============================== DOM REFS ============================== */
const lyricsEl   = document.getElementById('lyrics');
const startScreen = document.getElementById('startScreen');
const workspace  = document.querySelector('.workspace');
const toolbar    = document.getElementById('toolbar');
const settingsModal = document.getElementById('settingsModal');
const recBtn     = document.getElementById('recBtn');
const recTimer   = document.getElementById('recTimer');

/* ============================== SAVE ============================== */
document.getElementById('saveBtn').addEventListener('click', () => {
  persistCurrent();
  const title = document.getElementById('songTitle').textContent.trim() || 'Untitled song';
  const body = lyricsEl.innerHTML;
  const project = {
    title,
    bpm: document.getElementById('bpm').value,
    root: currentRoot,
    mode: currentMode,
    scale: currentScale,
    body
  };
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = title + '.json';
  a.click();
  URL.revokeObjectURL(url);
});

/* ============================= IMPORT ============================= */

document.getElementById('importBtn').addEventListener('click', () => {
  document.getElementById('importFileInput').click();
});
document.getElementById('importFileInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const p = JSON.parse(reader.result);
      if (!p.title || !p.body) throw new Error('invalid');
      projects.unshift({
        title: p.title,
        body: p.body,
        bpm: p.bpm || 100,
        root: p.root || 'C',
        mode: p.mode || 'major',
        scale: p.scale || 'natural',
        updated: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      });
      localStorage.setItem('sw_projects', JSON.stringify(projects));
      renderLibrary();
    } catch (err) {
      alert('That file is not a valid Songwritee project.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});


// ---------- Chord validation ----------
const ROOT_NOTES = ['A','B','C','D','E','F','G'];
const CHORD_EXTENSIONS = [
  '', 'm', 'maj', 'min', 'dim', 'aug', 'sus', 'sus2', 'sus4',
  '7', 'm7', 'maj7', 'min7', 'dim7', 'aug7', 'm7b5', '7b5', '7#5',
  '9', 'm9', 'maj9', 'add9', '6', 'm6', 'maj6', '11', '13',
  '5', '6/9', '7sus4', '9sus4', '13sus4', '7#9', '7b9', '7#11', '7b13'
];

function validateChord(input) {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Check 1: root note (auto-capitalize)
  const first = trimmed[0].toUpperCase();
  const rest = trimmed.slice(1);
  if (!ROOT_NOTES.includes(first)) return null;

  // Allow sharp/flat after root, e.g. C#, Bb
  let root = first;
  let ext = rest;
  if (rest[0] === '#' || rest[0] === 'b') {
    root = first + rest[0];
    ext = rest.slice(1);
  }

  // Normalize common variants
  const normalized = ext.replace('min', 'm').replace('major', 'maj');
  if (!CHORD_EXTENSIONS.includes(normalized)) return null;

  return root + normalized;
}

/* ============================== SCALES & CHORDS ============================== */
const KEYS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

const SCALES_MAJ = {
  'natural':   { mode: 'major', intervals: [0,2,4,5,7,9,11] },
  'lydian':    { mode: 'major', intervals: [0,2,4,6,7,9,11] },
  'mixolydian':{ mode: 'major', intervals: [0,2,4,5,7,9,10] },
  'pentatonic':{ mode: 'major', intervals: [0,2,4,7,9] },
  'blues':     { mode: 'major', intervals: [0,2,3,4,7,9] },
  'bebop':     { mode: 'major', intervals: [0,2,4,5,7,8,9,11] },
  'whole-tone':{ mode: 'major', intervals: [0,2,4,6,8,10] },
  'chromatic': { mode: 'major', intervals: [0,1,2,3,4,5,6,7,8,9,10,11] },
};

const SCALES_MIN = {
  'natural':   { mode: 'minor', intervals: [0,2,3,5,7,8,10] },
  'harmonic':  { mode: 'minor', intervals: [0,2,3,5,7,8,11] },
  'melodic':   { mode: 'minor', intervals: [0,2,3,5,7,9,11] },
  'dorian':    { mode: 'minor', intervals: [0,2,3,5,7,9,10] },
  'phrygian':  { mode: 'minor', intervals: [0,1,3,5,7,8,10] },
  'locrian':   { mode: 'minor', intervals: [0,1,3,5,6,8,10] },
  'pentatonic':{ mode: 'minor', intervals: [0,3,5,7,10] },
  'blues':     { mode: 'minor', intervals: [0,3,5,6,7,10] },
  'bebop':     { mode: 'minor', intervals: [0,2,3,5,7,9,10,11] },
  'dorian-b2': { mode: 'minor', intervals: [0,1,3,5,7,9,10] },
  'phrygian-dominant': { mode: 'minor', intervals: [0,1,4,5,7,8,10] },
  'hungarian-minor':   { mode: 'minor', intervals: [0,2,3,6,7,8,11] },
  'double-harmonic':   { mode: 'minor', intervals: [0,1,4,5,7,8,11] },
  'altered':   { mode: 'minor', intervals: [0,1,3,4,6,8,10] },
  'diminished':{ mode: 'minor', intervals: [0,2,3,5,6,8,9,11] },
};

const SCALE_TYPES = {
  major: Object.keys(SCALES_MAJ),
  minor: Object.keys(SCALES_MIN),
};

// Combined lookup so buildChart can resolve any selected scale by name + mode
function getScale(mode, name) {
  return (mode === 'minor' ? SCALES_MIN : SCALES_MAJ)[name];
}


const ROMAN_MAJOR = ['I','ii','iii','IV','V','vi','vii°'];
const ROMAN_MINOR = ['i','ii°','III','iv','v','VI','VII'];

let currentRoot = 'C';
let currentMode  = 'major';
let currentScale = 'natural';


function triadQuality(root, third, fifth) {
  const t = (KEYS.indexOf(third) - KEYS.indexOf(root) + 12) % 12;
  const f = (KEYS.indexOf(fifth) - KEYS.indexOf(root) + 12) % 12;
  if (t === 4 && f === 7) return '';
  if (t === 3 && f === 7) return 'm';
  if (t === 4 && f === 8) return 'aug';
  if (t === 3 && f === 6) return 'dim';
  if (t === 4 && f === 6) return 'sus4';
  if (t === 2 && f === 7) return 'sus2';
  return '';
}

function seventhQuality(root, third, fifth, seventh) {
  const t = (KEYS.indexOf(third) - KEYS.indexOf(root) + 12) % 12;
  const f = (KEYS.indexOf(fifth) - KEYS.indexOf(root) + 12) % 12;
  const s = (KEYS.indexOf(seventh) - KEYS.indexOf(root) + 12) % 12;
  if (t === 4 && f === 7 && s === 11) return 'Maj7';
  if (t === 3 && f === 7 && s === 10) return 'm7';
  if (t === 4 && f === 7 && s === 10) return '7';
  if (t === 3 && f === 6 && s === 10) return 'm7b5';
  if (t === 3 && f === 6 && s === 9)  return 'dim7';
  if (t === 4 && f === 8 && s === 11) return 'Maj7#5';
  return triadQuality(root, third, fifth) + '7';
}

function buildChart(root, mode, scaleName) {
  const scale = getScale(mode, scaleName);
  if (!scale) return;
  const idx = KEYS.indexOf(root);
  const notes = scale.intervals.map(semi => KEYS[(idx + semi) % 12]);
  const n = notes.length;
  const roman = mode === 'minor' ? ROMAN_MINOR : ROMAN_MAJOR;

  let rows = [];
  for (let i = 0; i < n; i++) {
    const third   = notes[(i + 2) % n];
    const fifth   = notes[(i + 4) % n];
    const seventh = notes[(i + 6) % n];
    rows.push([
      roman[i % roman.length],
      notes[i] + triadQuality(notes[i], third, fifth),
      notes[i] + seventhQuality(notes[i], third, fifth, seventh),
    ]);
  }

  // Borrowed from the parallel natural scale (opposite mode)
  const oppMode = mode === 'minor' ? 'major' : 'minor';
  const oppScale = getScale(oppMode, 'natural');
  const oppNotes = oppScale.intervals.map(semi => KEYS[(idx + semi) % 12]);
  const oppRoman = oppMode === 'minor' ? ROMAN_MINOR : ROMAN_MAJOR;
  const borrowed = oppNotes.map((note, i) => {
    const third = oppNotes[(i + 2) % oppNotes.length];
    const fifth = oppNotes[(i + 4) % oppNotes.length];
    return [oppRoman[i % oppRoman.length], note + triadQuality(note, third, fifth)];
  });

  let html = '<table class="chord-table"><tr><th></th><th>Triad</th><th>Seventh</th></tr>';
  rows.forEach(r => {
    html += `<tr><td>${r[0]}</td><td class="chord-name">${r[1]}</td><td class="chord-name">${r[2]}</td></tr>`;
  });
  html += '</table>';
  html += `<div style="font-weight:600;color:#999;font-size:11px;margin-bottom:4px">Borrowed (from ${root} ${oppMode})</div>`;
  html += '<table class="chord-table"><tr><th></th><th>Chord</th></tr>';
  borrowed.forEach(b => {
    html += `<tr><td>${b[0]}</td><td class="chord-name">${b[1]}</td></tr>`;
  });
  html += '</table>';
  document.getElementById('chordChart').innerHTML = html;
}


function populateScaleTypes() {
  const mode = document.getElementById('scaleModeSelect').value;
  currentMode = mode;
  const typeSel = document.getElementById('scaleTypeSelect');
  typeSel.innerHTML = '';
  SCALE_TYPES[mode].forEach(name => {
    typeSel.add(new Option(name.replace(/-/g, ' '), name));
  });
  if (!SCALE_TYPES[mode].includes(currentScale)) {
    currentScale = SCALE_TYPES[mode][0];
  }
  typeSel.value = currentScale;
  syncChordMenu();
}

function syncChordMenu() {
  document.getElementById('chordRootSelect').value = currentRoot;
  document.getElementById('chordModeSelect').value = currentMode;
  const cType = document.getElementById('chordScaleTypeSelect');
  cType.innerHTML = '';
  SCALE_TYPES[currentMode].forEach(name => {
    cType.add(new Option(name.replace(/-/g, ' '), name));
  });
  cType.value = currentScale;
  buildChart(currentRoot, currentMode, currentScale);
}


// Toolbar wiring
document.getElementById('scaleRootSelect').addEventListener('change', e => {
  currentRoot = e.target.value;
  syncChordMenu();
});
document.getElementById('scaleModeSelect').addEventListener('change', () => {
  populateScaleTypes();   // sets currentMode from the dropdown
  syncChordMenu();
});
document.getElementById('scaleTypeSelect').addEventListener('change', e => {
  currentScale = e.target.value;
  syncChordMenu();
});

// Chord menu wiring
document.getElementById('chordRootSelect').addEventListener('change', e => {
  currentRoot = e.target.value;
  document.getElementById('scaleRootSelect').value = currentRoot;
  syncChordMenu();
});
document.getElementById('chordModeSelect').addEventListener('change', () => {
  document.getElementById('scaleModeSelect').value = document.getElementById('chordModeSelect').value;
  populateScaleTypes();
  syncChordMenu();
});
document.getElementById('chordScaleTypeSelect').addEventListener('change', e => {
  currentScale = e.target.value;
  document.getElementById('scaleTypeSelect').value = currentScale;
  syncChordMenu();
});

// Key prev/next
document.getElementById('keyPrev').addEventListener('click', () => {
  const i = (KEYS.indexOf(currentRoot) - 1 + 12) % 12;
  currentRoot = KEYS[i];
  document.getElementById('scaleRootSelect').value = currentRoot;
  syncChordMenu();
});
document.getElementById('keyNext').addEventListener('click', () => {
  const i = (KEYS.indexOf(currentRoot) + 1) % 12;
  currentRoot = KEYS[i];
  document.getElementById('scaleRootSelect').value = currentRoot;
  syncChordMenu();
});

/* ============================== CHORD INSERTION ============================== */
document.getElementById('addChordBtn').addEventListener('click', () => {
  const chord = prompt('Enter chord (e.g. Am, F, G7):');
  if (!chord) return;
  const valid = validateChord(chord);
  if (!valid) {
    alert('That doesn\'t look like a valid chord. Try e.g. Am, F, G7, Cmaj7.');
    return;
  }
  insertChord(valid);
});

// Remember caret position when the editor loses focus
lyricsEl.addEventListener('blur', () => {
  const sel = window.getSelection();
  if (sel.rangeCount) savedRange = sel.getRangeAt(0).cloneRange();
});

// Insert chord at the saved (or current) caret position
function insertChord(chord) {
  const sel = window.getSelection();

  // Fall back to saved range from blur, else current selection
  let range = savedRange || (sel.rangeCount ? sel.getRangeAt(0) : null);
  if (!range) {
    range = document.createRange();
    range.selectNodeContents(lyricsEl);
    range.collapse(false);
  }

  // Find the text node and offset at the caret
  let node = range.startContainer;
  let offset = range.startOffset;

  // If the caret is in an element, locate the actual text node
  if (node.nodeType !== 3) {
    const walker = document.createTreeWalker(lyricsEl, NodeFilter.SHOW_TEXT);
    let t;
    while ((t = walker.nextNode())) {
      if (t.parentNode.closest('.tab-block')) continue; // skip tabs
      node = t; offset = 0; break;
    }
  }
  if (!node || node.nodeType !== 3) return;

  // Expand to the full word containing the caret
  const text = node.nodeValue;
  let start = text.lastIndexOf(' ', offset - 1) + 1;
  let end = text.indexOf(' ', offset);
  if (end === -1) end = text.length;
  const word = text.slice(start, end);

  // Build: chordwrap > chord + word
  const wrap = document.createElement('span');
  wrap.className = 'chordwrap';
  const ch = document.createElement('span');
  ch.className = 'chord';
  ch.textContent = chord;
  wrap.appendChild(ch);
  wrap.appendChild(document.createTextNode(word));

  // Replace the word with the wrapped version
  const before = text.slice(0, start);
  const after = text.slice(end);
  const frag = document.createDocumentFragment();
  frag.appendChild(document.createTextNode(before));
  frag.appendChild(wrap);
  frag.appendChild(document.createTextNode(after));
  node.replaceWith(frag);

  // Park the caret right after the chordwrap
  const r2 = document.createRange();
  r2.setStartAfter(wrap);
  r2.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r2);
  lyricsEl.focus();
  savedRange = null;
}
/* ============================ PASTE CONVERTION ============================ */
function alignChordsToLyrics(chordLine, lyricLine) {
  // chordLine: "  A        F#m     D  E  A"
  // lyricLine: "When the night has come"
  // returns [{ chord, word }]
  const pairs = [];
  let wordStart = -1, word = '';
  const words = [];

  // Build a list of words with their start columns
  for (let i = 0; i <= lyricLine.length; i++) {
    const ch = lyricLine[i] || ' ';
    if (ch !== ' ') {
      if (wordStart === -1) wordStart = i;
      word += ch;
    } else if (wordStart !== -1) {
      words.push({ word, start: wordStart });
      wordStart = -1; word = '';
    }
  }

  // Match each chord to the nearest word at or before its column
  const chordRe = /[A-G][#b]?(m|maj|min|dim|aug|sus|7|9|11|13|add|sus2|sus4|6|5)*/g;
  let m;
  while ((m = chordRe.exec(chordLine)) !== null) {
    const col = m.index;
    let best = null;
    for (const w of words) {
      if (w.start <= col) best = w;
      else break;
    }
    if (best) pairs.push({ chord: m[0], word: best.word });
  }
  return pairs;
}

/* ============================== VIEWING MODE ============================== */
const viewModeBtn = document.getElementById('viewModeBtn');
let viewMode = false;

const EDIT_TOOL_IDS = [
  'addChordBtn', 'addSectionBtn', 'boldBtn', 'italicBtn',
  'insertGuitarTabBtn', 'insertBassTabBtn',
  'bpm', 'scaleRootSelect', 'scaleModeSelect', 'scaleTypeSelect'
];

function setViewMode(on) {
  viewMode = on;
  lyricsEl.contentEditable = on ? 'false' : 'true';
  viewModeBtn.textContent = on ? '✏️ Edit' : '👁 View';
  viewModeBtn.classList.toggle('active', on);

  EDIT_TOOL_IDS.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = on;
  });
}

viewModeBtn.addEventListener('click', () => setViewMode(!viewMode));

/* ============================== SECTION LABEL ============================== */
document.getElementById('addSectionBtn').addEventListener('click', () => {
  const name = prompt('Section name (e.g. Verse, Chorus):');
  if (!name) return;
  lyricsEl.innerHTML += `<p class="section-label">[${name}]</p>`;
});

/* ============================== BOLD / ITALIC ============================== */
document.getElementById('boldBtn').addEventListener('click', () => {
  document.execCommand('bold');
  lyricsEl.focus();
});
document.getElementById('italicBtn').addEventListener('click', () => {
  document.execCommand('italic');
  lyricsEl.focus();
});

/* ============================== TRANSPOSE ============================== */
document.getElementById('transposeUp').addEventListener('click', () => transpose(1));
document.getElementById('transposeDown').addEventListener('click', () => transpose(-1));

function transpose(step) {
  const idx = KEYS.indexOf(currentRoot);
  currentRoot = KEYS[(idx + step + 12) % 12];
  document.getElementById('scaleRootSelect').value = currentRoot;
  syncChordMenu();
  // transpose the lyric chords
  const chords = document.querySelectorAll('#lyrics .chord');
  chords.forEach(c => {
    const transposed = transposeChord(c.textContent.trim(), step);
    if (transposed) c.textContent = transposed;
  });
}

function transposeChord(chord, step) {
  const match = chord.match(/^([A-G][#b]?)(.*)$/);
  if (!match) return null;
  const scale = useFlats ? CHORD_FLAT : CHORD_SHARP;
  let idx = scale.indexOf(match[1]);
  if (idx === -1) return null;
  idx = (idx + step + 12) % 12;
  return scale[idx] + match[2];
}

/* ============================== RECORDINGS ============================== */
recBtn.addEventListener('click', async () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    chunks = [];
    mediaRecorder.ondataavailable = e => chunks.push(e.data);
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      addRecording(url);
      stream.getTracks().forEach(t => t.stop());
      clearInterval(timerInterval);
      recBtn.classList.remove('recording');
      recBtn.textContent = 'REC';
    };
    mediaRecorder.start();
    recBtn.classList.add('recording');
    recBtn.textContent = 'STOP';
    seconds = 0;
    recTimer.textContent = '0:00';
    timerInterval = setInterval(() => {
      seconds++;
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      recTimer.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    }, 1000);
  } catch (e) {
    alert('Microphone access denied. Check Windows mic permissions.');
  }
});

function addRecording(url) {
  const list = document.getElementById('recList');
  if (list.textContent.includes('No recordings yet')) list.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'rec-item';
  div.innerHTML = `<audio controls src="${url}"></audio><button class="rec-del" title="Delete recording">🗑</button>`;
  div.querySelector('.rec-del').addEventListener('click', () => {
    div.remove();
    if (!list.children.length) list.innerHTML = '<div class="empty-rec">No recordings yet</div>';
  });
  list.appendChild(div);
}

function clearRecordings() {
  document.getElementById('recList').innerHTML = '<div class="empty-rec">No recordings yet</div>';
}

// Upload
document.getElementById('uploadAudioBtn').addEventListener('click', () => {
  document.getElementById('audioFileInput').click();
});
document.getElementById('audioFileInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const list = document.getElementById('recList');
  if (list.textContent.includes('No recordings yet')) list.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'rec-item';
  const name = file.name.replace(/\.[^.]+$/, '');
  div.innerHTML = `<div style="font-size:12px;color:#555;margin-bottom:4px">${name}</div>
                   <audio controls src="${url}"></audio>
                   <button class="rec-del" title="Delete recording">🗑</button>`;
  div.querySelector('.rec-del').addEventListener('click', () => {
    div.remove();
    if (!list.children.length) list.innerHTML = '<div class="empty-rec">No recordings yet</div>';
  });
  list.appendChild(div);
  e.target.value = '';
});

/* ============================== SIDE PANEL ============================== */
// Toggle side panel
document.getElementById('toggleSideBtn').addEventListener('click', () => {
  document.querySelector('.side-pane').classList.toggle('collapsed');
});

// Side panel tabs
document.querySelectorAll('.side-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.side-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.side-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('side-' + tab.dataset.side).classList.add('active');
  });
});
/* ============================== LIBRARY / START SCREEN ============================== */
const GREETINGS = [
  'Hello there',
  'Welcome back',
  'Good to see you',
  'Ready to write something new?',
  "Let's make some music"
];

function showStart() {
  const acc = settings.account || {};
  const name = acc.name ? ', ' + acc.name : '';
  startScreen.classList.add('visible');
  workspace.classList.add('hidden');
  toolbar.classList.add('hidden');
  document.getElementById('backLink').classList.add('hidden');
  document.querySelector('.song-title-wrap').classList.add('hidden');
  document.getElementById('deleteProjectTopBtn').classList.add('hidden');
  document.getElementById('greeting').textContent =
    GREETINGS[Math.floor(Math.random() * GREETINGS.length)] + name;
  renderLibrary();
}

function showEditor() {
  startScreen.classList.remove('visible');
  workspace.classList.remove('hidden');
  toolbar.classList.remove('hidden');
  document.getElementById('backLink').classList.remove('hidden');
  document.getElementById('deleteProjectTopBtn').classList.remove('hidden');
  document.querySelector('.song-title-wrap').classList.remove('hidden');
}

function renderLibrary() {
  const grid = document.getElementById('libraryGrid');
  if (!projects.length) {
    grid.innerHTML = '<div class="empty-library">No projects yet. Tap the + button to start your first song.</div>';
    return;
  }
  grid.innerHTML = '';
  projects.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'project-card';
    const title = document.createElement('div');
    title.className = 'project-title';
    title.textContent = p.title;
    const meta = document.createElement('div');
    meta.className = 'project-meta';
    meta.textContent = p.updated || '';
    const del = document.createElement('button');
    del.className = 'project-delete';
    del.title = 'Delete project';
    del.textContent = '🗑';
    del.addEventListener('click', e => {
      e.stopPropagation();
      if (confirm('Delete "' + p.title + '"? This cannot be undone.')) {
        projects.splice(i, 1);
        localStorage.setItem('sw_projects', JSON.stringify(projects));
        if (currentProject === i) currentProject = null;
        else if (currentProject !== null && currentProject > i) currentProject--;
        renderLibrary();
        clearRecordings();
      }
    });
    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(del);
    card.addEventListener('click', () => openProject(i));
    grid.appendChild(card);
  });
}

function newProject() {
  currentProject = null;
  document.getElementById('songTitle').textContent = 'Untitled song';
  lyricsEl.innerHTML = '<div class="line"><br></div>';

  // Reset scale & BPM to defaults for a fresh song
  document.getElementById('bpm').value = 100;
  currentRoot = 'C';
  currentMode = 'major';
  currentScale = 'natural';
  document.getElementById('scaleRootSelect').value = 'C';
  document.getElementById('scaleModeSelect').value = 'major';
  populateScaleTypes();   // rebuilds scale type dropdown (defaults to natural)
  syncChordMenu();        // rebuilds chord chart

  showEditor();
  const title = document.getElementById('songTitle');
  title.focus();
  const range = document.createRange();
  range.selectNodeContents(title);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function openProject(i) {
  const p = projects[i];
  if (!p) return;
  currentProject = i;
  document.getElementById('songTitle').textContent = p.title;
  lyricsEl.innerHTML = p.body || '';

  // Restore per-project scale & BPM (fall back to defaults for old projects)
  document.getElementById('bpm').value = p.bpm || 100;
  currentRoot = p.root || 'C';
  currentMode = p.mode || 'major';
  currentScale = p.scale || 'natural';
  document.getElementById('scaleRootSelect').value = currentRoot;
  document.getElementById('scaleModeSelect').value = currentMode;
  populateScaleTypes();
  syncChordMenu();

  showEditor();
}


function persistCurrent() {
  const title = document.getElementById('songTitle').textContent.trim() || 'Untitled song';
  const body = lyricsEl.innerHTML;
  const now = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const projectState = {
    bpm: document.getElementById('bpm').value,
    root: currentRoot,
    mode: currentMode,
    scale: currentScale,
  };
  if (currentProject !== null && projects[currentProject]) {
    projects[currentProject] = { title, body, updated: now, ...projectState };
  } else {
    projects.unshift({ title, body, updated: now, ...projectState });
    currentProject = 0;
  }
  localStorage.setItem('sw_projects', JSON.stringify(projects));
}

// Library wiring
document.getElementById('newProjectBtn').addEventListener('click', newProject);
document.getElementById('newProjectTopBtn').addEventListener('click', newProject);
document.getElementById('backLink').addEventListener('click', e => { e.preventDefault(); showStart(); });
document.getElementById('songTitle').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('songTitle').blur();
  }
});
document.getElementById('deleteProjectTopBtn').addEventListener('click', () => {
  if (currentProject === null) return;
  const p = projects[currentProject];
  if (!p) return;
  if (confirm('Delete "' + p.title + '"? This cannot be undone.')) {
    projects.splice(currentProject, 1);
    localStorage.setItem('sw_projects', JSON.stringify(projects));
    currentProject = null;
    showStart();
    clearRecordings();
  }
});

/* ============================== SETTINGS ============================== */
function openSettings() {
  settingsModal.classList.remove('hidden');
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [0,2,4].map(i => parseInt(h.substr(i,2), 16));
}
function rgbToHex([r,g,b]) {
  return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
}
function mix(hex, other, ratio) {
  const a = hexToRgb(hex), b = hexToRgb(other);
  return rgbToHex(a.map((v,i) => Math.round(v + (b[i]-v)*ratio)));
}
function buildMonoTheme(base, dark) {
  return {
    '--bg':          dark ? mix(base, '#000000', 0.78) : mix(base, '#ffffff', 0.78),
    '--panel':       dark ? mix(base, '#000000', 0.66) : mix(base, '#ffffff', 0.66),
    '--side':        dark ? mix(base, '#000000', 0.72) : mix(base, '#ffffff', 0.72),
    '--border':      dark ? mix(base, '#ffffff', 0.55) : mix(base, '#000000', 0.55),
    '--text':        dark ? mix(base, '#ffffff', 0.90) : mix(base, '#000000', 0.90),
    '--muted':       dark ? mix(base, '#ffffff', 0.60) : mix(base, '#000000', 0.60),
    '--accent':      dark ? mix(base, '#ffffff', 0.30) : mix(base, '#000000', 0.30),
    '--accent-hover':dark ? mix(base, '#ffffff', 0.40) : mix(base, '#000000', 0.40),
    '--input':       dark ? mix(base, '#000000', 0.60) : mix(base, '#ffffff', 0.60),
    '--hover':       dark ? mix(base, '#ffffff', 0.42) : mix(base, '#000000', 0.42),
  };
}





function applySettings() {
  const theme = settings.theme || 'light';
  const accent = settings.accent || '#3b82f6';
  const fontSize = settings.fontSize || 16;
  const fontFamily = settings.fontFamily || 'system';

  document.documentElement.setAttribute('data-theme', theme.startsWith('mono') ? 'mono' : theme);

  if (theme.startsWith('mono')) {
    const base = settings.monoColor || '#3b82f6';
    const dark = theme === 'mono-dark';
    const vars = buildMonoTheme(base, dark);
    Object.entries(vars).forEach(([k, v]) =>
      document.documentElement.style.setProperty(k, v)
    );
  } else {
    // Clear any leftover mono inline vars so CSS theme rules apply
    ['--bg','--panel','--side','--border','--text','--muted',
     '--accent','--accent-hover','--input','--hover'].forEach(k =>
      document.documentElement.style.removeProperty(k)
    );
    document.documentElement.style.setProperty('--accent', accent);
    document.documentElement.style.setProperty('--accent-hover', accent + 'cc');
  }

  lyricsEl.style.fontSize = fontSize + 'px';
  lyricsEl.style.fontFamily = fontFamily === 'system' ? '' : fontFamily;

  document.getElementById('themeLight').checked = theme === 'light';
  document.getElementById('themeDark').checked = theme === 'dark';
  document.getElementById('themeMonoLight').checked = theme === 'mono-light';
  document.getElementById('themeMonoDark').checked = theme === 'mono-dark';
  document.getElementById('fontSizeRange').value = fontSize;
  document.getElementById('fontSizeVal').textContent = fontSize;
  document.getElementById('fontFamilySelect').value = fontFamily;
  document.getElementById('projectLocation').value = settings.location || '';

  const monoColor = document.getElementById('monoColorInput');
  if (monoColor) monoColor.value = settings.monoColor || '#3b82f6';

  document.querySelectorAll('.swatch').forEach(s => {
    s.classList.toggle('selected', s.dataset.color === accent);
  });
  document.getElementById('accountName').value = (settings.account && settings.account.name) || '';
  updateAvatar();
}



// Open / close
document.getElementById('settingsBtn').addEventListener('click', () => {
  openSettings();
  buildShortcutsUI();
});
document.getElementById('settingsClose').addEventListener('click', () => {
  settingsModal.classList.add('hidden');
});
settingsModal.addEventListener('click', e => {
  if (e.target === settingsModal) settingsModal.classList.add('hidden');
});

// Theme
document.querySelectorAll('input[name="theme"]').forEach(r => {
  r.addEventListener('change', () => {
    settings.theme = r.value;
    localStorage.setItem('sw_settings', JSON.stringify(settings));
    applySettings();
  });
});

// Accent
document.querySelectorAll('.swatch').forEach(s => {
  s.addEventListener('click', () => {
    settings.accent = s.dataset.color;
    localStorage.setItem('sw_settings', JSON.stringify(settings));
    applySettings();
  });
});

// Mono base color
document.getElementById('monoColorInput').addEventListener('input', e => {
  if (settings.theme.startsWith('mono')) {
    const dark = settings.theme === 'mono-dark';
    const vars = buildMonoTheme(e.target.value, dark);
    Object.entries(vars).forEach(([k, v]) =>
      document.documentElement.style.setProperty(k, v)
    );
  }
});
document.getElementById('monoColorInput').addEventListener('change', e => {
  settings.monoColor = e.target.value;
  localStorage.setItem('sw_settings', JSON.stringify(settings));
});


// Font size
document.getElementById('fontSizeRange').addEventListener('input', e => {
  document.getElementById('fontSizeVal').textContent = e.target.value;
  settings.fontSize = parseInt(e.target.value);
  localStorage.setItem('sw_settings', JSON.stringify(settings));
  applySettings();
});

// Font family
document.getElementById('fontFamilySelect').addEventListener('change', e => {
  settings.fontFamily = e.target.value;
  localStorage.setItem('sw_settings', JSON.stringify(settings));
  applySettings();
});

// Location (stored for now; real folder write comes later)
document.getElementById('projectLocation').addEventListener('change', e => {
  settings.location = e.target.value;
  localStorage.setItem('sw_settings', JSON.stringify(settings));
  document.getElementById('locationNote').textContent = 'Location saved. Real save-to-folder comes in a later stage.';
});
document.getElementById('browseLocationBtn').addEventListener('click', () => {
  document.getElementById('locationNote').textContent = 'Folder picking needs the Tauri dialog plugin — wiring that up in the save-to-folder stage.';
});

/* ============================== CHANGELOG ============================== */
const CHANGELOG = {
  '1.4.2': [
    'Mobile panel overlay fixes',
]

};


function maybeShowChangelog() {
  const lastSeen = settings.lastSeenVersion || '';
  if (lastSeen !== APP_VERSION && CHANGELOG[APP_VERSION]) {
    showChangelog(CHANGELOG[APP_VERSION]);
  }
  settings.lastSeenVersion = APP_VERSION;
  localStorage.setItem('sw_settings', JSON.stringify(settings));
}

function showChangelog(items) {
  // Build a small modal listing the changes
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2>What's new in v${APP_VERSION}</h2>
        <button class="modal-close" id="changelogClose">✕</button>
      </div>
      <div class="modal-body">
        <ul style="padding-left:18px;line-height:1.8">
          ${items.map(i => `<li>${i}</li>`).join('')}
        </ul>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#changelogClose').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

/* ============================== PRINT / PDF ============================== */
document.getElementById('printBtn').addEventListener('click', () => {
  const title = document.getElementById('songTitle').textContent.trim() || 'Untitled song';

  // Build a clean print document
  const printDoc = document.createElement('div');
  printDoc.className = 'print-root';
  printDoc.innerHTML = `
    <div class="print-title">${escapeHtml(title)}</div>
    <div class="print-meta">Key: ${currentRoot} · BPM: ${document.getElementById('bpm').value}</div>
    <div class="print-body">${lyricsEl.innerHTML}</div>
  `;
  document.body.appendChild(printDoc);

  // Print, then clean up
  window.print();

  // Remove after print dialog closes (or after a tick)
  setTimeout(() => printDoc.remove(), 500);
});

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/* ============================== TAB INSERT ============================== */
function insertTab(type) {
  const strings = type === 'guitar'
    ? ['e', 'B', 'G', 'D', 'A', 'E']
    : ['G', 'D', 'A', 'E'];

  // Build the tab block
  const tab = document.createElement('div');
  tab.className = 'tab-block';
  tab.dataset.tab = type;
  strings.forEach(s => {
    const line = document.createElement('div');
    line.className = 'tab-line';
    line.textContent = s + '|' + '-'.repeat(35) + '|';
    tab.appendChild(line);
  });

  // Fresh numbered line after the tab
  const fresh = document.createElement('div');
  fresh.className = 'line';
  fresh.innerHTML = '<br>';

  // Find the line/tab the caret is in, insert after it as a sibling
  let anchor = null;
  const sel = window.getSelection();
  if (sel.rangeCount) {
    let node = sel.getRangeAt(0).startContainer;
    if (node.nodeType === 3) node = node.parentElement;
    anchor = node && node.closest ? node.closest('.line, .tab-block') : null;
  }

  if (anchor && anchor.parentNode === lyricsEl) {
    lyricsEl.insertBefore(tab, anchor.nextSibling);
    lyricsEl.insertBefore(fresh, tab.nextSibling);
  } else {
    lyricsEl.appendChild(tab);
    lyricsEl.appendChild(fresh);
  }

  // Park the caret in the fresh line
  const range = document.createRange();
  range.setStart(fresh, 0);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  lyricsEl.focus();
}

function unwrapTabs() {
  document.querySelectorAll('.line > .tab-block').forEach(tab => {
    const parent = tab.parentElement;
    parent.parentNode.insertBefore(tab, parent); // move tab out of the line
    if (!parent.textContent.trim()) parent.remove(); // drop the empty wrapper
  });
}

document.getElementById('insertGuitarTabBtn').addEventListener('click', () => insertTab('guitar'));
document.getElementById('insertBassTabBtn').addEventListener('click', () => insertTab('bass'));

/* ============================== LINE STRUCTURE ============================== */
// Enter: always make a numbered .line
lyricsEl.addEventListener('paste', e => {
  e.preventDefault();
  const text = e.clipboardData.getData('text/plain');
  const lines = text.split(/\r?\n/);

  const sel = window.getSelection();
  let anchor = null;
  if (sel.rangeCount) {
    let node = sel.getRangeAt(0).startContainer;
    if (node.nodeType === 3) node = node.parentElement;
    anchor = node && node.closest ? node.closest('.line, .tab-block') : null;
  }
  if (!anchor || anchor.parentNode !== lyricsEl) anchor = lyricsEl.lastElementChild;

  let ref = anchor;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // 1. Tab block detection — a run of tab lines
    if (/^[eEBGDA](\||\s\|)/.test(line)) {
      const tabLines = [];
      while (i < lines.length && /^[eEBGDA](\||\s\|)/.test(lines[i])) {
        tabLines.push(lines[i]);
        i++;
      }
      const tab = document.createElement('div');
      tab.className = 'tab-block';
      tab.dataset.tab = 'guitar';
      tabLines.forEach(t => {
        const dl = document.createElement('div');
        dl.className = 'tab-line';
        dl.textContent = t;
        tab.appendChild(dl);
      });
      lyricsEl.insertBefore(tab, ref.nextSibling);
      ref = tab;
      continue;
    }

    // 2. Section label
    if (/^\[.+\]$/.test(line.trim())) {
      const p = document.createElement('p');
      p.className = 'section-label';
      p.textContent = line.trim();
      lyricsEl.insertBefore(p, ref.nextSibling);
      ref = p;
      i++;
      continue;
    }

    // 3. Chord line + lyric line pair
    const chordLine = line;
    const next = lines[i + 1];
    if (isChordLine(chordLine)) {
      const hasLyric = next !== undefined && !isChordLine(next) && next.trim() && !/^\[.+\]$/.test(next.trim());
      if (hasLyric) {
        const pairs = alignChordsToLyrics(chordLine, next);
        if (pairs.length) {
          const div = document.createElement('div');
          div.className = 'line';
          buildChordLine(div, next, pairs);
          lyricsEl.insertBefore(div, ref.nextSibling);
          ref = div;
          i += 2;
          continue;
        }
      }
      // Floating chord line — no lyric below
      const div = document.createElement('div');
      div.className = 'line chord-line';
      buildFloatingChords(div, chordLine);
      lyricsEl.insertBefore(div, ref.nextSibling);
      ref = div;
      i++;
      continue;
    }

    // 4. Plain lyric line
    const div = document.createElement('div');
    div.className = 'line';
    if (line.trim()) {
      div.textContent = line;
    } else {
      div.classList.add('line-spacer');
      div.innerHTML = '<br>';
    }
    lyricsEl.insertBefore(div, ref.nextSibling);
    ref = div;
    i++;
  }

  const range = document.createRange();
  range.setStart(ref, 0);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  lyricsEl.focus();
});

function isChordLine(line) {
  // A line is a chord line if it's mostly chords (uppercase letters + optional suffixes)
  const trimmed = line.trim();
  if (!trimmed) return false;
  // strip spaces, then every token must look like a chord
  const tokens = trimmed.split(/\s+/);
  return tokens.length > 0 && tokens.every(t => /^[A-G][#b]?(m|maj|min|dim|aug|sus|7|9|11|13|add|sus2|sus4|6|5|maj7|m7|dim7|aug7|m7b5)*$/.test(t));
}

function buildChordLine(div, lyricText, pairs) {
  // Rebuild the lyric, wrapping matched words with their chord
  const matched = new Map();
  pairs.forEach(p => matched.set(p.word, p.chord));

  const words = lyricText.split(' ');
  let first = true;
  words.forEach(w => {
    if (!first) div.appendChild(document.createTextNode(' '));
    first = false;
    if (matched.has(w)) {
      const wrap = document.createElement('span');
      wrap.className = 'chordwrap';
      const ch = document.createElement('span');
      ch.className = 'chord';
      ch.textContent = matched.get(w);
      wrap.appendChild(ch);
      wrap.appendChild(document.createTextNode(w));
      div.appendChild(wrap);
    } else {
      div.appendChild(document.createTextNode(w));
    }
  });
}

function buildFloatingChords(div, chordLine) {
  const chordRe = /[A-G][#b]?(m|maj|min|dim|aug|sus|7|9|11|13|add|sus2|sus4|6|5|maj7|m7|dim7|aug7|m7b5)*/g;
  let m;
  while ((m = chordRe.exec(chordLine)) !== null) {

    const wrap = document.createElement('span');
    wrap.className = 'chordwrap';
    const ch = document.createElement('span');
    ch.className = 'chord';
    ch.textContent = m[0];
    wrap.appendChild(ch);
    div.appendChild(wrap);
    div.appendChild(document.createTextNode(' '));
  }
}



/* ============================== ACCOUNT ============================== */
function updateAvatar() {
  const acc = settings.account || {};
  const name = acc.name || '';
  const photo = acc.photo || '';
  let initials = 'SS';
  if (name.trim()) {
    initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  }
  document.querySelectorAll('.avatar').forEach(av => {
    if (photo) {
      av.innerHTML = '<img src="' + photo + '" alt="">';
    } else {
      av.textContent = initials;
    }
  });
}

document.getElementById('accountName').addEventListener('change', e => {
  settings.account = settings.account || {};
  settings.account.name = e.target.value.trim();
  localStorage.setItem('sw_settings', JSON.stringify(settings));
  updateAvatar();
  showStart(); // refresh the greeting
});

document.getElementById('uploadAvatarBtn').addEventListener('click', () => {
  document.getElementById('avatarFileInput').click();
});
document.getElementById('avatarFileInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    settings.account = settings.account || {};
    settings.account.photo = reader.result;
    localStorage.setItem('sw_settings', JSON.stringify(settings));
    updateAvatar();
  };
  reader.readAsDataURL(file);
  e.target.value = '';
});

document.getElementById('removeAvatarBtn').addEventListener('click', () => {
  settings.account = settings.account || {};
  settings.account.photo = '';
  localStorage.setItem('sw_settings', JSON.stringify(settings));
  updateAvatar();
});

/* ============================== SHORTCUTS ============================== */
const DEFAULT_SHORTCUTS = {
  guitarTab:  { key: 'g', shift: false },
  bassTab:    { key: 'B', shift: true  },
  addChord:   { key: 'k', shift: false },
  save:       { key: 's', shift: false },
  bold:       { key: 'b', shift: false },
  italic:     { key: 'i', shift: false },
};

function getShortcuts() {
  return Object.assign({}, DEFAULT_SHORTCUTS, settings.shortcuts || {});
}
function saveShortcuts(s) {
  settings.shortcuts = s;
  localStorage.setItem('sw_settings', JSON.stringify(settings));
}

function fmtCombo(c) {
  return (c.shift ? 'Ctrl+Shift+' : 'Ctrl+') + c.key.toUpperCase();
}

function buildShortcutsUI() {
  const grid = document.getElementById('shortcutsGrid');
  grid.innerHTML = '';
  const s = getShortcuts();
  const labels = {
    guitarTab: 'Insert guitar tab',
    bassTab: 'Insert bass tab',
    addChord: 'Add chord',
    save: 'Save',
    bold: 'Bold',
    italic: 'Italic',
  };
  Object.keys(s).forEach(id => {
    const row = document.createElement('div');
    row.className = 'shortcut-row';
    row.innerHTML =
      '<span class="sc-label">' + labels[id] + '</span>' +
      '<code>' + fmtCombo(s[id]) + '</code>' +
      '<button class="sc-reset" title="Reset">✕</button>';
    grid.appendChild(row);

    // Click to remap
    row.addEventListener('click', () => {
      grid.querySelectorAll('.editing').forEach(r => r.classList.remove('editing'));
      row.classList.add('editing');
      row.querySelector('code').textContent = 'Press keys...';
      const done = e => {
        e.preventDefault();
        const combo = { key: e.key, shift: e.shiftKey };
        if (combo.key === 'Escape') { row.classList.remove('editing'); return; }
        const ns = getShortcuts();
        ns[id] = combo;
        saveShortcuts(ns);
        row.querySelector('code').textContent = fmtCombo(combo);
        row.classList.remove('editing');
        document.removeEventListener('keydown', done, true);
      };
      document.addEventListener('keydown', done, true);
    });

    // Reset
    row.querySelector('.sc-reset').addEventListener('click', e => {
      e.stopPropagation();
      const ns = getShortcuts();
      ns[id] = Object.assign({}, DEFAULT_SHORTCUTS[id]);
      saveShortcuts(ns);
      row.querySelector('code').textContent = fmtCombo(ns[id]);
    });
  });
}

// Global shortcut handler — reads the current bindings
document.addEventListener('keydown', e => {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  const s = getShortcuts();
  const combo = { key: e.key, shift: e.shiftKey };

  // Save works anywhere
  if (combo.key === s.save.key && combo.shift === s.save.shift) {
    e.preventDefault();
    document.getElementById('saveBtn').click();
    return;
  }

  // Rest only when the editor is focused
  if (document.activeElement !== lyricsEl) return;

  if (combo.key === s.guitarTab.key && combo.shift === s.guitarTab.shift) {
    e.preventDefault(); insertTab('guitar');
  } else if (combo.key === s.bassTab.key && combo.shift === s.bassTab.shift) {
    e.preventDefault(); insertTab('bass');
  } else if (combo.key === s.addChord.key && combo.shift === s.addChord.shift) {
    e.preventDefault();
    document.getElementById('addChordBtn').click();
    // Hide the popup immediately, keep the input focused so typing still works
    const modal = document.querySelector('#chordModal, .chord-modal, [id*="chord"][class*="modal"]');
    if (modal) {
      modal.style.display = 'none';
      const input = modal.querySelector('input');
      if (input) input.focus();
    }
  } else if (combo.key === s.bold.key && combo.shift === s.bold.shift) {
    e.preventDefault(); document.getElementById('boldBtn').click();
  } else if (combo.key === s.italic.key && combo.shift === s.italic.shift) {
    e.preventDefault(); document.getElementById('italicBtn').click();
  }
});



/* ============================== INIT ============================== */
showStart();

window.addEventListener('load', () => {
  try { applySettings(); } catch (e) { console.error('settings error:', e); }
  try { showStart(); } catch (e) { console.error('start error:', e); }
  try { normalizeLyrics(); } catch (e) { console.error('normalize error:', e); }
  try { buildShortcutsUI(); } catch (e) { console.error('shortcuts error:', e); }

  const v = document.getElementById('versionLabel');
  if (v) v.textContent = 'Songwriter Studio v' + APP_VERSION;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err =>
      console.error('SW registration failed:', err)
    );
  }

  try { maybeShowChangelog(); } catch (e) { console.error('changelog error:', e); }
  try {
    populateScaleTypes();
    syncChordMenu();
  } catch (e) { console.error('scale init error:', e); }
});