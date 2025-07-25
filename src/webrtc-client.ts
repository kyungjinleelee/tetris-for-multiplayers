export interface GameState {
  playerId: string;
  playerName: string;
  board: (number | null)[][];
  current: any;
  next: any;
  score: number;
  gameOver: boolean;
  timestamp: number;
  gameStartTime?: number;
}

export interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'join-room' | 'leave-room' | 'game-state' | 'player-list';
  data: any;
  from: string;
  to?: string;
  roomId?: string;
}

export class WebRTCClient {
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private signalingSocket: WebSocket | null = null;
  private playerId: string;
  private roomId: string;
  private playerName: string;
  private onGameStateUpdate: (playerId: string, gameState: GameState) => void;
  private onPlayerListUpdate: (players: Array<{playerId: string, playerName: string}>) => void;

  constructor(
    playerId: string,
    roomId: string,
    playerName: string,
    onGameStateUpdate: (playerId: string, gameState: GameState) => void,
    onPlayerListUpdate: (players: Array<{playerId: string, playerName: string}>) => void
  ) {
    this.playerId = playerId;
    this.roomId = roomId;
    this.playerName = playerName;
    this.onGameStateUpdate = onGameStateUpdate;
    this.onPlayerListUpdate = onPlayerListUpdate;
  }

  async connect(signalingServerUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.signalingSocket = new WebSocket(signalingServerUrl);
      
      this.signalingSocket.onopen = () => {
        console.log('Connected to signaling server');
        this.joinRoom();
        resolve();
      };

      this.signalingSocket.onmessage = (event) => {
        const message: SignalingMessage = JSON.parse(event.data);
        this.handleSignalingMessage(message);
      };

      this.signalingSocket.onerror = (error) => {
        console.error('Signaling connection error:', error);
        reject(error);
      };

      this.signalingSocket.onclose = () => {
        console.log('Disconnected from signaling server');
      };
    });
  }

  private joinRoom(): void {
    if (this.signalingSocket?.readyState === WebSocket.OPEN) {
      const message: SignalingMessage = {
        type: 'join-room',
        data: { playerName: this.playerName },
        from: this.playerId,
        roomId: this.roomId
      };
      this.signalingSocket.send(JSON.stringify(message));
    }
  }

  private async handleSignalingMessage(message: SignalingMessage): Promise<void> {
    switch (message.type) {
      case 'player-list':
        this.onPlayerListUpdate(message.data.players);
        break;
      
      case 'offer':
        await this.handleOffer(message);
        break;
      
      case 'answer':
        await this.handleAnswer(message);
        break;
      
      case 'ice-candidate':
        await this.handleIceCandidate(message);
        break;
      
      case 'game-state':
        this.onGameStateUpdate(message.from, message.data);
        break;
    }
  }

  private async handleOffer(message: SignalingMessage): Promise<void> {
    const peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    this.peerConnections.set(message.from, peerConnection);

    // Data channel 생성
    const dataChannel = peerConnection.createDataChannel('gameData');
    this.setupDataChannel(dataChannel, message.from);

    // Offer 설정
    await peerConnection.setRemoteDescription(new RTCSessionDescription(message.data));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    // Answer 전송
    const answerMessage: SignalingMessage = {
      type: 'answer',
      data: answer,
      from: this.playerId,
      to: message.from,
      roomId: this.roomId
    };
    this.signalingSocket?.send(JSON.stringify(answerMessage));
  }

  private async handleAnswer(message: SignalingMessage): Promise<void> {
    const peerConnection = this.peerConnections.get(message.from);
    if (peerConnection) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(message.data));
    }
  }

  private async handleIceCandidate(message: SignalingMessage): Promise<void> {
    const peerConnection = this.peerConnections.get(message.from);
    if (peerConnection) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(message.data));
    }
  }

  private setupDataChannel(dataChannel: RTCDataChannel, peerId: string): void {
    this.dataChannels.set(peerId, dataChannel);

    dataChannel.onopen = () => {
      console.log(`Data channel opened with ${peerId}`);
    };

    dataChannel.onmessage = (event) => {
      const gameState: GameState = JSON.parse(event.data);
      this.onGameStateUpdate(peerId, gameState);
    };

    dataChannel.onclose = () => {
      console.log(`Data channel closed with ${peerId}`);
      this.dataChannels.delete(peerId);
    };
  }

  public sendGameState(gameState: GameState): void {
    const gameStateMessage: SignalingMessage = {
      type: 'game-state',
      data: gameState,
      from: this.playerId,
      roomId: this.roomId
    };

    // 시그널링 서버를 통해 브로드캐스트
    this.signalingSocket?.send(JSON.stringify(gameStateMessage));

    // P2P 연결된 플레이어들에게 직접 전송
    this.dataChannels.forEach((dataChannel, peerId) => {
      if (dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(gameState));
      }
    });
  }

  public disconnect(): void {
    this.dataChannels.forEach((dataChannel) => {
      dataChannel.close();
    });
    this.dataChannels.clear();

    this.peerConnections.forEach((peerConnection) => {
      peerConnection.close();
    });
    this.peerConnections.clear();

    if (this.signalingSocket) {
      this.signalingSocket.close();
      this.signalingSocket = null;
    }
  }

  public getConnectedPeers(): string[] {
    return Array.from(this.dataChannels.keys());
  }
} 