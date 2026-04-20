const express   = require('express');
const cors      = require('cors');
const Anthropic = require('@anthropic-ai/sdk');

const app    = express();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const MODEL = 'claude-haiku-4-5-20251001';

app.post('/api/analyze', async (req, res) => {
  const { image, systemPrompt } = req.body;
  if (!image || !systemPrompt) {
    return res.status(400).json({ error: 'Missing image or systemPrompt' });
  }

  const params = {
    model: MODEL,
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: systemPrompt },
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } }
      ]
    }]
  };

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) await new Promise(r => setTimeout(r, 3000));
    try {
      const response = await client.messages.create(params);
      const text = response.content[0].text;
      return res.json({
        text,
        usageMetadata: {
          promptTokenCount:     response.usage.input_tokens,
          candidatesTokenCount: response.usage.output_tokens
        },
        model: response.model
      });
    } catch (err) {
      if (err.status === 529) {
        if (attempt === 3) {
          return res.status(529).json({ error: 'Servers are currently busy — wait a few seconds and try again.' });
        }
        continue;
      }
      return res.status(err.status || 500).json({ error: err.message || 'API error' });
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PitchSense server running on port ${PORT}`));
