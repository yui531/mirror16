import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, collection, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js?v=3";

// Axis order, letters, labels. dir +1 = agreeing pushes toward the first letter.
const AXES = [
  { a: "E", b: "I", la: "外向", lb: "内向", name: "エネルギーの向き" },
  { a: "S", b: "N", la: "現実", lb: "直感", name: "ものの見方" },
  { a: "T", b: "F", la: "論理", lb: "感情", name: "判断のしかた" },
  { a: "J", b: "P", la: "計画", lb: "探索", name: "動き方" },
  { a: "A", b: "T", la: "自信", lb: "慎重", name: "気持ちの揺れ" },
];
// v2: 6 items per axis. S/N items avoid "sounds responsible" wording that pulled everyone toward S,
// and E/I and J/P items no longer overlap each other.
const QS = [
  [0, +1, "初対面の人にも自分から話しかける"],
  [0, -1, "大人数で過ごしたあとは、ひとりの時間で回復したい"],
  [0, +1, "考えがまとまる前に、口に出しながら整理する"],
  [0, +1, "休みの日は、誰かと会うと元気が出る"],
  [0, -1, "連絡は、電話よりメッセージのほうが気が楽"],
  [0, -1, "大勢の場では、聞き役にまわることが多い"],
  [1, +1, "話すときは、実際にあったできごとを例に出すことが多い"],
  [1, -1, "ありえないことを空想している時間が好き"],
  [1, +1, "新しいやり方より、試して確かめたやり方のほうがしっくりくる"],
  [1, -1, "物事の裏にある意味や、つながりを考えるのが好き"],
  [1, +1, "人の髪型や部屋の物の位置など、細かい変化によく気づく"],
  [1, -1, "ひとつの話から、どんどん別のアイデアに話が飛ぶ"],
  [2, +1, "判断するとき、気持ちより筋が通っているかを優先する"],
  [2, -1, "相手が傷つきそうなら、正しい指摘でも言い方を変える"],
  [2, +1, "議論で反論されても、個人的には気にしない"],
  [2, -1, "相談されたら、まず共感から入る"],
  [2, +1, "人の決め方が非効率だと、つい口を出したくなる"],
  [2, -1, "決めるときは、関わる人がどう感じるかを一番に考える"],
  [3, +1, "予定は前もって決めておきたい"],
  [3, -1, "締め切り直前に一気に片付けがち"],
  [3, +1, "机や持ち物がいつも整っている"],
  [3, -1, "その場の思いつきで行き先を変えるのが楽しい"],
  [3, +1, "やることリストを作って、順番に片付けるのが好き"],
  [3, -1, "決めるのはギリギリまで待って、選択肢を残しておきたい"],
  [4, +1, "失敗してもあまり引きずらない"],
  [4, -1, "人からどう見られているかが気になる"],
  [4, +1, "自分の判断に自信がある"],
  [4, -1, "小さなミスでも何度も思い返す"],
  [4, +1, "プレッシャーがかかっても、わりと落ち着いていられる"],
  [4, -1, "気分の浮き沈みが大きいほうだ"],
];
// v1 (20 items) — kept so answers saved before the update still score correctly.
const QS1 = [
  [0, +1, "初対面の人にも自分から話しかける"],
  [0, -1, "大人数で過ごしたあとは、ひとりの時間で回復したい"],
  [0, +1, "考えがまとまる前に、口に出しながら整理する"],
  [0, +1, "休みの日は予定を入れて外に出たい"],
  [1, +1, "具体的な事実や前例を重視する"],
  [1, -1, "話がすぐ「そもそも」や将来の可能性に広がる"],
  [1, +1, "説明書どおりに手順を踏むほうが安心する"],
  [1, -1, "たとえ話や抽象的なアイデアの話が好き"],
  [2, +1, "判断するとき、気持ちより筋が通っているかを優先する"],
  [2, -1, "相手が傷つきそうなら、正しい指摘でも言い方を変える"],
  [2, +1, "議論で反論されても、個人的には気にしない"],
  [2, -1, "相談されたら、まず共感から入る"],
  [3, +1, "予定は前もって決めておきたい"],
  [3, -1, "締め切り直前に一気に片付けがち"],
  [3, +1, "机や持ち物がいつも整っている"],
  [3, -1, "その場の思いつきで行き先を変えるのが楽しい"],
  [4, +1, "失敗してもあまり引きずらない"],
  [4, -1, "人からどう見られているかが気になる"],
  [4, +1, "自分の判断に自信がある"],
  [4, -1, "小さなミスでも何度も思い返す"],
];

