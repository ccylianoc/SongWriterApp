// ---------- State ----------
let currentKey = 'C';
const CHORD_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const CHORD_FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
let useFlats = false;

// ---------- Top bar / save ----------
document.getElementById('saveBtn').addEventListener('click', () => {
  persistCurrent();
  const title = document.getElementById('songTitle').textContent.trim() || 'Untitled song';
  const body = document.getElementById('lyrics').innerHTML;
  const blob = new Blob([body], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = title + '.html';
  a.click();
  URL.revokeObjectURL(url);
});


// ---------- Chord insertion ----------
document.getElementById('addChordBtn').addEventListener('click', () => {
  const chord = prompt('Enter chord (e.g. Am, F, G7):');
  if (!chord) return;
  insertChord(chord);
});

// Remember caret position when the editor loses focus
let savedRange = null;
const lyricsEl = document.getElementById('lyrics');
lyricsEl.addEventListener('blur', () => {
  const sel = window.getSelection();
  if (sel.rangeCount) savedRange = sel.getRangeAt(0).cloneRange();
});

// Insert chord at the saved (or current) caret position
function insertChord(chord) {
  const lyricsEl = document.getElementById('lyrics');
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

// ---------- Section label ----------
document.getElementById('addSectionBtn').addEventListener('click', () => {
  const name = prompt('Section name (e.g. Verse, Chorus):');
  if (!name) return;
  const lyrics = document.getElementById('lyrics');
  lyrics.innerHTML += `<p class="section-label">[${name}]</p>`;
});

// ---------- Bold / italic ----------
document.getElementById('boldBtn').addEventListener('click', () => {
  document.execCommand('bold');
  document.getElementById('lyrics').focus();
});
document.getElementById('italicBtn').addEventListener('click', () => {
  document.execCommand('italic');
  document.getElementById('lyrics').focus();
});

// ---------- Transpose ----------
document.getElementById('transposeUp').addEventListener('click', () => transpose(1));
document.getElementById('transposeDown').addEventListener('click', () => transpose(-1));

function transpose(step) {
  const chords = document.querySelectorAll('#lyrics .chord');
  chords.forEach(c => {
    const name = c.textContent.trim();
    const transposed = transposeChord(name, step);
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

// ---------- Recordings ----------
let mediaRecorder, chunks = [], timerInterval, seconds = 0;
const recBtn = document.getElementById('recBtn');
const recTimer = document.getElementById('recTimer');

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
  const list = document.getElementById('recList');
  list.innerHTML = '<div class="empty-rec">No recordings yet</div>';
}


// ---------- Key selector ----------
document.getElementById('keySelect').addEventListener('change', e => {
  currentKey = e.target.value;
});
// ---------- Side panel icon tabs ----------
document.querySelectorAll('.side-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.side-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.side-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('side-' + tab.dataset.side).classList.add('active');
  });
});


// ---------- Chords chart ----------
const KEYS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const TRADS = { '0':'', '1':'m', '2':'m', '3':'', '4':'', '5':'m', '6':'dim' };
const SEVS = { '0':'Maj7', '1':'m7', '2':'m7', '3':'Maj7', '4':'7', '5':'m7', '6':'m7b5' };
const BORROWED = { '0':'m', '1':'dim', '3':'m', '4':'m', '6':'' };
const BORROW_NAMES = ['i','ii°','bIII','iv','v','bVI','bVII'];
const keySelect = document.getElementById('chordKeySelect');
KEYS.forEach(k => keySelect.add(new Option(k + ' major', k)));
keySelect.value = 'C';

function roman(i, minor) { return ['I','ii','iii','IV','V','vi','vii°'][i]; }

function buildChart(root) {
  const idx = KEYS.indexOf(root);
  let rows = [];
  for (let i = 0; i < 7; i++) {
    const note = KEYS[(idx + i) % 12];
    rows.push([roman(i), note + TRADS[i], note + SEVS[i]]);
  }
  const borrowed = [];
  [0,1,3,4,6].forEach((deg, j) => {
    const note = KEYS[(idx + deg) % 12];
    borrowed.push([BORROW_NAMES[j], note + BORROWED[deg]]);
  });
  let html = '<table class="chord-table"><tr><th></th><th>Triad</th><th>Seventh</th></tr>';
  rows.forEach(r => {
    html += `<tr><td>${r[0]}</td><td class="chord-name">${r[1]}</td><td class="chord-name">${r[2]}</td></tr>`;
  });
  html += '</table>';
  html += '<div style="font-weight:600;color:#999;font-size:11px;margin-bottom:4px">Borrowed</div>';
  html += '<table class="chord-table"><tr><th></th><th>Chord</th></tr>';
  borrowed.forEach(b => {
    html += `<tr><td>${b[0]}</td><td class="chord-name">${b[1]}</td></tr>`;
  });
  html += '</table>';
  document.getElementById('chordChart').innerHTML = html;
}
buildChart('C');

keySelect.addEventListener('change', e => buildChart(e.target.value));
document.getElementById('keyPrev').addEventListener('click', () => {
  const i = (KEYS.indexOf(keySelect.value) - 1 + 12) % 12;
  keySelect.value = KEYS[i]; buildChart(KEYS[i]);
});
document.getElementById('keyNext').addEventListener('click', () => {
  const i = (KEYS.indexOf(keySelect.value) + 1) % 12;
  keySelect.value = KEYS[i]; buildChart(KEYS[i]);
});

// ---------- Recording upload ----------
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


// ---------- Start screen / library ----------
const GREETINGS = [
  'Hello there',
  'Welcome back',
  'Good to see you',
  'Ready to write something new?',
  "Let's make some music"
];
let projects = [];
try { projects = JSON.parse(localStorage.getItem('sw_projects') || '[]'); } catch (e) { projects = []; }
let currentProject = null;

const startScreen = document.getElementById('startScreen');
const workspace = document.querySelector('.workspace');
const toolbar = document.getElementById('toolbar');

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
  document.getElementById('lyrics').innerHTML = '<div class="line"><br></div>';
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
  document.getElementById('lyrics').innerHTML = p.body || '';
  showEditor();
}

