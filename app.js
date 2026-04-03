function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const cols = line.split(',').map(c => c.trim());
    const obj = {};
    headers.forEach((h, i) => obj[h] = cols[i]);
    return {
      num: Number(obj['車番']),
      score: Number(obj['得点']),
      B: Number(obj['B']),
      S: Number(obj['S']),
      style: obj['脚質'],
      win: Number(obj['勝率']),
      quinella: Number(obj['2連対率']),
      trio: Number(obj['3連対率'])
    };
  });
}

function parseLineup(text) {
  const teams = text.split('/').map(t => t.trim()).filter(Boolean);
  return teams.map(team => team.split('-').map(v => Number(v.trim())).filter(Boolean));
}

function teamMap(lineup) {
  const map = new Map();
  lineup.forEach((team, idx) => team.forEach((num, pos) => map.set(num, { team: idx, pos })));
  return map;
}

function ageHintFromStyle(style) {
  if (style === '逃') return 1.0;
  if (style === '両') return 0.6;
  return 0.2;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function scoreRacer(r, posInfo, maxB, maxS) {
  const front = clamp((r.S / Math.max(1, maxS)) * 2.2 + (posInfo?.pos === 0 ? 0.6 : 0) + (posInfo?.pos === 1 ? 0.3 : 0), 0, 3);
  const initiative = clamp((r.B / Math.max(1, maxB)) * 2.2 + (r.style === '逃' ? 0.8 : r.style === '両' ? 0.4 : 0), 0, 3);
  const band = posInfo?.pos === 1 ? 1 : posInfo?.pos === 2 ? 0.6 : 0;
  const partnerBonus = posInfo && posInfo.pos > 0 ? 0.25 : 0;
  const anchor = clamp((r.quinella / 50) + (r.trio / 100) + band + partnerBonus, 0, 3);
  const late = clamp((r.win / 40) + (r.style === '両' ? 0.8 : r.style === '追' ? 0.5 : 0), 0, 3);
  const youth = clamp((r.B >= 8 ? 1.4 : 0) + ageHintFromStyle(r.style) + (r.win >= 25 ? 0.6 : 0), 0, 3);
  const total = (front * 0.16) + (initiative * 0.28) + (anchor * 0.22) + (late * 0.20) + (youth * 0.14) + (r.score / 120);
  return { front, initiative, anchor, late, youth, total: Number(total.toFixed(2)) };
}

function analyzeRace(racers, lineup) {
  const maxB = Math.max(...racers.map(r => r.B));
  const maxS = Math.max(...racers.map(r => r.S));
  const posMap = teamMap(lineup);
  const scored = racers.map(r => ({ ...r, posInfo: posMap.get(r.num), ai: scoreRacer(r, posMap.get(r.num), maxB, maxS) }));

  const leaders = scored.filter(r => (r.ai.initiative >= 2.3));
  const youngLeaders = scored.filter(r => r.B >= 8 && (r.style === '逃' || r.style === '両'));
  const collapseRisk = clamp((leaders.length >= 2 ? 2 : 1) + (youngLeaders.length >= 3 ? 1 : 0), 0, 3);

  let structure = '安定戦';
  if (collapseRisk >= 3) structure = '踏み合い戦';
  else if (leaders.length >= 2) structure = '崩壊戦';
  else if (scored.some(r => r.S >= 8 && r.B >= 8)) structure = 'ツッパリ戦';

  const sorted = [...scored].sort((a, b) => b.ai.total - a.ai.total);
  const leader = [...scored].sort((a, b) => (b.ai.initiative + b.ai.front) - (a.ai.initiative + a.ai.front))[0];
  const bestAnchor = [...scored].sort((a, b) => b.ai.anchor - a.ai.anchor)[0];
  const bestLate = [...scored].sort((a, b) => b.ai.late - a.ai.late)[0];

  let head = sorted[0];
  if (structure === 'ツッパリ戦' && leader) head = leader;
  if (structure === '安定戦' && bestAnchor && bestAnchor.posInfo?.pos === 1 && leader && bestAnchor.posInfo.team === leader.posInfo?.team) head = bestAnchor;
  if (structure === '踏み合い戦') head = bestLate;

  const sameTeam = scored.filter(r => r.posInfo?.team === head.posInfo?.team && r.num !== head.num).sort((a, b) => a.posInfo.pos - b.posInfo.pos);
  const others = scored.filter(r => r.num !== head.num && !sameTeam.find(x => x.num === r.num)).sort((a, b) => b.ai.total - a.ai.total);

  const main = [];
  if (sameTeam[0]) main.push(`${head.num}-${sameTeam[0].num}-${sameTeam[1]?.num ?? others[0]?.num ?? ''}`);
  if (sameTeam[1]) main.push(`${head.num}-${sameTeam[1].num}-${sameTeam[0]?.num ?? others[0]?.num ?? ''}`);
  if (others[0]) main.push(`${head.num}-${others[0].num}-${sameTeam[0]?.num ?? others[1]?.num ?? ''}`);

  const sub = [];
  if (leader && leader.num !== head.num) sub.push(`${leader.num}-${head.num}-${bestAnchor?.num ?? ''}`);
  if (bestAnchor && bestAnchor.num !== head.num) sub.push(`${bestAnchor.num}-${head.num}-${leader?.num ?? ''}`);
  if (others[1]) sub.push(`${head.num}-${others[1].num}-${others[0]?.num ?? ''}`);

  const conclusion = `${head.num}頭を本線。${leader?.num !== head.num ? `主導権は${leader?.num}寄り、` : ''}${bestAnchor?.num !== head.num ? `${bestAnchor?.num}の位置価値も高め。` : ''}`;
  const structureText = `レース構造: ${structure} / 崩壊リスク ${collapseRisk.toFixed(1)} / 主導権候補 ${leader?.num ?? '-'} / 後出し最上位 ${bestLate?.num ?? '-'}`;

  return { scored: sorted, structureText, conclusion, main: main.filter(Boolean), sub: sub.filter(Boolean) };
}

function render(result) {
  document.getElementById('resultEmpty').classList.add('hidden');
  document.getElementById('result').classList.remove('hidden');
  document.getElementById('structureText').textContent = result.structureText;
  document.getElementById('conclusionText').textContent = result.conclusion;

  const tbody = document.querySelector('#scoreTable tbody');
  tbody.innerHTML = '';
  result.scored.forEach(r => {
    const tr = document.createElement('tr');
    const memo = [
      r.posInfo ? `ライン${r.posInfo.team + 1}-${r.posInfo.pos + 1}番手` : '単騎',
      r.style,
      `得点${r.score}`
    ].join(' / ');
    tr.innerHTML = `
      <td>${r.num}</td>
      <td>${r.ai.front.toFixed(1)}</td>
      <td>${r.ai.initiative.toFixed(1)}</td>
      <td>${r.ai.anchor.toFixed(1)}</td>
      <td>${r.ai.late.toFixed(1)}</td>
      <td>${r.ai.youth.toFixed(1)}</td>
      <td>${r.ai.total.toFixed(2)}</td>
      <td>${memo}</td>
    `;
    tbody.appendChild(tr);
  });

  const mainLine = document.getElementById('mainLine');
  const subLine = document.getElementById('subLine');
  mainLine.innerHTML = result.main.map(v => `<li>${v}</li>`).join('');
  subLine.innerHTML = result.sub.map(v => `<li>${v}</li>`).join('');
}

function sample() {
  document.getElementById('raceName').value = '小倉 ミッドナイト';
  document.getElementById('csvInput').value = `車番,得点,B,S,脚質,勝率,2連対率,3連対率
1,73.22,0,5,追,11.1,33.3,61.1
2,71.63,2,0,両,18.7,31.2,37.5
3,70.70,16,0,逃,33.3,44.4,51.8
4,69.44,9,0,逃,18.7,31.2,56.2
5,69.40,0,0,追,4.0,12.0,28.0
6,69.06,0,0,追,5.5,16.6,33.3
7,68.78,0,0,追,7.4,11.1,37.0`;
  document.getElementById('lineInput').value = '3-1-5/2-7/4-6';
}

document.getElementById('analyzeBtn').addEventListener('click', () => {
  const racers = parseCSV(document.getElementById('csvInput').value);
  const lineup = parseLineup(document.getElementById('lineInput').value);
  if (!racers.length || !lineup.length) {
    alert('CSVと並びを入力してください。');
    return;
  }
  render(analyzeRace(racers, lineup));
});

document.getElementById('sampleBtn').addEventListener('click', sample);
document.getElementById('clearBtn').addEventListener('click', () => {
  document.getElementById('raceName').value = '';
  document.getElementById('csvInput').value = '';
  document.getElementById('lineInput').value = '';
  document.getElementById('result').classList.add('hidden');
  document.getElementById('resultEmpty').classList.remove('hidden');
});