const itemsFor = answers => answers.length === QS1.length ? QS1 : QS;
// answers: ints 1..7 -> percent toward the first letter, per axis.
// An exact tie used to fall to E/S/T/J/A every time; now the most strongly answered item on that axis decides.
function score(answers) {
  const items = itemsFor(answers), n = items.length / AXES.length;
  const sums = AXES.map(() => 0), strongest = AXES.map(() => 0);
  items.forEach(([ax, dir], i) => {
    const v = dir * (answers[i] - 4);
    sums[ax] += v;
    if (Math.abs(v) > Math.abs(strongest[ax])) strongest[ax] = v;
  });
  return sums.map((s, ax) => {
    const p = Math.round(50 + (s / (3 * n)) * 50);
    return p === 50 && strongest[ax] ? (strongest[ax] > 0 ? 51 : 49) : p;
  });
}
// Axes within this distance of 50% are shown as "ほぼ半々".
const NEAR = 5;
function code(pcts) {
  const l = pcts.map((p, i) => p >= 50 ? AXES[i].a : AXES[i].b);
  return l.slice(0, 4).join("") + "-" + l[4];
}
function average(list) {
  return AXES.map((_, i) => Math.round(list.reduce((s, p) => s + p[i], 0) / list.length));
}
const TYPES = {
  ISTJ: ["きっちり守る人", "約束と手順を大事にして、任されたことは最後までやり切る。"],
  ISFJ: ["そっと支える人", "まわりの変化によく気づき、目立たないところで手を貸している。"],
  INFJ: ["静かに見通す人", "人の本音や先の展開を読みながら、自分の理想に向けて黙々と動く。"],
  INTJ: ["先を設計する人", "全体の筋道を組み立てて、ムダのないやり方を探すのが得意。"],
  ISTP: ["手を動かして確かめる人", "理屈より実物。困ったことが起きると淡々と直してしまう。"],
  ISFP: ["自分のペースで味わう人", "好きなものへのこだわりが強く、押しつけられるのは苦手。"],
  INFP: ["内側に火を持つ人", "穏やかに見えて、大事にしている価値観は絶対に譲らない。"],
  INTP: ["仕組みを考える人", "「なぜそうなる？」を掘り下げるのが好きで、考えごとに没頭しがち。"],
  ESTP: ["まず動く人", "考えるより先に飛び込んで、その場でなんとかしてしまう。"],
  ESFP: ["場を明るくする人", "今この瞬間を楽しむのがうまく、まわりを自然と巻き込む。"],
  ENFP: ["アイデアが止まらない人", "面白そうなことに次々と飛びつき、まわりを元気にする。"],
  ENTP: ["ひっくり返して考える人", "当たり前を疑うのが好きで、議論そのものを楽しめる。"],
  ESTJ: ["仕切って進める人", "役割と段取りを決めて、物事を確実に前へ進める。"],
  ESFJ: ["輪をつくる人", "みんなが居心地よくいられるように、こまめに気を配る。"],
  ENFJ: ["人を引っ張り上げる人", "相手の可能性を信じて、その気にさせるのがうまい。"],
  ENTJ: ["ゴールへ率いる人", "目標を決めたら、人も仕組みも動かして達成しにいく。"],
};
const IDENT = { A: "自信型。気持ちが安定していて、失敗を引きずりにくい。", T: "慎重型。細かいところに気づき、もっと良くしようと考え続ける。" };
const GROUPS = { NT: "考える派", NF: "寄りそう派", SJ: "守る派", SP: "動く派" };
const groupOf = c => c[1] === "N" ? (c[2] === "T" ? "NT" : "NF") : (c[3] === "J" ? "SJ" : "SP");
// A round little creature: body color by group, eyes/arms by E/I, mouth by T/F, accessory by group, A = sparkle / T = sweat drop
function charaSVG(c) {
  const g = groupOf(c), ink = "var(--ink-char)", body = `var(--${g.toLowerCase()})`;
  const E = c[0] === "E", F = c[2] === "F", A = c.slice(-1) === "A";
  const arms = E
    ? `<ellipse cx="20" cy="46" rx="7" ry="11" transform="rotate(-35 20 46)" fill="${body}"/><ellipse cx="80" cy="46" rx="7" ry="11" transform="rotate(35 80 46)" fill="${body}"/>`
    : `<ellipse cx="19" cy="70" rx="6" ry="9" transform="rotate(20 19 70)" fill="${body}"/><ellipse cx="81" cy="70" rx="6" ry="9" transform="rotate(-20 81 70)" fill="${body}"/>`;
  const eyes = E
    ? `<circle cx="40" cy="58" r="4" fill="${ink}"/><circle cx="60" cy="58" r="4" fill="${ink}"/><circle cx="41.5" cy="56.5" r="1.3" fill="#fff"/><circle cx="61.5" cy="56.5" r="1.3" fill="#fff"/>`
    : `<path d="M35 59 q5 -6 10 0 M55 59 q5 -6 10 0" stroke="${ink}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  const mouth = F
    ? `<path d="M44 66 q6 9 12 0 z" fill="${ink}"/>`
    : `<path d="M45 67 q5 4 10 0" stroke="${ink}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
  const acc = {
    NT: `<circle cx="40" cy="58" r="8" fill="none" stroke="${ink}" stroke-width="2.4"/><circle cx="60" cy="58" r="8" fill="none" stroke="${ink}" stroke-width="2.4"/><path d="M48 58 h4" stroke="${ink}" stroke-width="2.4"/>`,
    NF: `<path d="M50 32 v-10" stroke="#3d8a5a" stroke-width="3" stroke-linecap="round"/><ellipse cx="43" cy="20" rx="7" ry="4" transform="rotate(-25 43 20)" fill="#6cc98f"/><ellipse cx="57" cy="20" rx="7" ry="4" transform="rotate(25 57 20)" fill="#6cc98f"/>`,
    SJ: `<path d="M50 82 l-9 -5 v10 z M50 82 l9 -5 v10 z" fill="${ink}"/><circle cx="50" cy="82" r="2.6" fill="${ink}"/>`,
    SP: `<path d="M24 52 q0 -30 26 -30 q26 0 26 30" stroke="${ink}" stroke-width="3.5" fill="none"/><rect x="18" y="48" width="10" height="16" rx="4" fill="${ink}"/><rect x="72" y="48" width="10" height="16" rx="4" fill="${ink}"/>`,
  }[g];
  const mood = A
    ? `<path d="M84 22 l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2 l6 -2 z" fill="#ffd34d"/>`
    : `<path d="M84 26 q5 8 0 11 q-5 -3 0 -11 z" fill="#8fd0f5"/>`;
  return `<svg class="chara" viewBox="0 0 100 100" aria-hidden="true">
    ${arms}<ellipse cx="50" cy="60" rx="32" ry="29" fill="${body}"/>
    <ellipse cx="31" cy="67" rx="5" ry="3" fill="var(--blush)" opacity=".55"/><ellipse cx="69" cy="67" rx="5" ry="3" fill="var(--blush)" opacity=".55"/>
    ${eyes}${mouth}${acc}${mood}</svg>`;
}
function typeCard(kind, label, p, emptyText) {
  if (!p) return `<div class="type ${kind}"><span class="lbl"><i></i>${label}</span><span class="code none">${emptyText}</span></div>`;
  const c = code(p), t = TYPES[c.slice(0, 4)], g = groupOf(c);
  // Letters on an axis within NEAR of 50% are faded and listed, so a borderline result reads as one.
  const near = AXES.map((ax, i) => Math.abs(p[i] - 50) <= NEAR ? i : -1).filter(i => i >= 0);
  const letters = c.replace("-", "").split("");
  const codeHTML = letters.map((l, i) => `${i === 4 ? "-" : ""}<span${near.includes(i) ? ' class="near" title="ほぼ半々"' : ""}>${l}</span>`).join("");
  const nearNote = near.length ? `<span class="near-note">ほぼ半々：${near.map(i => `${AXES[i].a}/${AXES[i].b}（${AXES[i].a}${p[i]}%）`).join("、")}。ここは逆の文字になってもおかしくありません。</span>` : "";
  return `<div class="type ${kind}" data-g="${g}"><span class="lbl"><i></i>${label}</span>
    <div class="head"><div><span class="grp">${GROUPS[g]}</span><span class="code">${codeHTML}</span><span class="nick">${t[0]}</span></div>${charaSVG(c)}</div>
    <span class="desc">${t[1]}<br>-${c.slice(-1)}：${IDENT[c.slice(-1)]}</span>${nearNote}</div>`;
}

const state = {
  view: "result",
  db: null, me: null, people: {}, group: null, setupMissing: false,
  selected: null, target: null, ready: false,
};
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nameOf = id => id === state.me ? "あなた" : ((state.people[id] && state.people[id].nick) || "名前未設定");