function persistCurrent() {
  const title = document.getElementById('songTitle').textContent.trim() || 'Untitled song';
  const body = document.getElementById('lyrics').innerHTML;
  const now = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  if (currentProject !== null && projects[currentProject]) {
    projects[currentProject] = { title, body, updated: now };
  } else {
    projects.unshift({ title, body, updated: now });
    currentProject = 0;
  }
  localStorage.setItem('sw_projects', JSON.stringify(projects));
}

document.getElementById('newProjectBtn').addEventListener('click', newProject);
document.getElementById('newProjectTopBtn').addEventListener('click', newProject);
document.getElementById('backLink').addEventListener('click', e => { e.preventDefault(); showStart(); });
document.getElementById('songTitle').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('songTitle').blur();
    persistCurrent();
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

// ---------- Settings ----------
const settingsModal = document.getElementById('settingsModal');
const settings = JSON.parse(localStorage.getItem('sw_settings') || '{}');

function openSettings() {
  const modal = document.getElementById('settingsModal');
  if (!modal) {
    console.error('Settings modal not found — check index.html for id="settingsModal"');
    return;
  }
  modal.classList.remove('hidden');
}

console.log('SETTINGS LISTENER ATTACHED');
document.getElementById('settingsBtn').addEventListener('click', openSettings);

function applySettings() {
  const theme = settings.theme || 'light';
  const accent = settings.accent || '#3b82f6';
  const fontSize = settings.fontSize || 16;
  const fontFamily = settings.fontFamily || 'system';
  const textColor = settings.textColor || '#2c2f33';

  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--accent-hover', accent + 'cc');

  const lyrics = document.getElementById('lyrics');
  lyrics.style.fontSize = fontSize + 'px';
  lyrics.style.color = textColor;
  lyrics.style.fontFamily = fontFamily === 'system' ? '' : fontFamily;

  document.getElementById('themeLight').checked = theme === 'light';
  document.getElementById('themeDark').checked = theme === 'dark';
  document.getElementById('fontSizeRange').value = fontSize;
  document.getElementById('fontSizeVal').textContent = fontSize;
  document.getElementById('fontFamilySelect').value = fontFamily;
  document.getElementById('textColorInput').value = textColor;
  document.getElementById('projectLocation').value = settings.location || '';

  document.querySelectorAll('.swatch').forEach(s => {
    s.classList.toggle('selected', s.dataset.color === accent);
  });
  document.getElementById('accountName').value = (settings.account && settings.account.name) || '';
  updateAvatar();

}

