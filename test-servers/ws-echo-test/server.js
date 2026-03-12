const { WebSocketServer } = require('ws');

const wss = new WebSocketServer({ port: 4001 });

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.send(JSON.stringify({ type: 'welcome', message: 'Connected to HiveFetch test WebSocket server' }));

  ws.on('message', (data) => {
    const text = data.toString();
    console.log('Received:', text);

    // Echo back with metadata
    ws.send(JSON.stringify({
      type: 'echo',
      original: text,
      timestamp: new Date().toISOString(),
      length: text.length,
    }));
  });

  // Send a ping every 5 seconds
  const interval = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'ping', time: new Date().toISOString() }));
    }
  }, 5000);

  ws.on('close', () => {
    clearInterval(interval);
    console.log('Client disconnected');
  });
});

console.log('WebSocket echo server running on ws://localhost:4001');
console.log('');
console.log('Features:');
console.log('  - Sends a welcome message on connect');
console.log('  - Echoes back any message you send with metadata');
console.log('  - Sends a ping every 5 seconds');
