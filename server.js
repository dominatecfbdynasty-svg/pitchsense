const express = require('express');
const cors    = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PRIMARY_MODEL  = 'gemini-2.5-flash';
const FALLBACK_MODEL = 'gemini-2.5-flash-lite';

async function callGemini(model, payload) {
  const apiKey = process.env.GEMINI_API_KEY;
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify(payload)
    }
  );
}

app.post('/api/analyze', async (req, res) => {
  const { image, systemPrompt } = req.body;
  if (!image || !systemPrompt) {
    return res.status(400).json({ error: 'Missing image or systemPrompt' });
  }

  const payload = {
    contents: [{
      role:  'user',
      parts: [
        { text: systemPrompt },
        { inlineData: { mimeType: 'image/jpeg', data: image } }
      ]
    }]
  };

  let response;
  let usedModel = PRIMARY_MODEL;

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) await new Promise(r => setTimeout(r, 3000));
    response = await callGemini(PRIMARY_MODEL, payload);
    if (response.ok) break;
    if (response.status !== 503) {
      const err = await response.json();
      return res.status(response.status).json({ error: err.error?.message || 'API error' });
    }
    if (attempt === 3) {
      response = await callGemini(FALLBACK_MODEL, payload);
      usedModel = FALLBACK_MODEL;
      if (!response.ok) {
        if (response.status === 503) {
          return res.status(503).json({ error: 'Servers are currently busy — wait a few seconds and try again.' });
        }
        const err = await response.json();
        return res.status(response.status).json({ error: err.error?.message || 'API error' });
      }
    }
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return res.status(500).json({ error: 'Empty response from Gemini' });

  res.json({
    text,
    usageMetadata: data.usageMetadata || {},
    model: usedModel
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PitchSense server running on port ${PORT}`));
