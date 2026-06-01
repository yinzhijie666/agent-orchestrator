import { randomUUID } from "node:crypto";
import db from "../lib/db.js";

const threadRouter = {
  async createThread(req) {
    const body = req.json ? await req.json() : {};
    // Note: threads are created automatically when plans are created
    // This endpoint is for manual thread creation if needed
    return new Response(JSON.stringify({ message: 'Threads are auto-created with plans' }), { status: 200 });
  },

  getThread(req, params) {
    const thread = db.getThread(params.id);
    if (!thread) {
      return new Response(JSON.stringify({ error: 'Thread not found' }), { status: 404 });
    }

    const messages = db.getThreadMessages(params.id);
    
    return new Response(JSON.stringify({
      ...thread,
      context_window: JSON.parse(thread.context_window || '{}'),
      layer_states: JSON.parse(thread.layer_states || '{}'),
      messages
    }), { status: 200 });
  },

  async appendMessage(req, params) {
    const body = await req.json();
    const { agent, role, content } = body;

    if (!agent || !role || !content) {
      return new Response(JSON.stringify({ error: 'agent, role, content required' }), { status: 400 });
    }

    const message = db.createMessage({
      thread_id: params.id,
      agent,
      role,
      content
    });

    // Update thread timestamp
    db.db.prepare("UPDATE agent_threads SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), params.id);

    return new Response(JSON.stringify(message), { status: 201 });
  }
};

export default threadRouter;