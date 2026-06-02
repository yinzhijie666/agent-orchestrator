import broadcaster from "../websocket/broadcaster.js";

const internalEventRouter = {
  async handleEvent(req) {
    try {
      const { type, payload } = await req.json();
      if (!type) {
        return new Response(JSON.stringify({ error: 'type required' }), { status: 400 });
      }
      broadcaster.broadcast(type, payload || {});
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 400 });
    }
  }
};

export default internalEventRouter;
