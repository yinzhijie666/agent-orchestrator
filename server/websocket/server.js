import broadcaster from "./broadcaster.js";

const HEARTBEAT_INTERVAL = 30000; // 30s

function setupWebSocket() {
  // Server-side heartbeat
  const heartbeatTimer = setInterval(() => {
    const now = Date.now();
    for (const client of broadcaster.clients) {
      if (client.readyState === 1) { // OPEN
        if (client.data.lastPong && now - client.data.lastPong > HEARTBEAT_INTERVAL * 2) {
          client.close();
          broadcaster.removeClient(client);
        } else {
          broadcaster.sendTo(client, 'ping', { timestamp: now });
        }
      }
    }
  }, HEARTBEAT_INTERVAL);

  return {
    async open(ws) {
      ws.data = { subscribedPlans: new Set(), lastPong: Date.now() };
      broadcaster.addClient(ws);
      broadcaster.sendTo(ws, 'connected', { message: 'Welcome to Agent Orchestrator' });
    },

    async message(ws, message) {
      try {
        const data = JSON.parse(message);

        switch(data.type) {
          case 'subscribe':
            if (data.plan_id) {
              ws.data.subscribedPlans.add(data.plan_id);
              broadcaster.sendTo(ws, 'subscribed', { plan_id: data.plan_id });
            }
            break;
          case 'unsubscribe':
            if (data.plan_id) {
              ws.data.subscribedPlans.delete(data.plan_id);
            }
            break;
          case 'pong':
            ws.data.lastPong = Date.now();
            break;
          case 'ping':
            broadcaster.sendTo(ws, 'pong', { timestamp: Date.now() });
            break;
          default:
            console.log(`[WS] Unknown message type: ${data.type}`);
        }
      } catch (err) {
        console.error('[WS] Message parse error:', err);
      }
    },

    async close(ws) {
      broadcaster.removeClient(ws);
    }
  };
}

export { setupWebSocket, broadcaster };