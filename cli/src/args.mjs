// コマンドラインの引数を読む。誤りは UsageError で投げる。
//
// init の指定(どれも省ける。指定した質問は尋ねない):
//   --yes, -y               指定の無い質問は、すべて既定で答える
//   --hosts claude,codex    入れるホスト(none で入れない)
//   --git trunk             git のスタイル(none で選ばない)
//   --architecture layered  アーキテクチャのスタイル(none で選ばない)
//   --scope project         plugin を入れる範囲(user、none で入れない)
//   --check push="npm run check"  チェックの段階ごとの入口(空にするなら push=)

import { HOSTS, SCOPES, STAGES, STYLES } from './target.mjs';

export class UsageError extends Error {
  name = 'UsageError';
}

const VALUED = new Set(['--hosts', '--git', '--architecture', '--scope', '--check']);

function pick(flag, value, allowed) {
  if (value === 'none') return null;
  if (!allowed.includes(value)) throw new UsageError(`${flag} に ${value} は指定できません。指定できる値: ${allowed.join('、')}、none`);
  return value;
}

export function parseArgs(argv) {
  const result = { command: null, help: false, version: false, yes: false, checks: {} };
  const rest = [];
  for (let at = 0; at < argv.length; at += 1) {
    const [flag, ...inline] = argv[at].startsWith('--') ? argv[at].split('=') : [argv[at]];
    let value = inline.length ? inline.join('=') : undefined;
    if (flag === '--help' || flag === '-h') result.help = true;
    else if (flag === '--version' || flag === '-v') result.version = true;
    else if (flag === '--yes' || flag === '-y') result.yes = true;
    else if (VALUED.has(flag)) {
      if (value === undefined) {
        value = argv[at + 1];
        at += 1;
      }
      if (value === undefined) throw new UsageError(`${flag} に値を指定してください。`);
      if (flag === '--hosts') {
        const names = value === 'none' ? [] : value.split(',').map((name) => name.trim()).filter(Boolean);
        for (const name of names) if (!HOSTS.includes(name)) throw new UsageError(`--hosts に ${name} は指定できません。指定できる値: ${HOSTS.join('、')}、none`);
        result.hosts = [...new Set(names)];
      } else if (flag === '--git' || flag === '--architecture') result[flag.slice(2)] = pick(flag, value, STYLES[flag.slice(2)]);
      else if (flag === '--scope') result.scope = pick(flag, value, SCOPES);
      else {
        const split = value.indexOf('=');
        const stage = split < 0 ? value : value.slice(0, split);
        if (split < 0 || !STAGES.includes(stage)) throw new UsageError(`--check は 段階=コマンド の形で指定してください。段階は ${STAGES.join('、')} のいずれかです(例: --check push="npm run check")。`);
        result.checks[stage] = value.slice(split + 1).trim();
      }
    } else if (flag.startsWith('-')) throw new UsageError(`${flag} は不明なオプションです。`);
    else rest.push(flag);
  }
  if (rest.length > 1) throw new UsageError(`余分な引数があります: ${rest.slice(1).join(' ')}`);
  result.command = rest[0] ?? null;
  return result;
}

// 質問の指定が 1 つでもあるか。
export const specifies = (options) => options.hosts !== undefined || options.git !== undefined || options.architecture !== undefined || options.scope !== undefined || Object.keys(options.checks).length > 0;
