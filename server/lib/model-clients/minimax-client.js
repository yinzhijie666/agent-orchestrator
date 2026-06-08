import ZenClient from "./zen-client.js";

class MiniMaxClient extends ZenClient {
  writeForbidden() {
    throw new Error('MiniMax agent is read-only. Write operations are forbidden.');
  }
}

export default MiniMaxClient;