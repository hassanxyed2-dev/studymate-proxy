// Gemini feature: generate a 5-question multiple-choice quiz as JSON. The Gemini key never leaves the server.
const { json, readInput, fetchWithTimeout, mapUpstream } = require('./_shared');

exports.handler = async (event) => {
  const input = readInput(event);
  if (input.error) return input.error;
  const key = process.env.GEMINI_API_KEY;
  if (!key) return json(500, { error: 'GEMINI_API_KEY not configured on server' });
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  const prompt = `Create a 5-question multiple-choice quiz about "${input.topic}"` +
    (input.notes ? ` based mainly on these notes:\n${input.notes}\n` : '. ') +
    `Return ONLY JSON with this exact shape and no markdown:\n` +
    `{"questions":[{"question":"...","options":["A","B","C","D"],"answerIndex":0,"explanation":"..."}]}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, responseMimeType: 'application/json' }
      })
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error('Gemini error', res.status, txt.slice(0, 200));
      return json(mapUpstream(res.status), { error: 'Gemini request failed', upstreamStatus: res.status });
    }
    const data = await res.json();
    let raw = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text) || '';
    raw = raw.replace(/```json|```/g, '').trim();
    let parsed;
    try { parsed = JSON.parse(raw); } catch { return json(502, { error: 'Gemini returned an unreadable quiz. Try again.' }); }
    const questions = (parsed.questions || []).filter(q => q.question && Array.isArray(q.options) && q.options.length >= 2).slice(0, 5);
    if (!questions.length) return json(502, { error: 'Gemini returned no questions. Try again.' });
    return json(200, { provider: 'Gemini', model, questions });
  } catch (e) {
    const timeout = e.name === 'AbortError';
    return json(timeout ? 504 : 500, { error: timeout ? 'Gemini request timed out' : 'Server error' });
  }
};