// --- results ---------------------------------------------------------
function othersFor(id) {
  const out = [];
  for (const [rid, doc] of Object.entries(state.people)) {
    if (rid === id) continue;
    const g = doc.given && doc.given[id];
    if (g && Array.isArray(g.answers)) out.push({ raw: g.answers, pcts: score(g.answers), comment: typeof g.comment === "string" ? g.comment.trim() : "", nick: typeof doc.nick === "string" ? doc.nick.trim() : "", at: g.at || 0 });
  }
  return out;
}
// Per-question gap: others' average answer minus your own (both on 1..7)
function deepHTML(selfA, others) {
  if (!selfA) return "";
  // Only compare answers given to the same question set as your own.
  others = others.filter(o => o.raw.length === selfA.length);
  if (!others.length) return "";
  const rows = itemsFor(selfA).map((q, i) => {
    const o = others.reduce((s, x) => s + x.raw[i], 0) / others.length;
    return { text: q[2], s: selfA[i], o, d: o - selfA[i] };
  });
  const pos = v => ((v - 1) / 6) * 100;
  const rowHTML = r => `<div class="qrow"><span class="qtext">${esc(r.text)}</span>
    <div class="track"><div class="mid"></div>
      <div class="span" style="left:${Math.min(pos(r.s), pos(r.o))}%;width:${Math.abs(pos(r.s) - pos(r.o))}%"></div>
      <div class="mk others" style="left:${pos(r.o)}%"></div><div class="mk self" style="left:${pos(r.s)}%"></div>
    </div>
    <span class="vals">自分 ${r.s} ／ まわり ${r.o.toFixed(1)}（7が「そう思う」）</span></div>`;
  const mine = rows.filter(r => r.d <= -1.5).sort((a, b) => a.d - b.d).slice(0, 3);
  const theirs = rows.filter(r => r.d >= 1.5).sort((a, b) => b.d - a.d).slice(0, 3);
  const none = `<p class="note">差が1.5以上ある質問はありません。</p>`;
  const all = rows.slice().sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  return `<div class="block"><h2>質問ごとのズレ</h2>
    <div class="deep-cols">
      <div><p class="note"><b style="color:var(--self)">自分ではそう思っている</b>のに、まわりはそこまで感じていないこと</p>${mine.length ? mine.map(rowHTML).join("") : none}</div>
      <div><p class="note"><b style="color:var(--others)">まわりはそう感じている</b>のに、自分ではそう思っていないこと</p>${theirs.length ? theirs.map(rowHTML).join("") : none}</div>
    </div>
    <details><summary>${all.length}問すべてをズレの大きい順に見る</summary><div class="all">${all.map(rowHTML).join("")}</div></details>
  </div>`;
}
function commentsHTML(others) {
  const list = others.filter(o => o.comment).sort((a, b) => b.at - a.at);
  if (!list.length) return "";
  return `<div class="block"><h2>まわりのひとこと</h2><ul class="quotes">${list.map(o => `<li>${esc(o.comment)}<cite>${esc(o.nick || "匿名")}</cite></li>`).join("")}</ul></div>`;
}
function comparisonHTML(selfA, others, isExample) {
  const selfP = selfA ? score(selfA) : null;
  const othersList = others.map(o => o.pcts);
  const othersP = othersList.length ? average(othersList) : null;
  let gapText = "";
  if (selfP && othersP) {
    let best = 0;
    AXES.forEach((_, i) => { if (Math.abs(selfP[i] - othersP[i]) > Math.abs(selfP[best] - othersP[best])) best = i; });
    const ax = AXES[best], d = Math.abs(selfP[best] - othersP[best]);
    const side = p => p >= 50 ? `${ax.la}寄り ${p}%` : `${ax.lb}寄り ${100 - p}%`;
    gapText = d < 10
      ? `<p class="gap">どの軸もズレは10ポイント未満。自分の見立てとまわりの見立てがほぼ一致しています。</p>`
      : `<p class="gap">いちばんズレているのは<b>${ax.name}（${ax.la}／${ax.lb}）</b>。自分では<b style="color:var(--self)">${side(selfP[best])}</b>、まわりからは<b style="color:var(--others)">${side(othersP[best])}</b>に見えています。</p>`;
  }
  const axes = AXES.map((ax, i) => {
    const s = selfP ? selfP[i] : null, o = othersP ? othersP[i] : null;
    // track runs left = first letter (100%) to right = second letter
    const x = p => 100 - p;
    const span = s != null && o != null
      ? `<div class="span" style="left:${Math.min(x(s), x(o))}%;width:${Math.abs(s - o)}%"></div>` : "";
    return `<div class="axis">
      <div class="ends"><span>${ax.la}（${ax.a}）</span><span>${ax.lb}（${ax.b}）</span></div>
      <div class="track"><div class="mid"></div>${span}
        ${o != null ? `<div class="mk others" style="left:${x(o)}%" title="まわり ${o}%"></div>` : ""}
        ${s != null ? `<div class="mk self" style="left:${x(s)}%" title="自分 ${s}%"></div>` : ""}
      </div>
      <div class="pcts"><span>${s != null ? "自分 " + (s >= 50 ? ax.a + s : ax.b + (100 - s)) + "%" : ""}</span><span>${o != null ? "まわり " + (o >= 50 ? ax.a + o : ax.b + (100 - o)) + "%" : ""}</span></div>
    </div>`;
  }).join("");
  return `
    ${isExample ? `<p class="note"><span class="badge">表示例</span> まだ回答がないので、仮のデータで見え方を示しています。</p>` : ""}
    <div class="types">
      ${typeCard("self", "自分が思うタイプ", selfP, "未回答")}
      ${typeCard("others", `まわりが思うタイプ（${othersList.length}人の平均）`, othersP, "まだ誰も答えていません")}
    </div>
    ${gapText}
    <div class="legend"><span><i class="ls"></i>自分の回答</span><span><i class="lo"></i>まわりの回答（平均）</span></div>
    <div class="axes">${axes}</div>
    ${others.length ? `<div><p class="note">ひとりずつの見立て</p><div class="raters">${others.map(o => `<span><b>${esc(o.nick || "匿名")}</b> ${code(o.pcts)}</span>`).join("")}</div></div>` : ""}
    ${commentsHTML(others)}
    ${deepHTML(selfA, others)}`;
}
const EXAMPLE_SELF = [3,6,2,3,4,6,3,6,4,6,3,6,5,4,5,3,2,6,3,6];
const EXAMPLE_OTHERS = [
  { raw: [5,4,5,5,4,5,4,5,3,6,3,6,5,3,4,4,4,5,4,4], comment: "飲み会だとずっと話の中心にいる印象。", nick: "たっつん", at: 3 },
  { raw: [6,3,5,6,3,6,3,6,4,5,4,6,4,4,5,3,3,5,4,5], comment: "人の相談に乗るのがすごくうまい。", nick: "", at: 2 },
  { raw: [5,4,4,5,4,5,4,5,3,6,3,5,5,4,5,4,4,4,4,5], comment: "", nick: "みー", at: 1 },
].map(o => ({ ...o, pcts: score(o.raw) }));

