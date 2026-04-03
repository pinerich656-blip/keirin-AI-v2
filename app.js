document.addEventListener('DOMContentLoaded', () => {
  let latestResult = null;

  function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim());

    return lines.slice(1).map(line => {
      const cols = line.split(',').map(c => c.trim());
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = cols[i];
      });

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
    }).filter(r => !Number.isNaN(r.num));
  }

  function parseLineup(text) {
    return text
      .split('/')
      .map(t => t.trim())
      .filter(Boolean)
      .map(team =>
        team
          .split('-')
          .map(v => Number(v.trim()))
          .filter(v => !Number.isNaN(v))
      );
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
    const front = clamp(
      ((r.S / Math.max(1, maxS)) * 2) + (pos?.pos === 0 ? 0.5 : 0),
      0,
      3
    );

    const initiative = clamp(
      ((r.B / Math.max(1, maxB)) * 2) + (r.style === '逃' ? 0.8 : r.style === '両' ? 0.4 : 0),
      0,
      3
    );

    const anchor = clamp(
      (pos?.pos === 1 ? 1.2 : pos?.pos === 2 ? 0.6 : 0) +
      (r.quinella / 50),
      0,
      3
    );

    const late = clamp(
      (r.win / 40) + (r.style === '両' ? 0.8 : r.style === '追' ? 0.4 : 0),
      0,
      3
    );

    const elite = clamp(
      (r.win / 35) + (r.quinella / 60) + (r.score / 110),
      0,
      3
    );

    const soloRisk = clamp(
      (pos?.pos === 1 ? 1.0 : 0) +
      (r.B >= 8 ? 0.5 : 0),
      0,
      3
    );

    const total =
      front * 0.15 +
      initiative * 0.25 +
      anchor * 0.20 +
      late * 0.15 +
      elite * 0.20 -
      soloRisk * 0.10;

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

  function uniq(arr) {
    return [...new Set(arr.filter(Boolean))];
  }

  function analyzeRace(racers, lineup) {
    if (!racers.length) {
      throw new Error('選手データがありません。');
    }

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

    let structure = '安定戦';
    if (leaders.length >= 3) structure = '踏み合い戦';
    else if (leaders.length === 2) structure = '崩壊戦';
    else if (leaders.length <= 1) structure = '安定戦';

    const byTotal = [...scored].sort((a, b) => b.ai.total - a.ai.total);
    const byInitiative = [...scored].sort(
      (a, b) => (b.ai.initiative + b.ai.front) - (a.ai.initiative + a.ai.front)
    );
    const byAnchor = [...scored].sort((a, b) => b.ai.anchor - a.ai.anchor);
    const byLate = [...scored].sort((a, b) => b.ai.late - a.ai.late);

    const leader = byInitiative[0];
    const bestAnchor = byAnchor[0];
    const bestLate = byLate[0];

    let head = byTotal[0];

    if (structure === '踏み合い戦') {
      head = bestLate;
    } else if (
      structure === '安定戦' &&
      bestAnchor?.pos?.pos === 1 &&
      leader &&
      bestAnchor.pos?.team === leader.pos?.team
    ) {
      head = bestAnchor;
    } else if (structure === '崩壊戦' && bestLate) {
      head = bestLate;
    }

    const sameTeam = scored
      .filter(r => r.pos?.team === head.pos?.team && r.num !== head.num)
      .sort((a, b) => (a.pos?.pos ?? 99) - (b.pos?.pos ?? 99));

    const others = scored
      .filter(r => r.num !== head.num && !sameTeam.some(x => x.num === r.num))
      .sort((a, b) => b.ai.total - a.ai.total);

    const teamMate1 = sameTeam[0]?.num;
    const teamMate2 = sameTeam[1]?.num;
    const other1 = others[0]?.num;
    const other2 = others[1]?.num;
    const other3 = others[2]?.num;

    const main = uniq([
      `${head.num}-${teamMate1 || other1}-${teamMate2 || other2 || ''}`,
      `${head.num}-${other1}-${teamMate1 || other2 || ''}`,
      `${head.num}-${other1}-${other2 || teamMate1 || ''}`
    ]).filter(v => v.split('-').length === 3 && !v.includes('undefined'));

    const sub = uniq([
      leader && leader.num !== head.num
        ? `${leader.num}-${head.num}-${bestAnchor?.num || other1 || ''}`
        : '',
      bestAnchor && bestAnchor.num !== head.num
        ? `${bestAnchor.num}-${head.num}-${leader?.num || other1 || ''}`
        : '',
      other2 ? `${head.num}-${other2}-${other3 || teamMate1 || ''}` : ''
    ]).filter(v => v.split('-').length === 3 && !v.includes('undefined'));

    const conclusion = `${head.num}頭を本線。${leader?.num !== head.num ? ` 主導権候補は${leader?.num}。` : ''}${bestAnchor?.num && bestAnchor.num !== head.num ? ` 番手価値は${bestAnchor.num}が高め。` : ''}`;

    const structureText = `レース構造: ${structure} / 主導権候補: ${leader?.num ?? '-'} / 後出し最上位: ${bestLate?.num ?? '-'} / 番手価値上位: ${bestAnchor?.num ?? '-'}`;

    return {
      scored: byTotal,
      structureText,
      conclusion,
      main,
      sub
    };
  }

  function scoreClass(total) {
    if (total >= 1.9) return 'score-high';
    if (total >= 1.5) return 'score-mid';
    return 'score-low';
  }

  function render(result) {
    const resultBox = document.getElementById('result');
    const resultEmpty = document.getElementById('resultEmpty');
    const structureText = document.getElementById('structureText');
    const conclusionText = document.getElementById('conclusionText');
    const mainLine = document.getElementById('mainLine');
    const subLine = document.getElementById('subLine');
    const scoreTableBody = document.querySelector('#scoreTable tbody');

    if (resultBox) resultBox.classList.remove('hidden');
    if (resultEmpty) resultEmpty.classList.add('hidden');

    if (structureText) structureText.textContent = result.structureText;
    if (conclusionText) conclusionText.textContent = result.conclusion;

    if (mainLine) {
      mainLine.innerHTML = result.main.map(v => `<li class="bet-main">${v}</li>`).join('');
    }

    if (subLine) {
      subLine.innerHTML = result.sub.map(v => `<li class="bet-sub">${v}</li>`).join('');
    }

    if (scoreTableBody) {
      scoreTableBody.innerHTML = '';
      result.scored.forEach(r => {
        const tr = document.createElement('tr');
        tr.className = scoreClass(r.ai.total);

        const memo = [
          r.pos ? `ライン${r.pos.team + 1}-${r.pos.pos + 1}番手` : '単騎',
          r.style,
          `得点${r.score}`
        ].join(' / ');

        tr.innerHTML = `
          <td>${r.num}</td>
          <td>${r.ai.front.toFixed(1)}</td>
          <td>${r.ai.initiative.toFixed(1)}</td>
          <td>${r.ai.anchor.toFixed(1)}</td>
          <td>${r.ai.late.toFixed(1)}</td>
          <td>${r.ai.elite.toFixed(1)}</td>
          <td>${r.ai.soloRisk.toFixed(1)}</td>
          <td>${r.ai.total.toFixed(2)}</td>
          <td>${memo}</td>
        `;
        scoreTableBody.appendChild(tr);
      });
    }
  }

  function checkHit() {
    const actualInput = document.getElementById('actualResult');
    const hitResult = document.getElementById('hitResult');

    if (!actualInput || !hitResult) return;

    const actual = (actualInput.value || '').trim();
    if (!actual) {
      hitResult.className = 'muted';
      hitResult.textContent = '結果を入力してください。';
      return;
    }

    if (!latestResult) {
      hitResult.className = 'muted';
      hitResult.textContent = '先にAI判定をしてください。';
      return;
    }

    const allPreds = [...latestResult.main, ...latestResult.sub];
    const isMainHit = latestResult.main.includes(actual);
    const isSubHit = latestResult.sub.includes(actual);
    const isHit = allPreds.includes(actual);

    if (isMainHit) {
      hitResult.className = 'hit-main';
      hitResult.textContent = `◎ 本線的中: ${actual}`;
    } else if (isSubHit) {
      hitResult.className = 'hit-sub';
      hitResult.textContent = `○ 対抗・押さえ的中: ${actual}`;
    } else if (isHit) {
      hitResult.className = 'hit-sub';
      hitResult.textContent = `○ 的中: ${actual}`;
    } else {
      hitResult.className = 'hit-miss';
      hitResult.textContent = `× 不的中: ${actual}`;
    }
  }

  function sample() {
    const raceName = document.getElementById('raceName');
    const csvInput = document.getElementById('csvInput');
    const lineInput = document.getElementById('lineInput');

    if (raceName) raceName.value = '小倉 ミッドナイト';
    if (csvInput) {
      csvInput.value = `車番,得点,B,S,脚質,勝率,2連対率,3連対率
1,73.22,0,5,追,11.1,33.3,61.1
2,71.63,2,0,両,18.7,31.2,37.5
3,70.70,16,0,逃,33.3,44.4,51.8
4,69.44,9,0,逃,18.7,31.2,56.2
5,69.40,0,0,追,4.0,12.0,28.0
6,69.06,0,0,追,5.5,16.6,33.3
7,68.78,0,0,追,7.4,11.1,37.0`;
    }
    if (lineInput) lineInput.value = '3-1-5/2-7/4-6';
  }

  const analyzeBtn = document.getElementById('analyzeBtn');
  const sampleBtn = document.getElementById('sampleBtn');
  const clearBtn = document.getElementById('clearBtn');
  const checkResultBtn = document.getElementById('checkResultBtn');

  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', () => {
      try {
        const csvInput = document.getElementById('csvInput');
        const lineInput = document.getElementById('lineInput');

        const racers = parseCSV(csvInput?.value || '');
        const lineup = parseLineup(lineInput?.value || '');

        if (!racers.length || !lineup.length) {
          alert('CSVと並びを入力してください。');
          return;
        }

        const result = analyzeRace(racers, lineup);
        latestResult = result;
        render(result);
      } catch (e) {
        alert('エラー: ' + e.message);
      }
    });
  }

  if (sampleBtn) {
    sampleBtn.addEventListener('click', sample);
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      const raceName = document.getElementById('raceName');
      const csvInput = document.getElementById('csvInput');
      const lineInput = document.getElementById('lineInput');
      const actualResult = document.getElementById('actualResult');
      const hitResult = document.getElementById('hitResult');
      const resultBox = document.getElementById('result');
      const resultEmpty = document.getElementById('resultEmpty');
      const mainLine = document.getElementById('mainLine');
      const subLine = document.getElementById('subLine');
      const scoreTableBody = document.querySelector('#scoreTable tbody');

      latestResult = null;

      if (raceName) raceName.value = '';
      if (csvInput) csvInput.value = '';
      if (lineInput) lineInput.value = '';
      if (actualResult) actualResult.value = '';
      if (hitResult) {
        hitResult.className = 'muted';
        hitResult.textContent = '結果を入れて「的中チェック」を押してください。';
      }

      if (resultBox) resultBox.classList.add('hidden');
      if (resultEmpty) resultEmpty.classList.remove('hidden');
      if (mainLine) mainLine.innerHTML = '';
      if (subLine) subLine.innerHTML = '';
      if (scoreTableBody) scoreTableBody.innerHTML = '';
    });
  }

  if (checkResultBtn) {
    checkResultBtn.addEventListener('click', checkHit);
  }
});
