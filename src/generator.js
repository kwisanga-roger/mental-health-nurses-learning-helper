// Question generation: built-in offline generator + optional AI provider.

const STOPWORDS = new Set(('a an the and or but if then else of to in on at for with without into onto from by as is are was were be been being this that these those it its their there here we you they he she i me my your our not no yes do does did can could should would will shall may might must have has had which who whom whose what when where why how than too very just also about above below over under again further once more most other some such only own same so etc eg ie').split(/\s+/));

function sentences(text) {
  return String(text)
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 25 && s.length < 320);
}

function keywords(text) {
  const counts = new Map();
  const words = String(text).toLowerCase().match(/[a-z][a-z'-]{2,}/g) || [];
  for (const w of words) {
    if (STOPWORDS.has(w)) continue;
    counts.set(w, (counts.get(w) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w);
}

function keyTermInSentence(sentence) {
  const words = sentence.match(/[A-Za-z][A-Za-z'-]{3,}/g) || [];
  const candidates = words
    .filter(w => !STOPWORDS.has(w.toLowerCase()))
    .sort((a, b) => b.length - a.length);
  return candidates[0] || null;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function extractDefinitions(text) {
  const out = [];
  const seen = new Set();
  for (const s of sentences(text)) {
    const m = s.match(/^([A-Z][A-Za-z][A-Za-z '\-]{1,40}?)\s+(?:is|are|means|refers to|is defined as|is the)\s+(.{10,120})$/);
    if (!m) continue;
    const term = m[1].trim().replace(/[.,;:]$/, '');
    let def = m[2].trim().replace(/[.,;:]$/, '');
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    if (def.length > 90) def = def.slice(0, 87).trim() + '…';
    seen.add(key);
    out.push([term, def]);
  }
  return out;
}

export function builtinGenerate(notes, count = 8) {
  const sents = sentences(notes);
  const topWords = keywords(notes);
  const questions = [];

  if (sents.length === 0) {
    return [{
      type: 'short',
      prompt: 'Your notes were quite short. Summarize the main idea of the material in your own words.',
      answer: '(open response)',
    }];
  }

  const usedSentences = new Set();
  const distractorPool = topWords.slice(0, 40);
  const mcqCap = Math.max(1, Math.ceil(count * 0.4));

  for (const sentence of shuffle(sents)) {
    if (questions.length >= mcqCap) break;
    if (usedSentences.has(sentence)) continue;
    const term = keyTermInSentence(sentence);
    if (!term) continue;
    const answer = term;
    const distractors = shuffle(
      distractorPool.filter(w => w.toLowerCase() !== answer.toLowerCase() && Math.abs(w.length - answer.length) <= 4)
    ).slice(0, 3);
    if (distractors.length < 3) continue;
    const prompt = sentence.replace(new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`), '_____');
    const options = shuffle([answer, ...distractors]);
    questions.push({ type: 'mcq', prompt: `Fill in the blank: ${prompt}`, options, answer });
    usedSentences.add(sentence);
  }

  const tfCap = Math.min(count, mcqCap + Math.max(1, Math.floor(count * 0.25)));
  for (const sentence of shuffle(sents)) {
    if (questions.length >= tfCap) break;
    if (usedSentences.has(sentence)) continue;
    const makeFalse = Math.random() < 0.5;
    let statement = sentence;
    let answer = 'True';
    if (makeFalse) {
      const term = keyTermInSentence(sentence);
      const swap = topWords.find(w => w.toLowerCase() !== (term || '').toLowerCase());
      if (term && swap) {
        statement = sentence.replace(new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`), swap);
        answer = 'False';
      }
    }
    questions.push({ type: 'truefalse', prompt: `True or False: ${statement}`, options: ['True', 'False'], answer });
    usedSentences.add(sentence);
  }

  if (questions.length < count) {
    const pairs = extractDefinitions(notes).slice(0, 4);
    if (pairs.length >= 3) {
      const answer = {};
      pairs.forEach(([term, def]) => { answer[term] = def; });
      questions.push({
        type: 'matching',
        prompt: 'Match each term to its correct description.',
        options: [],
        left: pairs.map(p => p[0]),
        choices: shuffle(pairs.map(p => p[1])),
        answer,
      });
    }
  }

  if (questions.length < count) {
    const shorten = s => s.length > 90 ? s.slice(0, 87).trim() + '…' : s;
    const seqRe = /\b(first(ly)?|second(ly)?|third(ly)?|then|next|after|finally|lastly|step\s*\d+|stage\s*\d+)\b/i;
    let seq = sents.filter(s => seqRe.test(s));
    if (seq.length < 3) seq = sents.slice(0, 4);
    const ordered = seq.slice(0, 4).map(shorten);
    if (ordered.length >= 3 && new Set(ordered).size === ordered.length) {
      let items = shuffle(ordered.slice());
      if (JSON.stringify(items) === JSON.stringify(ordered)) items = ordered.slice().reverse();
      questions.push({
        type: 'ordering',
        prompt: 'Arrange these points in the order they appear in the material.',
        options: [],
        items,
        answer: ordered.slice(),
      });
    }
  }

  for (const w of topWords) {
    if (questions.length >= count) break;
    questions.push({
      type: 'short',
      prompt: `In your own words, explain the significance of "${w}" based on the material.`,
      answer: '(open response — compare against your notes)',
    });
  }

  return questions.slice(0, count);
}

function buildPrompt(notes, count) {
  return `You are an assignment generator for a study platform. Based ONLY on the following study notes, create ${count} varied assignment questions using a mix of these types: multiple-choice, true/false, matching, ordering, and short-answer.

Return STRICT JSON: an array of objects. Each object has a "type" and the fields for that type:
- type "mcq": "prompt", "options" (4 strings), "answer" (the correct option string)
- type "truefalse": "prompt", "options" ["True","False"], "answer" ("True" or "False")
- type "short": "prompt", "answer" (a brief model answer)
- type "matching": "prompt", "answer" (an object mapping each term to its correct description, 3-4 pairs)
- type "ordering": "prompt", "answer" (an array of 3-5 items in the correct order)

Study notes:
"""
${notes.slice(0, 8000)}
"""

Respond with ONLY the JSON array, no markdown fences.`;
}

async function generateWithOpenAI(notes, count) {
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.AI_MODEL || 'gpt-4o-mini';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: buildPrompt(notes, count) }], temperature: 0.4 }),
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
  const data = await res.json();
  return parseQuestions(data?.choices?.[0]?.message?.content || '');
}

async function generateWithGemini(notes, count) {
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.AI_MODEL || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: buildPrompt(notes, count) }] }] }),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const data = await res.json();
  return parseQuestions(data?.candidates?.[0]?.content?.parts?.[0]?.text || '');
}

