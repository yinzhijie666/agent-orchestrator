// WebSocket broadcaster for real-time updates
class WebSocketBroadcaster {
  constructor() {
    this.clients = new Set();
  }

  addClient(ws) {
    this.clients.add(ws);
    console.log(`[WS] Client connected. Total: ${this.clients.size}`);
  }

  removeClient(ws) {
    this.clients.delete(ws);
    console.log(`[WS] Client disconnected. Total: ${this.clients.size}`);
  }

  broadcast(type, payload) {
    const message = JSON.stringify({
      type,
      payload,
      timestamp: new Date().toISOString()
    });

    let sent = 0;
    this.clients.forEach(client => {
      if (client.readyState === 1) { // WebSocket.OPEN
        try { client.send(message); sent++; }
        catch (e) { console.warn('[WS] send failed:', e.message); }
      }
    });

    console.log(`[WS] Broadcasted "${type}" to ${sent} clients`);
  }

  sendTo(ws, type, payload) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({
        type,
        payload,
        timestamp: new Date().toISOString()
      }));
    }
  }

  getStats() {
    return {
      connected: this.clients.size,
      timestamp: new Date().toISOString()
    };
  }
}

export default new WebSocketBroadcaster();