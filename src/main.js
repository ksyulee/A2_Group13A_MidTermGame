import level1 from './levels/level1.json';
import level2 from './levels/level2.json';
import level3 from './levels/level3.json';

const tutorialData = [
  { speaker: 'COMMANDER STATIC', text: "Hello? Do you copy? My name is Commander Static. You are lost in the Blackout Maze. Its okay though, I've had to make my way out before. I can guide you out. Over.", pitch: 0.8, static: false },
  { speaker: 'YOU', text: "Okay great. I can't see a thing...", pitch: 1.2, static: false },
  { speaker: 'COMMANDER STATIC', text: "Good. Okay, start by going--", pitch: 0.8, static: true },
  { speaker: 'YOU', text: "Hello? Commander?", pitch: 1.2, static: false },
  { speaker: 'COMMANDER STATIC', text: "Yes, I'm still here. The signal seems to have worsened, we are going to have to make do like this...", pitch: 0.8, static: true }
];

let currentTutorialIndex = 0;
let battery = 100;
let currentLevelStep = 0;

const levels = [level1, level2, level3];
let currentLevelIndex = 0;

let mazeGraph = {};
let levelSequence = [];
let currentNode = 'start';
let playerX = 600;
let playerY = 800;
let lightRadius = 80;
let darkRadius = 180;

let audioCtx;
let noiseNode;
let gainNode;
let promptTimeout;
let currentAudio = null;
let lastSpokenText = "";
let lastSpokenStatic = false;

function stopAllAudio() {
  window.speechSynthesis.cancel();
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  stopStaticNoise();
  clearTimeout(promptTimeout);
}

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function playStaticNoise() {
  initAudio();
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  const bufferSize = audioCtx.sampleRate * 2;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  noiseNode = audioCtx.createBufferSource();
  noiseNode.buffer = buffer;
  noiseNode.loop = true;
  
  const bandpass = audioCtx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 1000;
  
  gainNode = audioCtx.createGain();
  gainNode.gain.value = 0.15; // Moderate static
  
  noiseNode.connect(bandpass);
  bandpass.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  
  noiseNode.start();
}

function stopStaticNoise() {
  if (noiseNode) {
    noiseNode.stop();
    noiseNode.disconnect();
    noiseNode = null;
  }
}