function renderResult() {
  const el = $("#view-result");
  if (!state.db) {
    const msg = !state.ready ? "読み込み中…"
      : !state.group ? "グループのリンクを開くと、ここにみんなの結果が出ます。"
      : state.setupMissing ? "保存先（Firebase）がまだ設定されていません。README の手順で firebase-config.js を埋めてください。"
      : "保存先に接続できませんでした。少し待ってからページを開き直してください。";
    el.innerHTML = `<p class="note">${msg}</p>`
      + comparisonHTML(EXAMPLE_SELF, EXAMPLE_OTHERS, true);
    return;
  }
  const ids = Object.keys(state.people).filter(id => state.people[id].self || othersFor(id).length);
  if (state.me && !ids.includes(state.me)) ids.unshift(state.me);
  if (!state.selected || !ids.includes(state.selected)) state.selected = state.me || ids[0];
  const id = state.selected;
  const selfA = state.people[id] && state.people[id].self && state.people[id].self.answers;
  const others = othersFor(id);
  const empty = !selfA && !others.length;
  const chips = ids.length > 1 ? `<div class="chips">${ids.map(p =>
    `<button class="chip" data-pick="${esc(p)}" aria-pressed="${p === id}">${esc(nameOf(p))}</button>`).join("")}</div>` : "";
  let hint = "";
  const mineWithSelf = id === state.me && selfA;
  if (id === state.me && !selfA) hint = `<p class="note">まず「自分を診断」で${QS.length}問に答えてください。そのあと上のリンクを友だちに送ると、「誰かを診断」からあなたについて答えてもらえます。</p>`;
  else if (mineWithSelf && !others.length) hint = `<div class="share">
      <p class="share-title">あなたのリンクができました</p>
      <p class="note">このリンクを友だちに送ると、開いた人はすぐに<b>あなたを診断する画面</b>になります。答えが集まると、ここに「まわりが思うタイプ」が出ます。</p>
      <div class="actions"><input type="text" id="share-link" readonly value="${esc(shareLink())}"><button class="btn" id="share-copy">リンクをコピー</button><span class="status" id="share-status"></span></div>
      ${shareButtonsHTML()}
    </div>`;
  else if (mineWithSelf) hint = `<div class="share">
      <p class="share-title">結果をシェアする</p>
      <p class="note">あなたを診断するリンクも一緒に送られるので、受け取った人もそのまま答えられます。</p>
      ${shareButtonsHTML()}
    </div>`;
  el.innerHTML = chips + hint + (empty
    ? comparisonHTML(EXAMPLE_SELF, EXAMPLE_OTHERS, true)
    : comparisonHTML(selfA || null, others, false));
  const sc = $("#share-copy");
  if (sc) sc.onclick = () => copyLink($("#share-link"), $("#share-status"));
  if (mineWithSelf) bindShare(score(selfA), others.length ? average(others.map(o => o.pcts)) : null, others.length);
}

