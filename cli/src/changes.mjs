// 答えから、プロジェクトに入れる変更を組み立てる。書く項目はこの道具のものだけで、ほかの項目と字は変えない。
// 読めない設定が 1 つでもあれば、ここで投げる。何も書かないうちに止まる。
//
// ホストごとの違い(0.172.0 の Codex、2.1.331 の Claude Code で確かめた):
//
// - Claude Code: .claude/settings.json の extraKnownMarketplaces と enabledPlugins。設定で有効にしただけでは、対話の
//   セッションの始めに読まれない。自分で入れていない人は、1 回 claude plugin install を実行する。
// - Codex: .codex/config.toml の marketplaces と plugins。git の marketplace は、プロジェクトの信頼と hook の承認
//   (/hooks)のあと、各人の操作なしで入る。hook の承認は、plugin の中身が変わるたびに要る。

import { planOf } from './plan.mjs';
import { CLAUDE_SETTINGS, CODEX_CONFIG, DECLARATION, PLUGIN_ID, STAGES, TARGET } from './target.mjs';
import { editCodexConfig } from './toml.mjs';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// 8.x が書いた、版を固定した Pi の package の行。
const OLD_COPY = '.claude/skills/dotagents';
const OLD_COPY_MARK = `${OLD_COPY}/VENDORED.json`;
const PI_SETTINGS = '.pi/settings.json';
const OLD_PI = `git:github.com/${TARGET.repo}@`;
const isOldPi = (entry) => String(typeof entry === 'string' ? entry : entry?.source).startsWith(OLD_PI);
// 7.x が配ったもの。9.0.0 は読まない。
const SEVEN = ['.claude/dotagents.json', '.claude/rules/dotagents', '.codex/dotagents'];

function box(data, key, file) {
  data[key] ??= {};
  if (!isObject(data[key])) throw new Error(`${file} の ${key} が JSON のオブジェクトではありません。何も書き込まずに中止します。`);
  return data[key];
}

// ほかの鍵は残し、name が決まっていればそれを、無ければその鍵を外す。入れ物が空になれば、入れ物ごと外す。
function setEntries(data, key, entries) {
  const current = isObject(data[key]) ? data[key] : null;
  if (data[key] !== undefined && !current) return;
  const next = { ...current };
  for (const [name, value] of entries) {
    if (value) next[name] = value;
    else delete next[name];
  }
  if (Object.keys(next).length) data[key] = next;
  else delete data[key];
}

function declare(plan, { git, architecture, checks }) {
  plan.json(DECLARATION, (data) => {
    setEntries(data, 'style', [['git', git], ['architecture', architecture]]);
    setEntries(data, 'checks', STAGES.map((stage) => [stage, checks[stage]]));
  });
  // 宣言が無いと、Claude Code はセッションを開くたびに入れ方を知らせる。何も選ばなくても、置く。
  if (plan.read(DECLARATION) === null) plan.set(DECLARATION, '{}\n');
}

function claude(plan) {
  plan.json(CLAUDE_SETTINGS, (data) => {
    // enabledPlugins を先に置く。各人の claude plugin install --scope project は、この順に書き直すので、先にそろえておくと
    // 差分ができない。
    const plugins = box(data, 'enabledPlugins', CLAUDE_SETTINGS);
    const markets = box(data, 'extraKnownMarketplaces', CLAUDE_SETTINGS);
    const known = isObject(markets[TARGET.marketplace]) ? markets[TARGET.marketplace] : {};
    markets[TARGET.marketplace] = { ...known, source: { source: 'github', repo: TARGET.repo }, autoUpdate: true };
    plugins[PLUGIN_ID] = true;
  });
}

function codex(plan) {
  plan.set(CODEX_CONFIG, editCodexConfig(plan.read(CODEX_CONFIG)));
}

// 8.x の残り。写しは、8.x が置いた印があるときだけ消す。Pi の設定は、8.x が書いた行だけを消す。
// 9.0.0 は Pi に入れないので、Pi の設定が読めなくても止めず、知らせる。
function removeOldCopy(plan, notices) {
  if (plan.exists(OLD_COPY_MARK)) plan.remove(OLD_COPY);
  if (!plan.exists(PI_SETTINGS)) return;
  try {
    plan.json(PI_SETTINGS, (data) => {
      if (!Array.isArray(data.packages) || !data.packages.some(isOldPi)) return;
      data.packages = data.packages.filter((entry) => !isOldPi(entry));
      if (!data.packages.length) delete data.packages;
    });
  } catch {
    if (plan.read(PI_SETTINGS)?.includes(OLD_PI)) notices.push(`${PI_SETTINGS} に 8.x が追加した行(${OLD_PI} で始まる package)が残っていますが、JSON として読み込めないため削除していません。手動で削除してください。`);
  }
}

function notices(plan) {
  const out = [];
  const seven = SEVEN.filter((relative) => plan.exists(relative));
  if (seven.length) out.push(`7.x のファイルが残っています(${seven.join('、')})。削除していません。dotagents の setup スキルの「8.x と 7.x から移るとき」に沿って移行するよう、エージェントに依頼してください。`);
  try {
    if (Object.hasOwn(JSON.parse(plan.read(DECLARATION)), 'outward')) out.push(`${DECLARATION} に outward が残っています。この項目はもう使われず、何の効果もないため、削除してかまいません。`);
  } catch {}
  return out;
}

// answers: { hosts, git, architecture, checks }。git と architecture は名前か null、checks は段階ごとの文字列(空は外す)。
export function buildPlan(root, answers) {
  const plan = planOf(root);
  const found = [];
  declare(plan, answers);
  if (answers.hosts.includes('claude')) claude(plan);
  if (answers.hosts.includes('codex')) codex(plan);
  removeOldCopy(plan, found);
  return { plan, notices: [...notices(plan), ...found] };
}
