document.addEventListener('DOMContentLoaded', () => {

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
  return text.split('/').map(t => t.split('-').map(Number));
}

function teamMap(lineup) {
  const map = new Map();
  lineup.forEach((team, i) => {
    team.forEach((num, j) => {
      map.set(num, { team: i, pos: j });
    });
  });
  return map;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function scoreRacer(r, pos, maxB, maxS) {

  const front = clamp((r.S / maxS) * 2 + (pos?.pos === 0 ? 0.5 : 0), 0, 3);

  const initiative = clamp((r.B / maxB) * 2 + (r.style === '逃' ? 0.8 : 0), 0, 3);

  const anchor = clamp(
    (pos?.pos === 1 ? 1.2 : pos?.pos === 2 ? 0.6 : 0) +
    (r.quinella / 50),
    0, 3
  );

  const late = clamp((r.win / 40) + (r.style === '両' ? 0.8 : 0), 0, 3);

  const elite = clamp((r.win / 35) + (r.quinella / 60) + (r.score / 110), 0, 3);

  const soloRisk = clamp(
    (pos?.pos === 1 ? 1 : 0) +
    (r.B >= 8 ? 0.5 : 0),
    0, 3
  );

  const total =
    front * 0.15 +
    initiative * 0.25 +
    anchor * 0.2 +
    late * 0.15 +
    elite * 0.2 -
    soloRisk * 0.1;

  return {
    front,
    initiative,
    anchor,
    late,
    elite,
    soloRisk,
    total: Number(total.toFixed(2))
  };
}

function analyzeRace(racers, lineup) {

  const maxB = Math.max(...racers.map(r => r.B));
  const maxS = Math.max(...racers.map(r => r.S));

  const posMap = teamMap(lineup);

  const scored = racers.map(r => {
    const pos = posMap.get(r.num);
    return {
      ...r,
      pos,
      ai: scoreRacer(r, pos, maxB, maxS)
    };
  });

  const leaders = scored.filter(r => r.ai.initiative >= 2);

  let structure = '安定';
  if (leaders.length >= 3) structure = '踏み合い';
  else if (leaders.length === 2) structure = '崩壊';

  let head = scored.sort((a, b) => b.ai.total - a.ai.total)[0];

  if (structure === '踏み合い') {
    head = scored.sort((a, b) => b.ai.late - a.ai.late)[0];
  }

  const sameTeam = scored.filter(r => r.pos?.team === head.pos?.team && r.num !== head.num);
  const others = scored.filter(r => r.num !== head.num);

  return {
    head: head.num,
    main: [
      `${head.num}-${sameTeam[0]?.num || others[0]?.num}`,
      `${head.num}-${others[0]?.num}-${others[1]?.num}`
    ],
    structure
  };
}

document.getElementById('analyzeBtn').addEventListener('click', () => {
  try {
    const racers = parseCSV(document.getElementById('csvInput').value);
    const lineup = parseLineup(document.getElementById('lineInput').value);

    const result = analyzeRace(racers, lineup);

    // 表示ON/OFF
    document.getElementById('result').classList.remove('hidden');
    document.getElementById('resultEmpty').classList.add('hidden');

    // テキスト表示
    document.getElementById('structureText').textContent = `構造: ${result.structure}`;
    document.getElementById('conclusionText').textContent = `本線: ${result.main.join(' / ')}`;

    // ★ここが追加部分（買い目リスト）
    document.getElementById('mainLine').innerHTML =
      result.main.map(v => `<li>${v}</li>`).join('');

  } catch (e) {
    alert('エラー: ' + e.message);
  }
});

});
