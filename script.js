const sounds = [
  "Ainiiku", "AKUHASHINE", "bakainu", "ema_can", "ema", "Fan", "huh",
  "ImNikaido", "Jikosyoukai", "korosanaide", "Kyoumiaru", "KyoumiShinshin",
  "naniwo", "sassato_hayaku", "sassato", "Sukuitai", "TADASHIKUNAI", "Yoroshiku"
];
const availableSounds = sounds;

const grid = document.querySelector("#sound-grid");
const status = document.querySelector("#status");
const player = document.querySelector(".player");
const playerCount = document.querySelector("#player-count");
const stopButton = document.querySelector("#stop-button");
const editToggle = document.querySelector("#edit-toggle");
const loadStatus = document.querySelector("#load-status");
const loadCount = document.querySelector("#load-count");
const loadProgress = document.querySelector("#load-progress");
const loadDetail = document.querySelector("#load-detail");
const fallbackAudio = document.querySelector("#fallback-audio");
const namesKey = "nikaido-se-button-names-v2";

let names = {};
let editing = false;
let currentId = null;
let currentSource = null;
let currentObjectUrl = null;
let playToken = 0;
const buffers = new Map();
const fallbackBlobs = new Map();
const failedSounds = new Set();
let audioContext = null;

try {
  const stored = JSON.parse(localStorage.getItem(namesKey) || "{}");
  names = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
} catch { names = {}; }

try {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (AudioContextClass) audioContext = new AudioContextClass();
} catch { audioContext = null; }

function labelFor(id) { return names[id] || id; }
function setStatus(message) { status.textContent = message; }

function cardState(id) {
  if (failedSounds.has(id)) return "読み込み失敗";
  if (buffers.has(id) || fallbackBlobs.has(id)) return "準備完了";
  return "読み込み中…";
}

function updateCard(id) {
  const card = grid.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (!card) return;
  const ready = buffers.has(id) || fallbackBlobs.has(id);
  const button = card.querySelector(".sound-button");
  const state = card.querySelector(".card-state");
  card.classList.toggle("unavailable", failedSounds.has(id));
  button.disabled = editing || failedSounds.has(id) || !ready;
  button.setAttribute("aria-label", failedSounds.has(id)
    ? `${labelFor(id)}、読み込み失敗` : `${labelFor(id)} を再生`);
  state.textContent = cardState(id);
  state.hidden = ready;
}

function render() {
  grid.replaceChildren(...sounds.map(id => {
    const card = document.createElement("div");
    card.className = "sound-card";
    if (currentId === id) card.classList.add("active");
    if (failedSounds.has(id)) card.classList.add("unavailable");
    card.dataset.id = id;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "sound-button";
    button.dataset.play = id;
    button.disabled = editing || failedSounds.has(id)
      || (!buffers.has(id) && !fallbackBlobs.has(id));
    button.setAttribute("aria-label", failedSounds.has(id)
      ? `${labelFor(id)}、読み込み失敗` : `${labelFor(id)} を再生`);

    const name = document.createElement("span");
    name.className = "card-name";
    name.textContent = labelFor(id);
    const state = document.createElement("span");
    state.className = "card-state";
    state.textContent = cardState(id);
    state.hidden = buffers.has(id) || fallbackBlobs.has(id);
    button.append(name, state);
    card.append(button);

    if (editing) {
      const input = document.createElement("input");
      input.className = "name-input";
      input.value = labelFor(id);
      input.maxLength = 60;
      input.dataset.rename = id;
      input.setAttribute("aria-label", `${id} のボタン名`);
      card.append(input);
    }
    return card;
  }));
  grid.classList.toggle("editing", editing);
}

function clearCurrentSource() {
  if (currentSource) {
    currentSource.onended = null;
    try { currentSource.stop(); } catch { /* already stopped */ }
    currentSource.disconnect();
    currentSource = null;
  }
  if (fallbackAudio) {
    fallbackAudio.pause();
    fallbackAudio.onended = null;
    fallbackAudio.removeAttribute("src");
    fallbackAudio.load();
  }
  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = null;
}

function stop() {
  playToken += 1;
  clearCurrentSource();
  currentId = null;
  player.classList.remove("playing");
  playerCount.textContent = "00 / 18";
  stopButton.disabled = true;
  setStatus("音声を選択してください");
  render();
}

function finishPlayback(token, id) {
  if (token !== playToken) return;
  if (currentSource) currentSource.disconnect();
  currentSource = null;
  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = null;
  currentId = null;
  player.classList.remove("playing");
  playerCount.textContent = "00 / 18";
  stopButton.disabled = true;
  setStatus(`${labelFor(id)} の再生が終わりました`);
  render();
}