document.getElementById('settingsBtn').addEventListener('click', () => {
  settingsModal.classList.remove('hidden');
});
document.getElementById('settingsClose').addEventListener('click', () => {
  settingsModal.classList.add('hidden');
});
settingsModal.addEventListener('click', e => {
  if (e.target === settingsModal) settingsModal.classList.add('hidden');
});

// Theme radios
document.querySelectorAll('input[name="theme"]').forEach(r => {
  r.addEventListener('change', () => {
    settings.theme = r.value;
    localStorage.setItem('sw_settings', JSON.stringify(settings));
    applySettings();
  });
});

// Accent swatches
document.querySelectorAll('.swatch').forEach(s => {
  s.addEventListener('click', () => {
    settings.accent = s.dataset.color;
    localStorage.setItem('sw_settings', JSON.stringify(settings));
    applySettings();
  });
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

// Text color
document.getElementById('textColorInput').addEventListener('input', e => {
  settings.textColor = e.target.value;
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

// App opens on the library screen
showStart();

window.addEventListener('load', () => {
  try { applySettings(); } catch (e) { console.error('settings error:', e); }
  try { showStart(); } catch (e) { console.error('start error:', e); }
});

// ---------- Tab insert ----------
function insertTab(type) {
  const strings = type === 'guitar'
    ? ['e', 'B', 'G', 'D', 'A', 'E']
    : ['G', 'D', 'A', 'E'];

  const lyrics = document.getElementById('lyrics');

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

  if (anchor && anchor.parentNode === lyrics) {
    lyrics.insertBefore(tab, anchor.nextSibling);
    lyrics.insertBefore(fresh, tab.nextSibling);
  } else {
    lyrics.appendChild(tab);
    lyrics.appendChild(fresh);
  }

  // Park the caret in the fresh line
  const range = document.createRange();
  range.setStart(fresh, 0);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  lyrics.focus();
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

// ---------- Line structure guard ----------

// Backspace at the very start of a line: keep the line and its number
// ---------- Enter: always make a numbered .line ----------
lyricsEl.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();

  const sel = window.getSelection();
  let anchor = null;
  if (sel.rangeCount) {
    let node = sel.getRangeAt(0).startContainer;
    if (node.nodeType === 3) node = node.parentElement;
    anchor = node && node.closest ? node.closest('.line, .tab-block') : null;
  }
  if (!anchor || anchor.parentNode !== lyricsEl) anchor = lyricsEl.lastElementChild;

  const fresh = document.createElement('div');
  fresh.className = 'line';
  fresh.innerHTML = '<br>';
  lyricsEl.insertBefore(fresh, anchor.nextSibling);

  const range = document.createRange();
  range.setStart(fresh, 0);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  lyricsEl.focus();
});

// ---------- DOM normalizer ----------
function normalizeLyrics() {
  // Lift any block elements nested inside .line out as siblings
  lyricsEl.querySelectorAll('.line > .line, .line > .tab-block, .line > div').forEach(block => {
    const parent = block.parentElement;
    parent.parentNode.insertBefore(block, parent.nextSibling);
    if (!parent.textContent.trim() && !parent.querySelector('.chord')) parent.remove();
  });

  // Wrap stray text nodes into .line divs
  Array.from(lyricsEl.childNodes).forEach(child => {
    if (child.nodeType === 3 && child.textContent.trim()) {
      const div = document.createElement('div');
      div.className = 'line';
      div.appendChild(child);
      lyricsEl.insertBefore(div, child.nextSibling);
    }
  });

  // Always at least one line
  if (!lyricsEl.querySelector('.line') && !lyricsEl.querySelector('.tab-block')) {
    lyricsEl.innerHTML = '<div class="line"><br></div>';
  }
}

lyricsEl.addEventListener('input', normalizeLyrics);
window.addEventListener('load', normalizeLyrics);



// ---------- Account ----------
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

// ---------- Shortcuts (remappable) ----------
const DEFAULT_SHORTCUTS = {
  guitarTab:  { key: 'g', shift: false },
  bassTab:     { key: 'B', shift: true  },
  addChord:    { key: 'k', shift: false },
  save:         { key: 's', shift: false },
  bold:         { key: 'b', shift: false },
  italic:       { key: 'i', shift: false },
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
  if (document.activeElement !== document.getElementById('lyrics')) return;

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

// Build the shortcuts list when settings opens
document.getElementById('settingsBtn').addEventListener('click', buildShortcutsUI);
window.addEventListener('load', () => {
  if (typeof buildShortcutsUI === 'function') buildShortcutsUI();
});

