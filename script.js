/* ==========================
   RINAプロフ帳 (Static HTML版)
   - Supabase: profiles / profile_book
   - QR生成: qrcodejs
   - QR読取: html5-qrcode
   ========================== */

(() => {
  "use strict";

  /* ====== ここだけ埋める（画面には出さない） ====== */
  const SUPABASE_URL = "https://vnxuwohqxqtzsmicddui.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_iq5jEx_erfmKhVaa5wAjJg_pxkbEWw7";
  /* =============================================== */

  // Supabaseテーブル名
  const T_PROFILES = "profiles";
  const T_BOOK = "profile_book";

  // localStorage keys
  const LS_DEVICE = "rina_device_id_v1";
  const LS_MY_PROFILE = "rina_my_profile_id_v1";

  // Helpers
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function show(screenKey) {
    // screenKey は "top" / "create" / "my" / "qr" / "book"
    $$(".screen").forEach((s) => s.classList.remove("active"));
    const el = $("#screen-" + screenKey);
    if (el) el.classList.add("active");
  }

  function getBaseUrlNoHash() {
    const u = new URL(location.href);
    u.hash = "";
    return u.toString();
  }

  function getOrCreateDeviceId() {
    let v = localStorage.getItem(LS_DEVICE);
    if (!v) {
      v = "dev_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
      localStorage.setItem(LS_DEVICE, v);
    }
    return v;
  }

  function sanitizeUuid(x) {
    if (!x) return "";
    const m = String(x).match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}/);
    return m ? m[0] : "";
  }

  async function fileToDataUrl(file, max = 320, quality = 0.75) {
    if (!file) return null;
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await new Promise((res, rej) => {
        img.onload = () => res();
        img.onerror = (e) => rej(e);
      });
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));

      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);

      return c.toDataURL("image/jpeg", quality);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function profileCard(p) {
    const safe = (v) => (v == null ? "" : String(v));
    const icon = p.icon_url
      ? `<div style="text-align:center;margin:10px 0;">
           <img src="${safe(p.icon_url)}" alt="icon" style="width:96px;height:96px;border-radius:18px;object-fit:cover;border:3px solid #0b0b0b;">
         </div>`
      : "";
    return `
      <div class="profile-card">
        ${icon}
        <div><b>ニックネーム</b>：${safe(p.name)}</div>
        <div><b>血液型</b>：${safe(p.blood)}</div>
        <div><b>星座</b>：${safe(p.zodiac)}</div>
        ${p.boom ? `<div><b>ハマってること</b>：${safe(p.boom)}</div>` : ""}
        ${p.oshi ? `<div><b>推し</b>：${safe(p.oshi)}</div>` : ""}
        ${p.future ? `<div><b>将来やってみたいこと</b>：${safe(p.future)}</div>` : ""}
        ${p.rina ? `<div><b>いつもの自分（RINAの使い方）</b>：${safe(p.rina)}</div>` : ""}
        <div style="opacity:.7;font-size:12px;margin-top:8px;">ID：${safe(p.id)}</div>
      </div>
    `;
  }

  function renderQr(url) {
    const area = $("#qrArea");
    if (!area) return;
    area.innerHTML = ""; // クリア

    if (!window.QRCode) {
      area.innerHTML = `<p style="color:#fecaca;">QRライブラリが読み込めていません。</p>`;
      return;
    }
    const box = document.createElement("div");
    area.appendChild(box);

    new window.QRCode(box, {
      text: url,
      width: 220,
      height: 220,
      correctLevel: window.QRCode.CorrectLevel.M,
    });
  }

  // Supabase client
  function createSb() {
    if (!window.supabase?.createClient) throw new Error("Supabaseライブラリが読み込めていません。");
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("Supabase URL/KEYが未設定です。");
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  }

  let sb;
  const deviceId = getOrCreateDeviceId();
  let qrScanner = null;

  async function fetchProfile(id) {
    const uuid = sanitizeUuid(id);
    if (!uuid) throw new Error("プロフィールIDが不正です");
    const { data, error } = await sb.from(T_PROFILES).select("*").eq("id", uuid).single();
    if (error) throw error;
    return data;
  }

  async function saveToBook(profileId) {
    const uuid = sanitizeUuid(profileId);
    if (!uuid) return;
    const { error } = await sb.from(T_BOOK).insert([{ device_id: deviceId, profile_id: uuid, kind: "scanned" }]);
    if (error) throw error;
  }

  async function renderBook() {
    show("book");
    const out = $("#bookList");
    out.innerHTML = "読み込み中…";

    const { data, error } = await sb
      .from(T_BOOK)
      .select("profile_id, created_at")
      .eq("device_id", deviceId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;

    if (!data.length) {
      out.innerHTML = "<div style='opacity:.8;'>まだ保存がありません。</div>";
      return;
    }

    const ids = Array.from(new Set(data.map((x) => x.profile_id))).filter(Boolean);
    const { data: profs, error: e2 } = await sb.from(T_PROFILES).select("*").in("id", ids);
    if (e2) throw e2;

    const map = new Map((profs || []).map((p) => [p.id, p]));
    out.innerHTML = data.map((row) => profileCard(map.get(row.profile_id) || { id: row.profile_id, name: "読み込み失敗" })).join("");
  }

  async function startQrScan() {
    show("qr");
    const reader = $("#reader");
    reader.innerHTML = "";

    if (!window.Html5Qrcode) {
      reader.innerHTML = `<p style="color:#fecaca;">QR読取ライブラリが読み込めていません。</p>`;
      return;
    }

    // 停止
    try {
      if (qrScanner) {
        await qrScanner.stop();
        qrScanner.clear();
      }
    } catch (_) {}

    qrScanner = new window.Html5Qrcode("reader");

    const onScanSuccess = async (text) => {
      try {
        // 止める（連続防止）
        await qrScanner.stop();
        qrScanner.clear();

        // URL / uuid からID抽出
        let id = "";
        try {
          const u = new URL(text);
          if (u.hash.includes("p=")) {
            const m = u.hash.match(/p=([^&]+)/);
            id = m ? decodeURIComponent(m[1]) : "";
          }
          if (!id && u.searchParams.get("p")) id = u.searchParams.get("p");
        } catch (_) {
          id = text;
        }

        const uuid = sanitizeUuid(id);
        if (!uuid) throw new Error("プロフィールIDが見つかりません");

        // 表示
        const p = await fetchProfile(uuid);
        // 表示は「プロフィール確認」画面を流用
        show("my");
        $("#myProfile").innerHTML = profileCard(p);

        // 保存
        await saveToBook(uuid);
      } catch (e) {
        alert("QR処理に失敗: " + (e?.message || e));
      }
    };

    const cameras = await window.Html5Qrcode.getCameras();
    if (!cameras.length) {
      reader.innerHTML = `<p style="color:#fecaca;">カメラが見つかりません（権限許可してね）</p>`;
      return;
    }
    await qrScanner.start(cameras[0].id, { fps: 10, qrbox: 240 }, onScanSuccess, () => {});
  }

  async function createProfile() {
    // 画面の要素（今のHTMLは name/intro だけなので、最低限で作る）
    const name = ($("#name")?.value || "").trim();
    const boom = ($("#intro")?.value || "").trim();

    if (!name) {
      alert("名前を入力してください");
      return;
    }

    // このHTMLには血液型/星座がまだ無いので「ひみつ」を自動で入れる
    // （あなたの最終仕様では select を追加するので、その時はここを読む形に直す）
    const blood = "ひみつ";
    const zodiac = "ひみつ";

    // アイコン機能がHTMLに無いので null
    const icon_url = null;

    const { data, error } = await sb
      .from(T_PROFILES)
      .insert([{ name, blood, zodiac, boom: boom || null, icon_url }])
      .select("id")
      .single();

    if (error) throw error;

    const id = data.id;
    localStorage.setItem(LS_MY_PROFILE, id);

    // プロフィールURL（このページ＋#p=uuid）
    const url = getBaseUrlNoHash() + "#p=" + encodeURIComponent(id);
    renderQr(url);

    // 作成後は自分のプロフィール画面へ
    const p = await fetchProfile(id);
    show("my");
    $("#myProfile").innerHTML = profileCard(p);
  }

  async function showMyProfile() {
    const id = localStorage.getItem(LS_MY_PROFILE);
    if (!id) {
      show("my");
      $("#myProfile").innerHTML = "<div style='opacity:.8;'>まだ作成していません。</div>";
      return;
    }
    const p = await fetchProfile(id);
    show("my");
    $("#myProfile").innerHTML = profileCard(p);

    // QRも更新して表示（固定URL）
    const url = getBaseUrlNoHash() + "#p=" + encodeURIComponent(p.id);
    renderQr(url);
  }

  async function handleHashOpen() {
    const h = location.hash || "";
    if (!h.includes("p=")) return;
    const m = h.match(/p=([^&]+)/);
    const raw = m ? decodeURIComponent(m[1]) : "";
    const uuid = sanitizeUuid(raw);
    if (!uuid) return;

    const p = await fetchProfile(uuid);
    show("my");
    $("#myProfile").innerHTML = profileCard(p);
  }

  function wireNav() {
    $$("button[data-nav]").forEach((b) => {
      b.addEventListener("click", async () => {
        const to = b.getAttribute("data-nav");
        if (to === "top") show("top");
        if (to === "create") show("create");
        if (to === "my") await showMyProfile();
        if (to === "qr") await startQrScan();
        if (to === "book") await renderBook();
      });
    });
  }

  async function boot() {
    try {
      sb = createSb();
    } catch (e) {
      alert(e?.message || e);
      return;
    }

    wireNav();

    const btn = $("#saveProfile");
    if (btn) btn.addEventListener("click", async () => {
      try {
        await createProfile();
      } catch (e) {
        alert("作成に失敗: " + (e?.message || e));
      }
    });

    window.addEventListener("hashchange", () => {
      handleHashOpen().catch(() => {});
    });

    // 初期
    show("top");
    await handleHashOpen();
  }

  document.addEventListener("DOMContentLoaded", () => {
    boot().catch((e) => alert(e?.message || e));
  });
})();