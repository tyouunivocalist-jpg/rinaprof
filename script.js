(() => {
  "use strict";

  // =========================
  // ここだけ差し替え（必須）
  // =========================
  const SUPABASE_URLゆ = "https://vnxuwohqxqtzsmicddui.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_iq5jEx_erfmKhVaa5wAjJg_pxkbEWw7";
  const TABLE_PROFILES = "profiles";      // 既に作ってる想定
  const RPC_UPSERT = "upsert_profile";    // 既に作ってる想定（PIN方式C）
  // =========================

  // localStorage keys
  const LS_MY_ID = "rinaprof_my_id";
  const LS_MY_PIN = "rinaprof_my_pin"; // この端末でのみ保持（表示/コピー用）
  const LS_BOOK = "rinaprof_book";     // 端末内の保存リスト（後でクラウド化も可能）

  const $ = (s) => document.querySelector(s);
  const toastEl = $("#toast");

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    setTimeout(() => toastEl.classList.remove("show"), 1800);
  }

  function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

  function basePublicUrl() {
    // GitHub Pages(/rinaprof/)配下でも壊れない：pathnameを保持したまま query/hash を落とす
    const u = new URL(location.href);
    u.search = "";
    u.hash = "";
    return u.toString();
  }

  function profileUrl(id) {
    const u = new URL(basePublicUrl());
    u.searchParams.set("p", id);
    return u.toString();
  }

  function getParamProfileId() {
    const u = new URL(location.href);
    const p = u.searchParams.get("p");
    return (p && p.trim()) ? p.trim() : null;
  }

  function randId() {
    // URL向け短めID（固定URL用）
    return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
  }

  function validPin(pin){
    return /^[0-9]{4,6}$/.test(pin);
  }

  function safeText(v){
    return (v ?? "").toString().trim();
  }

  // ---------------------------
  // Supabase client
  // ---------------------------
  const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ---------------------------
  // Screens
  // ---------------------------
  const screens = {
    home: $("#screen-home"),
    create: $("#screen-create"),
    me: $("#screen-me"),
    view: $("#screen-view"),
    scan: $("#screen-scan"),
    book: $("#screen-book"),
  };

  function showScreen(key){
    Object.entries(screens).forEach(([k, el]) => {
      if (!el) return;
      el.hidden = (k !== key);
    });
    // scroll top for clarity
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }

  // nav
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-go]");
    if (!btn) return;
    const to = btn.getAttribute("data-go");
    if (to === "home") { stopScanner(); showHome(); return; }
    if (to === "create") { stopScanner(); showCreate(); return; }
    if (to === "me") { stopScanner(); showMe(); return; }
    if (to === "scan") { showScan(); return; }
    if (to === "book") { stopScanner(); showBook(); return; }
  });

  // top menu buttons
  $("#goCreate").addEventListener("click", () => showCreate());
  $("#goMe").addEventListener("click", () => showMe());
  $("#goScan").addEventListener("click", () => showScan());
  $("#goBook").addEventListener("click", () => showBook());

  // ---------------------------
  // PIN card (home)
  // ---------------------------
  const pinMaskEl = $("#pinMask");
  const pinHintEl = $("#pinHint");
  let pinRevealTimer = null;

  function refreshPinCard(){
    const pin = localStorage.getItem(LS_MY_PIN);
    if (!pin) {
      pinMaskEl.textContent = "----";
      pinHintEl.textContent = "この端末ではPINを表示できません（作成時の端末をご利用ください）";
      return;
    }
    pinMaskEl.textContent = "●●●●";
    pinHintEl.textContent = "こちらはプロフィールの編集に使用するコードです";
  }

  $("#btnPinShow").addEventListener("click", async () => {
    const pin = localStorage.getItem(LS_MY_PIN);
    if (!pin) { toast("この端末ではPINを表示できません"); return; }
    pinMaskEl.textContent = pin;
    toast("10秒だけ表示します");
    if (pinRevealTimer) clearTimeout(pinRevealTimer);
    pinRevealTimer = setTimeout(() => { pinMaskEl.textContent = "●●●●"; }, 10000);
  });

  $("#btnPinCopy").addEventListener("click", async () => {
    const pin = localStorage.getItem(LS_MY_PIN);
    if (!pin) { toast("この端末ではPINをコピーできません"); return; }
    await navigator.clipboard.writeText(pin);
    toast("PINをコピーしました");
  });

  // ---------------------------
  // Avatar
  // ---------------------------
  const avatarInput = $("#f_avatar");
  const avatarImg = $("#avatarImg");
  const avatarEmpty = $("#avatarEmpty");
  let avatarDataUrl = null;

  function setAvatarPreview(dataUrl){
    avatarDataUrl = dataUrl;
    if (dataUrl) {
      avatarImg.src = dataUrl;
      avatarImg.style.display = "block";
      avatarEmpty.style.display = "none";
    } else {
      avatarImg.removeAttribute("src");
      avatarImg.style.display = "none";
      avatarEmpty.style.display = "block";
    }
  }

  avatarInput.addEventListener("change", async () => {
    const f = avatarInput.files && avatarInput.files[0];
    if (!f) { setAvatarPreview(null); return; }
    if (!f.type.startsWith("image/")) { toast("画像ファイルを選んでね"); avatarInput.value=""; return; }

    const reader = new FileReader();
    reader.onload = () => {
      // dataURLとして保存（DB text列に入れる想定）
      setAvatarPreview(reader.result);
      toast("画像を選択しました");
    };
    reader.readAsDataURL(f);
  });

  $("#btnAvatarClear").addEventListener("click", () => {
    avatarInput.value = "";
    setAvatarPreview(null);
    toast("画像を外しました");
  });

  // ---------------------------
  // Form helpers
  // ---------------------------
  const f = {
    nickname: $("#f_nickname"),
    blood: $("#f_blood"),
    zodiac: $("#f_zodiac"),
    hot: $("#f_hot"),
    oshi: $("#f_oshi"),
    usage: $("#f_usage"),
    future: $("#f_future"),
    pin: $("#f_pin"),
  };

  function resetForm(){
    Object.values(f).forEach(el => { if (el) el.value = ""; });
    f.blood.value = "A";
    f.zodiac.value = "おひつじ座";
    setAvatarPreview(null);
    $("#f_avatar").value = "";
  }

  $("#btnResetForm").addEventListener("click", resetForm);

  // ---------------------------
  // Profile rendering
  // ---------------------------
  function renderProfileCard(container, p){
    const nickname = safeText(p.nickname);
    const blood = safeText(p.blood);
    const zodiac = safeText(p.zodiac);
    const hot = safeText(p.hot);
    const oshiRaw = safeText(p.oshi);
    const usage = safeText(p.usage);
    const future = safeText(p.future);

    const oshiText = oshiRaw ? `#${oshiRaw}推し` : "";
    const avatar = safeText(p.avatar_data);

    container.innerHTML = `
      <div class="profileTop">
        <div class="pAvatar">${avatar ? `<img alt="アイコン" src="${avatar}">` : ""}</div>
        <div>
          <div class="pName">${escapeHtml(nickname || "（未入力）")}</div>
          <div class="pMeta">
            <div class="badge">血液型：${escapeHtml(blood || "ひみつ")}</div>
            <div class="badge">星座：${escapeHtml(zodiac || "ひみつ")}</div>
          </div>
        </div>
      </div>

      <div class="pGrid">
        <div class="pItem">
          <div class="pLabel">ハマってること</div>
          <div class="pValue">${escapeHtml(hot || "—")}</div>
        </div>
        <div class="pItem b">
          <div class="pLabel">推し</div>
          <div class="pValue"><span class="hash">${escapeHtml(oshiText || "—")}</span></div>
        </div>
        <div class="pItem c">
          <div class="pLabel">いつもの自分（RINAの利用）</div>
          <div class="pValue">${escapeHtml(usage || "—")}</div>
        </div>
        <div class="pItem d">
          <div class="pLabel">将来やってみたいこと</div>
          <div class="pValue">${escapeHtml(future || "—")}</div>
        </div>
      </div>
    `;
  }

  function escapeHtml(str){
    return String(str ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#39;");
  }

  function makeQr(el, url){
    el.innerHTML = "";
    new QRCode(el, { text: url, width: 170, height: 170 });
  }

  // ---------------------------
  // Create/Update (Supabase RPC)
  // ---------------------------
  async function upsertProfile(profileId, pin, data){
    // dataはRPC側でjsonbとして受ける想定
    const payload = {
      nickname: data.nickname,
      blood: data.blood,
      zodiac: data.zodiac,
      hot: data.hot,
      oshi: data.oshi,
      usage: data.usage,
      future: data.future,
      avatar_data: data.avatar_data || null,
    };

    const { error } = await db.rpc(RPC_UPSERT, {
      p_id: profileId,
      p_pin: pin,
      p_data: payload
    });

    if (error) throw error;
  }

  async function fetchProfile(profileId){
    const { data, error } = await db
      .from(TABLE_PROFILES)
      .select("id,nickname,blood,zodiac,hot,oshi,usage,future,avatar_data,updated_at")
      .eq("id", profileId)
      .single();

    if (error) throw error;
    return data;
  }

  // Create button
  $("#btnCreate").addEventListener("click", async () => {
    try{
      const nickname = safeText(f.nickname.value);
      if (!nickname) { toast("ニックネームを入れてね"); return; }

      const pin = safeText(f.pin.value);
      if (!validPin(pin)) { toast("PINは4〜6桁の数字にしてね"); return; }

      // 自分ID（固定）を作る：既に持ってるならそれを更新扱いにする
      let myId = localStorage.getItem(LS_MY_ID);
      if (!myId) myId = randId();

      const data = {
        nickname,
        blood: f.blood.value,
        zodiac: f.zodiac.value,
        hot: safeText(f.hot.value),
        oshi: safeText(f.oshi.value),
        usage: safeText(f.usage.value),
        future: safeText(f.future.value),
        avatar_data: avatarDataUrl,
      };

      toast("保存中…");
      await upsertProfile(myId, pin, data);

      // この端末に保存
      localStorage.setItem(LS_MY_ID, myId);
      localStorage.setItem(LS_MY_PIN, pin);

      toast("作成しました！");
      await showMe(true);

    } catch(err){
      console.error(err);
      toast("作成に失敗…（PIN/設定/権限を確認）");
    }
  });

  // ---------------------------
  // ME screen
  // ---------------------------
  $("#btnMeCopyLink").addEventListener("click", async () => {
    const myId = localStorage.getItem(LS_MY_ID);
    if (!myId) { toast("まだ作成していません"); return; }
    await navigator.clipboard.writeText(profileUrl(myId));
    toast("共有URLをコピーしました");
  });

  $("#btnMeEdit").addEventListener("click", async () => {
    const myId = localStorage.getItem(LS_MY_ID);
    if (!myId) { toast("まだ作成していません"); return; }

    // いったん入力画面へ（既存値を流し込む）
    try{
      const p = await fetchProfile(myId);
      f.nickname.value = p.nickname ?? "";
      f.blood.value = p.blood ?? "A";
      f.zodiac.value = p.zodiac ?? "おひつじ座";
      f.hot.value = p.hot ?? "";
      f.oshi.value = p.oshi ?? "";
      f.usage.value = p.usage ?? "";
      f.future.value = p.future ?? "";
      setAvatarPreview(p.avatar_data ?? null);

      // PINは端末にあるなら入れる（見えないけど）
      const pin = localStorage.getItem(LS_MY_PIN);
      f.pin.value = pin ? pin : "";

      toast("内容を読み込みました。PINを入れて『作成』で更新できます");
      showScreen("create");
    } catch(err){
      console.error(err);
      toast("読み込み失敗…");
    }
  });

  async function showMe(afterCreate=false){
    const myId = localStorage.getItem(LS_MY_ID);
    const meHint = $("#meHint");
    if (!myId){
      showScreen("me");
      $("#meCard").innerHTML = "";
      $("#meQr").innerHTML = "";
      meHint.classList.add("warn");
      meHint.textContent = "まだプロフィールがありません。「プロフィール入力」から作成してね。";
      return;
    }

    try{
      showScreen("me");
      meHint.classList.remove("warn");
      meHint.textContent = afterCreate ? "作成完了！このQRを共有してね。" : "最新のプロフィールを表示しています。";

      const p = await fetchProfile(myId);
      renderProfileCard($("#meCard"), p);
      makeQr($("#meQr"), profileUrl(myId));
      refreshPinCard();
    } catch(err){
      console.error(err);
      showScreen("me");
      $("#meCard").innerHTML = "";
      $("#meQr").innerHTML = "";
      meHint.classList.add("warn");
      meHint.textContent = "プロフィールの取得に失敗しました（Supabase設定・RLS・テーブル名を確認）";
    }
  }

  // ---------------------------
  // VIEW screen (shared)
  // ---------------------------
  let lastViewedProfile = null;

  async function showView(profileId){
    showScreen("view");
    try{
      const p = await fetchProfile(profileId);
      lastViewedProfile = p;
      renderProfileCard($("#viewCard"), p);
      makeQr($("#viewQr"), profileUrl(profileId));
      toast("プロフィールを開きました");
    } catch(err){
      console.error(err);
      $("#viewCard").innerHTML = `<div class="note warn">プロフィールを取得できませんでした（IDが間違っている可能性）</div>`;
      $("#viewQr").innerHTML = "";
      lastViewedProfile = null;
    }
  }

  $("#btnSaveToBook").addEventListener("click", () => {
    if (!lastViewedProfile) { toast("保存できるプロフィールがありません"); return; }
    saveToBook(lastViewedProfile);
    toast("プロフ帳に保存しました");
  });

  // ---------------------------
  // BOOK (device local)
  // ---------------------------
  function loadBook(){
    try{
      const raw = localStorage.getItem(LS_BOOK);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveBook(arr){
    localStorage.setItem(LS_BOOK, JSON.stringify(arr));
  }

  function saveToBook(p){
    const arr = loadBook();
    const exists = arr.find(x => x.id === p.id);
    const item = {
      id: p.id,
      nickname: p.nickname ?? "",
      updated_at: p.updated_at ?? null,
      avatar_data: p.avatar_data ?? null,
      blood: p.blood ?? "",
      zodiac: p.zodiac ?? ""
    };
    if (exists){
      Object.assign(exists, item);
    } else {
      arr.unshift(item);
    }
    saveBook(arr);
    renderBook();
  }

  function removeFromBook(id){
    const arr = loadBook().filter(x => x.id !== id);
    saveBook(arr);
    renderBook();
  }

  function renderBook(){
    const list = $("#bookList");
    const arr = loadBook();

    if (!arr.length){
      list.innerHTML = `<div class="note">まだ保存がありません。QR読取で追加してね。</div>`;
      return;
    }

    list.innerHTML = arr.map((x) => {
      const avatar = x.avatar_data ? `<img alt="アイコン" src="${x.avatar_data}">` : "";
      const meta = `血液型：${escapeHtml(x.blood || "ひみつ")} / 星座：${escapeHtml(x.zodiac || "ひみつ")}`;
      return `
        <div class="bookItem">
          <div class="bookLeft">
            <div class="pAvatar" style="width:44px;height:44px;border-radius:14px;">${avatar}</div>
            <div>
              <div class="bookName">${escapeHtml(x.nickname || "（未入力）")}</div>
              <div class="bookMeta">${meta}</div>
            </div>
          </div>
          <div class="row" style="gap:8px;justify-content:flex-end;">
            <button class="miniBtn" data-open="${x.id}">開く</button>
            <button class="miniBtn" data-del="${x.id}">削除</button>
          </div>
        </div>
      `;
    }).join("");
  }

  $("#bookList").addEventListener("click", (e) => {
    const open = e.target.closest("[data-open]");
    const del = e.target.closest("[data-del]");
    if (open){
      const id = open.getAttribute("data-open");
      showView(id);
      return;
    }
    if (del){
      const id = del.getAttribute("data-del");
      removeFromBook(id);
      toast("削除しました");
      return;
    }
  });

  $("#btnBookClear").addEventListener("click", () => {
    saveBook([]);
    renderBook();
    toast("全削除しました");
  });

  async function showBook(){
    showScreen("book");
    renderBook();
  }

  // ---------------------------
  // QR Scan
  // ---------------------------
  let scanner = null;
  let scannedProfile = null;

  function stopScanner(){
    if (scanner) {
      scanner.stop().catch(()=>{}).finally(()=>{
        scanner.clear();
        scanner = null;
      });
    }
  }

  $("#btnStartScan").addEventListener("click", async () => {
    try{
      $("#scanPreview").hidden = true;
      scannedProfile = null;

      if (!window.Html5Qrcode) {
        toast("QR読取ライブラリが読み込めていません");
        return;
      }

      const readerId = "reader";
      scanner = new Html5Qrcode(readerId);

      toast("カメラを起動します");
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (decodedText) => {
          // 成功時
          stopScanner();
          await handleScannedText(decodedText);
        },
        () => {}
      );
    } catch(err){
      console.error(err);
      toast("カメラ起動に失敗しました（権限を確認）");
    }
  });

  $("#btnStopScan").addEventListener("click", () => {
    stopScanner();
    toast("停止しました");
  });

  async function handleScannedText(text){
    const id = extractProfileIdFromUrl(text);
    if (!id){
      toast("このQRはプロフィールではありません");
      return;
    }
    toast("プロフィールを取得中…");
    try{
      const p = await fetchProfile(id);
      scannedProfile = p;
      renderProfileCard($("#scanCard"), p);
      $("#scanPreview").hidden = false;
      toast("取得しました。保存できます");
    } catch(err){
      console.error(err);
      toast("取得に失敗しました");
    }
  }

  function extractProfileIdFromUrl(text){
    try{
      const u = new URL(text);
      const p = u.searchParams.get("p");
      return p && p.trim() ? p.trim() : null;
    } catch {
      return null;
    }
  }

  $("#btnScanSave").addEventListener("click", () => {
    if (!scannedProfile) { toast("保存できるプロフィールがありません"); return; }
    saveToBook(scannedProfile);
    toast("プロフ帳に保存しました");
  });

  $("#btnScanOpen").addEventListener("click", () => {
    if (!scannedProfile) { toast("開けるプロフィールがありません"); return; }
    showView(scannedProfile.id);
  });

  async function showScan(){
    showScreen("scan");
  }

  // ---------------------------
  // Home / Create
  // ---------------------------
  function showHome(){
    showScreen("home");
    refreshPinCard();
  }

  function showCreate(){
    stopScanner();
    showScreen("create");
    refreshPinCard();
  }

  // ---------------------------
  // Boot
  // ---------------------------
  async function boot(){
    refreshPinCard();

    // 共有URLで開かれた場合は閲覧モードへ
    const sharedId = getParamProfileId();
    if (sharedId){
      await showView(sharedId);
      return;
    }

    // 自分IDがあるならホーム、なければ作成へ誘導
    const myId = localStorage.getItem(LS_MY_ID);
    showHome();
    if (!myId){
      toast("まずはプロフィールを作成しよう");
    }
  }

  // 初期：book renderだけ準備
  renderBook();

  // 起動
  boot();

})();