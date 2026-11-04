/* パドック記録(iPhone用Webアプリ)。サーバーを使わず、記録は端末の中だけ。PCとは文字列のコピーでやりとりする。
   見る項目は、競馬解説の共通項目(docs/anauma_paddock_spec.md)。印・確率・買い目は出さない。 */
"use strict";
const KEY = "lh_paddock_v1";
const GRADES = ["◎", "○", "△", "×"];
const GRADE_HELP = { "◎": "抜群", "○": "良い", "△": "普通", "×": "気になる" };
const ITEMS = [
  ["gait", "歩様・踏み込み", "パドック", "後脚の踏み込みが力強い / ギクシャク・前脚が硬い"],
  ["neck", "首・肩の使い方", "パドック", "しなやか / 硬い"],
  ["coat", "毛ヅヤ・張り", "パドック", "光沢があり筋肉がくっきり / くすんでボサボサ"],
  ["body", "馬体(引き締まり・前走との変化)", "パドック", "引き締まって前走並み / 太め・細め・雰囲気が変わった"],
  ["spirit", "気合・落ち着き", "パドック", "前を向き目に輝き / キョロキョロ・小走り・白目"],
  ["sweat", "発汗・イレ込みの少なさ", "パドック", "汗が少ない / ゼッケン周りに白い泡の汗が大量"],
  ["mount", "騎乗後の変化", "パドック", "腹回りが引き締まり気持ちが入る / 変化なし・落ち着きをなくす"],
  ["feel", "手応え(手綱・首)", "返し馬", "手綱が張り首を力強く動かす / 手綱に張りがない"],
  ["vigor", "覇気(口を開けていない)", "返し馬", "やる気がみなぎる(暴れとは別) / 覇気がなく口を開けている"],
  ["step", "脚捌きの軽さ", "返し馬", "軽い / 重い・硬い"],
];
const TAGS_GOOD = ["落ち着き", "気合乗り", "踏み込み深い", "毛ヅヤ良い", "活気"];
const TAGS_BAD = ["イレ込み", "発汗", "チャカつく", "元気なし", "馬体が細い", "首が高い"];
const PHASES = ["パドック", "返し馬"];

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const localISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

let S = load();
let view = "race";
let memoryOnly = false;

function defaults() { return { data: null, obs: [], draft: {}, ui: { race: null, phase: "パドック", open: {}, theme: "light" } }; }
/* 明るい表示(標準)と暗い表示の切り替え。屋外では明るい表示が見やすい */
function applyTheme() {
  const t = S.ui && S.ui.theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = t;
  const m = document.getElementById("themecolor"); if (m) m.setAttribute("content", t === "dark" ? "#0b0b0b" : "#f6f3ea");
}
function load() {
  try { const o = JSON.parse(localStorage.getItem(KEY) || "{}"); return Object.assign(defaults(), o); } catch (e) { memoryOnly = true; return defaults(); }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { memoryOnly = true; }
}
function toast(msg, ms = 2600) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

/* ---------- データ ---------- */
const races = () => (S.data && S.data.races) || [];
const curRace = () => races().find((r) => r.id === S.ui.race) || races()[0] || null;
const dkey = (rid, no, ph) => `${rid}|${no}|${ph}`;
const savedOf = (rid, no, ph) => S.obs.find((o) => !o.void && o.race_id === rid && o.horse_no === no && o.phase === ph);
const draftOf = (rid, no, ph) => S.draft[dkey(rid, no, ph)];
function ensureDraft(rid, no, ph) { const k = dkey(rid, no, ph); return (S.draft[k] = S.draft[k] || { grade: "", items: {}, tags: [], memo: "" }); }
const hasContent = (d) => d && (d.grade || Object.keys(d.items).length || d.tags.length || (d.memo || "").trim());
function startDate(r) {
  if (!S.data || !r || !r.start || r.start.length < 4) return null;
  const d = S.data.date; return new Date(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +r.start.slice(0, 2), +r.start.slice(2, 4), 0);
}

