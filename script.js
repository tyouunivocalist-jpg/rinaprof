/* =========================
   RINAプロフ帳 - GitHub Pages版
   - UI日本語
   - Supabase保存（端末IDで区別）
   - 共有URL: ?p=<profile_id>
   - QR: 共有URLを埋め込み
   - QR読取: 保存→プロフ帳へ
========================= */

/** ★ここだけ置き換えて★ */
const SUPABASE_URL = "https://vnxuwohqxqtzsmicddui.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_iq5jEx_erfmKhVaa5wAjJg_pxkbEWw7";

/** テーブル名（Supabase側でこの名前で作ってる前提） */
const TBL_PROFILES = "profiles";
const TBL_BOOK = "profile_book";

/** 共有URLのベース（GitHub Pagesの公開URL） */
const APP_BASE_URL = (() => {
  // 例: https://xxxx.github.io/rinaprof/
  const u = new URL(location.href);
  u.search = "";
  u.hash = "";
  return u.toString();
})();

const $ = (sel) => document.querySelector(sel);

const screens = {
  home: $("#screen-home"),
  create: $("#screen-create"),
  my: $("#screen-my"),
  scan: $("#screen-scan"),
  book: $("#screen-book"),
  view: $("#screen-view"),
};

const toastEl = $("#toast");
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 1600);
}

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.add("hidden"));
  screens[name].classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function go(name) {
  // hashは見た目だけ（?p= の共有優先）
  location.hash = `#${name}`;
  showScreen(name);
}

function ensureDeviceId() {
  const k = "rina_device_id";
  let v = localStorage.getItem(k);
  if (!v) {
    v = crypto.randomUUID();
    localStorage.setItem(k, v);
  }
  return v;
}
const DEVICE_ID = ensureDeviceId();

function setLocal(key, obj) {
  localStorage.setItem(key, JSON.stringify(obj));
}
function getLocal(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function getMyLatestId() {
  return localStorage.getItem("rina_my_latest_profile_id") || "";
}
function setMyLatestId(id) {
  localStorage.setItem("rina_my_latest_profile_id", id);
}

function getMyPinPlain() {
  return localStorage.getItem("rina_my_pin_plain") || "";
}
function setMyPinPlain(pin) {
  localStorage.setItem("rina_my_pin_plain", pin);
}

/** PINはハッシュで保存（簡易SHA-256） */
async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** icon file -> dataURL (jpeg縮小) */
async function fileToDataURL(file) {
  const img = new Image();
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  img.src = dataUrl;

  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
  });

  // resize to max 256
  const max = 256;
  const ratio = Math.min(max / img.width, max / img.height, 1);
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);

  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  return c.toDataURL("image/jpeg", 0.85);
}

/** Supabase client */
let supabase = null;
function initSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || SUPABASE_URL.includes("あなたの")) {
    toast("SupabaseのURL/キーが未設定です（script.js冒頭）");
    return null;
  }
  // umd: window.supabase
  if (!window.supabase?.createClient) {
    toast("Supabaseライブラリが読み込めていません（外部JS）");
    return null;
  }
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return supabase;
}

/** ====== UI elements ====== */
const navButtons = document.querySelectorAll("[data-go]");
navButtons.forEach((b) => {
  b.addEventListener("click", () => {
    const target = b.getAttribute("data-go");
    go(target);
  });
});
// menuGrid anchors compatibility (if any)
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    const id = a.getAttribute("href").replace("#", "");
    if (screens[id]) {
      e.preventDefault();
      go(id);
    }
  });
});

const fNickname = $("#fNickname");
const fIcon = $("#fIcon");
const iconPreview = $("#iconPreview");
const btnRemoveIcon = $("#btnRemoveIcon");
const fBlood = $("#fBlood");
const fZodiac = $("#fZodiac");
const fHobby = $("#fHobby");
const fOshi = $("#fOshi");
const fUsual = $("#fUsual");
const fFuture = $("#fFuture");
const fPin = $("#fPin");