// --- sharing ---------------------------------------------------------
function biggestGap(a, b) {
  let i = 0;
  AXES.forEach((_, k) => { if (Math.abs(a[k] - b[k]) > Math.abs(a[i] - b[i])) i = k; });
  return { i, d: Math.abs(a[i] - b[i]) };
}
// ズレ度: average distance between your view and others' view over the five axes (0–100).
const zureOf = (a, b) => Math.round(AXES.reduce((s, _, i) => s + Math.abs(a[i] - b[i]), 0) / AXES.length);
function zureLine(z) {
  return z < 8 ? "まわりにも見たままの自分が伝わってる"
    : z < 16 ? "ちょっとだけ、見せてない顔がある"
    : z < 25 ? "まわりが知らない自分がけっこういる"
    : "自分とまわりで、ほぼ別人";
}
// pub: for public posts (X, images). Those carry only the top page, never the group link,
// so strangers can't see the group's nicknames and comments.
function shareText(selfP, othersP, n, pub) {
  const c1 = code(selfP);
  let s = `【ミラー16】\n自分では ${c1}「${TYPES[c1.slice(0, 4)][0]}」`;
  if (othersP) {
    const c2 = code(othersP), z = zureOf(selfP, othersP);
    s += `\nまわりからは ${c2}「${TYPES[c2.slice(0, 4)][0]}」（${n}人）`;
    s += `\nズレ度 ${z}%：${zureLine(z)}`;
    s += pub ? `\n\nあなたは自分とまわりでどれくらいズレてる？↓` : `\n\nわたしのこと、どう見えてる？↓`;
  } else {
    s += pub ? `\nまわりからどう見えてるか、友だちに診断してもらえるよ↓` : `\nまわりからはどう見えてる？ 診断してみて↓`;
  }
  return s + "\n" + (pub ? location.origin + location.pathname + "\n#ミラー16" : shareLink());
}
function shareButtonsHTML() {
  return `<div class="actions share-btns">
      <a class="btn line" id="share-line" href="#" target="_blank" rel="noopener">LINEで送る</a>
      <a class="btn x" id="share-x" href="#" target="_blank" rel="noopener">Xでポスト</a>
      <button class="btn ghost" id="share-image">画像にする（インスタ用）</button>
    </div>
    <div id="share-image-box" class="share-image" hidden></div>`;
}
function bindShare(selfP, othersP, n) {
  const a = $("#share-line");
  if (!a) return;
  a.href = "https://line.me/R/share?text=" + encodeURIComponent(shareText(selfP, othersP, n));
  $("#share-x").href = "https://x.com/intent/post?text=" + encodeURIComponent(shareText(selfP, othersP, n, true));
  $("#share-image").onclick = async () => {
    const box = $("#share-image-box"), btn = $("#share-image");
    btn.disabled = true; btn.textContent = "画像を作っています…";
    try {
      const blob = await drawCard(selfP, othersP, n);
      const url = URL.createObjectURL(blob);
      const file = new File([blob], "mirror16.png", { type: "image/png" });
      const canShare = navigator.canShare && navigator.canShare({ files: [file] });
      box.hidden = false;
      box.innerHTML = `<img src="${url}" alt="診断結果の画像">
        <div class="actions">${canShare ? `<button class="btn" id="share-file">画像をシェア（インスタ・LINE・Xなど）</button>` : ""}
        <a class="btn ghost" href="${url}" download="mirror16.png">画像を保存</a></div>
        <p class="note">画像に名前は入りません。インスタのストーリーにそのまま貼れる縦長サイズです。スマホでは画像を長押ししても保存できます。</p>`;
      const sf = $("#share-file");
      if (sf) sf.onclick = () => navigator.share({ files: [file], text: shareText(selfP, othersP, n, true) }).catch(() => {});
      box.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (e) {
      console.error(e);
      box.hidden = false; box.innerHTML = `<p class="status err">画像を作れませんでした。ページを開き直してもう一度お試しください。</p>`;
    } finally { btn.disabled = false; btn.textContent = "結果を画像にする"; }
  };
}

// Result card image. Fixed light palette so the picture looks the same whatever theme the sender uses.
const CARD = {
  "--bg": "#eef1f4", "--surface": "#ffffff", "--fg": "#1c2230", "--muted": "#5d6676", "--line": "#d5dbe3",
  "--self": "#2346b8", "--others": "#d2386c", "--self-soft": "#dbe3fb", "--others-soft": "#f9dbe5",
  "--nt": "#8d6bb0", "--nt-soft": "#efe7f6", "--nt-strong": "#6b4a8f", "--nf": "#3fae7f", "--nf-soft": "#e2f4ea", "--nf-strong": "#23855a",
  "--sj": "#4a9cc1", "--sj-soft": "#e1eff6", "--sj-strong": "#2a7a9e", "--sp": "#e0a93a", "--sp-soft": "#fbf1dc", "--sp-strong": "#a8761a",
  "--ink-char": "#2a2833", "--blush": "#ff8fa8",
};
function charaImage(c) {
  const svg = charaSVG(c).replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" ')
    .replace(/var\((--[\w-]+)\)/g, (_, k) => CARD[k] || "#000");
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img); img.onerror = rej;
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}
// 1080x1920 = Instagram story size; no names anywhere on the card.
async function drawCard(selfP, othersP, n) {
  const DISP = '"Dela Gothic One", "Hiragino Sans", sans-serif', BODY = '"Zen Kaku Gothic New", "Hiragino Sans", "Yu Gothic", sans-serif';
  await Promise.all([document.fonts.load(`64px ${DISP}`, "ミラー16INFJ"), document.fonts.load(`700 30px ${BODY}`, "自分のまわり")]).catch(() => {});
  const W = 1080, H = 1920, cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const x = cv.getContext("2d"), C = k => CARD[k];
  const rr = (l, t, w, h, r, fill, stroke) => { x.beginPath(); x.roundRect(l, t, w, h, r); if (fill) { x.fillStyle = fill; x.fill(); } if (stroke) { x.strokeStyle = stroke; x.lineWidth = 2; x.stroke(); } };
  x.fillStyle = C("--bg"); x.fillRect(0, 0, W, H);
  rr(48, 48, W - 96, H - 96, 36, C("--surface"), C("--line"));
  // title
  x.textBaseline = "alphabetic"; x.font = `64px ${DISP}`;
  const t1 = "ミラー", t2 = "", t3 = "16";
  let tx = 100;
  [[t1, "--self"], [t2, "--fg"], [t3, "--others"]].forEach(([t, k]) => { x.fillStyle = C(k); x.fillText(t, tx, 170); tx += x.measureText(t).width; });
  // headline: ズレ度
  rr(100, 220, W - 200, 300, 28, C("--bg"));
  x.textAlign = "center";
  if (othersP) {
    const z = zureOf(selfP, othersP);
    x.font = `700 34px ${BODY}`; x.fillStyle = C("--muted"); x.fillText("自分とまわりのズレ度", W / 2, 290);
    x.font = `150px ${DISP}`; x.fillStyle = C("--others"); x.fillText(`${z}%`, W / 2, 440);
    x.font = `700 36px ${BODY}`; x.fillStyle = C("--fg"); x.fillText(zureLine(z), W / 2, 496);
  } else {
    x.font = `700 34px ${BODY}`; x.fillStyle = C("--muted"); x.fillText("自分とまわりのズレ度", W / 2, 300);
    x.font = `96px ${DISP}`; x.fillStyle = C("--others"); x.fillText("？？%", W / 2, 420);
    x.font = `700 34px ${BODY}`; x.fillStyle = C("--fg"); x.fillText("まわりからの回答、募集中", W / 2, 484);
  }
  x.textAlign = "left";
  // type boxes
  const box = async (l, label, p, labelKey, empty) => {
    const bw = 430, top = 570, bh = 420;
    if (!p) {
      rr(l, top, bw, bh, 24, C("--others-soft"));
      x.font = `700 28px ${BODY}`; x.fillStyle = C(labelKey); x.fillText(label, l + 30, top + 56);
      x.font = `500 28px ${BODY}`; x.fillStyle = C("--muted"); x.fillText(empty, l + 30, top + 130);
      return;
    }
    const c = code(p), g = groupOf(c).toLowerCase(), t = TYPES[c.slice(0, 4)];
    rr(l, top, bw, bh, 24, C(`--${g}-soft`));
    x.font = `700 28px ${BODY}`; x.fillStyle = C(labelKey); x.fillText(label, l + 30, top + 56);
    x.font = `700 24px ${BODY}`; x.fillStyle = C(`--${g}-strong`); x.fillText(GROUPS[groupOf(c)], l + 30, top + 100);
    x.font = `76px ${DISP}`; x.fillText(c, l + 26, top + 186);
    x.font = `700 32px ${BODY}`; x.fillStyle = C("--fg"); x.fillText(t[0], l + 30, top + 240);
    const img = await charaImage(c);
    x.drawImage(img, l + bw / 2 - 80, top + 252, 160, 160);
  };
  await box(100, "自分が思うタイプ", selfP, "--self");
  await box(550, othersP ? `まわりが思うタイプ（${n}人）` : "まわりが思うタイプ", othersP, "--others", "回答募集中！");
  // axes
  let y = 1090;
  AXES.forEach((ax, i) => {
    const L = 160, R = W - 160, tw = R - L, X = p => L + (100 - p) / 100 * tw;
    x.font = `700 26px ${BODY}`; x.fillStyle = C("--fg");
    x.textAlign = "left"; x.fillText(`${ax.la}(${ax.a})`, L, y);
    x.textAlign = "right"; x.fillText(`${ax.lb}(${ax.b})`, R, y);
    x.textAlign = "left";
    const ty = y + 34;
    x.fillStyle = C("--line"); x.fillRect(L, ty - 2, tw, 4);
    x.fillRect(L + tw / 2 - 1, ty - 12, 2, 24);
    if (othersP) { x.beginPath(); x.arc(X(othersP[i]), ty, 14, 0, Math.PI * 2); x.fillStyle = C("--surface"); x.fill(); x.lineWidth = 6; x.strokeStyle = C("--others"); x.stroke(); }
    x.beginPath(); x.arc(X(selfP[i]), ty, 14, 0, Math.PI * 2); x.fillStyle = C("--self"); x.fill();
    y += 88;
  });
  // legend + gap line
  x.font = `500 24px ${BODY}`; x.fillStyle = C("--muted");
  x.beginPath(); x.arc(172, y - 8, 10, 0, Math.PI * 2); x.fillStyle = C("--self"); x.fill();
  x.fillStyle = C("--muted"); x.fillText("自分", 192, y);
  if (othersP) {
    x.beginPath(); x.arc(282, y - 8, 10, 0, Math.PI * 2); x.lineWidth = 5; x.strokeStyle = C("--others"); x.stroke();
    x.fillText("まわり", 302, y);
    const g = biggestGap(selfP, othersP);
    x.font = `700 28px ${BODY}`; x.fillStyle = C("--fg");
    x.fillText(g.d >= 10 ? `いちばんズレてたのは「${AXES[g.i].name}」` : "自分の見立てとまわりの見立て、ほぼ一致", 160, y + 56);
  }
  x.textAlign = "center";
  x.font = `700 34px ${BODY}`; x.fillStyle = C("--fg");
  x.fillText("あなたはどれくらいズレてる？", W / 2, H - 150);
  x.font = `500 28px ${BODY}`; x.fillStyle = C("--muted");
  x.fillText(location.host + " で診断できます", W / 2, H - 100);
  return new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error("toBlob failed")), "image/png"));
}

