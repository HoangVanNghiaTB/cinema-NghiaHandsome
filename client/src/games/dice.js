import { el, confettiBurst } from './util.js';
import { sfx } from '../audio/sfx.js';

// Bầu cua + Tài xỉu chung một tranh (hai tab). Cả phòng đặt cược bằng điểm chung của rạp trong 20 giây, server lắc xúc xắc (server/games.js).
// Tài xỉu: tổng 3 xúc xắc 11-17 là Tài, 4-10 là Xỉu, đặt đúng thì ăn gấp đôi; bộ ba thì nhà cái ăn hết.
// Bầu cua: đặt vào linh vật, ra bao nhiêu con thì ăn bấy nhiêu lần tiền cược (ra 0 con thì mất).
const BAUCUA = ['nai', 'bau', 'ga', 'ca', 'cua', 'tom'];
const ICON = { nai: '🦌', bau: '🎃', ga: '🐓', ca: '🐟', cua: '🦀', tom: '🦐' };
const NAME = { nai: 'Nai', bau: 'Bầu', ga: 'Gà', ca: 'Cá', cua: 'Cua', tom: 'Tôm' };
const SPOTS = {
  taixiu: [
    { id: 'xiu', label: 'XỈU', sub: '4 - 10', color: '#2b6cff' },
    { id: 'tai', label: 'TÀI', sub: '11 - 17', color: '#e0412f' },
  ],
  baucua: BAUCUA.map((id) => ({ id, label: `${ICON[id]} ${NAME[id]}`, sub: '', color: '#2c7a4b' })),
};
const TAB_LABEL = { taixiu: 'Tài xỉu', baucua: 'Bầu cua' };
// Vị trí các chấm trên mặt xúc xắc (lưới 3x3, ô 0..8)
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

