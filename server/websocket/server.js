import broadcaster from "./broadcaster.js";

function setupWebSocket() {
  return {
    async open(ws) {
      ws.data = { subscribedPlans: new Set() };
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