let selectedIconDataUrl = "";

fIcon.addEventListener("change", async () => {
  const file = fIcon.files?.[0];
  if (!file) return;
  try {
    selectedIconDataUrl = await fileToDataURL(file);
    iconPreview.style.backgroundImage = `url(${selectedIconDataUrl})`;
    toast("画像を選択しました");
  } catch {
    toast("画像の読み込みに失敗しました");
  }
});
btnRemoveIcon.addEventListener("click", () => {
  selectedIconDataUrl = "";
  fIcon.value = "";
  iconPreview.style.backgroundImage = "";
  toast("画像を外しました");
});

/** PIN card on Home */
const pinMasked = $("#pinMasked");
const pinHint = $("#pinHint");
const btnRevealPin = $("#btnRevealPin");
const btnCopyPin = $("#btnCopyPin");

function refreshPinCard() {
  const pin = getMyPinPlain();
  if (!pin) {
    pinMasked.textContent = "----";
    pinHint.style.display = "block";
    return;
  }
  pinHint.style.display = "none";
  pinMasked.textContent = "●●●●";
}
btnRevealPin.addEventListener("click", () => {
  const pin = getMyPinPlain();
  if (!pin) return toast("この端末ではPINを表示できません");
  pinMasked.textContent = pin;
  toast("10秒だけ表示します");
  setTimeout(() => (pinMasked.textContent = "●●●●"), 10000);
});
btnCopyPin.addEventListener("click", async () => {
  const pin = getMyPinPlain();
  if (!pin) return toast("この端末ではPINをコピーできません");
  try {
    await navigator.clipboard.writeText(pin);
    toast("PINをコピーしました");
  } catch {
    toast("コピーに失敗しました");
  }
});

/** ====== Render profile card ====== */
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => (
    { "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]
  ));
}

function renderProfileCard(targetEl, p) {
  const oshiText = p.oshi ? `${p.oshi}推し!!` : "";
  const iconStyle = p.icon_data ? `style="background-image:url('${p.icon_data}')" ` : "";
  targetEl.innerHTML = `
    <div class="pcTop">
      <div class="pcIcon" ${iconStyle}></div>
      <div class="pcHead">
        <div class="pcName">${escapeHtml(p.nickname || "")}</div>
        <div class="pcMeta">
          <span>血液型：${escapeHtml(p.blood || "ひみつ")}</span>
          <span>星座：${escapeHtml(p.zodiac || "ひみつ")}</span>
        </div>
      </div>
    </div>

    ${oshiText ? `
      <div class="tagLine">
        <span class="accentHash">✦</span>
        <span><b>${escapeHtml(oshiText)}</b></span>
      </div>
    ` : ""}

    <div class="sections">
      <div class="sec">
        <div class="secTitle">ハマってること<div class="ul"></div></div>
        <div class="secBody">${escapeHtml(p.hobby || "—")}</div>
      </div>

      <div class="sec">
        <div class="secTitle">いつもの自分（RINAをどう利用してる？）<div class="ul"></div></div>
        <div class="secBody">${escapeHtml(p.usual || "—")}</div>
      </div>

      <div class="sec">
        <div class="secTitle">将来やってみたいこと<div class="ul"></div></div>
        <div class="secBody">${escapeHtml(p.future || "—")}</div>
      </div>
    </div>
  `;
}

/** ====== QR generate ====== */
function makeProfileUrl(profileId) {
  const u = new URL(APP_BASE_URL);
  u.searchParams.set("p", profileId);
  return u.toString();
}

function renderQr(mountEl, url) {
  mountEl.innerHTML = "";
  // QRCode library: new QRCode(element, options)
  // ensure stable size
  new QRCode(mountEl, {
    text: url,
    width: 220,
    height: 220,
    colorDark: "#1f1b16",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M,
  });
}

