import './style.css'

// 테트리스 UI 렌더링
const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <div id="game-container">
    <div id="player-info">
      <div id="player-name">Player</div>
      <div id="room-info">Room: <span id="room-id">-</span></div>
    </div>
    
    <div id="tetris-ui">
      <div id="left-panel">
        <div id="hold-section">
          <div>Hold</div>
          <canvas id="hold-canvas" width="120" height="120" tabindex="0"></canvas>
        </div>
        <div id="players-section">
          <div>Players</div>
          <div id="players-list"></div>
        </div>
      </div>
      
      <div id="main-game">
        <canvas id="tetris-canvas" width="240" height="400" tabindex="0"></canvas>
      </div>
      
      <div id="right-section">
        <div id="next-section">
          <div>Next</div>
          <canvas id="next-canvas" width="120" height="120" tabindex="0"></canvas>
        </div>
        <div id="tetris-info">
          <div>Score: <span id="score">0</span></div>
          <button id="start-btn">Start</button>
          <button id="share-btn">Share Room</button>
        </div>
      </div>
      
      <div id="other-players">
        <div id="other-players-title">Other Players</div>
        <div id="other-players-grid"></div>
      </div>
    </div>
  </div>
  
  <!-- 방 생성/참가 모달 -->
  <div id="room-modal" class="modal">
    <div class="modal-content">
      <h2>Tetris Multiplayer</h2>
      <div class="input-group">
        <label for="nickname">Nickname:</label>
        <input type="text" id="nickname" placeholder="Enter your nickname" maxlength="15">
      </div>
      <div class="button-group">
        <button id="create-room-btn">Create Room</button>
        <button id="join-room-btn">Join Room</button>
      </div>
      <div class="input-group" id="room-input-group" style="display: none;">
        <label for="room-code">Room Code:</label>
        <input type="text" id="room-code" placeholder="Enter room code">
        <button id="join-room-submit-btn">Join</button>
      </div>
    </div>
  </div>
