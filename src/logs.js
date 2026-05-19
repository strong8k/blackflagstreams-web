/* ═══════════════════════════════════════════════════════
   BFS Logger Worker — Backend Logging Endpoint
   Accepts logs and serves them via /api/logs and /logs.txt
   ═══════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

const MAX_LOG_LINES = 1000;
const LOGS_DIR = '/data/data/com.termux/files/home/projects/bfs1/logs';
const LOGS_FILE = path.join(LOGS_DIR, 'bfs-logs.txt');

let logs = [];

// Initialize logs directory
try {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
} catch (e) {
  console.log('[Logger] Warning: Could not create logs directory:', e.message);
}

// Log rotation function
function rotateLogs() {
  if (logs.length > MAX_LOG_LINES) {
    logs = logs.slice(-MAX_LOG_LINES);
  }
}

// Add a log entry
function addLog(entry) {
  logs.push(entry);
  rotateLogs();
  writeLogsToFile();
  return true;
}

// Write logs to disk
function writeLogsToFile() {
  try {
    const content = logs.join('\n') + '\n';
    fs.writeFileSync(LOGS_FILE, content, 'utf-8');
  } catch (e) {
    console.log('[Logger] Failed to write to disk:', e.message);
  }
}

// Get all logs as text
function getLogs() {
  return logs.join('\n');
}

// Get log count
function getLogCount() {
  return logs.length;
}

// Clear all logs
function clearLogs() {
  logs = [];
  writeLogsToFile();
  return true;
}

// Add log entry from request
function handleLogRequest(req) {
  try {
    const body = req.text();
    if (!body) return new Response('No log data provided', { status: 400 });
    
    const lines = body.trim().split('\n');
    logs.push(...lines);
    rotateLogs();
    writeLogsToFile();
    
    return new Response('OK', { status: 200 });
  } catch (e) {
    return new Response(`Error: ${e.message}`, { status: 500 });
  }
}

// Get logs from request
function handleGetLogs(req) {
  try {
    const content = getLogs();
    return new Response(content, {
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-cache',
        'X-Log-Count': String(logs.length)
      }
    });
  } catch (e) {
    return new Response(`Error: ${e.message}`, { status: 500 });
  }
}

// Handle POST /api/logs
addEventListener('fetch', event => {
  event.respondWith(handleFetch(event.request));
});

async function handleFetch(request) {
  const url = new URL(request.url);
  const method = request.method;

  // POST /api/logs - write logs
  if (method === 'POST' && url.pathname === '/api/logs') {
    return handleLogRequest(request);
  }

  // GET /api/logs - read logs
  if (method === 'GET' && url.pathname === '/api/logs') {
    return handleGetLogs(request);
  }

  // GET /logs.txt - serve logs as text file
  if (method === 'GET' && url.pathname === '/logs.txt') {
    try {
      const content = fs.readFileSync(LOGS_FILE, 'utf-8');
      return new Response(content, {
        headers: {
          'Content-Type': 'text/plain',
          'Cache-Control': 'no-cache'
        }
      });
    } catch (e) {
      return new Response('No logs available yet', { status: 404 });
    }
  }

  // Clear logs endpoint
  if (method === 'POST' && url.pathname === '/api/logs/clear') {
    clearLogs();
    return new Response('Logs cleared', { status: 200 });
  }

  return new Response('Not Found', { status: 404 });
}

console.log('[Logger] Logger worker started');
console.log('[Logger] Logs file:', LOGS_FILE);
console.log('[Logger] Max log lines:', MAX_LOG_LINES);