/** ====== export image ====== */
async function exportProfileImage(p, url, qrMountId, filenameBase = "rina-prof") {
  // Grab QR canvas from mount
  const mount = document.getElementById(qrMountId);
  const qrCanvas = mount?.querySelector("canvas");
  if (!qrCanvas) {
    toast("QRがまだ生成されていません");
    return;
  }

  const canvas = $("#exportCanvas");
  const ctx = canvas.getContext("2d");

  // background
  ctx.fillStyle = "#F4EEE3";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // soft blobs
  function blob(x,y,r,c){
    ctx.beginPath();
    ctx.fillStyle=c;
    ctx.globalAlpha=.18;
    ctx.arc(x,y,r,0,Math.PI*2);
    ctx.fill();
    ctx.globalAlpha=1;
  }
  blob(200,220,220,"#F2C14E");
  blob(900,240,240,"#5BB6D5");
  blob(260,1160,260,"#F07BA6");
  blob(860,1100,260,"#8E7AE6");

  // card
  const pad = 80;
  const cardX = pad, cardY = 120, cardW = canvas.width - pad*2, cardH = canvas.height - 240;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, cardX, cardY, cardW, cardH, 36);
  ctx.fill();
  ctx.strokeStyle = "rgba(31,27,22,.18)";
  ctx.lineWidth = 6;
  ctx.stroke();

  // header text
  ctx.fillStyle = "#1f1b16";
  ctx.font = "700 64px 'Yomogi', cursive";
  ctx.fillText("RINAプロフ", cardX + 40, cardY + 90);

  ctx.font = "400 30px 'Zen Maru Gothic', sans-serif";
  ctx.fillStyle = "rgba(31,27,22,.70)";
  ctx.fillText("あつまる　つながる　はじまる", cardX + 40, cardY + 140);

  // icon
  const iconX = cardX + 40;
  const iconY = cardY + 170;
  const iconS = 150;
  ctx.strokeStyle = "rgba(31,27,22,.18)";
  ctx.lineWidth = 6;
  roundRect(ctx, iconX, iconY, iconS, iconS, 36);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.stroke();

  if (p.icon_data) {
    const img = new Image();
    img.src = p.icon_data;
    await new Promise((res) => (img.onload = res));
    ctx.save();
    roundRect(ctx, iconX, iconY, iconS, iconS, 36);
    ctx.clip();
    ctx.drawImage(img, iconX, iconY, iconS, iconS);
    ctx.restore();
  }

  // name
  ctx.fillStyle = "#1f1b16";
  ctx.font = "700 66px 'Yomogi', cursive";
  ctx.fillText(p.nickname || "", iconX + iconS + 30, iconY + 80);

  // meta
  ctx.font = "400 32px 'Zen Maru Gothic', sans-serif";
  ctx.fillStyle = "rgba(31,27,22,.75)";
  ctx.fillText(`血液型：${p.blood || "ひみつ"}　　星座：${p.zodiac || "ひみつ"}`, iconX + iconS + 30, iconY + 132);

  // oshi
  const oshiText = p.oshi ? `${p.oshi}推し!!` : "";
  if (oshiText) {
    ctx.font = "700 44px 'Zen Maru Gothic', sans-serif";
    ctx.fillStyle = "#1f1b16";
    // underline accent
    ctx.fillText(oshiText, cardX + 40, iconY + 240);
    ctx.strokeStyle = "#5BB6D5";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(cardX + 40, iconY + 255);
    ctx.lineTo(cardX + 40 + Math.min(600, oshiText.length * 38), iconY + 255);
    ctx.stroke();
  }

  // sections blocks
  const secStartY = iconY + 280;
  const secX = cardX + 40;
  const secW = cardW - 80;
  const secH = 150;

  drawSection(ctx, secX, secStartY, secW, secH, "ハマってること", p.hobby || "—");
  drawSection(ctx, secX, secStartY + 170, secW, secH, "いつもの自分（RINAをどう利用してる？）", p.usual || "—");
  drawSection(ctx, secX, secStartY + 340, secW, secH, "将来やってみたいこと", p.future || "—");

  // QR bottom center (smaller)
  const qrSize = 260;
  const qrX = cardX + Math.round((cardW - qrSize) / 2);
  const qrY = cardY + cardH - qrSize - 60;

  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "rgba(31,27,22,.18)";
  ctx.lineWidth = 6;
  roundRect(ctx, qrX - 10, qrY - 10, qrSize + 20, qrSize + 20, 28);
  ctx.fill();
  ctx.stroke();

  ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

  // tiny url
  ctx.font = "400 22px 'Zen Maru Gothic', sans-serif";
  ctx.fillStyle = "rgba(31,27,22,.55)";
  drawWrap(ctx, url, cardX + 40, cardY + cardH - 18, cardW - 80, 26);

  // download
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `${filenameBase}.png`;
  a.click();
  toast("画像を保存しました（ダウンロード）");
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}

