const http = require('http');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const PORT = process.env.PORT || 4000;
const STORE_PATH = path.join(__dirname, 'data', 'store.json');
const AI_PROVIDER = (process.env.AI_PROVIDER || 'claude').toLowerCase();
const MAX_ANALYZE_TAGS = 5;
const MAX_RELATED_NOTES = 5;

function ensureStore() {
  if (!fs.existsSync(STORE_PATH)) {
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    const initialStore = {
      notes: [],
      links: [],
      tags: [],
      analyses: [],
      brand: {
        revolverWheel: {
          style: 'ring + central action',
          defaultActions: ['paragraph', 'heading', 'quote', 'code', 'bullet', 'numbered', 'todo', 'nested-todo'],
        },
      },
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(STORE_PATH, JSON.stringify(initialStore, null, 2));
  }
}

function readStore() {
  ensureStore();
  return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
}

function writeStore(nextStore) {
  const payload = {
    ...nextStore,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(STORE_PATH, JSON.stringify(payload, null, 2));
  return payload;
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(body));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });

    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error('Invalid JSON body.'));
      }
    });

    req.on('error', reject);
  });
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function getNoteText(note) {
  const blockText = (note.blocks || []).map((block) => block.text || '').join(' ');
  return `${note.title || ''} ${blockText} ${(note.tags || []).join(' ')}`.trim();
}

function normalizeNoteInput(input = {}) {
  const now = new Date().toISOString();
  const tags = Array.isArray(input.tags)
    ? uniqueSorted(input.tags.map((tag) => String(tag || '').trim().toLowerCase()))
    : [];

  return {
    title: (input.title || 'Untitled note').trim(),
    blocks: Array.isArray(input.blocks) ? input.blocks : [],
    tags,
    metadata: {
      ...(input.metadata || {}),
      editedAt: now,
    },
  };
}

function withNotFound(res, resource = 'Resource') {
  sendJson(res, 404, { error: `${resource} not found.` });
}

