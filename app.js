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
// Longer write-up behind "もっと詳しく": strengths, pitfalls, how they are with people, how they come across.
const DETAIL = {
  ISTJ: ["コツコツ続ける力と記憶力。一度決めたルールや約束を、状況が変わってもぶれずに守れる。お金や時間の管理もきっちりしている。",
    "前例のないことや急な予定変更にストレスを感じやすい。「こうあるべき」が強く出ると、相手のやり方を認めにくくなることも。",
    "言葉より行動で気持ちを示すタイプ。派手さはないけれど、頼まれたことは必ず覚えていて、困ったときに一番頼れる存在。",
    "最初はまじめで少しかたい人。付き合ううちに、さりげない気づかいとじわじわくる冗談に気づかれる。"],
  ISFJ: ["人の好みや体調の変化をよく覚えていて、言われる前に動ける。地道な作業も丁寧に続けられ、チームの土台を支える。",
    "頼まれると断れず、ひとりで抱え込みがち。不満をため込んで、ある日いきなり限界がくることも。",
    "身近な人をとても大切にする。広く浅くより、少数の相手と長く深く付き合うのが好き。",
    "やさしくて穏やかな人。実はかなり細かいところまで見ていて、芯は強い。"],
  INFJ: ["人の気持ちや場の空気を深く読み取り、物事の本質に気づくのが早い。理想に向けて、長い時間をかけて静かに努力できる。",
    "完璧を求めすぎて自分を追い込みやすい。人に合わせすぎて疲れ、急にひとりになりたくなる。",
    "誰とでも感じよく話せるけれど、本当に心を開くのはごく一部の人だけ。相談相手に選ばれやすい。",
    "落ち着いていて何を考えているのか読めない人。話すと意外と熱く、ユーモアもある。"],
  INTJ: ["長い目で計画を立て、筋道を組み立てて実行する力。ムダや非効率を見つけて、もっといいやり方を考えるのが得意。",
    "感情より理屈を優先して、冷たく見られることがある。納得できないルールや、話の通じない相手にはいらだちやすい。",
    "人付き合いは少なめでいい派。そのぶん信頼した相手には誠実で、本気で力になろうとする。",
    "クールで近寄りがたい人。話してみると、好きな分野への熱量とマニアックさに驚かれる。"],
  ISTP: ["トラブルが起きても冷静で、手を動かしながら原因を見つけて直せる。道具や仕組みの扱いを覚えるのが早い。",
    "先の予定を決められたり、気持ちを言葉にするよう求められたりするのが苦手。飽きると急に手を引くことも。",
    "べったりした関係は苦手で、お互い自由でいられる距離感が心地いい。一緒に何かをする時間を大事にする。",
    "無口でマイペースな人。いざというときの頼もしさと器用さで一目置かれている。"],
  ISFP: ["感覚が鋭く、色・音・味・ファッションなど、いいものを見分けるセンスがある。人の痛みにもそっと寄りそえる。",
    "衝突を避けたくて、言いたいことを飲み込みがち。計画を立てたり、長期の目標を管理したりするのは得意じゃない。",
    "押しつけない、押しつけられない関係が好き。少しずつ打ち解けて、仲良くなるととても情が深い。",
    "おっとりしたやさしい人。好きなことの話になると目が輝いて、こだわりの強さが見えてくる。"],
  INFP: ["想像力と共感力が豊か。言葉や作品で気持ちを表すのが得意で、人の個性やいいところを見つけられる。",
    "理想と現実の差に落ち込みやすい。批判を深く受け止めすぎたり、やる気に波があったりする。",
    "表面的な付き合いより、価値観が通じ合う関係を求める。大切な人の味方でいることにまっすぐ。",
    "おだやかで少し不思議な人。自分の信念に関わることでは、びっくりするほど頑固になる。"],
  INTP: ["物事の仕組みを分解して理解する力。矛盾や見落としにすぐ気づき、斬新な考えを思いつく。",
    "考えるだけで満足して、行動や締め切りが後回しになりがち。気持ちのこもった話にどう返せばいいか迷うことも。",
    "ひとりの時間がないと疲れる。興味が合う相手とは、何時間でも語り合える。",
    "ぼーっとしているようで、頭の中はずっと忙しい人。たまに出る鋭い一言が印象に残る。"],
  ESTP: ["行動が早く、その場の状況を読んで動ける。ピンチや人前に強く、交渉や盛り上げも得意。",
    "じっくり計画を立てるのや、退屈な作業が苦手。思いつきで動いて、あとで困ることも。",
    "誰とでもすぐ仲良くなれて、一緒にいると楽しい。重い話より、まず一緒に遊ぶことで距離を縮める。",
    "ノリがよくて行動力のある人。意外と人のことをよく見ていて、空気を読むのもうまい。"],
  ESFP: ["その場を楽しくする天才。人の気持ちに敏感で、落ち込んでいる人をさりげなく元気づけられる。",
    "先のことを考えるのが苦手で、目の前の楽しさを優先しがち。否定されたり、退屈な場にいたりすると一気にしぼむ。",
    "人が大好きで、友だちが多い。好きな人には気持ちをストレートに伝える。",
    "明るくて華やかな人。実は人の顔色に敏感で、ひとりで落ち込む日もある。"],
  ENFP: ["好奇心とアイデアが次々にわいて、人を巻き込んで形にしていける。相手のいいところを見つけてほめるのがうまい。",
    "飽きっぽく、始めたことを最後まで続けるのが苦手。やることが多すぎて、気分の浮き沈みも大きい。",
    "初対面でもすぐ打ち解ける。深い話ができる相手を大切にし、友だちの夢を本気で応援する。",
    "いつも楽しそうな人。じつは繊細で、人にどう思われているかをけっこう気にしている。"],
  ENTP: ["頭の回転が速く、どんな話題にもついていける。前提を疑って、誰も思いつかなかった解決策を出せる。",
    "議論が楽しくて、つい相手を言い負かしてしまう。細かい作業や、決まりきった手順は放り出しがち。",
    "話していて刺激をくれる相手が好き。からかうのは仲がいい証拠で、根に持たない。",
    "口が達者で面白い人。ただの屁理屈に見えて、実はちゃんと筋が通っていることが多い。"],
  ESTJ: ["段取りを組んで、人と物事を効率よく動かす力。責任感が強く、決めたことを最後までやり通す。",
    "自分のやり方が正しいと思うと、相手の気持ちを置いていきやすい。ルーズな人や曖昧な指示にはいらだつ。",
    "面倒見がよく、仲間のために動くのをいとわない。約束を守る人を信頼する。",
    "しっかり者で頼れるリーダー。厳しそうに見えて、身内にはかなり情に厚い。"],
  ESFJ: ["まわりの人の気持ちや必要なものによく気づいて、みんなが過ごしやすいように動ける。行事や集まりをまとめるのも得意。",
    "人にどう思われるかを気にしすぎて疲れやすい。感謝されないと寂しくなったり、断れずに予定を詰め込んだりする。",
    "人とのつながりを何より大切にする。記念日や好みをよく覚えていて、気づかいを形にして伝える。",
    "やさしくて社交的な人。実は好き嫌いがはっきりしていて、ゆずれないマナーもある。"],
  ENFJ: ["人の気持ちを汲み取りながら、みんなを同じ方向にまとめる力。相手の成長を心から応援できる。",
    "人のために動きすぎて自分を後回しにしがち。期待に応えようとして、無理を重ねてしまうことも。",
    "相手の話を親身に聞き、必要なときは背中を押す。人間関係のもめごとをほうっておけない。",
    "あたたかくて頼りになる人。まわりの期待を背負いすぎて、ひとりで泣いている日もある。"],
  ENTJ: ["目標を決めて、計画・人・お金を動かして達成する力。決断が早く、困難な状況でも前に進める。",
    "スピードと結果を重視するあまり、人の気持ちや休息を軽く見がち。自分にも他人にも厳しくなりやすい。",
    "頼られると全力で応える。成長しようとしている人が好きで、本気でアドバイスする。",
    "自信にあふれた強い人。身内には意外と甘く、気を許した相手の前ではよく笑う。"],
};
const DETAIL_HEADS = ["得意なこと", "つまずきやすいところ", "人との関わり方", "まわりからの見え方"];
const IDENT = { A: "自信型。気持ちが安定していて、失敗を引きずりにくい。", T: "慎重型。細かいところに気づき、もっと良くしようと考え続ける。" };
const GROUPS = { NT: "考える派", NF: "寄りそう派", SJ: "守る派", SP: "動く派" };
const groupOf = c => c[1] === "N" ? (c[2] === "T" ? "NT" : "NF") : (c[3] === "J" ? "SJ" : "SP");
// One round animal mascot per type, colored by group. E: eyes open, I: smiling eyes;
// F: open smile, T: small smile; -A sparkle, -T sweat drop.
const INK = "#2a2833", WHITE = "#ffffff", PINK = "#ffb3c4", BEAK = "#f0a83a";
function starPath(r1, r2) {
  let d = "";
  for (let k = 0; k < 10; k++) { const r = k % 2 ? r2 : r1, a = -Math.PI / 2 + k * Math.PI / 5; d += (k ? "L" : "M") + (r * Math.cos(a)).toFixed(1) + " " + (r * Math.sin(a)).toFixed(1); }
  return d + "Z";
}
const ring = (n, r, cx, cy, rr, fill) => Array.from({ length: n }, (_, k) => { const a = k / n * Math.PI * 2; return `<circle cx="${(cx + r * Math.cos(a)).toFixed(1)}" cy="${(cy + r * Math.sin(a)).toFixed(1)}" r="${rr}" fill="${fill}"/>`; }).join("");
// back: drawn behind the head; front: drawn on the head before the face. B = body color, D = darker shade.
const ANIMALS = {
  INTJ: { name: "フクロウ", back: (B, D) => `<path d="M26 40 L20 16 L42 32Z M74 40 L80 16 L58 32Z" fill="${D}"/>`,
    front: () => `<circle cx="40" cy="56" r="11" fill="${WHITE}"/><circle cx="60" cy="56" r="11" fill="${WHITE}"/>`, beak: true },
  INTP: { name: "ネコ", back: (B) => `<path d="M24 46 L27 17 L47 32Z M76 46 L73 17 L53 32Z" fill="${B}"/><path d="M28 40 L30 24 L41 32Z M72 40 L70 24 L59 32Z" fill="${PINK}"/>`,
    front: () => `<path d="M30 66 h-12 M30 70 l-11 3 M70 66 h12 M70 70 l11 3" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"/>`, nose: true },
  ENTJ: { name: "ライオン", back: (B, D) => `<circle cx="50" cy="58" r="37" fill="${D}"/>${ring(14, 36, 50, 58, 7, D)}<circle cx="29" cy="33" r="7" fill="${B}"/><circle cx="71" cy="33" r="7" fill="${B}"/>`, muzzle: true, nose: true },
  ENTP: { name: "キツネ", back: (B) => `<path d="M20 52 L22 12 L46 32Z M80 52 L78 12 L54 32Z" fill="${B}"/><path d="M25 42 L26 22 L39 32Z M75 42 L74 22 L61 32Z" fill="${WHITE}"/>`,
    front: () => `<path d="M22 64 Q36 62 50 78 Q64 62 78 64 Q72 86 50 88 Q28 86 22 64Z" fill="${WHITE}"/>`, nose: true },
  INFJ: { name: "シカ", back: (B, D) => `<path d="M36 32 L30 12 M32 20 L22 16 M64 32 L70 12 M68 20 L78 16" stroke="${D}" stroke-width="4" stroke-linecap="round"/><ellipse cx="21" cy="46" rx="11" ry="5.5" transform="rotate(-20 21 46)" fill="${B}"/><ellipse cx="79" cy="46" rx="11" ry="5.5" transform="rotate(20 79 46)" fill="${B}"/>`,
    front: () => `<circle cx="36" cy="40" r="2.2" fill="${WHITE}" opacity=".8"/><circle cx="64" cy="40" r="2.2" fill="${WHITE}" opacity=".8"/><circle cx="50" cy="36" r="2" fill="${WHITE}" opacity=".8"/>`, muzzle: true, nose: true },
  INFP: { name: "ウサギ", back: (B) => `<ellipse cx="39" cy="20" rx="8" ry="21" fill="${B}"/><ellipse cx="61" cy="20" rx="8" ry="21" fill="${B}"/><ellipse cx="39" cy="22" rx="4" ry="15" fill="${PINK}"/><ellipse cx="61" cy="22" rx="4" ry="15" fill="${PINK}"/>`, nose: true },
  ENFJ: { name: "イヌ", back: () => "", front: (B, D) => `<ellipse cx="23" cy="56" rx="9" ry="18" transform="rotate(14 23 56)" fill="${D}"/><ellipse cx="77" cy="56" rx="9" ry="18" transform="rotate(-14 77 56)" fill="${D}"/>`, muzzle: true, nose: true, tongue: true },
  ENFP: { name: "リス", back: (B, D) => `<path d="M68 90 Q100 86 94 52 Q90 30 74 36 Q90 52 72 72Z" fill="${D}"/><path d="M30 38 L28 22 L42 32Z M70 38 L72 22 L58 32Z" fill="${B}"/>`, muzzle: true, nose: true },
  ISTJ: { name: "ビーバー", back: (B, D) => `<circle cx="28" cy="35" r="7" fill="${D}"/><circle cx="72" cy="35" r="7" fill="${D}"/>`, muzzle: true, nose: true, teeth: true },
  ISFJ: { name: "ヒツジ", back: (B, D) => `${ring(12, 30, 50, 52, 10, WHITE)}<ellipse cx="17" cy="56" rx="10" ry="5" transform="rotate(20 17 56)" fill="${D}"/><ellipse cx="83" cy="56" rx="10" ry="5" transform="rotate(-20 83 56)" fill="${D}"/>`,
    front: () => ring(7, 13, 50, 30, 7, WHITE) },
  ESTJ: { name: "ペンギン", back: () => "", front: () => `<path d="M50 44 Q34 32 28 48 Q24 66 36 80 Q50 90 64 80 Q76 66 72 48 Q66 32 50 44Z" fill="${WHITE}"/>`, beak: true },
  ESFJ: { name: "クマ", back: (B, D) => `<circle cx="27" cy="34" r="10" fill="${B}"/><circle cx="73" cy="34" r="10" fill="${B}"/><circle cx="27" cy="34" r="5" fill="${D}"/><circle cx="73" cy="34" r="5" fill="${D}"/>`, muzzle: true, nose: true },
  ISTP: { name: "タヌキ", back: (B, D) => `<circle cx="29" cy="35" r="7" fill="${D}"/><circle cx="71" cy="35" r="7" fill="${D}"/>`,
    front: (B, D) => `<ellipse cx="39" cy="57" rx="11" ry="8" transform="rotate(-12 39 57)" fill="${D}"/><ellipse cx="61" cy="57" rx="11" ry="8" transform="rotate(12 61 57)" fill="${D}"/>`, muzzle: true, nose: true, lightEyes: true },
  ISFP: { name: "コアラ", back: (B) => `<circle cx="22" cy="42" r="14" fill="${B}"/><circle cx="78" cy="42" r="14" fill="${B}"/><circle cx="22" cy="42" r="8" fill="${WHITE}" opacity=".85"/><circle cx="78" cy="42" r="8" fill="${WHITE}" opacity=".85"/>`, bigNose: true },
  ESTP: { name: "トラ", back: (B, D) => `<circle cx="29" cy="34" r="8" fill="${B}"/><circle cx="71" cy="34" r="8" fill="${B}"/><circle cx="29" cy="34" r="4" fill="${D}"/><circle cx="71" cy="34" r="4" fill="${D}"/>`,
    front: (B, D) => `<path d="M50 30 v9 M42 31 l3 7 M58 31 l-3 7 M21 56 h8 M22 64 h7 M79 56 h-8 M78 64 h-7" stroke="${D}" stroke-width="3" stroke-linecap="round"/>`, muzzle: true, nose: true },
  ESFP: { name: "サル", back: (B) => `<circle cx="19" cy="58" r="10" fill="${B}"/><circle cx="81" cy="58" r="10" fill="${B}"/><circle cx="19" cy="58" r="5.5" fill="#f7d6c1"/><circle cx="81" cy="58" r="5.5" fill="#f7d6c1"/>`,
    front: () => `<path d="M50 50 Q42 40 34 46 Q26 54 32 68 Q38 84 50 84 Q62 84 68 68 Q74 54 66 46 Q58 40 50 50Z" fill="#f7d6c1"/>` },
};
function charaSVG(c) {
  const type = c.slice(0, 4), an = ANIMALS[type], g = groupOf(c).toLowerCase();
  const B = `var(--${g})`, D = `var(--${g}-strong)`;
  const E = c[0] === "E", F = c[2] === "F", A = c.slice(-1) === "A";
  const eyeC = an.lightEyes ? WHITE : INK;
  const eyes = E
    ? `<circle cx="40" cy="56" r="3.6" fill="${eyeC}"/><circle cx="60" cy="56" r="3.6" fill="${eyeC}"/>${an.lightEyes ? "" : `<circle cx="41.3" cy="54.7" r="1.2" fill="#fff"/><circle cx="61.3" cy="54.7" r="1.2" fill="#fff"/>`}`
    : `<path d="M36 57 q4 -5 8 0 M56 57 q4 -5 8 0" stroke="${eyeC}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
  const muzzle = an.muzzle ? `<ellipse cx="50" cy="70" rx="13" ry="10" fill="${WHITE}" opacity=".9"/>` : "";
  const nose = an.bigNose ? `<ellipse cx="50" cy="65" rx="6.5" ry="8" fill="${INK}"/>`
    : an.beak ? `<path d="M44 63 L56 63 L50 71Z" fill="${BEAK}"/>`
    : an.nose ? `<ellipse cx="50" cy="65" rx="3.4" ry="2.4" fill="${INK}"/>` : "";
  const my = an.bigNose || an.beak ? 76 : 71;
  const mouth = F
    ? `<path d="M45 ${my} q5 7 10 0 z" fill="${INK}"/>${an.tongue ? `<ellipse cx="50" cy="${my + 4}" rx="2.6" ry="2" fill="#ff6b8a"/>` : ""}`
    : `<path d="M45.5 ${my} q4.5 3.4 9 0" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  const teeth = an.teeth ? `<rect x="46.5" y="${my + 1}" width="7" height="6" rx="1" fill="${WHITE}" stroke="${INK}" stroke-width="1"/><path d="M50 ${my + 1} v6" stroke="${INK}" stroke-width="1"/>` : "";
  const mood = A
    ? `<path d="${starPath(6.5, 2.6)}" transform="translate(85 18)" fill="#ffd34d"/>`
    : `<path d="M85 12 q5 8 0 11 q-5 -3 0 -11 z" fill="#8fd0f5"/>`;
  return `<svg class="chara" viewBox="0 0 100 100" aria-hidden="true">
    ${an.back(B, D)}
    <circle cx="50" cy="58" r="30" fill="${B}"/>
    ${an.front ? an.front(B, D) : ""}${muzzle}
    <ellipse cx="32" cy="67" rx="4.5" ry="2.6" fill="var(--blush)" opacity=".7"/><ellipse cx="68" cy="67" rx="4.5" ry="2.6" fill="var(--blush)" opacity=".7"/>
    ${eyes}${nose}${mouth}${teeth}${mood}</svg>`;
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
    <div class="head"><div><span class="grp">${GROUPS[g]}・${ANIMALS[c.slice(0, 4)].name}</span><span class="code">${codeHTML}</span><span class="nick">${t[0]}</span></div>${charaSVG(c)}</div>
    <span class="desc">${t[1]}<br>-${c.slice(-1)}：${IDENT[c.slice(-1)]}</span>${nearNote}
    <details class="more"><summary>もっと詳しく</summary><dl>${DETAIL[c.slice(0, 4)].map((d, i) => `<dt>${DETAIL_HEADS[i]}</dt><dd>${d}</dd>`).join("")}</dl></details></div>`;
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
  // Ratings given to any earlier record this person took over count as theirs; the newest one per rater wins.
  const ids = [id, ...((state.people[id] && state.people[id].aliases) || [])];
  for (const [rid, doc] of Object.entries(state.people)) {
    if (ids.includes(rid)) continue;
    const g = ids.map(k => doc.given && doc.given[k]).filter(x => x && Array.isArray(x.answers)).sort((a, b) => (b.at || 0) - (a.at || 0))[0];
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
    // Each marker carries its own label under the track; when the two sit close, one combined label.
    const pct = p => (p >= 50 ? ax.a + " " + p : ax.b + " " + (100 - p)) + "%";
    const at = p => Math.min(90, Math.max(10, x(p)));
    let labels = "";
    if (s != null && o != null && Math.abs(s - o) < 30) {
      labels = `<span class="ml both" style="left:${at((s + o) / 2)}%"><b class="s">自分 ${pct(s)}</b>・<b class="o">まわり ${pct(o)}</b></span>`;
    } else {
      if (s != null) labels += `<span class="ml s" style="left:${at(s)}%">自分 ${pct(s)}</span>`;
      if (o != null) labels += `<span class="ml o" style="left:${at(o)}%">まわり ${pct(o)}</span>`;
    }
    const lean = p => p == null ? "" : p >= 50 ? "a" : "b";
    return `<div class="axis">
      <div class="ends"><span class="${lean(s) === "a" ? "on" : ""}">${ax.la}<small>${ax.a}</small></span><span class="axname">${ax.name}</span><span class="${lean(s) === "b" ? "on" : ""}">${ax.lb}<small>${ax.b}</small></span></div>
      <div class="track"><div class="mid"></div>${span}
        ${o != null ? `<div class="mk others" style="left:${x(o)}%" title="まわり ${o}%"></div>` : ""}
        ${s != null ? `<div class="mk self" style="left:${x(s)}%" title="自分 ${s}%"></div>` : ""}
        ${labels}
      </div>
    </div>`;
  }).join("");
  // Headline: ズレ度 as one big number with a meter (0–40 fills the bar).
  const zure = selfP && othersP ? zureOf(selfP, othersP) : null;
  const headline = zure != null
    ? `<div class="zure"><span class="zl">自分とまわりのズレ度</span><span class="zv">${zure}<small>%</small></span>
        <div class="zmeter" aria-hidden="true"><i style="width:${Math.min(100, zure / 40 * 100)}%"></i></div>
        <span class="zt">${zureLine(zure)}</span></div>`
    : selfP ? `<div class="zure wait"><span class="zl">自分とまわりのズレ度</span><span class="zv">？？<small>%</small></span><span class="zt">友だちが答えると、ここに出ます</span></div>` : "";
  return `
    ${isExample ? `<p class="note"><span class="badge">表示例</span> まだ回答がないので、仮のデータで見え方を示しています。</p>` : ""}
    ${headline}
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
      : !state.group ? "「自分を診断する」から始めると、ここに結果が出ます。下は結果のイメージです。"
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
    `<button class="chip" data-pick="${esc(p)}" aria-pressed="${p === id}">${chipAnimal(p)}${esc(nameOf(p))}</button>`).join("")}</div>` : "";
  let hint = "";
  const mineWithSelf = id === state.me && selfA;
  if (id === state.me && !selfA) hint = `<p class="note">まず「自分を診断」で${QS.length}問に答えてください。そのあと上のリンクを友だちに送ると、「友だちを診断」からあなたについて答えてもらえます。</p>`;
  else if (mineWithSelf && !others.length) hint = `<div class="share">
      <p class="share-title">あなたのリンクができました</p>
      <p class="note">このリンクを友だちに送ると、開いた人はすぐに<b>あなたを診断する画面</b>になります。答えが集まると、ここに「まわりが思うタイプ」が出ます。</p>
      <div class="actions"><input type="text" id="share-link" readonly value="${esc(shareLink())}"><button class="btn" id="share-copy">リンクをコピー</button><span class="status" id="share-status"></span></div>
      ${shareButtonsHTML()}
    </div>`;
  else if (mineWithSelf) hint = `<div class="share">
      <p class="share-title">結果をシェアする</p>
      <p class="note">あなたを診断するリンクも一緒に送られるので、受け取った人もそのまま答えられます。</p>
      <div class="actions"><input type="text" id="share-link" readonly value="${esc(shareLink())}"><button class="btn" id="share-copy">リンクをコピー</button><span class="status" id="share-status"></span></div>
      ${shareButtonsHTML()}
    </div>`;
  el.innerHTML = chips + hint + (empty
    ? comparisonHTML(EXAMPLE_SELF, EXAMPLE_OTHERS, true)
    : comparisonHTML(selfA || null, others, false));
  // The share card already has the link, so the copy of it at the top would just repeat it.
  $("#group-bar").hidden = state.view === "result" && !!mineWithSelf && !state.connectError;
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
  let s = `【ミラー16】\n自分では ${c1}（${ANIMALS[c1.slice(0, 4)].name}）「${TYPES[c1.slice(0, 4)][0]}」`;
  if (othersP) {
    const c2 = code(othersP), z = zureOf(selfP, othersP);
    s += `\nまわりからは ${c2}（${ANIMALS[c2.slice(0, 4)].name}）「${TYPES[c2.slice(0, 4)][0]}」（${n}人）`;
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
    <p class="status" id="line-status" role="status"></p>
    <div id="share-image-box" class="share-image" hidden></div>`;
}
function bindShare(selfP, othersP, n) {
  const a = $("#share-line");
  if (!a) return;
  // line.me/R/share often does nothing (PCs, some in-app browsers), so phones get the share
  // sheet (LINE is listed there) and everything else gets the message copied for pasting.
  const lineText = shareText(selfP, othersP, n);
  a.href = "https://line.me/R/share?text=" + encodeURIComponent(lineText);
  a.onclick = async e => {
    e.preventDefault();
    const st = $("#line-status");
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      try { await navigator.share({ text: lineText }); return; }
      catch (err) { if (err.name === "AbortError") return; }
      location.href = a.href;
      return;
    }
    try { await navigator.clipboard.writeText(lineText); st.textContent = "送る文をコピーしました。LINEのトークに貼り付けて送ってください。"; }
    catch (err) { st.innerHTML = `下の文をコピーして、LINEのトークに貼り付けてください。<textarea readonly rows="7">${esc(lineText)}</textarea>`; st.querySelector("textarea").select(); }
  };
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
    x.font = `700 24px ${BODY}`; x.fillStyle = C(`--${g}-strong`); x.fillText(GROUPS[groupOf(c)] + "・" + ANIMALS[c.slice(0, 4)].name, l + 30, top + 100);
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
  return `<div class="scale-key"><span class="no" aria-hidden="true">← そう思わない</span><span class="prog"><b class="prog-n">0</b> / ${QS.length}</span><span class="yes" aria-hidden="true">そう思う →</span><i class="prog-bar" style="width:0"></i></div>
  <ol class="q">${QS.map((q, i) => `<li>
    <div class="qt"><small>${String(i + 1).padStart(2, "0")}</small>${esc(q[2])}</div>
    <div class="scale"><span class="no">そう<br>思わない</span><div class="dots" role="radiogroup" aria-label="${esc(q[2])}">
      ${[1,2,3,4,5,6,7].map(v => `<label title="${SCALE[v - 1]}"><input type="radio" id="${prefix}-${i}-${v}" name="${prefix}-${i}" value="${v}" aria-label="${SCALE[v - 1]}"${prefill && prefill[i] === v ? " checked" : ""}><span></span></label>`).join("")}
    </div><span class="yes">そう<br>思う</span></div>
  </li>`).join("")}</ol>`;
}
// The animal of someone's own answer, for their name chip.
function chipAnimal(id) {
  const s = state.people[id] && state.people[id].self;
  return s ? `<span class="chip-ani" aria-hidden="true">${charaSVG(code(score(s.answers)))}</span>` : "";
}
// Answered-count in the sticky key, and after each answer glide to the next unanswered question.
// root.onchange (not addEventListener) so re-renders don't stack listeners.
const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
function bindProgress(root, prefix) {
  const items = [...root.querySelectorAll("ol.q li")];
  const upd = () => {
    let n = 0;
    items.forEach(li => { const on = !!li.querySelector("input:checked"); li.classList.toggle("done", on); n += on; });
    const num = root.querySelector(".prog-n"), bar = root.querySelector(".prog-bar");
    if (num) num.textContent = n;
    if (bar) bar.style.width = (n / QS.length * 100) + "%";
  };
  root.onchange = e => {
    upd();
    const li = e.target.closest && e.target.closest("ol.q li");
    if (!li || e.target.type !== "radio") return;
    const next = items.slice(items.indexOf(li) + 1).find(x => !x.querySelector("input:checked"));
    if (next) setTimeout(() => next.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "center" }), 180);
  };
  upd();
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
    setStatus(statusEl, !state.group ? "先に「自分を診断する」から始めてください。"
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
      <p class="note">診断し合う友だちには、この名前で表示されます。</p>
      <input type="text" id="s-nick" maxlength="20" placeholder="例：むーちゃん" autocomplete="off"></div>
    <p class="note">ふだんの自分にいちばん近いものを選んでください。7段階、全${QS.length}問です。</p>
    ${mine && mine.self && mine.self.answers.length !== QS.length ? `<p class="status err">質問が${QS.length}問に増えて、判定の精度が上がりました。今の結果は前の${mine.self.answers.length}問の答えで出しています。答え直すと新しい質問で判定されます。</p>` : ""}
    ${formHTML("s", mine && mine.self && mine.self.answers)}
    <div class="actions"><button class="btn" id="save-self">保存して結果を見る</button><span class="status" id="status-self"></span></div>`;
  const nk = $("#s-nick");
  nk.value = (mine && mine.nick) || "";
  bindProgress(el, "s");
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
  if (!state.db) { el.innerHTML = `<p class="note">友だちのリンクを開くと、ここでその人を診断できます。</p>`; return; }
  if (!candidates.length) {
    const meDone = state.people[state.me] && state.people[state.me].self;
    el.innerHTML = meDone
      ? `<p class="note">まだ、あなた以外に自己診断した友だちがいません。<br>上の「あなたの診断リンク」を友だちに送ると、開いた人はすぐに<b>あなたを診断する画面</b>になります。その人が自己診断を済ませると、ここに出てきて、その人のことも診断できます。</p>`
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
  bindProgress(el, "o");
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
  if (!state.group && view !== "result") { startNew(view); return; }
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
  if (state.group && state.loaded) renderGroupBar();
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
// The "group" stays behind the scenes: starting a diagnosis quietly makes one, and the
// person's own link (group + their id) is all anyone ever needs to pass around.
function startNew(view) {
  try { localStorage.setItem("m16-view", view || "self"); } catch (e) {}
  location.hash = "g-" + newGroupId();
}
function renderGroupBar() {
  const el = $("#group-bar");
  document.body.classList.toggle("landing", !state.group);
  if (!state.group) {
    // One animal from each group, twice over, as a friendly parade.
    const parade = ["INFP-A", "ENTJ-A", "ESFJ-A", "ISFP-T", "INTP-T", "ENFJ-A", "ESTP-A", "ISFJ-T"].map(charaSVG).join("");
    el.innerHTML = `<div class="hero">
      <div class="parade" aria-hidden="true">${parade}</div>
      <p class="hero-q">自分が思う自分と、<br>まわりから見える自分。<br><b>どれくらいズレてる？</b></p>
      <p class="hero-about">自分のことを答えたあと、リンクを友だちに送ると、友だちが「あなたはこう見える」で答えてくれる16タイプ診断。自分の答えとどれくらい違うかが、ズレ度でわかります。</p>
      <ol class="steps">
        <li><span>1</span><div><b>自分のことを診断</b><small>30問・3分くらい</small></div></li>
        <li><span>2</span><div><b>できたリンクを友だちに送る</b><small>LINEでそのまま送れます</small></div></li>
        <li><span>3</span><div><b>友だちが答えるとズレ度がわかる</b><small>自分のタイプと、まわりから見たタイプを比べます</small></div></li>
      </ol>
      <div class="actions"><button class="btn big" id="start">自分を診断する</button></div>
      <p class="note">登録もログインもいりません。</p>
    </div>`;
    $("#start").onclick = () => startNew("self");
    return;
  }
  const mine = state.people[state.me], meDone = mine && mine.self;
  const inv = state.inviter && state.inviter !== state.me && state.people[state.inviter];
  const invName = inv && inv.nick ? esc(inv.nick) : "";
  const err = state.connectError ? `<p class="status err" role="alert">保存先につながりませんでした（${esc(state.connectError)}）。電波のいい場所でページを開き直してください。LINE などのアプリ内で開いている場合は、Safari や Chrome で開き直してください。</p>` : "";
  let body;
  if (meDone) {
    body = `<div class="field"><label for="group-link">あなたの診断リンク</label>
      <p class="note">友だちに送ると、開いた人があなたのことを診断できます。</p>
      <div class="actions"><input type="text" id="group-link" readonly value="${esc(shareLink())}"><button class="btn" id="copy-link">コピー</button><span class="status" id="copy-status"></span></div></div>`;
  } else if (invName) {
    body = `<p class="gap"><b>${invName}</b>さんから診断のお願いが届いています。下の質問に、${invName}さんがどう見えるかで答えてください。</p>`;
  } else {
    body = `<p class="gap">まずは「自分を診断」で、自分のことに答えてください。終わると、友だちに送るリンクができます。</p>`;
  }
  el.innerHTML = err + body;
  const cl = $("#copy-link");
  if (cl) cl.onclick = () => copyLink($("#group-link"), $("#copy-status"));
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
  // "~p<uid>" is added by the old sites' redirect page: the id this device had there.
  const m = location.hash.match(/^#g-([a-z0-9]{6,32})(?:-([A-Za-z0-9]{6,128}))?(?:~p([A-Za-z0-9]{6,128}))?$/);
  state.group = m ? m[1] : null;
  state.inviter = m && m[2] ? m[2] : null;
  state.prev = m && m[3] ? m[3] : null;
  if (state.prev) history.replaceState(null, "", location.pathname + location.search + location.hash.replace(/~p[A-Za-z0-9]+$/, ""));
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
    const raw = {};
    snap.docs.forEach(d => { raw[d.id] = d.data(); });
    // A record listed in someone's `aliases` (their answers from before a URL move) is folded into
    // that person: it disappears from the lists, and its id now points at them.
    const aliasOf = {};
    for (const [id, d] of Object.entries(raw)) if (Array.isArray(d.aliases)) d.aliases.forEach(a => { if (a !== id) aliasOf[a] = id; });
    const people = {};
    for (const [id, d] of Object.entries(raw)) {
      if (aliasOf[id] && id !== state.me) continue;
      if (!Array.isArray(d.aliases)) { people[id] = d; continue; }
      // Fill gaps from the earlier records: their self-diagnosis if this one has none, their ratings of others, their nickname.
      const m = { ...d, given: { ...(d.given || {}) } };
      for (const a of d.aliases) {
        const o = raw[a];
        if (!o) continue;
        if (!m.self && o.self) m.self = o.self;
        for (const [k, v] of Object.entries(o.given || {})) if (!m.given[k]) m.given[k] = v;
        if (!m.nick && o.nick) m.nick = o.nick;
      }
      people[id] = m;
    }
    const firstLoad = !state.loaded;
    state.loaded = true;
    state.people = people;
    state.aliasOf = aliasOf;
    if (firstLoad) {
      // Arrived from an old URL on a device that had answered there: fold that record into this one, once.
      const mineRaw = raw[state.me] || {};
      if (state.prev && state.prev !== state.me && raw[state.prev] && !(mineRaw.aliases || []).includes(state.prev) && !aliasOf[state.prev]) {
        const next = { ...mineRaw, aliases: [...(mineRaw.aliases || []), state.prev].slice(-10), at: Date.now() };
        if (!next.nick && raw[state.prev].nick) next.nick = raw[state.prev].nick;
        setDoc(doc(state.db, "groups", state.group, "people", state.me), next).catch(e => console.error(e));
      }
      if (state.inviter && state.inviter === state.prev) state.inviter = null;
      if (state.inviter && aliasOf[state.inviter]) state.inviter = aliasOf[state.inviter];
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