function drawWrap(ctx, text, x, y, maxW, lineH){
  const words = String(text).split("");
  let line = "";
  for (let i=0;i<words.length;i++){
    const test = line + words[i];
    const w = ctx.measureText(test).width;
    if (w > maxW && line) {
      ctx.fillText(line, x, y);
      line = words[i];
      y += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y);
}

function drawSection(ctx, x, y, w, h, title, body){
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "rgba(31,27,22,.14)";
  ctx.lineWidth = 5;
  roundRect(ctx, x, y, w, h, 28);
  ctx.fill(); ctx.stroke();

  ctx.fillStyle = "#1f1b16";
  ctx.font = "700 34px 'Yomogi', cursive";
  ctx.fillText(title, x + 22, y + 48);

  // underline
  ctx.strokeStyle = "rgba(142,122,230,.75)";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(x + 22, y + 62);
  ctx.lineTo(x + 160, y + 62);
  ctx.stroke();

  ctx.fillStyle = "rgba(31,27,22,.85)";
  ctx.font = "400 30px 'Zen Maru Gothic', sans-serif";
  drawWrap(ctx, body, x + 22, y + 102, w - 44, 36);
}

/** ====== Create profile ====== */
$("#formCreate").addEventListener("submit", async (e) => {
  e.preventDefault();
  const client = supabase || initSupabase();
  if (!client) return;

  const nickname = fNickname.value.trim();
  if (!nickname) return toast("ニックネームを入力してね");

  const blood = fBlood.value;
  const zodiac = fZodiac.value;
  const hobby = (fHobby.value || "").trim();
  const oshi = (fOshi.value || "").trim();
  const usual = (fUsual.value || "").trim();
  const future = (fFuture.value || "").trim();

  const pinPlain = (fPin.value || "").trim();
  if (pinPlain && !/^\d{4}$/.test(pinPlain)) {
    return toast("PINは4桁の数字で入力してね");
  }

  const pin_hash = pinPlain ? await sha256Hex(pinPlain) : null;

  const payload = {
    device_id: DEVICE_ID,
    nickname,
    blood,
    zodiac,
    hobby,
    oshi,
    usual,
    future,
    icon_data: selectedIconDataUrl || null,
    pin_hash,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  toast("作成中…");
  const { data, error } = await client
    .from(TBL_PROFILES)
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    console.error(error);
    toast("作成に失敗しました（Supabase）");
    return;
  }

  const id = data.id;
  setMyLatestId(id);

  if (pinPlain) setMyPinPlain(pinPlain);

  // reset pin card
  refreshPinCard();

  toast("作成しました！");
  await loadMyProfile(); // render
  go("my");
});

/** ====== Load my profile ====== */
const profileCard = $("#profileCard");
const qrMount = $("#qrMount");
const myUrlHint = $("#myUrlHint");

async function loadMyProfile() {
  const client = supabase || initSupabase();
  if (!client) return;

  const myId = getMyLatestId();
  if (!myId) {
    profileCard.innerHTML = `<div class="muted">まだ作成されていません。プロフィール入力から作成してね。</div>`;
    qrMount.innerHTML = "";
    myUrlHint.textContent = "";
    return;
  }

  const { data, error } = await client
    .from(TBL_PROFILES)
    .select("*")
    .eq("id", myId)
    .single();

  if (error || !data) {
    console.error(error);
    profileCard.innerHTML = `<div class="muted">読み込みに失敗しました。</div>`;
    return;
  }

  renderProfileCard(profileCard, data);

  const url = makeProfileUrl(data.id);
  renderQr(qrMount, url);
  myUrlHint.textContent = url;

  // store latest snapshot locally (optional)
  setLocal("rina_my_latest_profile_obj", data);
}

$("#btnCopyLink").addEventListener("click", async () => {
  const id = getMyLatestId();
  if (!id) return toast("まだ作成されていません");
  const url = makeProfileUrl(id);
  try {
    await navigator.clipboard.writeText(url);
    toast("リンクをコピーしました");
  } catch {
    toast("コピーに失敗しました");
  }
});

$("#btnSaveImage").addEventListener("click", async () => {
  const p = getLocal("rina_my_latest_profile_obj");
  if (!p?.id) return toast("プロフィールがありません");
  const url = makeProfileUrl(p.id);
  await exportProfileImage(p, url, "qrMount", "rina-prof");
});

/** ====== Shared view (?p=) ====== */
const viewCard = $("#viewCard");
const qrMountView = $("#qrMountView");
const viewUrlHint = $("#viewUrlHint");
$("#btnSaveImageView").addEventListener("click", async () => {
  const p = getLocal("rina_view_profile_obj");
  if (!p?.id) return toast("プロフィールがありません");
  const url = makeProfileUrl(p.id);
  await exportProfileImage(p, url, "qrMountView", "rina-prof");
});

async function loadSharedProfile(profileId) {
  const client = supabase || initSupabase();
  if (!client) return;

  const { data, error } = await client
    .from(TBL_PROFILES)
    .select("*")
    .eq("id", profileId)
    .single();

  if (error || !data) {
    console.error(error);
    viewCard.innerHTML = `<div class="muted">プロフィールが見つかりませんでした。</div>`;
    qrMountView.innerHTML = "";
    viewUrlHint.textContent = "";
    return;
  }

  renderProfileCard(viewCard, data);
  const url = makeProfileUrl(data.id);
  renderQr(qrMountView, url);
  viewUrlHint.textContent = url;

  setLocal("rina_view_profile_obj", data);
}

/** ====== QR Scan ====== */
let html5Qr = null;
const scanText = $("#scanText");

$("#btnStartScan").addEventListener("click", async () => {
  try {
    scanText.textContent = "カメラを起動中…";
    if (!html5Qr) html5Qr = new Html5Qrcode("reader");

    await html5Qr.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 240, height: 240 } },
      async (decodedText) => {
        scanText.textContent = decodedText;
        toast("読み取りました");

        // stop after success
        try { await html5Qr.stop(); } catch {}
        await onScanned(decodedText);
      }
    );
  } catch (e) {
    console.error(e);
    scanText.textContent = "カメラ起動に失敗しました（許可/対応端末を確認）";
    toast("カメラ起動に失敗しました");
  }
});