async function play(id) {
  if (editing || failedSounds.has(id)) return;
  const buffer = buffers.get(id);
  const blob = fallbackBlobs.get(id);
  if (!buffer && !blob) return;

  const token = ++playToken;
  clearCurrentSource();
  currentId = id;
  playerCount.textContent = `${String(sounds.indexOf(id) + 1).padStart(2, "0")} / 18`;
  setStatus(labelFor(id));
  player.classList.add("playing");
  render();

  try {
    if (audioContext && buffer) {
      const resumed = audioContext.state === "suspended" ? audioContext.resume() : Promise.resolve();
      await resumed;
      if (token !== playToken) return;
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.onended = () => finishPlayback(token, id);
      currentSource = source;
      source.start();
    } else if (fallbackAudio && blob) {
      currentObjectUrl = URL.createObjectURL(blob);
      fallbackAudio.src = currentObjectUrl;
      fallbackAudio.onended = () => finishPlayback(token, id);
      await fallbackAudio.play();
      if (token !== playToken) return;
    }
    if (token === playToken) stopButton.disabled = false;
  } catch {
    if (token !== playToken) return;
    clearCurrentSource();
    currentId = null;
    player.classList.remove("playing");
    playerCount.textContent = "00 / 18";
    stopButton.disabled = true;
    setStatus(`${labelFor(id)} を再生できませんでした`);
    render();
  }
}

async function loadSound(id) {
  const response = await fetch(`audio/Hiro_01_${id}.mp3`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  if (audioContext) {
    const decoded = await audioContext.decodeAudioData(bytes);
    buffers.set(id, decoded);
  } else {
    fallbackBlobs.set(id, new Blob([bytes], { type: "audio/mpeg" }));
  }
  updateCard(id);
}

async function preloadSounds() {
  loadProgress.max = availableSounds.length;
  loadProgress.value = 0;
  loadCount.textContent = `0 / ${availableSounds.length}`;
  loadDetail.textContent = "ページを開くと18件すべてを先読みし、準備できた音声から再生します。";

  let next = 0;
  let finished = 0;
  const worker = async () => {
    while (next < availableSounds.length) {
      const id = availableSounds[next++];
      try { await loadSound(id); }
      catch { failedSounds.add(id); updateCard(id); }
      finished += 1;
      loadProgress.value = finished;
      loadCount.textContent = `${finished} / ${availableSounds.length}`;
      const ready = buffers.size + fallbackBlobs.size;
      loadStatus.textContent = `音声を準備しています ${ready} / ${availableSounds.length} 件`;
    }
  };

  await Promise.all(Array.from({ length: Math.min(4, availableSounds.length) }, worker));
  const ready = buffers.size + fallbackBlobs.size;
  loadStatus.textContent = ready === availableSounds.length
    ? `${ready}件の音声を先読みしました。再生できます。`
    : `${ready} / ${availableSounds.length} 件を準備しました。読み込めない音声があります。`;
  if (failedSounds.size) {
    loadDetail.textContent = `読み込み失敗: ${[...failedSounds].join("、")}。ページを再読み込みして再試行できます。`;
  }
}

grid.addEventListener("click", event => {
  const button = event.target.closest("[data-play]");
  if (button && !button.disabled) play(button.dataset.play);
});

function saveName(input) {
  const id = input.dataset.rename;
  const value = input.value.trim();
  if (value && value !== id) names[id] = value;
  else delete names[id];
  try { localStorage.setItem(namesKey, JSON.stringify(names)); } catch { /* private mode */ }
  if (currentId === id) setStatus(labelFor(id));
  const button = input.parentElement.querySelector(".sound-button");
  button.setAttribute("aria-label", failedSounds.has(id)
    ? `${labelFor(id)}、読み込み失敗` : `${labelFor(id)} を再生`);
  button.querySelector(".card-name").textContent = labelFor(id);
  input.value = labelFor(id);
}

grid.addEventListener("focusout", event => {
  if (event.target.matches("[data-rename]")) saveName(event.target);
});
grid.addEventListener("keydown", event => {
  if (!event.target.matches("[data-rename]")) return;
  if (event.key === "Enter") { event.preventDefault(); event.target.blur(); }
  if (event.key === "Escape") { event.target.value = labelFor(event.target.dataset.rename); event.target.blur(); }
});

editToggle.addEventListener("click", () => {
  editing = !editing;
  editToggle.setAttribute("aria-pressed", String(editing));
  editToggle.textContent = editing ? "編集を終了" : "ボタン名を編集";
  render();
});
stopButton.addEventListener("click", stop);

render();
preloadSounds();

