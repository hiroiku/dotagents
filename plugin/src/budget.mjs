// 役が働いた時間を数え、見込みを超えたら 1 回だけ知らせる。止めはしない。
//
// 計測では、作る役を 3 体以上使った仕事が、作業の時間の 1〜4 割を使っていた。見込みを超えた役は、
// 継ぎ足して合わせ続けるより、止まって報告するほうが早い。数えるのを役に任せると、数えない。

import fs from 'node:fs';
import path from 'node:path';
import { home } from './log.mjs';

export const DEFAULT_ROLE_MINUTES = 90;
// これより長く空いた時間は、働いた時間に数えない。続きを頼まれるまで待っていた時間だからである。
const IDLE_MS = 10 * 60 * 1000;
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;

const stateDir = () => path.join(home(), 'state', 'roles');

export function roleMinutes(declaration) {
  const minutes = declaration?.limits?.roleMinutes;
  return Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_ROLE_MINUTES;
}

// 道具の呼び出しのたびに呼ぶ。見込みの倍数を初めて超えたときだけ、知らせる文を返す。
export function tick(agentId, limitMinutes, now = Date.now()) {
  if (!agentId || !/^[\w.-]+$/.test(agentId)) return null;
  const file = path.join(stateDir(), `${agentId}.json`);
  let state = { activeMs: 0, last: now, told: 0 };
  try {
    state = { ...state, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {}
  const gap = now - state.last;
  if (gap > 0 && gap < IDLE_MS) state.activeMs += gap;
  state.last = now;
  const steps = Math.floor(state.activeMs / (limitMinutes * 60000));
  const tell = steps > state.told;
  if (tell) state.told = steps;
  try {
    fs.mkdirSync(stateDir(), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(state));
  } catch {}
  if (!tell) return null;
  return `この役は、働き始めてから ${Math.round(state.activeMs / 60000)} 分たっています(見込みは ${limitMinutes} 分)。見込みを超えているなら、継ぎ足さずにここで止め、分かったことと残りを報告してください。もうすぐ終わるなら、続けて構いません。`;
}

export function prune(now = Date.now()) {
  try {
    for (const name of fs.readdirSync(stateDir())) {
      const file = path.join(stateDir(), name);
      if (now - fs.statSync(file).mtimeMs > KEEP_MS) fs.rmSync(file, { force: true });
    }
  } catch {}
}
