import { WebSocketServer } from 'ws';
import http from 'http';

const server = http.createServer();
const wss = new WebSocketServer({ server });

// 방 관리
const rooms = new Map(); // roomId -> Set of WebSocket connections
const players = new Map(); // WebSocket -> { playerId, roomId, playerName }

wss.on('connection', (ws) => {
  console.log('New client connected');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleMessage(ws, data);
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });

  ws.on('close', () => {
    handleDisconnect(ws);
  });
});

function handleMessage(ws, message) {
  switch (message.type) {
    case 'join-room':
      handleJoinRoom(ws, message);
      break;
    
    case 'leave-room':
      handleLeaveRoom(ws, message);
      break;
    
    case 'offer':
    case 'answer':
    case 'ice-candidate':
      handleWebRTCMessage(ws, message);
      break;
    
    case 'game-state':
      handleGameState(ws, message);
      break;
    
    default:
      console.log('Unknown message type:', message.type);
  }
}

function handleJoinRoom(ws, message) {
  const { roomId, from, data } = message;
  const playerName = data.playerName;
  
  // 플레이어 정보 저장
  players.set(ws, { playerId: from, roomId, playerName });
  
  // 방에 참가
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  rooms.get(roomId).add(ws);
  
  console.log(`Player ${playerName} (${from}) joined room ${roomId}`);
  
  // 방의 모든 플레이어에게 새 플레이어 목록 전송
  broadcastPlayerList(roomId);
  
  // 새로 참가한 플레이어에게 기존 플레이어들과의 WebRTC 연결 설정
  setupWebRTCConnections(ws, roomId, from);
}

function handleLeaveRoom(ws, message) {
  const playerInfo = players.get(ws);
  if (playerInfo) {
    const { roomId, playerId } = playerInfo;
    
    // 방에서 제거
    const room = rooms.get(roomId);
    if (room) {
      room.delete(ws);
      if (room.size === 0) {
        rooms.delete(roomId);
        console.log(`Room ${roomId} deleted (empty)`);
      }
    }
    
    // 플레이어 정보 제거
    players.delete(ws);
    
    console.log(`Player ${playerId} left room ${roomId}`);
    
    // 남은 플레이어들에게 업데이트된 플레이어 목록 전송
    broadcastPlayerList(roomId);
  }
}

function handleWebRTCMessage(ws, message) {
  const { to, roomId } = message;
  const room = rooms.get(roomId);
  
  if (room) {
    // 특정 플레이어에게 메시지 전송
    for (const client of room) {
      const playerInfo = players.get(client);
      if (playerInfo && playerInfo.playerId === to) {
        client.send(JSON.stringify(message));
        break;
      }
    }
  }
}

function handleGameState(ws, message) {
  const { roomId } = message;
  const room = rooms.get(roomId);
  
  if (room) {
    // 방의 다른 모든 플레이어에게 게임 상태 브로드캐스트
    for (const client of room) {
      if (client !== ws) {
        client.send(JSON.stringify(message));
      }
    }
  }
}

function handleDisconnect(ws) {
  const playerInfo = players.get(ws);
  if (playerInfo) {
    const { roomId, playerId } = playerInfo;
    
    // 방에서 제거
    const room = rooms.get(roomId);
    if (room) {
      room.delete(ws);
      if (room.size === 0) {
        rooms.delete(roomId);
        console.log(`Room ${roomId} deleted (empty)`);
      }
    }
    
    // 플레이어 정보 제거
    players.delete(ws);
    
    console.log(`Player ${playerId} disconnected from room ${roomId}`);
    
    // 남은 플레이어들에게 업데이트된 플레이어 목록 전송
    broadcastPlayerList(roomId);
  }
}

function broadcastPlayerList(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  
  const playerList = Array.from(room).map(ws => {
    const playerInfo = players.get(ws);
    return {
      playerId: playerInfo.playerId,
      playerName: playerInfo.playerName
    };
  });
  
  const message = {
    type: 'player-list',
    data: { players: playerList },
    roomId
  };
  
  for (const client of room) {
    client.send(JSON.stringify(message));
  }
}

function setupWebRTCConnections(newPlayer, roomId, newPlayerId) {
  const room = rooms.get(roomId);
  if (!room) return;
  
  // 기존 플레이어들과 새 플레이어 간의 WebRTC 연결 설정
  for (const client of room) {
    if (client !== newPlayer) {
      const playerInfo = players.get(client);
      if (playerInfo) {
        // 새 플레이어가 기존 플레이어에게 offer 전송
        const offerMessage = {
          type: 'offer',
          from: newPlayerId,
          to: playerInfo.playerId,
          roomId,
          data: null // 실제 offer는 클라이언트에서 생성
        };
        client.send(JSON.stringify(offerMessage));
      }
    }
  }
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});

// 정기적으로 빈 방 정리
setInterval(() => {
  for (const [roomId, room] of rooms.entries()) {
    if (room.size === 0) {
      rooms.delete(roomId);
      console.log(`Cleaned up empty room: ${roomId}`);
    }
  }
}, 60000); // 1분마다 정리 