// Shared helpers for both functions. Keys are read from Netlify environment variables only.
const MAX_INPUT = 2000;

function json(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function readInput(event) {
  if (event.httpMethod !== 'POST') return { error: json(405, { error: 'POST only' }) };
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { error: json(400, { error: 'Invalid JSON' }) }; }
  const topic = String(body.topic || '').trim();
  const notes = String(body.notes || '').trim();
  if (!topic) return { error: json(400, { error: 'Topic is required' }) };
  if (topic.length > 200 || notes.length > MAX_INPUT) return { error: json(400, { error: 'Input too long' }) };
  return { topic, notes };
}

async function fetchWithTimeout(url, options, ms = 25000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...options, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

// Map upstream HTTP status to a status the app understands
function mapUpstream(status) {
  if (status === 401 || status === 403) return 401;
  if (status === 429) return 429;
  if (status >= 500) return 502;
  return 500;
}

module.exports = { json, readInput, fetchWithTimeout, mapUpstream };
