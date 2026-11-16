// [ACADEMIC THEME 2: EVENT-DRIVEN PROGRAMMING]
// Architecture: Handlers / Observer Pattern ("Hollywood Principle: Don't call us; we'll call you")
//               via Typed In-Process Pub/Sub EventBus & Server-Sent Events (SSE).
// - OBJECTS AS EVENTS & DISPATCHING: Events carry structured typed payloads ('leaderboard.changed',
//   'game.finalized') dispatched asynchronously to registered observer callbacks (Handlers Pattern).
// - OBSERVER FAULT ISOLATION: Each listener execution is wrapped in an isolated try/catch and
//   Promise boundary. If an observer fails or rejects, it CANNOT crash the publishing transaction.
// - REAL-TIME REACTIVE PIPELINE: Rather than observers polling the subject, 'leaderboard.changed'
//   pushes updates through HTTP Server-Sent Events (GET /api/leaderboard/stream) to React clients.
// - ALTERNATIVE APPROACHES CONSIDERED & CRITIQUED:
//   * Polling (Client timers hitting GET /leaderboard every 2 seconds):
//     Critique: Massive CPU/bandwidth waste on redundant HTTP handshakes and database queries; high latency.
//   * WebSockets (Full Duplex):
//     Critique: Introduces connection state complexity, custom ping/pong protocols, and firewall traversal friction;
//     unnecessary for unidirectional leaderboard updates.
//   * Direct Synchronous Method Invocations:
//     Critique: Causes tight coupling between GameService and Notification/Stream infrastructure.
type Events = {
  'leaderboard.changed': { reason: string };
  'game.finalized': { id: string; mode: string };
};
export class EventBus {
  private listeners = new Map<keyof Events, Set<(payload: never) => unknown>>();
  on<K extends keyof Events>(type: K, handler: (payload: Events[K]) => unknown) {
    const handlers = this.listeners.get(type) ?? new Set();
    handlers.add(handler as (payload: never) => unknown);
    this.listeners.set(type, handlers);
    return () => {
      handlers.delete(handler as (payload: never) => unknown);
    };
  }
  emit<K extends keyof Events>(type: K, payload: Events[K]) {
    // [THEME: EVENT-DRIVEN] Isolate each optional observer, including async rejection.
    for (const handler of this.listeners.get(type) ?? []) {
      try {
        Promise.resolve(handler(payload as never)).catch(() =>
          console.error(`Observer rejected: ${type}`),
        );
      } catch {
        console.error(`Observer failed: ${type}`);
      }
    }
  }
}
