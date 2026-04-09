import { WebSocketServer, WebSocket } from 'ws';
import { applyOperation, transformOperation, Operation } from './ot';
import { saveSession, getSession } from './db/sessions';

const wss = new WebSocketServer({ port: 8080 });

interface Client {
  ws: WebSocket;
  userId: string;
  sessionId: string;
  revision: number;
}

const sessions = new Map<string, { clients: Client[]; document: string; revision: number }>();

wss.on('connection', (ws, req) => {
  const params = new URLSearchParams(req.url?.split('?')[1]);
  const sessionId = params.get('sessionId') || '';
  const userId = params.get('userId') || '';

  if (!sessionId || !userId) {
    ws.close(1008, 'sessionId and userId required');
    return;
  }

  // Init session if new
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, { clients: [], document: '', revision: 0 });
  }

  const session = sessions.get(sessionId)!;
  const client: Client = { ws, userId, sessionId, revision: session.revision };
  session.clients.push(client);

  // Send current document state to new client
  ws.send(JSON.stringify({
    type: 'init',
    document: session.document,
    revision: session.revision,
  }));

  // Broadcast cursor presence
  broadcast(sessionId, { type: 'user_joined', userId }, ws);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'operation') {
        const { operation, revision } = msg as { operation: Operation; revision: number };

        // Transform operation against any concurrent ops
        let transformedOp = operation;
        for (let r = revision; r < session.revision; r++) {
          // In production, store op history and transform here
          transformedOp = transformOperation(transformedOp, transformedOp);
        }

        // Apply to document
        session.document = applyOperation(session.document, transformedOp);
        session.revision++;
        client.revision = session.revision;

        // Broadcast transformed op to all other clients
        broadcast(sessionId, {
          type: 'operation',
          operation: transformedOp,
          revision: session.revision,
          userId,
        }, ws);

        // Persist session
        saveSession(sessionId, session.document, session.revision);
      }

      if (msg.type === 'cursor') {
        broadcast(sessionId, { type: 'cursor', userId, position: msg.position }, ws);
      }
    } catch (err) {
      console.error('Message parse error:', err);
    }
  });

  ws.on('close', () => {
    session.clients = session.clients.filter(c => c.ws !== ws);
    broadcast(sessionId, { type: 'user_left', userId });
  });
});

function broadcast(sessionId: string, msg: object, exclude?: WebSocket) {
  const session = sessions.get(sessionId);
  if (!session) return;
  const payload = JSON.stringify(msg);
  for (const client of session.clients) {
    if (client.ws !== exclude && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}

console.log('StreamSync WebSocket server running on ws://localhost:8080');