$("#btnStopScan").addEventListener("click", async () => {
  try {
    if (html5Qr) await html5Qr.stop();
    toast("停止しました");
  } catch {}
});

function extractProfileIdFromUrl(text) {
  try {
    const u = new URL(text);
    const p = u.searchParams.get("p");
    return p || "";
  } catch {
    return "";
  }
}

async function onScanned(decodedText) {
  const profileId = extractProfileIdFromUrl(decodedText);
  if (!profileId) {
    toast("このQRはプロフィールURLではありません");
    return;
  }

  const client = supabase || initSupabase();
  if (!client) return;

  // fetch profile
  const { data: prof, error: e1 } = await client
    .from(TBL_PROFILES)
    .select("*")
    .eq("id", profileId)
    .single();

  if (e1 || !prof) {
    console.error(e1);
    toast("プロフィール取得に失敗しました");
    return;
  }

  // upsert into book for this device
  const row = {
    device_id: DEVICE_ID,
    profile_id: profileId,
    nickname: prof.nickname,
    icon_data: prof.icon_data || null,
    blood: prof.blood,
    zodiac: prof.zodiac,
    saved_at: new Date().toISOString(),
  };

  const { error: e2 } = await client.from(TBL_BOOK).insert(row);
  if (e2) {
    // duplicate? ignore if already exists
    console.warn(e2);
    toast("保存に失敗 or 既に保存済みかも");
  } else {
    toast("プロフ帳に保存しました");
  }

  await loadBook();
  go("book");
}

