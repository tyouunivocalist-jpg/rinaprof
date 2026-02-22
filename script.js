/* ============================
   RINAプロフ帳 script.js（GitHub Pages向け 完成版）
   - DOM読み込み後に確実にイベントを付与
   - ボタンが「反応しない」を潰すための委譲クリック
   - CodePen→GitHubで壊れやすい外部JS順/DOMタイミング問題を吸収
   - Supabaseは「設定してあれば」使う（未設定ならローカル保存で動く）
   ============================ */

(() => {
  "use strict";

  // ========= ここだけ自分のSupabase情報に差し替え（必須にしたい場合は下のローカルfallbackを消してOK） =========
  const SUPABASE_URL = "https://vnxuwohqxqtzsmicddui.supabase.co";      // ←入れる
  const SUPABASE_ANON_KEY = "sb_publishable_iq5jEx_erfmKhVaa5wAjJg_pxkbEWw7"; // ←入れる
  const TABLE_PROFILES = "profiles"; // テーブル名（違うなら変更）
  const TABLE_BOOK = "profile_book"; // 他者保存テーブル名（違うなら変更）
  // ==========================================================================================================

  // ===== util =====
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const log = (...a) => console.log("[RINAPROF]", ...a);

  // 画面上に出す簡易トースト
  function toast(msg, ms = 2200) {
    let el = $("#__toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "__toast";
      el.style.cssText =
        "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);" +
        "background:rgba(0,0,0,.78);color:#fff;padding:10px 14px;border-radius:999px;" +
        "font-size:14px;z-index:99999;max-width:90%;text-align:center;line-height:1.35";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.display = "block";
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (el.style.display = "none"), ms);
  }

  function safeText(el) {
    return (el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  // ===== Pages（単一HTML想定：セクションの表示切替）=====
  // HTMLを変えずに「ありがちなID/クラス」を広めに拾う
  const VIEWS = [
    { key: "home", selectors: ["#home", "#view-home", ".view-home", "[data-view='home']"] },
    { key: "input", selectors: ["#input", "#view-input", ".view-input", "[data-view='input']"] },
    { key: "confirm", selectors: ["#confirm", "#view-confirm", ".view-confirm", "[data-view='confirm']"] },
    { key: "scan", selectors: ["#scan", "#view-scan", ".view-scan", "[data-view='scan']"] },
    { key: "book", selectors: ["#book", "#view-book", ".view-book", "[data-view='book']"] },
  ];

  function findViewEl(key) {
    const conf = VIEWS.find((v) => v.key === key);
    if (!conf) return null;
    for (const sel of conf.selectors) {
      const el = $(sel);
      if (el) return el;
    }
    return null;
  }

  function allViewEls() {
    const found = [];
    for (const v of VIEWS) {
      const el = findViewEl(v.key);
      if (el) found.push({ key: v.key, el });
    }
    return found;
  }

  function showView(key) {
    const views = allViewEls();
    if (views.length === 0) {
      // 画面切替型じゃないHTMLでも「ボタン無反応」だけは出さないようにする
      toast("このページは画面切替用のセクションが見つからない（表示はそのまま）");
      log("No view sections found. showView skipped.");
      return;
    }
    for (const v of views) {
      v.el.style.display = v.key === key ? "" : "none";
    }
    log("showView:", key);
  }

  // ===== Supabase init（存在すれば使う）=====
  function getSupabaseClient() {
    try {
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
      const sb = window.supabase;
      if (!sb?.createClient) return null;
      return sb.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  // ===== Local fallback storage =====
  const LS_MY = "rinaprof_my_profile";
  const LS_BOOK = "rinaprof_book";

  function loadMyProfileLocal() {
    try {
      return JSON.parse(localStorage.getItem(LS_MY) || "null");
    } catch {
      return null;
    }
  }
  function saveMyProfileLocal(p) {
    localStorage.setItem(LS_MY, JSON.stringify(p));
  }
  function loadBookLocal() {
    try {
      return JSON.parse(localStorage.getItem(LS_BOOK) || "[]");
    } catch {
      return [];
    }
  }
  function saveBookLocal(list) {
    localStorage.setItem(LS_BOOK, JSON.stringify(list));
  }

  // ===== Form reading/writing（HTMLが多少違っても拾う）=====
  // よくあるname/idを広く対応
  const FIELD_MAP = [
    { key: "name", selectors: ["#name", "[name='name']", "[name='username']", "#username"] },
    { key: "nickname", selectors: ["#nickname", "[name='nickname']"] },
    { key: "blood", selectors: ["#blood", "[name='blood']", "[name='blood_type']", "#blood_type"] },
    { key: "zodiac", selectors: ["#zodiac", "[name='zodiac']", "[name='constellation']"] },
    { key: "birthday", selectors: ["#birthday", "[name='birthday']"] },
    { key: "hobby", selectors: ["#hobby", "[name='hobby']"] },
    { key: "comment", selectors: ["#comment", "[name='comment']", "#message", "[name='message']"] },
  ];

  function findFieldEl(key) {
    const f = FIELD_MAP.find((x) => x.key === key);
    if (!f) return null;
    for (const sel of f.selectors) {
      const el = $(sel);
      if (el) return el;
    }
    return null;
  }

  function readProfileFromForm() {
    const obj = {};
    for (const f of FIELD_MAP) {
      const el = findFieldEl(f.key);
      if (!el) continue;
      const v = (el.value ?? "").toString().trim();
      if (v) obj[f.key] = v;
    }
    return obj;
  }

  function writeProfileToForm(p) {
    if (!p) return;
    for (const f of FIELD_MAP) {
      const el = findFieldEl(f.key);
      if (!el) continue;
      if (p[f.key] != null) el.value = p[f.key];
    }
  }

  // ===== Preview rendering =====
  // プレビュー枠の候補
  const PREVIEW_SEL = ["#preview", "#profilePreview", ".profile-preview", "[data-preview]"];

  function getPreviewEl() {
    for (const s of PREVIEW_SEL) {
      const el = $(s);
      if (el) return el;
    }
    return null;
  }

  function renderPreview(profile) {
    const host = getPreviewEl();
    if (!host) {
      // プレビュー枠が無いHTMLでも落とさない
      toast("プレビュー表示枠が見つからない（保存は継続）");
      return;
    }

    const lines = [];
    const label = (k, v) => lines.push(`<div style="margin:.35em 0"><b>${k}</b>：${escapeHtml(v)}</div>`);

    if (!profile) {
      host.innerHTML = `<div style="opacity:.7">まだデータがありません</div>`;
      return;
    }

    if (profile.name) label("名前", profile.name);
    if (profile.nickname) label("あだ名", profile.nickname);
    if (profile.blood) label("血液型", profile.blood);
    if (profile.zodiac) label("星座", profile.zodiac);
    if (profile.birthday) label("誕生日", profile.birthday);
    if (profile.hobby) label("趣味", profile.hobby);
    if (profile.comment) label("ひとこと", profile.comment);

    host.innerHTML = `
      <div style="padding:10px 12px">
        ${lines.join("") || `<div style="opacity:.7">入力項目が見つからない or 空です</div>`}
      </div>
    `;
  }

  function escapeHtml(s) {
    return (s ?? "")
      .toString()
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ===== QR =====
  const QR_EL_SEL = ["#qrcode", "#qr", ".qr", "[data-qr]"];

  function getQrEl() {
    for (const s of QR_EL_SEL) {
      const el = $(s);
      if (el) return el;
    }
    return null;
  }

  function makeSharePayload(profile) {
    // 最低限の互換：payloadはURLに入ることが多いので小さく
    const p = { ...profile, _v: 1, _t: Date.now() };
    return btoa(unescape(encodeURIComponent(JSON.stringify(p))));
  }

  function parseSharePayload(b64) {
    try {
      const json = decodeURIComponent(escape(atob(b64)));
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  function buildShareUrl(payloadB64) {
    // GitHub Pages: /<repo>/ を含む
    const base = location.href.split("?")[0].split("#")[0];
    const u = new URL(base);
    u.searchParams.set("p", payloadB64);
    return u.toString();
  }

  function renderQrForProfile(profile) {
    const host = getQrEl();
    if (!host) {
      toast("QR表示枠が見つからない（URL共有は可能）");
      return;
    }
    host.innerHTML = ""; // clear

    const payload = makeSharePayload(profile);
    const url = buildShareUrl(payload);

    if (window.QRCode) {
      // qrcodejs
      // eslint-disable-next-line no-new
      new QRCode(host, {
        text: url,
        width: 220,
        height: 220,
      });
      log("QR created.");
    } else {
      toast("QRCodeライブラリが読み込めてない（外部JSの順番を確認）");
    }

    // 共有URLをどこかに出したい場合の候補
    const linkEl = $("#shareUrl") || $("#shareURL") || $("[data-share-url]");
    if (linkEl) linkEl.textContent = url;

    // コピーボタン候補
    const copyBtn =
      $("#copyUrl") ||
      $("#copyURL") ||
      $("[data-action='copy-url']") ||
      findBtnByText(["コピー", "URLコピー"]);

    if (copyBtn) {
      copyBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(url);
          toast("URLをコピーした");
        } catch {
          // iOSで失敗する場合がある
          prompt("このURLをコピーしてね", url);
        }
      };
    }
  }

  // ===== Camera scan (html5-qrcode) =====
  let html5Qr = null;
  function startScanner(onDecoded) {
    const target =
      $("#reader") ||
      $("#qr-reader") ||
      $(".qr-reader") ||
      $("[data-qr-reader]");

    if (!target) {
      toast("QRカメラ枠(#reader等)が見つからない");
      return;
    }
    if (!window.Html5Qrcode) {
      toast("html5-qrcodeが読み込めてない（外部JSの順番を確認）");
      return;
    }

    const id = target.id || "__qr_reader";
    if (!target.id) target.id = id;

    html5Qr = new Html5Qrcode(id);
    html5Qr
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        (decodedText) => {
          onDecoded(decodedText);
        },
        () => {}
      )
      .then(() => toast("カメラ起動"))
      .catch((e) => {
        console.error(e);
        toast("カメラ起動に失敗（権限/HTTPS/ブラウザ）");
      });
  }

  async function stopScanner() {
    try {
      if (html5Qr) {
        await html5Qr.stop();
        await html5Qr.clear();
        html5Qr = null;
        toast("カメラ停止");
      }
    } catch {}
  }

  // ===== Buttons detection =====
  function findBtnByText(words) {
    const candidates = $$("button, a, [role='button'], .btn");
    for (const el of candidates) {
      const t = safeText(el);
      if (!t) continue;
      if (words.some((w) => t.includes(w))) return el;
    }
    return null;
  }

  // ===== Core actions =====
  async function actionSaveProfile() {
    const profile = readProfileFromForm();
    if (!profile || Object.keys(profile).length === 0) {
      toast("入力が空っぽ");
      return;
    }

    // まずローカル保存（確実）
    saveMyProfileLocal(profile);

    // Supabaseが設定されていれば追加で保存
    const client = getSupabaseClient();
    if (client) {
      try {
        // ここは「あなたのスキーマ」に合わせて必要なら調整
        // email認証等なしで使う想定：upsertにしておく（同一端末で上書き）
        const deviceKey = getDeviceKey();
        const row = { device_key: deviceKey, ...profile, updated_at: new Date().toISOString() };

        const { error } = await client.from(TABLE_PROFILES).upsert(row, { onConflict: "device_key" });
        if (error) throw error;
        toast("保存OK（Supabase）");
      } catch (e) {
        console.error(e);
        toast("Supabase保存失敗→ローカルには保存済み");
      }
    } else {
      toast("保存OK（ローカル）");
    }

    // プレビュー/QR更新
    renderPreview(profile);
    renderQrForProfile(profile);
  }

  async function actionLoadMyLatest() {
    const local = loadMyProfileLocal();
    if (local) {
      writeProfileToForm(local);
      renderPreview(local);
      renderQrForProfile(local);
      toast("自分の最新を表示（ローカル）");
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      toast("保存データがない");
      return;
    }

    try {
      const deviceKey = getDeviceKey();
      const { data, error } = await client
        .from(TABLE_PROFILES)
        .select("*")
        .eq("device_key", deviceKey)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        toast("Supabaseにもデータなし");
        return;
      }
      saveMyProfileLocal(data);
      writeProfileToForm(data);
      renderPreview(data);
      renderQrForProfile(data);
      toast("自分の最新を表示（Supabase）");
    } catch (e) {
      console.error(e);
      toast("読み込み失敗");
    }
  }

  async function actionSaveOtherFromUrl(urlOrText) {
    // URL（?p=...）か payload だけを受け取る
    try {
      let p = null;

      // URLならp=を抜く
      if (/^https?:\/\//i.test(urlOrText)) {
        const u = new URL(urlOrText);
        const b64 = u.searchParams.get("p");
        if (!b64) {
          toast("このURLに p= が無い");
          return;
        }
        p = parseSharePayload(b64);
      } else {
        // payloadだけ
        p = parseSharePayload(urlOrText);
      }

      if (!p) {
        toast("QRの中身が解析できない");
        return;
      }

      // ローカル保存
      const list = loadBookLocal();
      list.unshift(p);
      saveBookLocal(list);

      // Supabaseにも保存（設定されていれば）
      const client = getSupabaseClient();
      if (client) {
        try {
          const deviceKey = getDeviceKey();
          const row = { device_key: deviceKey, payload: p, created_at: new Date().toISOString() };
          const { error } = await client.from(TABLE_BOOK).insert(row);
          if (error) throw error;
        } catch (e) {
          console.error(e);
          // ローカルは成功してるので致命にしない
        }
      }

      toast("プロフィール帳に保存した");
      renderBook();
    } catch (e) {
      console.error(e);
      toast("保存に失敗");
    }
  }

  function renderBook() {
    const host =
      $("#bookList") ||
      $("#book-list") ||
      $(".book-list") ||
      $("[data-book-list]");

    const list = loadBookLocal();
    if (!host) {
      log("No book list element found.");
      return;
    }
    if (!list.length) {
      host.innerHTML = `<div style="opacity:.7;padding:10px">まだ保存がありません</div>`;
      return;
    }
    host.innerHTML = list
      .slice(0, 100)
      .map((p, i) => {
        const title = escapeHtml(p.name || p.nickname || `プロフィール${i + 1}`);
        const sub = [
          p.blood ? `血液型:${escapeHtml(p.blood)}` : "",
          p.zodiac ? `星座:${escapeHtml(p.zodiac)}` : "",
        ].filter(Boolean).join(" / ");
        return `
          <div style="border:1px solid rgba(0,0,0,.08);border-radius:12px;padding:10px;margin:10px 0;background:#fff">
            <div style="font-weight:700">${title}</div>
            <div style="opacity:.75;font-size:13px;margin-top:3px">${escapeHtml(sub)}</div>
            ${p.comment ? `<div style="margin-top:6px">${escapeHtml(p.comment)}</div>` : ""}
          </div>
        `;
      })
      .join("");
  }

  // ===== Device key（端末固定キー）=====
  function getDeviceKey() {
    const k = "rinaprof_device_key";
    let v = localStorage.getItem(k);
    if (!v) {
      v = cryptoRandomId();
      localStorage.setItem(k, v);
    }
    return v;
  }

  function cryptoRandomId() {
    try {
      const a = new Uint8Array(16);
      crypto.getRandomValues(a);
      return Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      return "dev_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
    }
  }

  // ===== Click wiring（ここが「ボタン反応しない」を潰す本体）=====
  function routeByText(txt) {
    // ナビ
    if (txt.includes("ホーム")) return { type: "nav", key: "home" };
    if (txt.includes("プロフィール入力")) return { type: "nav", key: "input" };
    if (txt.includes("プロフィール確認")) return { type: "nav", key: "confirm" };
    if (txt.includes("QR読取")) return { type: "nav", key: "scan" };
    if (txt.includes("プロフ帳") || txt.includes("プロフィール帳")) return { type: "nav", key: "book" };

    // アクション
    if (txt.includes("作成") || txt.includes("保存")) return { type: "act", key: "save" };
    if (txt.includes("表示") || txt.includes("最新")) return { type: "act", key: "load" };
    if (txt.includes("開始") && txt.includes("カメラ")) return { type: "act", key: "scanStart" };
    if (txt.includes("停止") && txt.includes("カメラ")) return { type: "act", key: "scanStop" };
    if (txt.includes("保存") && (txt.includes("他者") || txt.includes("読み取り"))) return { type: "act", key: "saveOther" };

    return null;
  }

  function setupDelegatedClicks() {
    document.addEventListener("click", async (ev) => {
      const target = ev.target.closest("button, a, [role='button'], .btn");
      if (!target) return;

      // data-* があれば最優先（HTMLが既にそうなってる場合に最強）
      const nav = target.getAttribute("data-nav");
      const act = target.getAttribute("data-action");
      if (nav) {
        ev.preventDefault();
        await stopScanner();
        showView(nav);
        if (nav === "book") renderBook();
        if (nav === "confirm") {
          const p = loadMyProfileLocal();
          renderPreview(p);
          if (p) renderQrForProfile(p);
        }
        return;
      }
      if (act) {
        ev.preventDefault();
        await handleAction(act);
        return;
      }

      // 文字で推測（HTMLが変えられない前提の保険）
      const txt = safeText(target);
      const r = routeByText(txt);
      if (!r) return;

      ev.preventDefault();
      if (r.type === "nav") {
        await stopScanner();
        showView(r.key);
        if (r.key === "book") renderBook();
        if (r.key === "confirm") {
          const p = loadMyProfileLocal();
          renderPreview(p);
          if (p) renderQrForProfile(p);
        }
      } else {
        await handleAction(r.key);
      }
    });
  }

  async function handleAction(key) {
    if (key === "save") return actionSaveProfile();
    if (key === "load") return actionLoadMyLatest();
    if (key === "scanStart") {
      showView("scan");
      startScanner(async (decodedText) => {
        toast("QR検出");
        // URLの可能性が高い
        await actionSaveOtherFromUrl(decodedText);
        await stopScanner();
      });
      return;
    }
    if (key === "scanStop") return stopScanner();

    if (key === "saveOther") {
      // URL入力欄候補
      const inp =
        $("#otherUrl") ||
        $("#otherURL") ||
        $("[name='otherUrl']") ||
        $("[name='otherURL']") ||
        $("[data-other-url]");

      const v = (inp?.value || "").trim();
      if (!v) return toast("URL/コードが空");
      return actionSaveOtherFromUrl(v);
    }
  }

  // ===== Query paramで閲覧モード（?p=xxxx） =====
  function handleQueryParamView() {
    const u = new URL(location.href);
    const b64 = u.searchParams.get("p");
    if (!b64) return false;

    const p = parseSharePayload(b64);
    if (!p) {
      toast("共有データが壊れてる");
      return true;
    }

    // 表示だけする
    showView("confirm");
    renderPreview(p);
    // 「保存」ボタンが押された時だけ保存、の設計にしたい場合はここでは保存しない
    toast("共有プロフィールを表示中");
    return true;
  }

  // ===== boot =====
  async function boot() {
    // 外部ライブラリが遅れて入るケースに保険（スマホ回線）
    for (let i = 0; i < 30; i++) {
      // supabaseは任意なので存在チェックのみ
      if (document.readyState === "complete" || document.readyState === "interactive") break;
      await sleep(50);
    }

    setupDelegatedClicks();

    // 初期：ローカルの自分データがあればフォーム/プレビュー更新
    const my = loadMyProfileLocal();
    if (my) {
      writeProfileToForm(my);
      renderPreview(my);
      renderQrForProfile(my);
    }

    // 共有URLなら表示モード
    if (handleQueryParamView()) return;

    // 初期表示：homeがあればhome、それが無ければ何もしない
    if (findViewEl("home")) showView("home");

    // プロフ帳が表示される構造なら反映
    renderBook();

    log("boot ok");
  }

  document.addEventListener("DOMContentLoaded", boot);
})();