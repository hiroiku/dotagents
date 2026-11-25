import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { stats } from '../tools/stats.mjs';

test('集計は、記録からプロジェクトごとの回数を出す', () => {
  const previous = process.env.DOTAGENTS_HOME;
  process.env.DOTAGENTS_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-stats-'));
  try {
    const now = new Date('2026-11-20T12:00:00Z');
    fs.mkdirSync(path.join(process.env.DOTAGENTS_HOME, 'log'));
    const entry = (value) => JSON.stringify(value);
    fs.writeFileSync(path.join(process.env.DOTAGENTS_HOME, 'log', '2026-11.jsonl'), [
      entry({ t: '2026-11-19T01:00:00Z', event: 'guard', project: 'p', decision: 'ask', kind: 'push' }),
      entry({ t: '2026-11-19T02:00:00Z', event: 'guard', project: 'p', decision: 'deny', kind: 'pace' }),
      entry({ t: '2026-11-19T02:10:00Z', event: 'guard', project: 'p', decision: 'deny', kind: 'follow' }),
      entry({ t: '2026-11-19T02:20:00Z', event: 'guard', project: 'p', decision: 'deny', kind: 'ci' }),
      entry({ t: '2026-11-19T02:30:00Z', event: 'guard', project: 'p', decision: 'deny', kind: 'ci' }),
      entry({ t: '2026-11-19T03:00:00Z', event: 'context', project: 'p', role: 'lead', chars: 1400 }),
      entry({ t: '2026-11-19T04:00:00Z', event: 'role', project: 'p', role: 'builder', agentType: 'dotagents:builder', model: 'm', seconds: 600, out: 1000, in: 200, cached: 5000, tools: 9 }),
      entry({ t: '2026-11-19T05:00:00Z', event: 'role', project: 'p', role: 'builder', agentType: 'dotagents:builder', model: 'm', seconds: 300, out: 500, in: 100, cached: 4000 }),
      entry({ t: '2026-11-19T06:00:00Z', event: 'role', project: 'p', role: 'worker', agentType: 'Explore' }),
      entry({ t: '2026-11-01T00:00:00Z', event: 'guard', project: 'p', decision: 'ask', kind: 'push' }),
      'broken line',
    ].join('\n'));
    const result = stats({ days: 7, now });
    assert.deepEqual(result.projects.p.asks, { push: 1 });
    assert.deepEqual(result.projects.p.denies, { pace: 1, follow: 1, ci: 2 });
    assert.deepEqual(result.projects.p.contexts.lead, { count: 1, chars: 1400 });
    assert.deepEqual(result.projects.p.roles, { 'dotagents:builder(m)': { count: 2, seconds: 900, out: 1500, in: 300, cached: 9000 }, Explore: { count: 1, seconds: 0, out: 0, in: 0, cached: 0 } });
  } finally {
    if (previous === undefined) delete process.env.DOTAGENTS_HOME;
    else process.env.DOTAGENTS_HOME = previous;
  }
});
