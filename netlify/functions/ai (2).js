// StudyMate secure proxy. Keys never leave this server.
// POST /.netlify/functions/ai  { "provider": "openai" | "gemini", "task": "explain" | "quiz", "topic": "..." }
// Env vars (Netlify site settings): OPENAI_API_KEY, GEMINI_API_KEY, optional OPENAI_MODEL, GEMINI_MODEL

const MAX_TOPIC = 200;

const PROMPTS = {
  explain: (topic) =>
    `You are a friendly tutor for a university student in Pakistan. Explain the topic "${topic}" in simple English in about 150 words: what it is, why it matters, and one everyday example. Use short paragraphs. Do not add a title.`,
  quiz: (topic) =>
    `Create a 5-question multiple-choice quiz about "${topic}" for a university student. For each question give options A-D on separate lines, then the line "Answer: <letter>" and a one-sentence reason. Number the questions 1-5. Plain text only, no markdown.`
};

const json = (status, body) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body)
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST' });

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

  const { provider, task, topic } = payload;
  if (!['openai', 'gemini'].includes(provider)) return json(400, { error: 'provider must be openai or gemini' });
  if (!PROMPTS[task]) return json(400, { error: 'task must be explain or quiz' });
  if (typeof topic !== 'string' || topic.trim().length < 3) return json(400, { error: 'topic too short' });
  if (topic.length > MAX_TOPIC) return json(400, { error: `topic longer than ${MAX_TOPIC} characters` });

  const prompt = PROMPTS[task](topic.trim());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);

  try {
    let text, model;
    if (provider === 'openai') {
      const key = process.env.OPENAI_API_KEY;
      if (!key) return json(500, { error: 'OPENAI_API_KEY not configured' });
      model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 600, temperature: 0.7 }),
        signal: controller.signal
      });
      const data = await r.json();
      if (!r.ok) return json(r.status, { error: data.error?.message || `OpenAI error ${r.status}` });
      text = data.choices?.[0]?.message?.content?.trim();
    } else {
      const key = process.env.GEMINI_API_KEY;
      if (!key) return json(500, { error: 'GEMINI_API_KEY not configured' });
      model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 800, temperature: 0.7 } }),
        signal: controller.signal
      });
      const data = await r.json();
      if (!r.ok) return json(r.status, { error: data.error?.message || `Gemini error ${r.status}` });
      text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('').trim();
    }
    if (!text) return json(502, { error: 'Empty response from provider' });
    return json(200, { provider, model, task, text });
  } catch (e) {
    if (e.name === 'AbortError') return json(504, { error: 'Provider timed out' });
    return json(502, { error: 'Could not reach provider' });
  } finally {
    clearTimeout(timer);
  }
};