`;

// 테트리스 상수 및 타입
const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 36; // 캔버스 크기와 맞춤 (36x20=720, 36x10=360)

// 테트로미노 모양 정의 (회전 포함)
const TETROMINOS = [
  // I
  [
    [ [0,1], [1,1], [2,1], [3,1] ],
    [ [2,0], [2,1], [2,2], [2,3] ],
    [ [0,2], [1,2], [2,2], [3,2] ],
    [ [1,0], [1,1], [1,2], [1,3] ],
  ],
  // J
  [
    [ [0,0], [0,1], [1,1], [2,1] ],
    [ [1,0], [2,0], [1,1], [1,2] ],
    [ [0,1], [1,1], [2,1], [2,2] ],
    [ [1,0], [1,1], [0,2], [1,2] ],
  ],
  // L
  [
    [ [2,0], [0,1], [1,1], [2,1] ],
    [ [1,0], [1,1], [1,2], [2,2] ],
    [ [0,1], [1,1], [2,1], [0,2] ],
    [ [0,0], [1,0], [1,1], [1,2] ],
  ],
  // O
  [
    [ [1,0], [2,0], [1,1], [2,1] ],
    [ [1,0], [2,0], [1,1], [2,1] ],
    [ [1,0], [2,0], [1,1], [2,1] ],
    [ [1,0], [2,0], [1,1], [2,1] ],
  ],
  // S
  [
    [ [1,0], [2,0], [0,1], [1,1] ],
    [ [1,0], [1,1], [2,1], [2,2] ],
    [ [1,1], [2,1], [0,2], [1,2] ],
    [ [0,0], [0,1], [1,1], [1,2] ],
  ],
  // T
  [
    [ [1,0], [0,1], [1,1], [2,1] ],
    [ [1,0], [1,1], [2,1], [1,2] ],
    [ [0,1], [1,1], [2,1], [1,2] ],
    [ [1,0], [0,1], [1,1], [1,2] ],
  ],
  // Z
  [
    [ [0,0], [1,0], [1,1], [2,1] ],
    [ [2,0], [1,1], [2,1], [1,2] ],
    [ [0,1], [1,1], [1,2], [2,2] ],
    [ [1,0], [0,1], [1,1], [0,2] ],
  ],
];
const COLORS = [
  '#00f0f0', // I
  '#0000f0', // J
  '#f0a000', // L
  '#f0f000', // O
  '#00f000', // S
  '#a000f0', // T
  '#f00000', // Z
];

type Cell = number | null; // null: 빈칸, 0~6: 테트로미노 색

type Tetromino = {
  shape: number[][][];
  color: string;
  rotation: number;
  x: number;
  y: number;
  type: number;
};

// 게임 상태
let board: Cell[][] = [];
let current: Tetromino | null = null;
let next: Tetromino | null = null;
let hold: Tetromino | null = null;
let holdUsed = false;
let score = 0;
let gameOver = false;
let dropInterval = 500;
let dropTimer: number | undefined;

// 멀티플레이어 관련 변수 (WebSocket 제거)
let playerId = '';
let playerName = '';
let roomId = '';
let players: { [key: string]: { name: string; board: Cell[][]; score: number; current: Tetromino | null; next: Tetromino | null; gameOver: boolean; gameStartTime?: number } } = {};
let otherPlayerCanvases: { [key: string]: HTMLCanvasElement } = {};
let gameStateInterval: number | null = null;
const GAME_START_TIMEOUT = 10000; // 10초 후 다른 플레이어는 시작 불가

// DOM 요소들
const playerNameEl = document.getElementById('player-name')!;
const roomIdEl = document.getElementById('room-id')!;
const playersListEl = document.getElementById('players-list')!;
const otherPlayersGridEl = document.getElementById('other-players-grid')!;
const roomModalEl = document.getElementById('room-modal')!;
const nicknameInput = document.getElementById('nickname') as HTMLInputElement;
const roomCodeInput = document.getElementById('room-code') as HTMLInputElement;
const createRoomBtn = document.getElementById('create-room-btn')!;
const joinRoomBtn = document.getElementById('join-room-btn')!;
const joinRoomSubmitBtn = document.getElementById('join-room-submit-btn')!;
const shareBtn = document.getElementById('share-btn')!;

const canvas = document.getElementById('tetris-canvas') as HTMLCanvasElement;
canvas.width = COLS * BLOCK_SIZE;
canvas.height = ROWS * BLOCK_SIZE;
const ctx = canvas.getContext('2d')!;
const holdCanvas = document.getElementById('hold-canvas') as HTMLCanvasElement;
const holdCtx = holdCanvas.getContext('2d')!;
const nextCanvas = document.getElementById('next-canvas') as HTMLCanvasElement;
const nextCtx = nextCanvas.getContext('2d')!;
const scoreEl = document.getElementById('score')!;
const startBtn = document.getElementById('start-btn')!;

function resetBoard() {
  board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function randomTetromino(): Tetromino {
  const type = Math.floor(Math.random() * TETROMINOS.length);
  return {
    shape: TETROMINOS[type],
    color: COLORS[type],
    rotation: 0,
    x: 3,
    y: 0,
    type,
  };
}

function drawCell(x: number, y: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
  ctx.strokeStyle = '#222';
  ctx.strokeRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
}

function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // 보드
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (board[y][x] !== null) {
        drawCell(x, y, COLORS[board[y][x]!]);
      }
    }
  }
  // 현재 블록
  if (current) {
    for (const [dx, dy] of current.shape[current.rotation]) {
      const px = current.x + dx;
      const py = current.y + dy;
      if (py >= 0 && py < ROWS && px >= 0 && px < COLS) {
        drawCell(px, py, current.color);
      }
    }
  }
  
  // 멀티플레이어: 게임 상태 전송 (게임 진행 중일 때만, 더 자주 업데이트)
  if (current && !gameOver) {
    // 상태 저장을 별도로 처리하여 렌더링 성능 향상
    setTimeout(() => saveGameState(), 0);
  }
}

function drawHold() {
  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  if (hold) {
    const blockSize = 20;
    const offsetX = (holdCanvas.width - 4 * blockSize) / 2;
    const offsetY = (holdCanvas.height - 4 * blockSize) / 2;
    
    for (const [dx, dy] of hold.shape[0]) {
      const x = offsetX + dx * blockSize;
      const y = offsetY + dy * blockSize;
      holdCtx.fillStyle = hold.color;
      holdCtx.fillRect(x, y, blockSize, blockSize);
      holdCtx.strokeStyle = '#222';
      holdCtx.strokeRect(x, y, blockSize, blockSize);
    }
  }
}

function drawNext() {
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  if (next) {
    const blockSize = 20;
    const offsetX = (nextCanvas.width - 4 * blockSize) / 2;
    const offsetY = (nextCanvas.height - 4 * blockSize) / 2;
    
    for (const [dx, dy] of next.shape[0]) {
      const x = offsetX + dx * blockSize;
      const y = offsetY + dy * blockSize;
      nextCtx.fillStyle = next.color;
      nextCtx.fillRect(x, y, blockSize, blockSize);
      nextCtx.strokeStyle = '#222';
      nextCtx.strokeRect(x, y, blockSize, blockSize);
    }
  }
}

function holdTetromino() {
  if (!current || holdUsed) return;
  
  if (hold) {
    // 홀드된 블록과 현재 블록 교환
    const temp = hold;
    hold = { ...current, rotation: 0, x: 3, y: 0 };
    current = { ...temp, rotation: 0, x: 3, y: 0 };
  } else {
    // 홀드가 비어있으면 현재 블록을 홀드하고 다음 블록 사용
    hold = { ...current, rotation: 0, x: 3, y: 0 };
    current = next;
    next = randomTetromino();
  }
  
  holdUsed = true;
  drawHold();
  drawNext();
  drawBoard();
}

function isValidMove(tetro: Tetromino, nx: number, ny: number, nrot: number) {
  for (const [dx, dy] of tetro.shape[nrot]) {
    const x = nx + dx;
    const y = ny + dy;
    if (x < 0 || x >= COLS || y >= ROWS) return false;
    if (y >= 0 && board[y][x] !== null) return false;
  }
  return true;
}

function mergeTetromino() {
  if (!current) return;
  for (const [dx, dy] of current.shape[current.rotation]) {
    const x = current.x + dx;
    const y = current.y + dy;
    if (y >= 0 && y < ROWS && x >= 0 && x < COLS) {
      board[y][x] = current.type;
    }
  }
}

function clearLines() {
  let lines = 0;
  const newBoard: Cell[][] = [];
  
  // 완성되지 않은 줄들만 새 배열에 추가
  for (let y = ROWS - 1; y >= 0; y--) {
    if (!board[y].every(cell => cell !== null)) {
      newBoard.unshift([...board[y]]);
    } else {
      lines++;
    }
  }
  
  // 빈 줄들을 위에 추가
  while (newBoard.length < ROWS) {
    newBoard.unshift(Array(COLS).fill(null));
  }
  
  // board 배열 교체
  board = newBoard;
  
  if (lines > 0) {
    score += [0, 100, 300, 500, 800][lines];
    scoreEl.textContent = score.toString();
    
    // 점수 변경 시 즉시 상태 저장 및 플레이어 목록 업데이트
    saveGameState();
    updatePlayersList();
  }
}

function lockAndNext() {
  if (!current) return;
  
  mergeTetromino();
  clearLines();
  spawnTetromino();
  
  // current가 새로 할당된 후 유효성 검사
  if (current && !isValidMove(current, current.x, current.y, current.rotation)) {
    gameOver = true;
    saveGameState(); // 게임 오버 상태 즉시 저장
    stopGame();
    alert('Game Over!');
  }
  
  drawBoard();
}

function drop() {
  if (!current) return;
  if (isValidMove(current, current.x, current.y + 1, current.rotation)) {
    current.y++;
    drawBoard();
  } else {
    lockAndNext();
  }
}

function hardDrop() {
  if (!current || gameOver) return;
  
  // 타이머 확실히 정리
  if (dropTimer) {
    clearTimeout(dropTimer);
    dropTimer = undefined;
  }
  
  // 블록을 바닥까지 내리기 (drop() 호출하지 않고 직접)
  while (isValidMove(current, current.x, current.y + 1, current.rotation)) {
    current.y++;
  }
  
  // 블록을 board에 저장하고 즉시 그리기
  mergeTetromino();
  drawBoard();
  
  // 줄 삭제
  clearLines();
  drawBoard();
  
  // 다음 블록 생성
  spawnTetromino();
  drawBoard();
  
  // 게임 오버 체크
  if (current && !isValidMove(current, current.x, current.y, current.rotation)) {
    gameOver = true;
    saveGameState(); // 게임 오버 상태 즉시 저장
    stopGame();
    alert('Game Over!');
  } else {
    // 게임이 계속 진행 중이면 타이머 재시작
    dropTimer = window.setTimeout(gameLoop, dropInterval);
  }
}

function move(dx: number) {
  if (!current) return;
  if (isValidMove(current, current.x + dx, current.y, current.rotation)) {
    current.x += dx;
    drawBoard();
  }
}

function rotate() {
  if (!current) return;
  const nextRot = (current.rotation + 1) % 4;
  if (isValidMove(current, current.x, current.y, nextRot)) {
    current.rotation = nextRot;
    drawBoard();
  }
}

function spawnTetromino() {
  current = next || randomTetromino();
  next = randomTetromino();
  holdUsed = false; // 새로운 블록이 생성되면 홀드 사용 가능
  drawNext();
}

function gameLoop() {
  if (gameOver) return;
  drop();
  dropTimer = window.setTimeout(gameLoop, dropInterval);
}

function startGame() {
  resetBoard();
  score = 0;
  scoreEl.textContent = '0';
  gameOver = false;
  hold = null;
  holdUsed = false;
  dropInterval = 500;
  spawnTetromino();
  drawBoard();
  drawHold();
  drawNext();
  if (dropTimer) clearTimeout(dropTimer);
  dropTimer = window.setTimeout(gameLoop, dropInterval);
  
  // 캔버스에 포커스를 주어 키보드 이벤트가 즉시 감지되도록 함
  canvas.focus();
  
  // 게임 시작 시간 기록
  if (players[playerId]) {
    players[playerId].gameStartTime = Date.now();
  }
  
  // 게임 시작 시 상태 공유 및 플레이어 목록 업데이트 (즉시 실행)
  setTimeout(() => {
    saveGameState();
    updatePlayersList();
  }, 0);
}

function stopGame() {
  if (dropTimer) clearTimeout(dropTimer);
  
  // 게임 오버 상태 저장
  if (gameOver) {
    saveGameState();
  }
  
  stopGameStateSharing();
}

// 키보드 이벤트
window.addEventListener('keydown', (e) => {
  if (!current || gameOver) return;
  switch (e.key) {
    case 'ArrowLeft':
      move(-1);
      break;
    case 'ArrowRight':
      move(1);
      break;
    case 'ArrowDown':
      drop();
      break;
    case 'ArrowUp':
      rotate();
      break;
    case ' ': // space
      hardDrop();
      break;
    case 'x': // x for hold
    case 'X': // 대문자 X도 지원
      holdTetromino();
      break;
  }
});

startBtn.addEventListener('click', startGame);

// 멀티플레이어 이벤트 리스너
createRoomBtn.addEventListener('click', createRoom);
joinRoomBtn.addEventListener('click', () => {
  const roomInputGroup = document.getElementById('room-input-group')!;
  roomInputGroup.style.display = 'block';
  
  // URL에 방 코드가 있으면 자동으로 채우기
  const urlParams = new URLSearchParams(window.location.search);
  const roomFromUrl = urlParams.get('room');
  if (roomFromUrl && roomCodeInput) {
    roomCodeInput.value = roomFromUrl;
  }
});

// 방 참가 제출 버튼에 이벤트 리스너 추가
joinRoomSubmitBtn.addEventListener('click', joinRoom);

// 방 코드 입력 필드에서 Enter 키로 참가
roomCodeInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    joinRoom();
  }
});

shareBtn.addEventListener('click', () => {
  if (roomId) {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    navigator.clipboard.writeText(url).then(() => {
      alert('Room link copied to clipboard!');
    }).catch(() => {
      prompt('Copy this room link:', url);
    });
  }
});

// 멀티플레이어 함수들 (WebSocket 제거)
function generateRoomId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function createRoom() {
  if (!nicknameInput.value.trim()) {
    alert('Please enter a nickname');
    return;
  }
  
  playerName = nicknameInput.value.trim();
  playerNameEl.textContent = playerName;
  
  roomId = generateRoomId();
  roomIdEl.textContent = roomId;
  
  players[playerId] = {
    name: playerName,
    board: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
    score: 0,
    current: null,
    next: null,
    gameOver: false
  };
  
  hideRoomModal();
  updateRoomInfo();
  updatePlayersList();
  
  // URL 업데이트
  updateURL();
  
  // 게임 상태 공유 시작
  startGameStateSharing();
}

function joinRoom() {
  if (!nicknameInput.value.trim() || !roomCodeInput.value.trim()) {
    alert('Please enter nickname and room code');
    return;
  }
  
  playerName = nicknameInput.value.trim();
  roomId = roomCodeInput.value.trim().toUpperCase();
  
  playerNameEl.textContent = playerName;
  roomIdEl.textContent = roomId;
  
  // 플레이어 정보 초기화
  players[playerId] = {
    name: playerName,
    board: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
    score: 0,
    current: null,
    next: null,
    gameOver: false
  };
  
  hideRoomModal();
  updateRoomInfo();
  updatePlayersList();
  
  // URL 업데이트
  updateURL();
  
  // 게임 상태 공유 시작
  startGameStateSharing();
}

function hideRoomModal() {
  roomModalEl.style.display = 'none';
}

function showRoomModal() {
  roomModalEl.style.display = 'flex';
}

function updateRoomInfo() {
  const url = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
  // URL을 클립보드에 복사하거나 공유 기능 구현
}

function updateURL() {
  const url = new URL(window.location.href);
  url.searchParams.set('room', roomId);
  url.searchParams.set('player', playerId);
  url.searchParams.set('name', playerName);
  window.history.replaceState({}, '', url.toString());
}

function updatePlayersList() {
  // 자신의 점수를 players 객체에 업데이트
  if (players[playerId]) {
    players[playerId].score = score;
  }
  
  playersListEl.innerHTML = '';
  Object.entries(players).forEach(([id, player]) => {
    const playerItem = document.createElement('div');
    playerItem.className = `player-item ${id === playerId ? 'self' : ''}`;
    playerItem.textContent = `${player.name} (${player.score})`;
    playersListEl.appendChild(playerItem);
  });
  
  // 다른 플레이어가 게임 중인지 확인하여 시작 버튼 제어
  checkGameStartAvailability();
}

function checkGameStartAvailability() {
  const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
  if (!startBtn) return;
  
  // 다른 플레이어 중 게임 중인 사람이 있는지 확인
  let otherPlayerPlaying = false;
  let hasOtherPlayers = false;
  let timeoutExpired = false;
  const currentTime = Date.now();
  
  Object.entries(players).forEach(([id, player]) => {
    if (id !== playerId) {
      hasOtherPlayers = true;
      // 게임 중이거나 게임 오버가 아닌 상태면 게임 중으로 간주
      if (player.current && !player.gameOver) {
        otherPlayerPlaying = true;
        // 게임 시작 시간이 있고, 타임아웃이 지났는지 확인
        if (player.gameStartTime && (currentTime - player.gameStartTime) > GAME_START_TIMEOUT) {
          timeoutExpired = true;
        }
      }
    }
  });
  
  // 다른 플레이어가 없으면 시작 가능
  if (!hasOtherPlayers) {
    startBtn.disabled = false;
    startBtn.textContent = 'Start';
    startBtn.style.opacity = '1';
    return;
  }
  
  // 다른 플레이어가 있고, 타임아웃이 지났으면 시작 불가
  if (timeoutExpired) {
    startBtn.disabled = true;
    startBtn.textContent = 'Too late to join...';
    startBtn.style.opacity = '0.5';
    return;
  }
  
  // 10초 이내라면 다른 플레이어가 게임 중이어도 시작 가능
  startBtn.disabled = false;
  startBtn.textContent = 'Start';
  startBtn.style.opacity = '1';
}

function createOtherPlayerCanvas(playerId: string) {
  const playerDiv = document.createElement('div');
  playerDiv.className = 'other-player';
  
  const playerName = document.createElement('div');
  playerName.className = 'other-player-name';
  playerName.textContent = players[playerId].name;
  
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 320;
  canvas.style.width = '200px';
  canvas.style.height = '320px';
  
  playerDiv.appendChild(playerName);
  playerDiv.appendChild(canvas);
  otherPlayersGridEl.appendChild(playerDiv);
  
  otherPlayerCanvases[playerId] = canvas;
  
  // 즉시 빈 보드 그리기
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // 빈 보드 그리기 (테두리만)
  const blockSize = canvas.width / COLS;
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      ctx.strokeRect(x * blockSize, y * blockSize, blockSize, blockSize);
    }
  }
}

function removeOtherPlayerCanvas(playerId: string) {
  const canvas = otherPlayerCanvases[playerId];
  if (canvas && canvas.parentElement) {
    canvas.parentElement.remove();
  }
  delete otherPlayerCanvases[playerId];
}

function updateOtherPlayerGame(playerId: string, gameState: any) {
  const canvas = otherPlayerCanvases[playerId];
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // 다른 플레이어의 게임 상태를 그리기
  const { board, current, score, gameOver } = gameState;
  
  // 게임 오버 상태면 "GAME OVER" 텍스트 표시
  if (gameOver) {
    // 반투명 검은 배경
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 빨간색 "GAME OVER" 텍스트
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 15);
    
    // 흰색 점수 텍스트
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial';
    ctx.fillText(`Score: ${score}`, canvas.width / 2, canvas.height / 2 + 15);
    
    // 빨간색 테두리 추가
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 3;
    ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
    
    return;
  }
  
  // 보드 그리기 (다른 플레이어 캔버스는 더 작으므로 블록 크기 조정)
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (board[y][x] !== null) {
        const blockSize = canvas.width / COLS;
        ctx.fillStyle = COLORS[board[y][x]!];
        ctx.fillRect(x * blockSize, y * blockSize, blockSize, blockSize);
        ctx.strokeStyle = '#222';
        ctx.strokeRect(x * blockSize, y * blockSize, blockSize, blockSize);
      }
    }
  }
  
  // 현재 블록 그리기
  if (current) {
    const blockSize = canvas.width / COLS;
    for (const [dx, dy] of current.shape[current.rotation]) {
      const px = current.x + dx;
      const py = current.y + dy;
      if (py >= 0 && py < ROWS && px >= 0 && px < COLS) {
        ctx.fillStyle = current.color;
        ctx.fillRect(px * blockSize, py * blockSize, blockSize, blockSize);
        ctx.strokeStyle = '#222';
        ctx.strokeRect(px * blockSize, py * blockSize, blockSize, blockSize);
      }
    }
  }
}

function saveGameState() {
  const gameState = {
    playerId,
    roomId,
    playerName,
    gameState: {
      board,
      current,
      next,
      score,
      gameOver,
      timestamp: Date.now(),
      gameStartTime: players[playerId]?.gameStartTime
    }
  };
  
  // 로컬 스토리지에 저장
  localStorage.setItem(`tetris_${roomId}_${playerId}`, JSON.stringify(gameState));
  
  // URL에 게임 상태 인코딩 (간단한 상태만)
  const urlState = {
    board: board.map(row => row.map(cell => cell ? 1 : 0).join('')).join(''),
    score,
    gameOver: gameOver ? 1 : 0
  };
  
  const encodedState = btoa(JSON.stringify(urlState));
  const url = new URL(window.location.href);
  url.searchParams.set('state', encodedState);
  window.history.replaceState({}, '', url.toString());
}

function loadOtherPlayersState() {
  if (!roomId) return;
  
  const roomKey = `tetris_${roomId}`;
  const keys = Object.keys(localStorage).filter(key => key.startsWith(roomKey));
  
  keys.forEach(key => {
    const otherPlayerId = key.split('_')[2];
    if (otherPlayerId && otherPlayerId !== playerId) {
      try {
        const data = JSON.parse(localStorage.getItem(key)!);
        if (data && data.gameState) {
          // 다른 플레이어 정보 추가/업데이트
          if (!players[otherPlayerId]) {
            players[otherPlayerId] = {
              name: data.playerName || 'Player',
              board: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
              score: 0,
              current: null,
              next: null,
              gameOver: false
            };
            createOtherPlayerCanvas(otherPlayerId);
            updatePlayersList();
          }
          
          // 게임 상태 업데이트 (타임스탬프 확인)
          const currentTime = Date.now();
          const dataTime = data.gameState.timestamp || 0;
          
          // 1초 이내의 데이터만 사용 (더 빠른 반응)
          if (currentTime - dataTime < 1000) {
            // 게임 오버 상태인지 확인
            if (data.gameState.gameOver) {
              // 게임 오버 상태면 보드를 초기화하고 현재 블록 제거
              players[otherPlayerId].board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
              players[otherPlayerId].current = null;
              players[otherPlayerId].score = data.gameState.score;
              players[otherPlayerId].gameOver = true;
              players[otherPlayerId].gameStartTime = undefined; // 게임 오버 시 시작 시간 초기화
            } else {
              // 게임 진행 중이면 정상적으로 업데이트
              players[otherPlayerId].board = data.gameState.board;
              players[otherPlayerId].score = data.gameState.score;
              players[otherPlayerId].current = data.gameState.current;
              players[otherPlayerId].gameOver = false;
              // 게임 시작 시간 업데이트 (새로 시작한 경우)
              if (data.gameState.gameStartTime) {
                players[otherPlayerId].gameStartTime = data.gameState.gameStartTime;
              }
            }
            
            updateOtherPlayerGame(otherPlayerId, data.gameState);
            updatePlayersList(); // 플레이어 목록도 업데이트
            checkGameStartAvailability(); // 시작 버튼 상태 재확인
          } else {
            // 오래된 데이터라도 기본 상태는 표시 (빈 보드)
            updateOtherPlayerGame(otherPlayerId, {
              board: players[otherPlayerId].board,
              current: null,
              score: players[otherPlayerId].score,
              gameOver: players[otherPlayerId].gameOver
            });
          }
        }
      } catch (e) {
        console.error('Error loading player state:', e);
      }
    }
  });
}

function startGameStateSharing() {
  // 주기적으로 게임 상태 저장
  gameStateInterval = setInterval(() => {
    // 항상 상태 저장 (게임 시작 전에도 저장하여 다른 플레이어가 상태를 확인할 수 있도록)
    saveGameState();
    loadOtherPlayersState();
  }, 100); // 0.1초마다 업데이트 (더 빠른 실시간 동기화)
}

function stopGameStateSharing() {
  if (gameStateInterval) {
    clearInterval(gameStateInterval);
    gameStateInterval = null;
  }
}

// 초기화
function initMultiplayer() {
  // URL에서 방 ID 확인
  const urlParams = new URLSearchParams(window.location.search);
  const roomFromUrl = urlParams.get('room');
  const playerFromUrl = urlParams.get('player');
  const nameFromUrl = urlParams.get('name');
  const stateFromUrl = urlParams.get('state');

  if (roomFromUrl) {
    // 방 링크로 접속한 경우
    roomCodeInput.value = roomFromUrl;
    roomId = roomFromUrl;
    roomIdEl.textContent = roomId;
    
    if (playerFromUrl && nameFromUrl) {
      // 기존 플레이어로 복귀
      playerId = playerFromUrl;
      playerName = nameFromUrl;
      playerNameEl.textContent = playerName;
      hideRoomModal();
      startGameStateSharing();
    } else {
      // 새 플레이어로 참가
      showRoomModal();
    }
  } else {
    // 새로 접속한 경우
    showRoomModal();
  }

  // 플레이어 ID 생성 (URL에 없으면)
  if (!playerId) {
    playerId = Math.random().toString(36).substring(2, 15);
  }
}

// 최초 화면
resetBoard();
drawBoard();
drawHold();
drawNext();

// 멀티플레이어 초기화
initMultiplayer();