// --- questionnaires --------------------------------------------------
const SCALE = ["まったくそう思わない", "そう思わない", "あまりそう思わない", "どちらともいえない", "ややそう思う", "そう思う", "とてもそう思う"];
function formHTML(prefix, prefill) {
  if (prefill && prefill.length !== QS.length) prefill = null;
  return `<div class="scale-key" aria-hidden="true"><span class="no">← 左ほど そう思わない</span><span class="yes">右ほど そう思う →</span></div>
  <ol class="q">${QS.map((q, i) => `<li>
    <div class="qt"><small>${String(i + 1).padStart(2, "0")}</small>${esc(q[2])}</div>
    <div class="scale"><span class="no">そう<br>思わない</span><div class="dots" role="radiogroup" aria-label="${esc(q[2])}">
      ${[1,2,3,4,5,6,7].map(v => `<label title="${SCALE[v - 1]}"><input type="radio" id="${prefix}-${i}-${v}" name="${prefix}-${i}" value="${v}" aria-label="${SCALE[v - 1]}"${prefill && prefill[i] === v ? " checked" : ""}><span></span></label>`).join("")}
    </div><span class="yes">そう<br>思う</span></div>
  </li>`).join("")}</ol>`;
}
function readForm(root, prefix) {
  const out = [];
  for (let i = 0; i < QS.length; i++) {
    const c = root.querySelector(`input[name="${prefix}-${i}"]:checked`);
    if (!c) return { missing: i + 1 };
    out.push(Number(c.value));
  }
  return { answers: out };
}
function setStatus(el, text, kind) {
  el.textContent = text;
  el.className = "status" + (kind ? " " + kind : "");
  el.setAttribute("role", kind === "err" ? "alert" : "status");
}
// Point at the first unanswered question instead of a quiet note next to the button.
function flagMissing(root, prefix, n, statusEl) {
  root.querySelectorAll("li.missing").forEach(li => li.classList.remove("missing"));
  const li = root.querySelector(`input[name="${prefix}-${n - 1}"]`).closest("li");
  li.classList.add("missing");
  li.addEventListener("change", () => li.classList.remove("missing"), { once: true });
  li.scrollIntoView({ behavior: "smooth", block: "center" });
  setStatus(statusEl, `${n}問目がまだです。赤くなっている質問に答えてから、もう一度保存してください。`, "err");
}
async function saveMine(mutate, statusEl, btn) {
  if (!state.db || !state.me) {
    setStatus(statusEl, !state.group ? "先に上の「グループを作る」を押すか、友だちから届いたリンクを開いてください。"
      : state.connectError ? `保存先につながっていないので保存できません（${state.connectError}）。ページを開き直してください。`
      : "保存先につながるのを待っています。数秒待ってからもう一度押してください。", "err");
    return;
  }
  btn.disabled = true; setStatus(statusEl, "保存しています…");
  const cur = JSON.parse(JSON.stringify(state.people[state.me] || {}));
  mutate(cur);
  cur.at = Date.now();
  const slow = setTimeout(() => setStatus(statusEl, "保存に時間がかかっています。電波のいい場所で、このまま少し待ってください。", "err"), 10000);
  try {
    await setDoc(doc(state.db, "groups", state.group, "people", state.me), cur);
    setStatus(statusEl, "保存しました。", "ok");
    return true;
  } catch (e) {
    console.error(e);
    setStatus(statusEl, e && e.code === "permission-denied"
      ? "保存が拒否されました。あだ名やひとことが長すぎないか確かめてください。"
      : `保存できませんでした（${(e && e.code) || "通信エラー"}）。通信を確かめてもう一度お試しください。`, "err");
  } finally { clearTimeout(slow); btn.disabled = false; }
}

function renderSelf() {
  const el = $("#view-self");
  const mine = state.people[state.me];
  el.innerHTML = `<div class="field"><label for="s-nick">あなたのあだ名</label>
      <p class="note">グループのみんなには、この名前で表示されます。</p>
      <input type="text" id="s-nick" maxlength="20" placeholder="例：むーちゃん" autocomplete="off"></div>
    <p class="note">ふだんの自分にいちばん近いものを選んでください。7段階、全${QS.length}問です。</p>
    ${mine && mine.self && mine.self.answers.length !== QS.length ? `<p class="status err">質問が${QS.length}問に増えて、判定の精度が上がりました。今の結果は前の${mine.self.answers.length}問の答えで出しています。答え直すと新しい質問で判定されます。</p>` : ""}
    ${formHTML("s", mine && mine.self && mine.self.answers)}
    <div class="actions"><button class="btn" id="save-self">保存して結果を見る</button><span class="status" id="status-self"></span></div>`;
  const nk = $("#s-nick");
  nk.value = (mine && mine.nick) || "";
  $("#save-self").onclick = async () => {
    const r = readForm(el, "s"), st = $("#status-self"), nick = nk.value.trim().slice(0, 20);
    if (!nick) { setStatus(st, "いちばん上の「あなたのあだ名」を入れてください。", "err"); nk.scrollIntoView({ behavior: "smooth", block: "center" }); nk.focus(); return; }
    if (r.missing) { flagMissing(el, "s", r.missing, st); return; }
    const ok = await saveMine(cur => { cur.nick = nick; cur.self = { answers: r.answers, at: Date.now() }; }, st, $("#save-self"));
    if (ok) { state.selected = state.me; show("result"); }
  };
}