const BROKEN = "文字列が壊れています(コピー・貼り付けの途中で、文字が欠けたり変わったりしました)。もう一度コピーし直すか、PCが作った『phone_data_日付.txt』のファイルを『ファイルを選ぶ』で読み込んでください";
async function decodeData(text) {
  const t = (text || "").replace(/\s+/g, "");
  if (t.startsWith("LH1:")) {
    if (typeof DecompressionStream === "undefined") throw new Error("このiPhoneのiOSが古いため、読み込めません(iOS 16.4以上が必要)");
    try {
      const bin = atob(t.slice(4));
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      const ds = new DecompressionStream("deflate");
      const stream = new Blob([bytes]).stream().pipeThrough(ds);
      return JSON.parse(await new Response(stream).text());
    } catch (e) { throw new Error(BROKEN); }
  }
  if (t.startsWith("{")) { try { return JSON.parse(text.trim()); } catch (e) { throw new Error(BROKEN); } }
  throw new Error("『LH1:』で始まるデータを貼り付けるか、ファイルを選んでください");
}
/* 検査値(CRC32)。文字列が途中で壊れていないかをPC側で確かめる */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(bytes) { let c = 0xffffffff; for (const b of bytes) c = CRC_T[(c ^ b) & 0xff] ^ (c >>> 8); return ((c ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0"); }
async function deflateB64(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  let s = ""; for (const b of buf) s += String.fromCharCode(b);
  return btoa(s);
}
async function loadData(text) {
  const d = await decodeData(text);
  if (!d || !Array.isArray(d.races)) throw new Error("データの形式が違います");
  S.data = d; S.ui.race = d.races.length ? d.races[0].id : null; save();
  return d;
}
async function exportRecords() {
  const recs = S.obs.filter((o) => !o.void);
  const json = JSON.stringify({ v: 1, made: localISO(new Date()), recs });
  const bytes = new TextEncoder().encode(json);
  if (typeof CompressionStream === "undefined") return "LHREC1:" + btoa(unescape(encodeURIComponent(json)));  // 古いiOS: 圧縮なし(検査値なし)
  const body = await deflateB64(bytes);
  return `LHREC2:${crc32(new TextEncoder().encode(body))}:${body}`;
}
let recText = "";
async function prepRecords() {
  recText = await exportRecords();
  const out = document.getElementById("out"); if (out) out.value = recText;
  document.querySelectorAll("[data-needrec]").forEach((b) => { b.disabled = false; });
}
const ymd = () => { const d = new Date(); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`; };
function download(name, text) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" })); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ---------- 操作 ---------- */
function setGrade(rid, no, ph, g) { const d = ensureDraft(rid, no, ph); d.grade = d.grade === g ? "" : g; save(); }
function setItem(rid, no, ph, k, v) { const d = ensureDraft(rid, no, ph); if (d.items[k] === v) delete d.items[k]; else d.items[k] = v; save(); }
function toggleTag(rid, no, ph, t) { const d = ensureDraft(rid, no, ph); const i = d.tags.indexOf(t); if (i >= 0) d.tags.splice(i, 1); else d.tags.push(t); save(); }
function saveRace(rid, ph, now = new Date()) {
  const r = races().find((x) => x.id === rid); if (!r) return { n: 0, late: false };
  const st = startDate(r); const late = !!(st && now > st); let n = 0;
  for (const h of r.horses) {
    const d = draftOf(rid, h.no, ph);
    if (!hasContent(d) || savedOf(rid, h.no, ph)) continue;
    S.obs.push({ race_id: rid, horse_no: h.no, name: h.name, phase: ph, grade: d.grade || "", items: Object.assign({}, d.items), tags: d.tags.slice(), memo: (d.memo || "").trim(),
      pop: h.pop, odds: h.odds, at: localISO(now), start: r.start || "", void: false });
    delete S.draft[dkey(rid, h.no, ph)]; n++;
  }
  save(); return { n, late };
}
function voidRec(rid, no, ph) { const o = savedOf(rid, no, ph); if (o) { o.void = true; save(); } }
function sumItems(items) { let p = 0, m = 0; for (const v of Object.values(items || {})) { if (v > 0) p++; else if (v < 0) m++; } return [p, m]; }

/* ---------- 画面 ---------- */
const $app = () => document.getElementById("app");
function render() {
  const r = curRace(); const ph = S.ui.phase;
  let html = `<div class="top"><div class="row"><select id="race" class="grow">${races().map((x) => `<option value="${esc(x.id)}" ${r && x.id === r.id ? "selected" : ""}>${esc(x.label)}${x.start ? " " + esc(x.start.slice(0, 2) + ":" + x.start.slice(2, 4)) : ""}${x.rough ? "【" + esc(x.rough.label) + "】" : ""}</option>`).join("") || "<option>(データ未読み込み)</option>"}</select>
    <button data-act="prev">◀</button><button data-act="next">▶</button><button class="themebtn" data-act="theme">${S.ui.theme === "dark" ? "明るく" : "暗く"}</button></div>
    <div class="nav">${[["race", "記入"], ["summary", "まとめ"], ["guide", "見方"], ["data", "データ"]].map(([k, l]) => `<button data-view="${k}" class="${view === k ? "on" : ""}">${l}</button>`).join("")}</div>
    ${view === "race" ? `<div class="seg">${PHASES.map((p) => `<button data-phase="${p}" class="${p === ph ? "on" : ""}">${p}</button>`).join("")}</div>` : ""}</div>`;
  if (memoryOnly) html += `<div class="banner warn">この端末では保存ができない状態です(プライベートブラウズなど)。通常のSafariで開いてください。</div>`;
  html += view === "race" ? viewRace(r, ph) : view === "summary" ? viewSummary(r) : view === "guide" ? viewGuide() : viewData();
  $app().innerHTML = html;
  if (view === "data") prepRecords();  // 記録の文字列を先に作っておく(コピー・共有を、タップの直後にすぐ実行するため)
  const bar = document.getElementById("bar"); if (bar) bar.remove();
  if (view === "race" && r) {
    const b = document.createElement("div"); b.id = "bar"; b.className = "bar";
    const nd = r.horses.filter((h) => hasContent(draftOf(r.id, h.no, ph)) && !savedOf(r.id, h.no, ph)).length;
    b.innerHTML = `<div class="in"><button data-act="clear">入力をクリア</button><button class="primary" data-act="save">保存する(${nd}頭)</button></div>`;
    document.body.appendChild(b);
  }
}
function banner(r) {
  if (!r) return "";
  const ro = r.rough; const st = startDate(r); const now = new Date();
  let t = `<b>${esc(r.label)}</b> ${r.heads}頭`;
  if (st) { const m = Math.round((st - now) / 60000); t += `　発走 ${pad(st.getHours())}:${pad(st.getMinutes())} ` + (m >= 0 ? `(あと${m}分)` : `<span class="warn">(発走後です。この記録は集計に入りません)</span>`); }
  else t += `　<span class="mute">発走時刻が不明(記録は集計に入りません)</span>`;
  if (ro) t += `<br>荒れ度: <b>${esc(ro.label)}</b>(${esc(ro.version || "")}) 人気薄(7番人気以下)が3着内に1頭以上入る率 ${ro.ls_rate == null ? "—" : Math.round(ro.ls_rate * 100) + "%"}`;
  if (r.bands) {
    t += `<br><span class="mute">この荒れ度の過去(2021〜2023)、人気薄の3着内率:</span> ` + Object.entries(r.bands).map(([b, v]) => `${esc(b)}人気 ${v.act == null ? "—" : (v.act * 100).toFixed(1) + "%"}(見込み${v.exp == null ? "—" : (v.exp * 100).toFixed(1) + "%"}・差${v.lift == null ? "—" : (v.lift * 100 >= 0 ? "+" : "") + (v.lift * 100).toFixed(1) + "pt"})`).join(" / ");
  }
  return `<div class="banner" id="banner">${t}</div>`;
}
function notesHtml(h) {
  if (!h.notes || !h.notes.length) return "";
  return `<div class="notes">データ(人気薄の過去の差): ` + h.notes.map((n) => `<span class="${n[0] === "＋" ? "p" : "m"}">${esc(n)}</span>`).join(" ") + `</div>`;
}
function viewRace(r, ph) {
  if (!r) return `<div class="banner">まず『データ』で、PCソフトからコピーしたスマホ用データを貼り付けてください。</div>`;
  let html = banner(r);
  const items = ITEMS.filter((i) => i[2] === ph);
  for (const h of r.horses) {
    const sv = savedOf(r.id, h.no, ph); const d = sv || draftOf(r.id, h.no, ph) || { grade: "", items: {}, tags: [], memo: "" };
    const open = !!S.ui.open[dkey(r.id, h.no, ph)];
    const ls = h.pop != null && h.pop >= 7;
    html += `<div class="card ${sv ? "saved" : ""}" data-no="${h.no}">
      <div class="hd"><div class="no">${h.no}</div><div class="nm">${esc(h.name)}</div>
      <span class="pill ${ls ? "ls" : ""}">${h.pop == null ? "—" : h.pop + "人気"} ${h.odds == null ? "" : h.odds.toFixed(1)}</span>
      ${sv ? `<span class="pill">✓保存済み</span>` : `<button class="more" data-act="open">${open ? "▴" : "▾"}</button>`}</div>
      ${notesHtml(h)}
      <div class="grades">${GRADES.map((g) => `<button data-g="${g}" class="${d.grade === g ? "on" : ""}" ${sv ? "disabled" : ""}>${g}</button>`).join("")}</div>
      <div class="gl">${GRADES.map((g) => `<span>${GRADE_HELP[g]}</span>`).join("")}</div>`;
    if (open && !sv) {
      html += `<div class="chk">${items.map(([k, lab, , hint]) => `<div class="item"><div class="lb">${esc(lab)}</div><div class="hint">${esc(hint)}</div>
        <div class="tri" data-k="${k}">${[[-1, "悪い −"], [0, "普通"], [1, "良い ＋"]].map(([v, l]) => `<button data-v="${v}" class="${d.items[k] === v ? "on" : ""}">${l}</button>`).join("")}</div></div>`).join("")}
        <div class="tags">${TAGS_GOOD.map((t) => `<button class="g ${d.tags.includes(t) ? "on" : ""}" data-tag="${esc(t)}">${esc(t)}</button>`).join("")}${TAGS_BAD.map((t) => `<button class="b ${d.tags.includes(t) ? "on" : ""}" data-tag="${esc(t)}">${esc(t)}</button>`).join("")}</div>
        <div style="margin-top:8px"><input type="text" data-memo placeholder="メモ(任意)" value="${esc(d.memo || "")}"></div></div>`;
    } else if (sv) {
      const [p, m] = sumItems(sv.items);
      html += `<div class="notes">チェック 良い${p}・悪い${m}${sv.tags.length ? " / " + sv.tags.map(esc).join("・") : ""}${sv.memo ? " / " + esc(sv.memo) : ""} <button class="more" data-act="void" style="padding:3px 8px;font-size:12px">取り消す</button></div>`;
    }
    html += `</div>`;
  }
  return html;
}
function viewSummary(r) {
  if (!r) return `<div class="banner">データが未読み込みです。</div>`;
  let html = banner(r) + `<h2>${esc(r.label)} まとめ(人気順)</h2><div class="mute">自分の評価と人気・データを並べただけです。買い目の提案ではありません。</div>
    <table><tr><th>番</th><th class="l">馬名</th><th>人気</th><th>単勝</th><th>パド</th><th>返し</th><th>✓</th></tr>`;
  const rows = r.horses.slice().sort((a, b) => (a.pop == null ? 99 : a.pop) - (b.pop == null ? 99 : b.pop) || a.no - b.no);
  for (const h of rows) {
    const g = (ph) => { const o = savedOf(r.id, h.no, ph) || draftOf(r.id, h.no, ph); return o || null; };
    const p = g("パドック"), c = g("返し馬");
    const good = (x) => x && (x.grade === "◎" || x.grade === "○"), bad = (x) => x && x.grade === "×";
    const hot = h.pop >= 7 && (good(p) || good(c)); const cold = h.pop != null && h.pop <= 3 && (bad(p) || bad(c));
    const items = Object.assign({}, p ? p.items : {}, c ? c.items : {}); const [pp, mm] = sumItems(items);
    html += `<tr class="${hot ? "hot" : cold ? "cold" : ""}"><td>${h.no}</td><td class="l">${esc(h.name)}${h.notes && h.notes.length ? `<div class="notes">${h.notes.slice(0, 2).map(esc).join(" ")}</div>` : ""}</td><td>${h.pop == null ? "—" : h.pop}</td><td>${h.odds == null ? "" : h.odds.toFixed(1)}</td>
      <td>${p ? esc(p.grade || "·") : ""}</td><td>${c ? esc(c.grade || "·") : ""}</td><td>${pp || mm ? `+${pp}/−${mm}` : ""}</td></tr>`;
  }
  html += `</table><div class="mute" style="margin-top:8px">パド=パドックの評価、返し=返し馬の評価、✓=チェックの良い(+)/悪い(−)の数。緑=人気薄(7番人気以下)で気配が◎○ / 赤=人気馬(3番人気以内)で気配が×。気配の評価はあなたの主観で、効果は記録が貯まってから確かめます。</div>`;
  return html;
}
function viewGuide() {
  const rows = ITEMS.map(([, lab, ph, hint]) => `<tr><td class="l">${esc(ph)}</td><td class="l">${esc(lab)}</td><td class="l">${esc(hint)}</td></tr>`).join("");
  return `<h2>見方(競馬解説に共通する項目)</h2><table><tr><th class="l">場面</th><th class="l">項目</th><th class="l">良い / 悪い</th></tr>${rows}</table>
  <h2>見るときのコツ</h2><div class="banner">
  ・パドックは周回が約15分。まず全体を見て気になる馬をメモし、2〜3周目に注目馬・人気馬を見直す。<br>
  ・真横から、太陽を背にした位置だと毛ヅヤや歩様が見やすい。<br>
  ・人気馬でも、発汗が多い・イレ込み・踏み込みが浅いなら割り引く。<br>
  ・パドックだけで予想を大きく変えない(事前の予想への「味付け」)。<br>
  ・返し馬は全馬を見るのが難しい。パドックで見る馬を先に絞る。暴れる馬と、やる気がある馬は別。<br>
  ・見慣れるまで馬券に入れない。記録して、レース後に答え合わせを重ねる。</div>
  <div class="mute">効果を数値で検証した資料は見つかっていません。このアプリの記録で、項目ごとに確かめます。</div>`;
}
function viewData() {
  const d = S.data; const n = S.obs.filter((o) => !o.void).length;
  return `<h2>データ(PC → スマホ)</h2><div class="banner">${d ? `読み込み済み: <b>${esc(d.date)}</b> ${d.races.length}レース(作成 ${esc(d.made || "")})` : "未読み込みです。"}<br><span class="mute"><b>Googleドライブを使う場合(おすすめ)</b>: PCの穴馬検索で『スマホ用データをコピー』を押すと、同期フォルダに自動で置かれます。下の『ファイルを選ぶ』→『ドライブ』→ <b>phone_data_latest.txt</b> を選ぶだけです。<br>そうでない場合は、文字列をスマホに送って、ここに貼り付けます。</span></div>
  <textarea id="paste" rows="4" placeholder="LH1:…"></textarea><div class="row" style="margin-top:8px"><button data-act="load" class="grow">貼り付けた文字列を読み込む</button></div>
  <div style="margin-top:8px"><div class="mute">または、PCが作ったファイル(phone_data_日付.txt)を選ぶ(文字列が壊れる心配がありません)</div><input type="file" id="file" accept=".txt,text/plain" style="margin-top:6px;width:100%"></div>
  <h2>記録(スマホ → PC)</h2><div class="banner">保存した記録: <b>${n}件</b>(取り消した分は含みません)<br><span class="mute">レースが終わったら『記録をコピー』を押し、PCの穴馬検索『パドック』タブの『スマホの記録を取り込む』に貼り付けます。記録はこの端末の中だけに保存されています。Safariのデータを消すと消えるので、こまめにコピーしてください。</span></div>
  <div class="row"><button data-act="share" data-needrec disabled class="grow" style="background:var(--accent);color:#1b1810;border-color:var(--accent);font-weight:800">ファイルで共有(おすすめ)</button></div>
  <div class="mute" style="margin:4px 0 8px"><b>Googleドライブを使う場合(おすすめ)</b>: 共有の画面で『ファイルに保存』→『ドライブ』→ PCの同期フォルダと同じフォルダを選びます。PCでは『同期フォルダから取り込む』を押すだけです(2回目からは、同じフォルダが最初に出ます)。メール・LINE・AirDropなどで送ってもよく、文字列と違って、途中で壊れません。</div>
  <div class="row"><button data-act="copy" data-needrec disabled class="grow">記録をコピー(文字列)</button></div>
  <textarea id="out" rows="3" readonly placeholder="準備中…" style="margin-top:8px"></textarea>
  <h2>そのほか</h2><div class="row"><button data-act="wipe" class="grow">保存した記録を全部消す</button></div>
  <div class="mute" style="margin-top:12px">アプリのバージョン: 4(2026-11-04。明るい表示が標準。右上の『暗く/明るく』で切り替え。Googleドライブでの受け渡しの説明を追加)</div>`;
}

/* ---------- イベント ---------- */
document.addEventListener("click", async (e) => {
  const b = e.target.closest("button"); if (!b) return;
  const r = curRace(); const ph = S.ui.phase; const card = b.closest(".card"); const no = card ? +card.dataset.no : null;
  if (b.dataset.view) { view = b.dataset.view; render(); return; }
  if (b.dataset.phase) { S.ui.phase = b.dataset.phase; save(); render(); return; }
  if (b.dataset.g && r) { setGrade(r.id, no, ph, b.dataset.g); keepScroll(); return; }
  if (b.dataset.v !== undefined && r) { setItem(r.id, no, ph, b.closest(".tri").dataset.k, +b.dataset.v); keepScroll(); return; }
  if (b.dataset.tag && r) { toggleTag(r.id, no, ph, b.dataset.tag); keepScroll(); return; }
  const act = b.dataset.act; if (!act) return;
  if (act === "theme") { S.ui.theme = S.ui.theme === "dark" ? "light" : "dark"; save(); applyTheme(); render(); return; }
  if (act === "prev" || act === "next") { const i = races().findIndex((x) => r && x.id === r.id) + (act === "next" ? 1 : -1); if (races()[i]) { S.ui.race = races()[i].id; save(); render(); window.scrollTo(0, 0); } }
  else if (act === "open" && r) { const k = dkey(r.id, no, ph); S.ui.open[k] = !S.ui.open[k]; save(); keepScroll(); }
  else if (act === "void" && r) { if (confirm("この記録を取り消します(PCの集計から外れます)。よいですか?")) { voidRec(r.id, no, ph); render(); } }
  else if (act === "save" && r) {
    const st = startDate(r);
    if (st && new Date() > st && !confirm("発走時刻を過ぎています。保存しても集計には入りません。保存しますか?")) return;
    const res = saveRace(r.id, ph); render(); toast(res.n ? `${res.n}頭を保存しました` : "保存する入力がありません");
  }
  else if (act === "clear" && r) { for (const h of r.horses) delete S.draft[dkey(r.id, h.no, ph)]; save(); render(); toast("入力をクリアしました"); }
  else if (act === "load") { try { const d = await loadData(document.getElementById("paste").value); view = "race"; render(); toast(`${d.races.length}レースを読み込みました`); } catch (err) { toast("読み込めません: " + err.message, 5000); } }
  else if (act === "copy") {
    const t = recText; const out = document.getElementById("out"); out.value = t;
    try { await navigator.clipboard.writeText(t); toast("コピーしました。PCに貼り付けてください(壊れる場合は『ファイルで共有』を使ってください)", 4500); } catch (err) { out.focus(); out.select(); toast("コピーできませんでした。下の文字列を選んでコピーしてください", 4500); }
  }
  else if (act === "share") {
    const name = `paddock_records_${ymd()}.txt`; const file = new File([recText], name, { type: "text/plain" });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: "パドック記録" });
      else { download(name, recText); toast("ファイルを保存しました。ダウンロードの一覧からPCへ送ってください", 4500); }
    } catch (err) { if (err && err.name !== "AbortError") { download(name, recText); toast("共有できなかったため、ファイルを保存しました", 4500); } }
  }
  else if (act === "wipe") { if (confirm("保存した記録を全部消します。PCに取り込み済みか確認しましたか?") && confirm("本当に消しますか?(元に戻せません)")) { S.obs = []; S.draft = {}; save(); render(); toast("消しました"); } }
});
document.addEventListener("change", async (e) => {
  if (e.target.id === "file" && e.target.files && e.target.files[0]) {
    try { const d = await loadData(await e.target.files[0].text()); view = "race"; render(); toast(`${d.races.length}レースを読み込みました`); } catch (err) { toast("読み込めません: " + err.message, 6000); }
    return;
  }
  if (e.target.id === "race") { S.ui.race = e.target.value; save(); render(); window.scrollTo(0, 0); } });
document.addEventListener("input", (e) => {
  if (e.target.matches("[data-memo]")) { const card = e.target.closest(".card"); const r = curRace(); if (r && card) { ensureDraft(r.id, +card.dataset.no, S.ui.phase).memo = e.target.value; save(); } }
});
function keepScroll() { const y = window.scrollY; render(); window.scrollTo(0, y); }
setInterval(() => { const r = curRace(); const el = document.getElementById("banner"); if (view === "race" && el && r) { const tmp = document.createElement("div"); tmp.innerHTML = banner(r); el.innerHTML = tmp.firstChild.innerHTML; } }, 30000);

applyTheme();
window.LH = { crc32, applyTheme, S: () => S, loadData, decodeData, saveRace, setGrade, setItem, toggleTag, exportRecords, savedOf, draftOf, render, startDate, reset: () => { S = defaults(); },
  setView: (v) => { view = v; render(); }, setOpen: (rid, no, ph, on = true) => { S.ui.open[dkey(rid, no, ph)] = on; }, setPhase: (p) => { S.ui.phase = p; } };
if (document.getElementById("app") && !window.__LH_TEST) render();
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
