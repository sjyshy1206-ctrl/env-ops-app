// 법제처 Open API(DRF)로 추적 법령의 현행 버전과 시행 예정 개정을 확인해 data/laws.json 에 저장한다.
// 필요: Node 18 이상, 환경변수 LAW_OC (법제처 Open API 인증값). 외부 패키지 없음.
import { readFile, writeFile } from 'node:fs/promises';

const OC = process.env.LAW_OC;
const BASE = (process.env.LAW_API_BASE || 'https://www.law.go.kr/DRF').replace(/\/$/, '');
const TRACKED = process.env.TRACKED_FILE || 'data/tracked.json';
const OUT = process.env.OUT_FILE || 'data/laws.json';
const WITH_REASON = process.env.WITH_REASON !== '0';

if (!OC) { console.error('LAW_OC 환경변수가 없어요. GitHub 저장소 Settings > Secrets 에 LAW_OC 를 넣어 주세요.'); process.exit(1); }

const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // 한국 날짜
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ymd = s => { s = String(s || '').replace(/\D/g, ''); return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : ''; };
const same = (a, b) => a.replace(/\s/g, '') === b.replace(/\s/g, '');

// 응답 구조가 조금 달라도 법령 항목을 찾을 수 있게 넓게 뒤진다
function findItems(o, acc = []) {
  if (Array.isArray(o)) { o.forEach(x => findItems(x, acc)); return acc; }
  if (o && typeof o === 'object') {
    if (o['법령명한글'] || o['법령명']) acc.push(o); else Object.values(o).forEach(v => findItems(v, acc));
  }
  return acc;
}
const pick = (it, ...ks) => { for (const k of ks) if (it[k] != null && it[k] !== '') return String(it[k]).trim(); return ''; };
const toItem = it => ({
  name: pick(it, '법령명한글', '법령명'), mst: pick(it, '법령일련번호', 'MST'), id: pick(it, '법령ID'),
  prom: ymd(pick(it, '공포일자')), promNo: pick(it, '공포번호'), eff: ymd(pick(it, '시행일자')),
  kind: pick(it, '제개정구분명'), dept: pick(it, '소관부처명'),
});

async function getJSON(path, params) {
  const url = `${BASE}/${path}?` + new URLSearchParams({ OC, type: 'JSON', ...params });
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'env-law-tracker (GitHub Actions)' } });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      try { return JSON.parse(text); }
      catch { throw new Error('JSON이 아닌 응답 (인증값·IP 등록 확인): ' + text.replace(/\s+/g, ' ').slice(0, 160)); }
    } catch (e) { if (i === 2) throw e; await sleep(1500 * (i + 1)); }
  }
}
const search = async (target, name) =>
  findItems(await getJSON('lawSearch.do', { target, query: name, display: '100' })).map(toItem).filter(x => same(x.name, name));

// 상세에서 제·개정 이유를 짧게 꺼낸다 (없으면 빈 문자열)
const leaves = v => typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(leaves) : v && typeof v === 'object' ? Object.values(v).flatMap(leaves) : [];
function collectText(o, keys, acc = []) {
  if (Array.isArray(o)) o.forEach(x => collectText(x, keys, acc));
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) {
    if (keys.some(key => k.includes(key))) acc.push(...leaves(v));
    else collectText(v, keys, acc);
  }
  return acc;
}
async function reasonOf(mst) {
  if (!WITH_REASON || !mst) return '';
  try {
    const j = await getJSON('lawService.do', { target: 'law', MST: mst });
    const t = collectText(j, ['제개정이유', '개정문']).join(' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return t.length > 600 ? t.slice(0, 600) + '…' : t;
  } catch { return ''; }
}

const tracked = JSON.parse(await readFile(TRACKED, 'utf8')).laws;
let prev = { laws: [], changes: [] };
try { prev = JSON.parse(await readFile(OUT, 'utf8')); } catch {}
const prevOf = n => prev.laws.find(l => l.name === n);
const changes = prev.changes || [];
const has = c => changes.some(x => x.law === c.law && ((c.mst && x.mst === c.mst) || (x.prom === c.prom && x.eff === c.eff)));

const laws = [], errors = [];
let added = 0;
for (const name of tracked) {
  try {
    const cur = (await search('law', name))[0];
    if (!cur) { errors.push(`${name}: 같은 이름의 현행 법령 없음 (정식 명칭 확인)`); const p = prevOf(name); if (p) laws.push(p); continue; }
    const p = prevOf(name);
    if (p && (cur.mst !== p.mst || cur.prom !== p.prom)) {
      const c = { law: name, kind: cur.kind || '기타', prom: cur.prom, eff: cur.eff, mst: cur.mst, type: 'current', detected: today, summary: await reasonOf(cur.mst) };
      if (!has(c)) { changes.unshift(c); added++; }
    }
    laws.push({ ...cur, checked: today });
    await sleep(300);
    try {
      for (const f of await search('eflaw', name)) {
        if (f.eff > today && f.mst !== cur.mst) {
          const c = { law: name, kind: f.kind || '기타', prom: f.prom, eff: f.eff, mst: f.mst, type: 'upcoming', detected: today, summary: '' };
          if (!has(c)) { c.summary = await reasonOf(f.mst); changes.unshift(c); added++; }
        }
      }
    } catch (e) { errors.push(`${name} (시행 예정 조회): ${e.message}`); }
    await sleep(300);
  } catch (e) {
    errors.push(`${name}: ${e.message}`);
    const p = prevOf(name); if (p) laws.push(p);
  }
}

const out = { updated: new Date().toISOString(), today, source: '법제처 국가법령정보 Open API', laws, changes: changes.slice(0, 300), errors };
await writeFile(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`법령 ${laws.length}/${tracked.length}개 확인, 새 개정 ${added}건, 오류 ${errors.length}건`);
errors.forEach(e => console.log(' - ' + e));
if (errors.length === tracked.length) { console.error('모든 법령 조회에 실패했어요. LAW_OC 값과 법제처 Open API 신청 상태를 확인하세요.'); process.exit(1); }
if (added && process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT, `new_changes=${added}\n`, { flag: 'a' });