function renderOther() {
  const el = $("#view-other");
  const candidates = Object.keys(state.people).filter(id => id !== state.me && state.people[id].self);
  if (!state.db) { el.innerHTML = `<p class="note">グループのリンクを開くと、自己診断を済ませた人の一覧がここに出ます。</p>`; return; }
  if (!candidates.length) {
    const meDone = state.people[state.me] && state.people[state.me].self;
    el.innerHTML = meDone
      ? `<p class="note">このグループで自己診断を済ませたのは、まだあなただけです。ここには自分以外の人が出るので、今は誰も選べません。<br>上のリンクを友だちに送ると、開いた人はすぐに<b>あなたを診断する画面</b>になります。その人が自己診断を済ませると、ここに出てきます。</p>`
      : `<p class="note">まだ自己診断を済ませた人がいません。先に「自分を診断」をして、上のリンクを友だちに送ってください。</p>`;
    return;
  }
  if (!candidates.includes(state.target)) state.target = null;
  const given = state.people[state.me] && state.people[state.me].given || {};
  const chips = `<div class="chips">${candidates.map(p =>
    `<button class="chip" data-target="${esc(p)}" aria-pressed="${p === state.target}">${esc(nameOf(p))}${given[p] ? " ✓" : ""}</button>`).join("")}</div>`;
  if (!state.target) { el.innerHTML = `<p class="note">誰について答えますか。✓は回答済みの人です。答え直すこともできます。</p>` + chips; return; }
  el.innerHTML = chips + `<p class="note"><b>${esc(nameOf(state.target))}</b>さんがふだんどう見えるかで答えてください。相手の画面には、下に書いたあだ名と一緒に表示されます。あだ名が空欄なら「匿名」になります。</p>
    ${formHTML("o", given[state.target] && given[state.target].answers)}
    <div class="field"><label for="o-comment">ひとこと（任意）</label>
      <p class="note">「この人のこういうところ」を短く。相手の結果画面に表示されます。</p>
      <textarea id="o-comment" maxlength="140" placeholder="例：話を聞くのがすごくうまい"></textarea>
      <span class="counter" id="o-count"></span></div>
    <div class="field"><label for="o-nick">あなたのあだ名（任意）</label>
      <p class="note">相手の結果に「誰の見立てか」として出ます。自己診断のあだ名と同じものです。</p>
      <input type="text" id="o-nick" maxlength="20" placeholder="例：むーちゃん" autocomplete="off"></div>
    <div class="actions"><button class="btn" id="save-other">保存する</button><span class="status" id="status-other"></span></div>`;
  const ta = $("#o-comment"), cnt = $("#o-count"), nk = $("#o-nick");
  ta.value = (given[state.target] && given[state.target].comment) || "";
  nk.value = (state.people[state.me] && state.people[state.me].nick) || "";
  const upd = () => { cnt.textContent = `${ta.value.length} / 140`; };
  ta.addEventListener("input", upd); upd();
  $("#save-other").onclick = async () => {
    const r = readForm(el, "o"), st = $("#status-other"), t = state.target;
    if (r.missing) { flagMissing(el, "o", r.missing, st); return; }
    const comment = ta.value.trim().slice(0, 140), nick = nk.value.trim().slice(0, 20);
    const ok = await saveMine(cur => { if (nick || !cur.self) cur.nick = nick; cur.given = Object.assign({}, cur.given, { [t]: { answers: r.answers, comment, at: Date.now() } }); }, st, $("#save-other"));
    if (!ok) return;
    const meDone = state.people[state.me] && state.people[state.me].self;
    const next = $("#next-other") || el.appendChild(Object.assign(document.createElement("div"), { id: "next-other", className: "share" }));
    next.innerHTML = meDone
      ? `<p class="share-title">${esc(nameOf(t))}さんへの回答を保存しました</p>
         <p class="note">ほかにも答えられる人がいれば、上の名前を選んで続けて答えられます。</p>`
      : `<p class="share-title">${esc(nameOf(t))}さんへの回答を保存しました</p>
         <p class="note">次はあなたの番です。自分のことを診断すると、あなた専用のリンクができて、みんなにあなたを診断してもらえます。</p>
         <div class="actions"><button class="btn" id="go-self">自分を診断する</button></div>`;
    const go = $("#go-self");
    if (go) go.onclick = () => { show("self"); window.scrollTo({ top: 0, behavior: "smooth" }); };
    next.scrollIntoView({ behavior: "smooth", block: "center" });
  };
}

// --- map -------------------------------------------------------------
state.mapX = 0; state.mapY = 2;
function mapPeople() {
  if (!state.db) return null;
  const out = [];
  for (const id of Object.keys(state.people)) {
    const self = state.people[id].self;
    const others = othersFor(id);
    if (!self && !others.length) continue;
    out.push({ id, name: nameOf(id), self: self ? score(self.answers) : null, others: others.length ? average(others.map(o => o.pcts)) : null });
  }
  return out;
}
function renderMap() {
  const el = $("#view-map");
  let people = mapPeople(), example = false;
  if (!people || !people.length) {
    example = true;
    people = [
      { id: "ex1", name: "Aさん", self: score(EXAMPLE_SELF), others: average(EXAMPLE_OTHERS.map(o => o.pcts)) },
      { id: "ex2", name: "Bさん", self: [70, 30, 75, 80, 60], others: [55, 40, 80, 85, 50] },
      { id: "ex3", name: "Cさん", self: [30, 70, 35, 25, 40], others: [45, 60, 30, 35, 55] },
    ];
  }
  const X = AXES[state.mapX], Y = AXES[state.mapY];
  const opts = sel => AXES.map((a, i) => `<option value="${i}"${i === sel ? " selected" : ""}>${a.la}／${a.lb}</option>`).join("");
  // left / top = first letter (100%), matching the result tracks
  const P = 56, W = 400, px = p => P + (100 - p) / 100 * (W - 2 * P), py = p => P + (100 - p) / 100 * (W - 2 * P);
  const pts = people.map(pp => {
    const sx = pp.self && px(pp.self[state.mapX]), sy = pp.self && py(pp.self[state.mapY]);
    const ox = pp.others && px(pp.others[state.mapX]), oy = pp.others && py(pp.others[state.mapY]);
    const hl = pp.id === state.selected;
    const lx = pp.self ? sx : ox, ly = pp.self ? sy : oy;
    return `<g class="pt" data-pick-map="${esc(pp.id)}" tabindex="0" role="button" aria-label="${esc(pp.name)}の結果を見る" opacity="${hl || example ? 1 : .85}">
      ${pp.self && pp.others ? `<line x1="${ox}" y1="${oy}" x2="${sx}" y2="${sy}" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="3 3"/>` : ""}
      ${pp.others ? `<circle cx="${ox}" cy="${oy}" r="7" fill="var(--surface)" stroke="var(--others)" stroke-width="3"/>` : ""}
      ${pp.self ? `<circle cx="${sx}" cy="${sy}" r="${hl ? 9 : 7}" fill="var(--self)"/>` : ""}
      <text x="${lx}" y="${ly - 13}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--fg)">${esc(pp.name)}</text>
    </g>`;
  }).join("");
  const q = (x, y, t) => `<text x="${x}" y="${y}" text-anchor="middle" font-size="11" fill="var(--muted)">${t}</text>`;
  el.innerHTML = `${example ? `<p class="note"><span class="badge">表示例</span> 回答が集まると、参加した人がここに並びます。</p>` : ""}
    <div class="mapctl"><label for="map-x">横軸</label><select id="map-x">${opts(state.mapX)}</select>
      <label for="map-y">縦軸</label><select id="map-y">${opts(state.mapY)}</select></div>
    <div class="legend"><span><i class="ls"></i>自分の回答</span><span><i class="lo"></i>まわりから見た位置</span><span>点線＝ズレ</span></div>
    <div class="mapbox"><svg viewBox="0 0 ${W} ${W}" role="img" aria-label="${X.la}と${Y.la}の散布図">
      <rect x="${P}" y="${P}" width="${W - 2 * P}" height="${W - 2 * P}" fill="var(--bg)" stroke="var(--line)"/>
      <line x1="${W / 2}" y1="${P}" x2="${W / 2}" y2="${W - P}" stroke="var(--line)"/><line x1="${P}" y1="${W / 2}" x2="${W - P}" y2="${W / 2}" stroke="var(--line)"/>
      <text x="${P}" y="${W - P + 22}" font-size="13" font-weight="700" fill="var(--fg)">← ${X.la}（${X.a}）</text>
      <text x="${W - P}" y="${W - P + 22}" text-anchor="end" font-size="13" font-weight="700" fill="var(--fg)">${X.lb}（${X.b}）→</text>
      <text x="${P - 10}" y="${P + 4}" text-anchor="end" font-size="13" font-weight="700" fill="var(--fg)">${Y.a}</text>
      <text x="${P - 10}" y="${W - P}" text-anchor="end" font-size="13" font-weight="700" fill="var(--fg)">${Y.b}</text>
      <text x="${W / 2}" y="${P - 16}" text-anchor="middle" font-size="13" font-weight="700" fill="var(--fg)">↑ ${Y.la}／${Y.lb} ↓</text>
      ${pts}
    </svg></div>
    ${example ? "" : `<p class="note">点を押すと、その人の結果を開きます。</p>`}`;
  $("#map-x").onchange = e => { state.mapX = Number(e.target.value); renderMap(); };
  $("#map-y").onchange = e => { state.mapY = Number(e.target.value); renderMap(); };
}
function pickFromMap(id) {
  if (id.startsWith("ex")) return;
  state.selected = id; show("result");
}

