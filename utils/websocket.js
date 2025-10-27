const WebSocket = require('ws');

class WebSocketServer {
  constructor(server) {
    this.wss = new WebSocket.Server({ server });
    this.clients = new Map(); // userId -> WebSocket connection
    
    this.wss.on('connection', (ws, req) => {
      console.log('New WebSocket connection');
      
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this.handleMessage(ws, data);
        } catch (error) {
          console.error('Invalid WebSocket message:', error);
        }
      });
      
      ws.on('close', () => {
        // Remove client from map
        for (const [userId, clientWs] of this.clients.entries()) {
          if (clientWs === ws) {
            this.clients.delete(userId);
            break;
          }
        }
        console.log('WebSocket connection closed');
      });
    });
  }
  
  handleMessage(ws, data) {
    switch (data.type) {
      case 'auth':
        // Authenticate user and store connection
        if (data.userId) {
          this.clients.set(data.userId, ws);
          ws.send(JSON.stringify({ type: 'auth_success' }));
        }
        break;
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
      default:
        console.log('Unknown message type:', data.type);
    }
  }
  
  // Send notification to specific user
  sendToUser(userId, notification) {
    const client = this.clients.get(userId);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'notification',
        data: notification
      }));
    }
  }
  
  // Send notification to all connected users
  broadcast(notification) {
    const message = JSON.stringify({
      type: 'notification',
      data: notification
    });
    
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}

module.exports = WebSocketServer;