function speak(text, pitch, withStatic, callback) {
  stopAllAudio();
  
  if (withStatic) {
    playStaticNoise();
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.pitch = pitch;
  utterance.rate = 0.85;
  
  if (withStatic) {
    utterance.volume = 0.65; // Lowered volume, jumbled
  } else {
    utterance.volume = 1.0;
  }
  
  utterance.onend = () => {
    if (withStatic) stopStaticNoise();
    if (callback) callback();
  };
  
  utterance.onerror = () => {
    if (withStatic) stopStaticNoise();
    if (callback) callback();
  };
  
  window.speechSynthesis.speak(utterance);
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

document.getElementById('btn-tutorial').addEventListener('click', () => {
  stopAllAudio();
  currentTutorialIndex = 0;
  showScreen('tutorial-screen');
  playTutorialStep();
});

document.getElementById('btn-start').addEventListener('click', () => {
  stopAllAudio();
  showScreen('game-screen-1');
});

document.getElementById('tutorial-screen').addEventListener('click', () => {
  stopAllAudio();
  currentTutorialIndex++;
  if (currentTutorialIndex < tutorialData.length) {
    playTutorialStep();
  } else {
    showScreen('game-screen-1');
  }
});

function jumbleText(text) {
  const words = text.split(' ');
  return words.map(word => {
    // 40% chance to partially drop a word (only for words longer than 3 letters)
    if (word.length <= 3 || Math.random() > 0.4) return word;
    
    const mid = Math.floor(word.length / 2);
    // Randomly drop either the first half or the second half of the word
    if (Math.random() < 0.5) {
      return word.substring(0, mid) + ",";
    } else {
      return word.substring(mid) + ",";
    }
  }).join(' ');
}

function playTutorialStep() {
  const step = tutorialData[currentTutorialIndex];
  const textEl = document.getElementById('tutorial-text');
  textEl.innerHTML = `<strong>${step.speaker}:</strong> ${step.text}`;
  
  let textToSpeak = step.text;
  if (step.static) {
    textToSpeak = jumbleText(textToSpeak);
  }
  speak(textToSpeak, step.pitch, step.static);
}

document.getElementById('game-screen-1').addEventListener('click', () => {
  stopAllAudio();
  showScreen('game-screen-2');
});

document.getElementById('game-screen-2').addEventListener('click', () => {
  stopAllAudio();
  startGame(0);
});

function startGame(levelIdx = 0) {
  stopAllAudio();
  currentLevelIndex = levelIdx;
  const levelData = levels[currentLevelIndex];
  
  mazeGraph = levelData.nodes;
  levelSequence = levelData.sequence;
  currentNode = levelData.startNode;
  
  playerX = mazeGraph[currentNode].x;
  playerY = mazeGraph[currentNode].y;
  
  battery = 100;
  currentLevelStep = 0;
  lightRadius = 80;
  darkRadius = 180;
  
  drawMaze(levelData);
  updateBatteryDisplay();
  updatePlayerPosition();
  showScreen('main-game-screen');
  
  promptTimeout = setTimeout(() => {
    playCurrentPrompt(true);
  }, 1000);
  
  document.addEventListener('keydown', handleMazeMovement);
}

function drawMaze(levelData) {
  const wrapper = document.getElementById('maze-wrapper');
  const svg = document.getElementById('maze-svg');
  const landmarksContainer = document.getElementById('landmarks-container');
  
  wrapper.style.width = `${levelData.width}px`;
  wrapper.style.height = `${levelData.height}px`;
  svg.setAttribute('width', levelData.width);
  svg.setAttribute('height', levelData.height);
  
  svg.innerHTML = '';
  landmarksContainer.innerHTML = '';
  
  const drawnEdges = new Set();
  
  for (const [nodeId, node] of Object.entries(levelData.nodes)) {
    if (node.landmark) {
      const el = document.createElement('div');
      el.className = 'landmark';
      el.style.left = `${node.x}px`;
      el.style.top = `${node.y - 40}px`;
      el.innerText = node.landmark;
      landmarksContainer.appendChild(el);
    }
    
    const directions = ['up', 'down', 'left', 'right'];
    for (const dir of directions) {
      if (node[dir]) {
        const targetId = node[dir];
        const targetNode = levelData.nodes[targetId];
        
        const edgeId = [nodeId, targetId].sort().join('-');
        if (!drawnEdges.has(edgeId)) {
          drawnEdges.add(edgeId);
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', `M ${node.x} ${node.y} L ${targetNode.x} ${targetNode.y}`);
          path.setAttribute('class', 'maze-path');
          svg.appendChild(path);
        }
      }
    }
  }
}

function updateBatteryDisplay() {
  const batteryText = document.getElementById('battery-text');
  batteryText.innerText = `${battery}%`;
  if (battery <= 20) {
    batteryText.style.color = 'red';
  } else {
    batteryText.style.color = '#00ff00';
  }
}

function updatePlayerPosition() {
  const container = document.getElementById('maze-container');
  container.style.setProperty('--player-x', `${playerX}px`);
  container.style.setProperty('--player-y', `${playerY}px`);
  container.style.setProperty('--light-radius', `${lightRadius}px`);
  container.style.setProperty('--dark-radius', `${darkRadius}px`);
}

function playCurrentPrompt(withStatic) {
  if (currentLevelStep < levelSequence.length) {
    let promptText = levelSequence[currentLevelStep].prompt;
    if (withStatic) {
      promptText = jumbleText(promptText);
    }
    lastSpokenText = promptText;
    lastSpokenStatic = withStatic;
    speak(promptText, 0.8, withStatic);
  }
}

document.getElementById('btn-repeat').addEventListener('click', () => {
  if (lastSpokenText) {
    stopAllAudio();
    speak(lastSpokenText, 0.8, lastSpokenStatic);
  }
});

document.getElementById('btn-clarify').addEventListener('click', () => {
  if (battery >= 5) {
    battery -= 5;
    updateBatteryDisplay();
    stopAllAudio();
    playCurrentPrompt(false);
  }
});

function animateBump(direction) {
  const player = document.getElementById('player-character');
  let dx = 0, dy = 0;
  if (direction === 'ArrowUp') dy = -15;
  if (direction === 'ArrowDown') dy = 15;
  if (direction === 'ArrowLeft') dx = -15;
  if (direction === 'ArrowRight') dx = 15;
  
  player.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  setTimeout(() => {
    player.style.transform = `translate(-50%, -50%)`;
  }, 200);
}

let isMoving = false;

function handleMazeMovement(e) {
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  if (isMoving) return;
  
  isMoving = true;
  
  const batteryDrain = Math.floor(100 / (levelSequence.length + 4));
  
  if (battery >= batteryDrain) {
    battery -= batteryDrain;
  } else {
    battery = 0;
  }
  updateBatteryDisplay();
  
  if (battery <= 0) {
    endGame(false, "Out of battery! You are lost in the dark forever.");
    return;
  }
  
  const directionMap = {
    'ArrowUp': 'up',
    'ArrowDown': 'down',
    'ArrowLeft': 'left',
    'ArrowRight': 'right'
  };
  
  const moveDir = directionMap[e.key];
  const nextNode = mazeGraph[currentNode][moveDir];
  
  if (nextNode) {
    // Valid path
    currentNode = nextNode;
    playerX = mazeGraph[currentNode].x;
    playerY = mazeGraph[currentNode].y;
    
    const expectedNode = levelSequence[currentLevelStep]?.target;
    
    if (currentNode === expectedNode) {
      // Correct progress
      lightRadius = Math.min(150, lightRadius + 30);
      darkRadius = Math.min(300, darkRadius + 30);
      currentLevelStep++;
      
      stopAllAudio();
      
      if (currentLevelStep >= levelSequence.length) {
        promptTimeout = setTimeout(() => {
          endGame(true, "You successfully navigated out of the maze!");
        }, 1000);
      } else {
        promptTimeout = setTimeout(() => {
          playCurrentPrompt(true);
        }, 1000);
      }
    } else {
      // Wrong direction or backtracking
      lightRadius = Math.max(40, lightRadius - 20);
      darkRadius = Math.max(120, darkRadius - 20);
    }
    
    updatePlayerPosition();
    setTimeout(() => { isMoving = false; }, 400);
  } else {
    // Hit a wall
    animateBump(e.key);
    setTimeout(() => { isMoving = false; }, 300);
  }
}

function endGame(win, message) {
  document.removeEventListener('keydown', handleMazeMovement);
  stopAllAudio();
  
  showScreen('end-screen');
  document.getElementById('end-title').innerText = win ? "MISSION ACCOMPLISHED" : "GAME OVER";
  document.getElementById('end-title').style.color = win ? "#00ff00" : "red";
  document.getElementById('end-message').innerText = message;
  
  const btnNext = document.getElementById('btn-next-level');
  const btnRestart = document.getElementById('btn-restart');
  
  if (win && currentLevelIndex < levels.length - 1) {
    btnNext.style.display = 'inline-block';
    btnRestart.style.display = 'none';
  } else {
    btnNext.style.display = 'none';
    btnRestart.style.display = 'inline-block';
    if (win) {
      document.getElementById('end-message').innerText += "\n\nYou have completed all levels!";
    }
  }
}

document.getElementById('btn-next-level').addEventListener('click', () => {
  stopAllAudio();
  startGame(currentLevelIndex + 1);
});

document.getElementById('btn-restart').addEventListener('click', () => {
  stopAllAudio();
  showScreen('start-screen');
});
