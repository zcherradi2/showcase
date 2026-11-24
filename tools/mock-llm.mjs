// tools/mock-llm.mjs
// A tiny OpenAI-compatible server for tests: it answers /v1/models and
// /v1/chat/completions the way the FreeLLMAPI router does, so the "AI decides"
// path can be exercised with no network, no key and no rate limit.
//
//   node tools/mock-llm.mjs 3311
//   PERSONA_LLM_BASE_URL=http://127.0.0.1:3311/v1 dotnet run --project src/Persona.Api

import http from 'node:http';

const port = Number(process.argv[2] ?? 3311);

const ANALYSIS = {
  verdict: 'The Quiet Operator',
  tags: ['Engine', 'Blade', 'Veil'],
  persona:
    'The room reads you as someone who fixes things before anyone notices they were broken, and who does not stay to be thanked for it.',
  ego: 'You describe yourself as warmer than the room does. The gap is not a lie, it is a hope: you want to be received the way you intend, not the way you perform.',
  shadow:
    'The thing you hide from yourself is how much the credit matters. You have built an identity around not needing recognition, which quietly makes recognition impossible to ask for, and then quietly resentful when it does not arrive.',
  experiment:
    'For seven days, when you fix something, say one sentence out loud about it: "I handled that." No apology, no joke to soften it. Watch which day feels worst.',
  question: 'What would you have to admit about yourself if the room turned out to be right about your candor but wrong about your warmth?',
  shadowStrength: 0.7,
};

const server = http.createServer((req, res) => {
  const send = (code, obj) => {
    const body = JSON.stringify(obj);
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(body);
  };

  if (req.url?.startsWith('/v1/models')) {
    return send(200, {
      object: 'list',
      data: [
        { id: 'mock/gemini-2.0-flash', object: 'model', provider: 'mock' },
        { id: 'mock/llama-3.3-70b', object: 'model', provider: 'mock' },
      ],
    });
  }

  if (req.url?.startsWith('/v1/chat/completions')) {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      let model = 'mock/llama-3.3-70b';
      try {
        model = JSON.parse(raw).model || model;
      } catch {
        /* keep the default */
      }
      send(200, {
        id: 'chatcmpl-mock',
        object: 'chat.completion',
        model,
        choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(ANALYSIS) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1200, completion_tokens: 300, total_tokens: 1500 },
      });
    });
    return;
  }

  send(404, { error: 'not found' });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`mock llm on http://127.0.0.1:${port}/v1`);
});