function scoreRelatedNotes(targetNote, notes) {
  const targetTokens = tokenize(getNoteText(targetNote));
  const targetSet = new Set(targetTokens);

  return notes
    .filter((note) => note.id !== targetNote.id)
    .map((note) => {
      const noteTokens = tokenize(getNoteText(note));
      const overlap = noteTokens.filter((token) => targetSet.has(token));
      const exactTitleMatch = note.title.toLowerCase() === targetNote.title.toLowerCase() ? 2 : 0;
      const sharedTags = (note.tags || []).filter((tag) => (targetNote.tags || []).includes(tag)).length;
      const score = overlap.length + exactTitleMatch + sharedTags;

      return {
        id: note.id,
        title: note.title,
        score,
        reasons: uniqueSorted([...overlap.slice(0, 6), ...((note.tags || []).filter((tag) => (targetNote.tags || []).includes(tag)))]),
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RELATED_NOTES);
}

function extractTagCandidates(note, allNotes) {
  const tokens = tokenize(getNoteText(note));
  const counts = new Map();

  tokens.forEach((token) => {
    counts.set(token, (counts.get(token) || 0) + 1);
  });

  const globalTags = allNotes.flatMap((entry) => entry.tags || []);
  globalTags.forEach((tag) => {
    const normalized = String(tag).toLowerCase();
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  });

  const candidates = [...counts.entries()]
    .filter(([token]) => token.length >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([token]) => token)
    .filter((token) => !(note.tags || []).includes(token))
    .slice(0, MAX_ANALYZE_TAGS);

  return candidates;
}

async function providerSuggest({ note, allNotes }) {
  const related = scoreRelatedNotes(note, allNotes);
  const tags = extractTagCandidates(note, allNotes);

  if (AI_PROVIDER === 'gemini') {
    return {
      provider: 'gemini',
      suggestedTags: tags,
      relatedNotes: related,
      mode: 'context-driven-local-heuristic',
    };
  }

  return {
    provider: 'claude',
    suggestedTags: tags,
    relatedNotes: related,
    mode: 'context-driven-local-heuristic',
  };
}

function upsertAnalysis(store, analysis) {
  const existingIndex = (store.analyses || []).findIndex((entry) => entry.noteId === analysis.noteId);
  if (existingIndex >= 0) {
    store.analyses[existingIndex] = analysis;
    return;
  }

  if (!Array.isArray(store.analyses)) {
    store.analyses = [];
  }

  store.analyses.push(analysis);
}

function buildGraph(store) {
  const noteNodes = store.notes.map((note) => ({
    id: note.id,
    label: note.title,
    type: 'note',
    tags: note.tags || [],
    updatedAt: note.updatedAt,
  }));

  const tagNodes = uniqueSorted(store.tags || []).map((tag) => ({
    id: `tag:${tag}`,
    label: tag,
    type: 'tag',
  }));

  const noteLinkEdges = (store.links || []).map((link) => ({
    id: link.id,
    source: link.sourceId,
    target: link.targetId,
    type: link.type || 'manual-link',
  }));

  const tagEdges = store.notes.flatMap((note) =>
    (note.tags || []).map((tag) => ({
      id: `edge:${note.id}:tag:${tag}`,
      source: note.id,
      target: `tag:${tag}`,
      type: 'tag-relationship',
    })),
  );

  const aiEdges = (store.analyses || []).flatMap((analysis) =>
    (analysis.relatedNotes || []).map((related) => ({
      id: `edge:ai:${analysis.noteId}:${related.id}`,
      source: analysis.noteId,
      target: related.id,
      type: 'ai-related',
      score: related.score,
    })),
  );

  return {
    nodes: [...noteNodes, ...tagNodes],
    edges: [...noteLinkEdges, ...tagEdges, ...aiEdges],
  };
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, 400, { error: 'Bad request.' });
    return;
  }

  const [pathname, query] = req.url.split('?');

  if (req.method === 'OPTIONS') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === '/health' && req.method === 'GET') {
    sendJson(res, 200, { status: 'ok', aiProvider: AI_PROVIDER });
    return;
  }

  if (pathname === '/store' && req.method === 'GET') {
    sendJson(res, 200, readStore());
    return;
  }

  if (pathname === '/brand' && req.method === 'GET') {
    const store = readStore();
    sendJson(res, 200, {
      productKey: 'revolver-wheel',
      wheel: store.brand?.revolverWheel || null,
      guidance: {
        visual: 'High contrast dark base, warm accent, restrained typography, radial interaction as hero pattern.',
      },
    });
    return;
  }

  if (pathname === '/search' && req.method === 'GET') {
    const params = new URLSearchParams(query || '');
    const q = (params.get('q') || '').toLowerCase().trim();

    if (!q) {
      sendJson(res, 400, { error: 'Query parameter "q" is required.' });
      return;
    }

    const store = readStore();
    const exactMatches = [];
    const contextMatches = [];

    store.notes.forEach((note) => {
      const title = (note.title || '').toLowerCase();
      const haystack = getNoteText(note).toLowerCase();
      if (title === q) {
        exactMatches.push(note);
      } else if (haystack.includes(q)) {
        contextMatches.push(note);
      }
    });

    sendJson(res, 200, {
      exactMatches,
      contextMatches,
      total: exactMatches.length + contextMatches.length,
    });
    return;
  }

  if (pathname === '/notes' && req.method === 'GET') {
    const store = readStore();
    const notes = [...store.notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    sendJson(res, 200, { notes });
    return;
  }

  if (pathname === '/notes' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const input = normalizeNoteInput(body);
      const now = new Date().toISOString();

      const note = {
        id: randomUUID(),
        ...input,
        createdAt: now,
        updatedAt: now,
      };

      const store = readStore();
      store.notes.push(note);
      store.tags = uniqueSorted([...store.tags, ...note.tags]);
      writeStore(store);

      sendJson(res, 201, { note });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }

    return;
  }

  const noteIdMatch = pathname.match(/^\/notes\/([^/]+)$/);
  if (noteIdMatch) {
    const noteId = noteIdMatch[1];
    const store = readStore();
    const noteIndex = store.notes.findIndex((note) => note.id === noteId);

    if (noteIndex === -1) {
      withNotFound(res, 'Note');
      return;
    }

    if (req.method === 'GET') {
      sendJson(res, 200, { note: store.notes[noteIndex] });
      return;
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      try {
        const body = await parseBody(req);
        const input = normalizeNoteInput({
          ...store.notes[noteIndex],
          ...body,
          metadata: {
            ...(store.notes[noteIndex].metadata || {}),
            ...(body.metadata || {}),
          },
        });

        const updated = {
          ...store.notes[noteIndex],
          ...input,
          updatedAt: new Date().toISOString(),
        };

        store.notes[noteIndex] = updated;
        store.tags = uniqueSorted(store.notes.flatMap((note) => note.tags || []));
        writeStore(store);
        sendJson(res, 200, { note: updated });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }

      return;
    }

    if (req.method === 'DELETE') {
      const [deleted] = store.notes.splice(noteIndex, 1);
      store.links = store.links.filter((link) => link.sourceId !== deleted.id && link.targetId !== deleted.id);
      store.analyses = (store.analyses || []).filter((analysis) => analysis.noteId !== deleted.id);
      store.tags = uniqueSorted(store.notes.flatMap((note) => note.tags || []));
      writeStore(store);
      sendJson(res, 200, { deletedId: deleted.id });
      return;
    }
  }

  if (pathname === '/links' && req.method === 'GET') {
    const store = readStore();
    sendJson(res, 200, { links: store.links || [] });
    return;
  }

  if (pathname === '/links' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const { sourceId, targetId, type = 'manual' } = body;

      if (!sourceId || !targetId) {
        sendJson(res, 400, { error: 'sourceId and targetId are required.' });
        return;
      }

      const store = readStore();
      const sourceExists = store.notes.some((note) => note.id === sourceId);
      const targetExists = store.notes.some((note) => note.id === targetId);

      if (!sourceExists || !targetExists) {
        sendJson(res, 400, { error: 'Both notes must exist before creating a link.' });
        return;
      }

      const duplicate = store.links.some((link) => link.sourceId === sourceId && link.targetId === targetId);
      if (duplicate) {
        sendJson(res, 409, { error: 'Link already exists.' });
        return;
      }

      const link = {
        id: randomUUID(),
        sourceId,
        targetId,
        type,
        createdAt: new Date().toISOString(),
      };

      store.links.push(link);
      writeStore(store);
      sendJson(res, 201, { link });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }

    return;
  }

  if (pathname === '/graph' && req.method === 'GET') {
    const store = readStore();
    sendJson(res, 200, buildGraph(store));
    return;
  }

  const analyzeMatch = pathname.match(/^\/analyze\/([^/]+)$/);
  if (analyzeMatch && req.method === 'POST') {
    const noteId = analyzeMatch[1];
    const store = readStore();
    const note = store.notes.find((entry) => entry.id === noteId);

    if (!note) {
      withNotFound(res, 'Note');
      return;
    }

    const suggestions = await providerSuggest({ note, allNotes: store.notes });
    const analysis = {
      id: randomUUID(),
      noteId,
      provider: suggestions.provider,
      suggestedTags: suggestions.suggestedTags,
      relatedNotes: suggestions.relatedNotes,
      mode: suggestions.mode,
      status: 'completed',
      createdAt: new Date().toISOString(),
    };

    upsertAnalysis(store, analysis);
    writeStore(store);

    sendJson(res, 200, { analysis });
    return;
  }

  sendJson(res, 404, { error: 'Endpoint not found.' });
});

ensureStore();
server.listen(PORT, () => {
  console.log(`Revolver local backend listening on http://localhost:${PORT} (AI provider: ${AI_PROVIDER})`);
});