export default {
  id: 'dice',
  title: 'Bầu cua · Tài xỉu',
  mount(root, ctx) {
    const wrap = el('div', 'g-split g-dice');
    const main = el('div', 'g-dice-main');
    const tabs = el('div', 'g-tabs');
    const tabBtns = {};
    let tab = 'taixiu';
    for (const t of ['taixiu', 'baucua']) {
      const b = el('button', 'g-btn', TAB_LABEL[t]);
      b.addEventListener('click', () => {
        tab = t;
        shown = null;
        baseline = false; // đổi tab thì ván đã ra của tab kia không bắn pháo lại
        refresh();
      });
      tabBtns[t] = b;
      tabs.appendChild(b);
    }
    const diceRow = el('div', 'g-dice-row');
    const dieEls = [0, 1, 2].map(() => diceRow.appendChild(el('div', 'g-die', '?')));
    const verdict = el('div', 'g-dice-verdict');
    diceRow.appendChild(verdict);
    const grid = el('div', 'g-spots');
    const hist = el('div', 'g-hist'); // soi cầu: các ván đã ra trong phiên
    main.append(tabs, diceRow, grid, hist);

    const side = el('div', 'g-side');
    const timer = el('div', 'g-timer', '20');
    const pts = el('div', 'g-status');
    const chipRow = el('div', 'g-chips');
    let chip = 10;
    const chipBtns = [];
    const status = el('div', 'g-status');
    const startBtn = el('button', 'g-btn', 'Mở ván cược');
    startBtn.addEventListener('click', () => ctx.send({ op: 'start', table: tab }));
    const undoBtn = el('button', 'g-btn', 'Huỷ cược của tôi');
    undoBtn.addEventListener('click', () => ctx.send({ op: 'unbet', table: tab }));
    const rank = el('div', 'g-list');
    side.append(timer, pts, chipRow, status, startBtn, undoBtn, rank);
    wrap.append(main, side);
    root.appendChild(wrap);

    let s = null;
    let receivedAt = 0;
    let shown = null; // xúc xắc đã hiện ra (để biết khi nào có kết quả mới mà lắc)
    let rollTimer = null;
    let baseline = false; // đã thấy một lúc chưa có kết quả trong lần mở này (chỉ khi đó mới bắn pháo, mở bảng giữa chừng thì không)
    const stops = new Set(); // pháo giấy đang bay, để dừng khi đóng game

    const secsLeft = () => {
      const t = s?.tables[tab];
      return t?.phase === 'betting' ? Math.max(0, Math.ceil((t.msLeft - (performance.now() - receivedAt)) / 1000)) : 0;
    };
    let lastSecond = -1;
    const tickTimer = setInterval(() => {
      const t = s?.tables[tab];
      const left = t?.phase === 'betting' ? secsLeft() : -1;
      timer.textContent = left >= 0 ? String(left) : '--';
      if (left > 0 && left <= 5 && left !== lastSecond) sfx.play('tick'); // 5 giây cuối cược
      lastSecond = left;
    }, 250);

    // Vẽ một mặt xúc xắc: Tài xỉu là mặt chấm (1..6), Bầu cua là mặt linh vật; d = 0..5, null = chưa lắc
    function setDie(e, d) {
      e.replaceChildren();
      e.className = tab === 'baucua' ? 'g-die bc' : 'g-die';
      if (d === null) {
        e.textContent = '?';
        return;
      }
      if (tab === 'taixiu') {
        e.classList.add('pips');
        for (let i = 0; i < 9; i++) {
          const cell = el('i');
          if (PIPS[d + 1].includes(i)) cell.className = d === 0 || d === 3 ? 'pip red' : 'pip'; // nhất và tứ chấm đỏ như xúc xắc thật
          e.appendChild(cell);
        }
      } else {
        e.append(el('div', 'g-die-icon', ICON[BAUCUA[d]]), el('div', 'g-die-name', NAME[BAUCUA[d]]));
      }
    }
    function showDice(dice) {
      dieEls.forEach((e, i) => setDie(e, dice ? dice[i] : null));
    }
    function verdictOf(dice) {
      if (tab !== 'taixiu') return dice.map((d) => NAME[BAUCUA[d]]).join(' · ');
      const sum = dice[0] + dice[1] + dice[2] + 3;
      if (dice[0] === dice[1] && dice[1] === dice[2]) return `${sum}: Bộ ba, nhà cái ăn`;
      return `${sum}: ${sum >= 11 ? 'TÀI' : 'XỈU'}`;
    }

    // Soi cầu: Tài xỉu hiện từng ván (số tổng, đỏ = Tài, xanh = Xỉu, vàng = bộ ba) kèm đếm và cầu đang bệt;
    // Bầu cua hiện ba linh vật của từng ván kèm số lần ra của mỗi linh vật
    function renderHistory(list) {
      hist.replaceChildren();
      if (!list.length) {
        hist.appendChild(el('div', 'g-dim', 'Soi cầu: chưa có ván nào trong phiên này'));
        return;
      }
      const head = el('div', 'g-hist-head', `Soi cầu (${list.length} ván gần nhất, mới nhất bên phải)`);
      const row = el('div', 'g-hist-row');
      const info = el('div', 'g-hist-info');
      if (tab === 'taixiu') {
        const kinds = list.map((d) => (d[0] === d[1] && d[1] === d[2] ? 'b' : d[0] + d[1] + d[2] + 3 >= 11 ? 't' : 'x'));
        list.forEach((d, i) => {
          const sum = d[0] + d[1] + d[2] + 3;
          const chip = el('span', `g-hist-chip ${kinds[i] === 't' ? 'tai' : kinds[i] === 'x' ? 'xiu' : 'bb'}`, String(sum));
          chip.title = `${d.map((x) => x + 1).join(' ')} = ${sum}${kinds[i] === 'b' ? ' (bộ ba)' : kinds[i] === 't' ? ' Tài' : ' Xỉu'}`;
          row.appendChild(chip);
        });
        const count = (k) => kinds.filter((x) => x === k).length;
        let run = 1;
        while (run < kinds.length && kinds[kinds.length - 1 - run] === kinds[kinds.length - 1]) run++;
        const lastKind = kinds[kinds.length - 1];
        const name = lastKind === 't' ? 'Tài' : lastKind === 'x' ? 'Xỉu' : 'Bộ ba';
        info.textContent = `Tài ${count('t')} · Xỉu ${count('x')} · Bộ ba ${count('b')}  |  đang ra ${name} ${run} ván liền`;
      } else {
        list.forEach((d) => row.appendChild(el('span', 'g-hist-chip bc', d.map((x) => ICON[BAUCUA[x]]).join(''))));
        const tally = BAUCUA.map((id, i) => `${ICON[id]} ${list.reduce((n, d) => n + d.filter((x) => x === i).length, 0)}`);
        info.textContent = `Số lần ra: ${tally.join(' · ')}`;
      }
      hist.append(head, row, info);
      row.scrollLeft = row.scrollWidth;
    }

    // Có người đặt thắng thì bắn pháo giấy từ giữa lên cho cả phòng; mình thắng thì có thêm tiếng trúng lớn như xổ số
    function celebrate(results, mine) {
      if (!results.some((r) => r.net > 0)) return;
      stops.add(confettiBurst(root, mine?.net > 0 ? 150 : 90));
      if (mine?.net > 0) sfx.play('jackpot');
    }

    function buildChips(chips) {
      if (chipBtns.length) return;
      for (const c of chips) {
        const b = el('button', 'g-btn', String(c));
        b.addEventListener('click', () => {
          chip = c;
          chipBtns.forEach((x) => x.classList.toggle('on', x === b));
        });
        b.classList.toggle('on', c === chip);
        chipBtns.push(b);
        chipRow.appendChild(b);
      }
    }

    function refresh() {
      if (!s) return;
      buildChips(s.chips);
      for (const t of Object.keys(tabBtns)) tabBtns[t].classList.toggle('on', t === tab);
      const t = s.tables[tab];
      const me = ctx.me().id;
      const myBets = t.bets[me] ?? {};
      const total = {};
      for (const spots of Object.values(t.bets)) for (const [k, v] of Object.entries(spots)) total[k] = (total[k] ?? 0) + v;
      const betting = t.phase === 'betting';

      // Cửa cược
      grid.replaceChildren();
      grid.classList.toggle('six', tab === 'baucua');
      for (const sp of SPOTS[tab]) {
        const b = el('button', 'g-spot');
        b.style.background = sp.color;
        b.disabled = !betting;
        b.append(el('div', 'g-spot-label', sp.label));
        if (sp.sub) b.append(el('div', 'g-spot-sub', sp.sub));
        b.append(el('div', 'g-spot-sub', `Cả phòng: ${total[sp.id] ?? 0}`));
        if (myBets[sp.id]) b.append(el('div', 'g-spot-mine', `Bạn cược: ${myBets[sp.id]}`));
        b.addEventListener('click', () => ctx.send({ op: 'bet', table: tab, spot: sp.id, amt: chip }));
        grid.appendChild(b);
      }

      // Xúc xắc: có kết quả mới thì lắc một lúc rồi mới hiện
      const last = t.last;
      const key = last ? `${tab}:${last.dice.join('')}` : null;
      if (!last) baseline = true;
      renderHistory(t.history ?? []);
      if (!last) {
        clearInterval(rollTimer);
        diceRow.classList.remove('rolling');
        shown = null;
        showDice(null);
        verdict.textContent = betting ? 'Đang nhận cược...' : '';
      } else if (key !== shown) {
        const fresh = baseline; // ván này vừa ra trước mắt (không phải kết quả cũ lúc mới mở)
        shown = key;
        clearInterval(rollTimer);
        verdict.textContent = 'Đang lắc...';
        sfx.play('shake');
        diceRow.classList.add('rolling'); // xúc xắc nảy và xoay trong lúc đổi mặt liên tục
        rollTimer = setInterval(() => showDice([0, 1, 2].map(() => Math.floor(Math.random() * 6))), 90);
        setTimeout(() => {
          clearInterval(rollTimer);
          diceRow.classList.remove('rolling');
          if (shown !== key) return;
          showDice(last.dice);
          sfx.play('dieLand');
          verdict.textContent = verdictOf(last.dice);
          const mineRes = last.results.find((r) => r.name === myName());
          if (fresh) celebrate(last.results, mineRes);
          if (mineRes && mineRes.net < 0) setTimeout(() => sfx.play('lose'), 300);
          else if (mineRes && mineRes.net > 0 && !fresh) sfx.play('win');
          status.textContent = mineRes ? (mineRes.net >= 0 ? `Bạn ${mineRes.net > 0 ? 'thắng' : 'hoà'} ${mineRes.net > 0 ? '+' + mineRes.net : ''}` : `Bạn thua ${mineRes.net}`) : 'Ván đã xong';
        }, 1100);
      }

      pts.textContent = `Điểm của bạn: ${ctx.wallet().pts}`; // điểm chung của rạp, cũng dùng cho các game khác
      if (betting) status.textContent = 'Đặt cược đi!';
      else if (!last) status.textContent = 'Mở ván để cả phòng cùng cược';
      timer.textContent = betting ? String(secsLeft()) : '--';
      startBtn.style.display = betting ? 'none' : '';
      startBtn.textContent = last ? 'Ván mới' : 'Mở ván cược';
      undoBtn.style.display = betting && Object.keys(myBets).length ? '' : 'none';

      rank.replaceChildren(el('h4', '', 'Bảng điểm'));
      for (const p of s.players) {
        const row = el('div', p.id === me ? 'g-top me' : 'g-top');
        row.append(el('span', '', p.name), el('b', '', String(p.pts)));
        rank.appendChild(row);
      }
    }
    const myName = () => s?.players.find((p) => p.id === ctx.me().id)?.name;

    return {
      onWallet: refresh,
      state(next) {
        s = next;
        receivedAt = performance.now();
        refresh();
      },
      destroy() {
        clearInterval(tickTimer);
        clearInterval(rollTimer);
        for (const stop of stops) stop();
        stops.clear();
      },
    };
  },
};
