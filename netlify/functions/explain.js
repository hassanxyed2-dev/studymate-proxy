// ChatGPT feature: explain a topic simply. The OpenAI key never leaves the server.
const { json, readInput, fetchWithTimeout, mapUpstream } = require('./_shared');

exports.handler = async (event) => {
  const input = readInput(event);
  if (input.error) return input.error;
  const key = process.env.OPENAI_API_KEY;
  if (!key) return json(500, { error: 'OPENAI_API_KEY not configured on server' });
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const prompt = `Explain the topic "${input.topic}" to a university student in simple language. ` +
    `Use short paragraphs and, where helpful, a numbered list of key points. Keep it under 250 words.` +
    (input.notes ? `\n\nStudent's own notes for context:\n${input.notes}` : '');

  try {
    const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are a patient study tutor. Be accurate and concise.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.4,
        max_tokens: 600
      })
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error('OpenAI error', res.status, txt.slice(0, 200));
      return json(mapUpstream(res.status), { error: 'ChatGPT request failed', upstreamStatus: res.status });
    }
    const data = await res.json();
    const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '').trim();
    return json(200, { provider: 'ChatGPT', model, text });
  } catch (e) {
    const timeout = e.name === 'AbortError';
    return json(timeout ? 504 : 500, { error: timeout ? 'ChatGPT request timed out' : 'Server error' });
  }
};