function parseQuestions(text) {
  let clean = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = clean.indexOf('[');
  const end = clean.lastIndexOf(']');
  if (start !== -1 && end !== -1) clean = clean.slice(start, end + 1);
  const arr = JSON.parse(clean);
  if (!Array.isArray(arr)) throw new Error('AI did not return an array');
  return arr.map(q => {
    const type = ['mcq', 'truefalse', 'short', 'matching', 'ordering'].includes(q.type) ? q.type : 'short';
    const base = { type, prompt: String(q.prompt || '').trim(), options: Array.isArray(q.options) ? q.options.map(String) : [] };
    if (type === 'matching' && q.answer && typeof q.answer === 'object' && !Array.isArray(q.answer)) {
      const answer = {};
      for (const [k, v] of Object.entries(q.answer)) answer[String(k)] = String(v);
      base.answer = answer;
      base.left = Object.keys(answer);
      base.choices = shuffle(Object.values(answer));
    } else if (type === 'ordering' && Array.isArray(q.answer)) {
      const answer = q.answer.map(String);
      base.answer = answer;
      base.items = shuffle(answer.slice());
    } else {
      base.answer = String(q.answer ?? '').trim();
    }
    return base;
  }).filter(q => q.prompt && !(q.type === 'matching' && (!q.left || q.left.length < 2))
                          && !(q.type === 'ordering' && (!q.items || q.items.length < 2)));
}

export function aiConfigured() {
  const provider = (process.env.AI_PROVIDER || '').toLowerCase();
  if (provider === 'openai') return !!process.env.OPENAI_API_KEY;
  if (provider === 'gemini') return !!process.env.GEMINI_API_KEY;
  return false;
}

export async function generateAssignment(notes, count = 8) {
  const provider = (process.env.AI_PROVIDER || '').toLowerCase();
  if (aiConfigured()) {
    try {
      const questions = provider === 'gemini'
        ? await generateWithGemini(notes, count)
        : await generateWithOpenAI(notes, count);
      if (questions.length > 0) return { generator: 'ai', questions };
    } catch (err) {
      console.warn(`AI generation failed (${err.message}); using built-in generator.`);
    }
  }
  return { generator: 'builtin', questions: builtinGenerate(notes, count) };
}
