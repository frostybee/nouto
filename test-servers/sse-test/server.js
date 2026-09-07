import express from 'express';

const app = express();
const PORT = 4002;

app.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  let counter = 0;
  const interval = setInterval(() => {
    counter++;
    res.write(`id: ${counter}\n`);
    res.write(`event: counter\n`);
    res.write(`data: ${JSON.stringify({ count: counter, time: new Date().toISOString() })}\n\n`);
  }, 1000);

  req.on('close', () => {
    clearInterval(interval);
    console.log('Client disconnected');
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`SSE test server running on http://localhost:${PORT}`);
  console.log('');
  console.log('Endpoints:');
  console.log('  GET /events  - SSE stream (counter event every second)');
  console.log('  GET /health  - Health check');
});
