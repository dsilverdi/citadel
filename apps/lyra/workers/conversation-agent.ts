import { Agent } from "agents";
import type { LiveEvent } from "../server/contracts";
import type { Env } from "../server/env";

// D1 owns application records. The Agent only coordinates live delivery.
// publish is Worker RPC, deliberately not decorated as a browser-callable method.
export class ConversationAgent extends Agent<Env> {
  publish(event: LiveEvent) {
    this.broadcast(JSON.stringify(event));
  }
  onRequest() {
    return new Response("Method not allowed", { status: 405 });
  }
}