/** ====== Book ====== */
const bookList = $("#bookList");
$("#btnReloadBook").addEventListener("click", loadBook);
$("#btnClearLocal").addEventListener("click", () => {
  localStorage.removeItem("rina_my_latest_profile_id");
  localStorage.removeItem("rina_my_latest_profile_obj");
  toast("端末の控えを消しました");
  loadMyProfile();
  refreshPinCard();
});

async function loadBook() {
  const client = supabase || initSupabase();
  if (!client) return;

  bookList.innerHTML = `<div class="muted">読み込み中…</div>`;

  const { data, error } = await client
    .from(TBL_BOOK)
    .select("*")
    .eq("device_id", DEVICE_ID)
    .order("saved_at", { ascending: false });

  if (error) {
    console.error(error);
    bookList.innerHTML = `<div class="muted">読み込みに失敗しました</div>`;
    return;
  }

  if (!data || data.length === 0) {
    bookList.innerHTML = `<div class="muted">まだ保存がありません。QR読取で追加してね。</div>`;
    return;
  }

  bookList.innerHTML = data.map((r) => {
    const iconStyle = r.icon_data ? `style="background-image:url('${r.icon_data}')"` : "";
    const meta = `血液型：${escapeHtml(r.blood || "ひみつ")} / 星座：${escapeHtml(r.zodiac || "ひみつ")}`;
    return `
      <div class="bookItem">
        <div class="biIcon" ${iconStyle}></div>
        <div class="biMain">
          <div class="biName">${escapeHtml(r.nickname || "")}</div>
          <div class="biMeta">${meta}</div>
          <div class="biBtns">
            <button class="chipBtn" data-open="${escapeHtml(r.profile_id)}" type="button">開く</button>
            <button class="chipBtn" data-copy="${escapeHtml(r.profile_id)}" type="button">リンクコピー</button>
          </div>
        </div>
      </div>
    `;
  }).join("");

  // bind
  bookList.querySelectorAll("[data-open]").forEach((b) => {
    b.addEventListener("click", async () => {
      const id = b.getAttribute("data-open");
      const url = makeProfileUrl(id);
      // show shared view inside app
      await loadSharedProfile(id);
      go("view");
      // update view url hint already set
      toast("表示しました");
    });
  });

  bookList.querySelectorAll("[data-copy]").forEach((b) => {
    b.addEventListener("click", async () => {
      const id = b.getAttribute("data-copy");
      const url = makeProfileUrl(id);
      try {
        await navigator.clipboard.writeText(url);
        toast("リンクをコピーしました");
      } catch {
        toast("コピーに失敗しました");
      }
    });
  });
}

/** ====== Router startup ====== */
function parseQueryProfileId() {
  const u = new URL(location.href);
  return u.searchParams.get("p") || "";
}

function initialRoute() {
  const p = parseQueryProfileId();
  if (p) {
    // shared open
    showScreen("view");
    loadSharedProfile(p);
    return;
  }
  // hash route
  const h = (location.hash || "").replace("#", "");
  if (h && screens[h]) showScreen(h);
  else showScreen("home");
}

window.addEventListener("hashchange", () => {
  const h = (location.hash || "").replace("#", "");
  if (h && screens[h]) showScreen(h);
});

(async function boot() {
  refreshPinCard();
  initSupabase();
  initialRoute();
  await loadMyProfile();
  await loadBook();
})();