// --- shell -----------------------------------------------------------
function show(view) {
  state.view = view;
  document.querySelectorAll("nav button").forEach(b => b.setAttribute("aria-selected", b.dataset.view === view));
  $("#view-result").hidden = view !== "result";
  $("#view-self").hidden = view !== "self";
  $("#view-other").hidden = view !== "other";
  $("#view-map").hidden = view !== "map";
  render(true);
  try { localStorage.setItem("m16-view", view); } catch (e) {}
}
// Forms re-render only on tab switch or when explicitly asked, so live snapshots don't wipe half-filled answers.
function render(forms) {
  renderResult();
  renderMap();
  if (forms || state.view !== "self") renderSelf();
  if (forms || state.view !== "other") renderOther();
}
document.querySelector("nav").addEventListener("click", e => { const b = e.target.closest("button[data-view]"); if (b) show(b.dataset.view); });
document.addEventListener("click", e => {
  const p = e.target.closest("[data-pick]"); if (p) { state.selected = p.dataset.pick; renderResult(); }
  const t = e.target.closest("[data-target]"); if (t) { state.target = t.dataset.target; renderOther(); }
  const m = e.target.closest("[data-pick-map]"); if (m) pickFromMap(m.dataset.pickMap);
});
document.addEventListener("keydown", e => {
  const m = e.target.closest && e.target.closest("[data-pick-map]");
  if (m && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); pickFromMap(m.dataset.pickMap); }
});

// --- group link ------------------------------------------------------
// A group lives at #g-xxxxxxxxxx; everyone who opens the same link sees the same people.
function newGroupId() {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789", r = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(r, b => abc[b % abc.length]).join("");
}
function renderGroupBar() {
  const el = $("#group-bar");
  if (!state.group) {
    el.innerHTML = `<p class="note">まずグループを作って、そのリンクを友だちに送ってください。同じリンクを開いた人どうしで診断し合えます。</p>
      <div class="actions"><button class="btn" id="make-group">グループを作る</button></div>`;
    $("#make-group").onclick = () => { location.hash = "g-" + newGroupId(); };
    return;
  }
  const link = shareLink();
  const inv = state.inviter && state.inviter !== state.me && state.people[state.inviter];
  const invName = inv && inv.nick ? esc(inv.nick) : "";
  el.innerHTML = `${state.connectError ? `<p class="status err" role="alert">保存先につながりませんでした（${esc(state.connectError)}）。電波のいい場所でページを開き直してください。LINE などのアプリ内で開いている場合は、Safari や Chrome で開き直してください。</p>` : ""}${invName ?`<p class="gap"><b>${invName}</b>さんから届いたリンクです。「誰かを診断」で${invName}さんがどう見えるか答えてください。自分のことも「自分を診断」しておくと、みんなに答えてもらえます。</p>` : ""}
    <div class="field"><label for="group-link">このグループのリンク（友だちに送ってください）</label>
    <div class="actions"><input type="text" id="group-link" readonly value="${esc(link)}"><button class="btn" id="copy-link">コピー</button><span class="status" id="copy-status"></span></div></div>`;
  $("#copy-link").onclick = () => copyLink($("#group-link"), $("#copy-status"));
}
// The shared link carries the sender's id so the person who opens it lands on rating them.
function shareLink() {
  return location.origin + location.pathname + "#g-" + state.group + (state.me ? "-" + state.me : "");
}
async function copyLink(input, statusEl) {
  try { await navigator.clipboard.writeText(shareLink()); statusEl.textContent = "コピーしました。"; }
  catch (e) { input.select(); statusEl.textContent = "選択したので、そのままコピーしてください。"; }
}

(async function boot() {
  try { const v = localStorage.getItem("m16-view"); if (v) state.view = v; } catch (e) {}
  const m = location.hash.match(/^#g-([a-z0-9]{6,32})(?:-([A-Za-z0-9]{6,128}))?$/);
  state.group = m ? m[1] : null;
  state.inviter = m && m[2] ? m[2] : null;
  renderGroupBar();
  show(state.view);
  if (!state.group) { state.ready = true; render(true); return; }
  if (!firebaseConfig || !firebaseConfig.projectId || firebaseConfig.projectId.startsWith("YOUR_")) {
    state.ready = true; state.setupMissing = true; render(true); return;
  }
  try {
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const cred = await signInAnonymously(auth);
    state.me = cred.user.uid;
    // Long-polling fallback keeps it working on networks and in-app browsers that block streaming connections.
    state.db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
  } catch (e) {
    console.error(e);
    state.connectError = (e && e.code) || "接続エラー";
    state.ready = true; renderGroupBar(); render(true); return;
  }
  state.ready = true;
  onSnapshot(collection(state.db, "groups", state.group, "people"), snap => {
    const people = {};
    snap.docs.forEach(d => { people[d.id] = d.data(); });
    const firstLoad = !state.loaded;
    state.loaded = true;
    state.people = people;
    if (firstLoad) {
      // Opened from someone's link: go straight to rating them (or to self-diagnosis if they haven't done theirs yet).
      const inv = state.inviter && state.inviter !== state.me ? people[state.inviter] : null;
      if (inv && inv.self) { state.target = state.inviter; state.view = "other"; }
      else if (state.inviter && state.inviter !== state.me) state.view = "self";
      renderGroupBar();
      show(state.view);
      return;
    }
    render(false);
  }, e => { console.error(e); state.db = null; state.connectError = (e && e.code) || "接続エラー"; renderGroupBar(); render(true); });
})();
window.addEventListener("hashchange", () => location.reload());
