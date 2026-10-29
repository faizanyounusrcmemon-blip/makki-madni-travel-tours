
(() => {
  "use strict";

  const cfg = window.CMS_CONFIG || {};
  const ready =
    cfg.SUPABASE_URL &&
    !cfg.SUPABASE_URL.includes("PASTE_") &&
    cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_ANON_KEY.includes("PASTE_") &&
    window.supabase;

  const $ = id => document.getElementById(id);
  const MB = 1024 * 1024;
  const GB = 1024 * MB;

  if (!ready) {
    $("config-warning")?.classList.remove("hidden");
    if ($("login-msg")) {
      $("login-msg").textContent = "Pehle cms-config.js configure karein.";
    }
    $("login-form")?.addEventListener("submit", e => e.preventDefault());
    return;
  }

  const db = window.supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_ANON_KEY,
    {
      auth: {
        storage: window.sessionStorage,
        persistSession: true,
        autoRefreshToken: true
      }
    }
  );

  let records = {
    hotels: [],
    packages: [],
    ziyarat: []
  };

  const esc = s =>
    String(s ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));

  const $status = s => {
    if ($("status")) $("status").textContent = s;
  };

  function table(type) {
    if (type === "hotel") return "website_hotels";
    if (type === "ziyarat") return "website_ziyarat";
    return "website_packages";
  }

  function recordArray(type) {
    if (type === "hotel") return records.hotels;
    if (type === "ziyarat") return records.ziyarat;
    return records.packages;
  }

  function typeLabel(type) {
    if (type === "hotel") return "Hotel";
    if (type === "ziyarat") return "Ziyarat";
    return "Umrah Package";
  }

  function fmtBytes(bytes) {
    const n = Math.max(0, Number(bytes) || 0);
    if (n < 1024) return `${n} B`;
    if (n < MB) return `${(n / 1024).toFixed(1)} KB`;
    if (n < GB) return `${(n / MB).toFixed(2)} MB`;
    return `${(n / GB).toFixed(2)} GB`;
  }

  function paintUsage(prefix, used, limit, extra = "") {
    const pct = Math.max(
      0,
      Math.min(100, limit ? (used / limit) * 100 : 0)
    );

    const usedEl = $(`${prefix}-used`);
    const freeEl = $(`${prefix}-free`);
    const pctEl = $(`${prefix}-percent`);
    const barEl = $(`${prefix}-bar`);
    const note = $(`${prefix}-note`);

    if (usedEl) usedEl.textContent = fmtBytes(used);
    if (freeEl) freeEl.textContent = fmtBytes(Math.max(0, limit - used));
    if (pctEl) pctEl.textContent = `${pct.toFixed(1)}% used`;

    if (barEl) {
      barEl.style.width = `${pct}%`;
      barEl.classList.toggle("usage-danger", pct >= 90);
    }

    if (note && extra) note.textContent = extra;
  }

  async function loadUsage() {
    const status = $("usage-status");
    if (status) status.textContent = "Usage data load ho raha hai...";

    try {
      const { data, error } = await db.rpc("admin_usage_monitor");

      if (error || !data) {
        if (status) {
          status.textContent =
            "Usage load nahi hua. admin_usage_monitor aur website_admins check karein.";
        }
        console.error("admin_usage_monitor:", error);
        return;
      }

      paintUsage(
        "db-usage",
        Number(data.database_bytes || 0),
        500 * MB,
        "Database size ka estimate."
      );

      paintUsage(
        "storage-usage",
        Number(data.storage_bytes || 0),
        GB,
        `${Number(data.storage_files || 0)} files in "${data.bucket_id || "website-photos"}".`
      );

      if (status) {
        status.textContent =
          `Last checked: ${new Date(data.measured_at || Date.now()).toLocaleString()}`;
      }
    } catch (err) {
      console.error(err);
      if (status) status.textContent = "Usage load karne mein error hua.";
    }
  }

  // Analytics panel: admin.html mein manually add karna zaroori nahi.
  function ensureAnalyticsPanel() {
    const dashboard = $("dashboard");
    if (!dashboard || $("website-analytics-panel")) return;

    const panel = document.createElement("section");
    panel.id = "website-analytics-panel";
    panel.className =
      "mb-6 rounded-2xl border border-yellow-600/40 bg-slate-950/80 p-4 md:p-6";

    panel.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 class="text-xl md:text-2xl font-bold text-amber-300">
            Website Visitor Analytics
          </h2>
          <p class="text-sm text-slate-400 mt-1">
            Visitors aur media views ka tracking dashboard
          </p>
        </div>
        <button id="analytics-refresh"
          class="btn2 rounded-lg px-4 py-2" type="button">
          Refresh Analytics
        </button>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <div class="rounded-xl border border-yellow-700/30 p-4">
          <p class="text-sm text-slate-400">Today Visitors</p>
          <p id="an-today" class="text-3xl font-bold text-amber-300 mt-2">—</p>
        </div>
        <div class="rounded-xl border border-yellow-700/30 p-4">
          <p class="text-sm text-slate-400">Monthly Visitors</p>
          <p id="an-month" class="text-3xl font-bold text-amber-300 mt-2">—</p>
        </div>
        <div class="rounded-xl border border-yellow-700/30 p-4">
          <p class="text-sm text-slate-400">Yearly Visitors</p>
          <p id="an-year" class="text-3xl font-bold text-amber-300 mt-2">—</p>
        </div>
        <div class="rounded-xl border border-yellow-700/30 p-4">
          <p class="text-sm text-slate-400">Total Visitors</p>
          <p id="an-total" class="text-3xl font-bold text-amber-300 mt-2">—</p>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div class="rounded-xl border border-yellow-700/30 p-4">
          <h3 class="font-bold text-amber-200 mb-2">Photo & Video Views</h3>
          <p id="an-media" class="text-3xl font-bold text-white">—</p>
          <p class="text-xs text-slate-400 mt-2">
            Media tracking active hone ke baad counts show honge.
          </p>
        </div>
        <div class="rounded-xl border border-yellow-700/30 p-4">
          <h3 class="font-bold text-amber-200 mb-2">Currently Active Visitors</h3>
          <p id="an-active" class="text-3xl font-bold text-white">—</p>
          <p id="an-active-note" class="text-xs text-slate-400 mt-2">
            Active visitor count ke liye SQL mein active-session tracking chahiye.
          </p>
        </div>
      </div>

      <div class="rounded-xl border border-yellow-700/30 p-4 mt-4">
        <h3 class="font-bold text-amber-200 mb-3">Daily Visitors — Last 30 Days</h3>
        <div id="an-chart" class="space-y-3">
          <p class="text-sm text-slate-400">Analytics load hone ka intezar karein.</p>
        </div>
      </div>

      <div class="rounded-xl border border-yellow-700/30 p-4 mt-4">
        <h3 class="font-bold text-amber-200 mb-3">Page-wise Visits</h3>
        <div id="an-pages" class="overflow-x-auto text-sm text-slate-300">
          Page-wise report ke liye SQL RPC mein pages data add karna hoga.
        </div>
      </div>

      <div class="rounded-xl border border-yellow-700/30 p-4 mt-4">
        <h3 class="font-bold text-amber-200 mb-3">Individual Photo & Video Views</h3>
        <div id="an-media-list" class="overflow-x-auto text-sm text-slate-300">
          Media views load ho rahe hain...
        </div>
      </div>

      <p id="an-status" class="text-xs text-slate-400 mt-4">
        Analytics load ho raha hai...
      </p>
    `;

    dashboard.prepend(panel);
    $("analytics-refresh")?.addEventListener("click", loadAnalytics);
  }

  function drawDailyChart(daily) {
    const container = $("an-chart");
    if (!container) return;

    if (!Array.isArray(daily) || !daily.length) {
      container.innerHTML =
        '<p class="text-sm text-slate-400">Abhi daily visitor data available nahi hai.</p>';
      return;
    }

    const max = Math.max(1, ...daily.map(x => Number(x.views || 0)));

    container.innerHTML = daily.map(x => {
      const value = Number(x.views || 0);
      const width = Math.max(1, (value / max) * 100);

      return `
        <div>
          <div class="flex justify-between gap-3 text-xs mb-1">
            <span>${esc(x.day || "")}</span>
            <span>${value} visits</span>
          </div>
          <div class="h-2 rounded-full bg-slate-800 overflow-hidden">
            <div class="h-full rounded-full bg-amber-400"
              style="width:${width}%"></div>
          </div>
        </div>`;
    }).join("");
  }

  function drawMediaTable(media) {
    const container = $("an-media-list");
    if (!container) return;

    if (!Array.isArray(media) || !media.length) {
      container.innerHTML =
        '<p class="text-slate-400">Abhi media views record nahi huay.</p>';
      return;
    }

    container.innerHTML = `
      <table class="w-full text-left">
        <thead>
          <tr class="border-b border-yellow-700/30 text-amber-200">
            <th class="p-2">Content</th>
            <th class="p-2">Category</th>
            <th class="p-2">Media</th>
            <th class="p-2 text-right">Views</th>
          </tr>
        </thead>
        <tbody>
          ${media.map(x => `
            <tr class="border-b border-slate-800">
              <td class="p-2 break-words">${esc(x.content_name || x.media_url || "Media")}</td>
              <td class="p-2">${esc(x.content_type || "—")}</td>
              <td class="p-2">${esc(x.media_type || "—")}</td>
              <td class="p-2 text-right font-bold text-amber-300">${Number(x.views || 0)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>`;
  }

  async function loadAnalytics() {
    const status = $("an-status");
    if (status) status.textContent = "Analytics load ho raha hai...";

    try {
      const { data, error } = await db.rpc("admin_website_analytics");

      if (error || !data) {
        if (status) {
          status.textContent =
            "Analytics load nahi hua. admin_website_analytics SQL function aur website_admins permissions check karein.";
        }
        console.error("admin_website_analytics:", error);
        return;
      }

      if ($("an-today")) $("an-today").textContent =
        Number(data.today_visits || 0).toLocaleString();

      if ($("an-month")) $("an-month").textContent =
        Number(data.month_visits || 0).toLocaleString();

      if ($("an-total")) $("an-total").textContent =
        Number(data.total_visits || 0).toLocaleString();

      if ($("an-media")) $("an-media").textContent =
        Number(data.media_views || 0).toLocaleString();

      // Yearly number tabhi show hoga jab SQL RPC yearly_visits return kare.
      if ($("an-year")) {
        $("an-year").textContent =
          data.yearly_visits == null
            ? "SQL update required"
            : Number(data.yearly_visits).toLocaleString();
      }

      // Active visitors tabhi show honge jab RPC active_visitors return kare.
      if ($("an-active")) {
        $("an-active").textContent =
          data.active_visitors == null
            ? "SQL update required"
            : Number(data.active_visitors).toLocaleString();
      }

      if (data.active_visitors != null && $("an-active-note")) {
        $("an-active-note").textContent = "SQL se returned active visitor count.";
      }

      drawDailyChart(data.daily || []);
      drawMediaTable(data.media || []);

      // Page-wise visits tabhi render honge jab SQL pages array return kare.
      const pagesEl = $("an-pages");
      if (pagesEl) {
        if (Array.isArray(data.pages) && data.pages.length) {
          pagesEl.innerHTML = `
            <table class="w-full text-left">
              <thead><tr class="border-b border-yellow-700/30 text-amber-200">
                <th class="p-2">Page</th><th class="p-2 text-right">Visits</th>
              </tr></thead>
              <tbody>
                ${data.pages.map(p => `
                  <tr class="border-b border-slate-800">
                    <td class="p-2">${esc(p.page_path || "/")}</td>
                    <td class="p-2 text-right">${Number(p.visits || 0)}</td>
                  </tr>`).join("")}
              </tbody>
            </table>`;
        } else {
          pagesEl.textContent =
            "Page-wise report ke liye admin_website_analytics SQL function mein pages array add karein.";
        }
      }

      if (status) {
        status.textContent =
          `Analytics refreshed: ${new Date().toLocaleString()}`;
      }
    } catch (err) {
      console.error(err);
      if (status) status.textContent = "Analytics load karte waqt error hua.";
    }
  }

  async function showSession() {
    const { data, error } = await db.auth.getSession();

    if (error) {
      $("login-panel")?.classList.remove("hidden");
      $("dashboard")?.classList.add("hidden");
      if ($("login-msg")) $("login-msg").textContent = error.message;
      return;
    }

    const session = data?.session;

    if (!session) {
      $("login-panel")?.classList.remove("hidden");
      $("dashboard")?.classList.add("hidden");
      return;
    }

    const { data: admin, error: adminError } = await db
      .from("website_admins")
      .select("user_id")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (adminError || !admin) {
      await db.auth.signOut();
      $("login-panel")?.classList.remove("hidden");
      $("dashboard")?.classList.add("hidden");
      if ($("login-msg")) $("login-msg").textContent = "Admin access nahi hai.";
      return;
    }

    $("login-panel")?.classList.add("hidden");
    $("dashboard")?.classList.remove("hidden");

    ensureAnalyticsPanel();

    await Promise.all([
      load(),
      loadUsage(),
      loadAnalytics()
    ]);
  }

  async function load() {
    $status("Content load ho raha hai...");

    const [h, p, z] = await Promise.all([
      db.from("website_hotels").select("*")
        .order("sort_order").order("created_at"),
      db.from("website_packages").select("*")
        .order("sort_order").order("created_at"),
      db.from("website_ziyarat").select("*")
        .order("sort_order").order("created_at")
    ]);

    if (h.error || p.error || z.error) {
      const err = h.error || p.error || z.error;
      $status("Load error: " + err.message);
      console.error("Content load error:", err);
      return;
    }

    records.hotels = h.data || [];
    records.packages = p.data || [];
    records.ziyarat = z.data || [];

    if ($("hotels-list")) {
      $("hotels-list").innerHTML =
        records.hotels.map(x => itemHtml(x, "hotel")).join("") ||
        '<p class="text-sm text-slate-400">Abhi hotels add nahi kiye.</p>';
    }

    if ($("packages-list")) {
      $("packages-list").innerHTML =
        records.packages.map(x => itemHtml(x, "package")).join("") ||
        '<p class="text-sm text-slate-400">Abhi packages add nahi kiye.</p>';
    }

    ensureZiyaratSections();

    const makkah = records.ziyarat.filter(x => x.city === "makkah");
    const madinah = records.ziyarat.filter(x => x.city === "madinah");

    $("ziyarat-makkah-list").innerHTML =
      makkah.map(x => itemHtml(x, "ziyarat")).join("") ||
      '<p class="text-sm text-slate-400">Abhi Makkah Ziyarat add nahi ki.</p>';

    $("ziyarat-madinah-list").innerHTML =
      madinah.map(x => itemHtml(x, "ziyarat")).join("") ||
      '<p class="text-sm text-slate-400">Abhi Madinah Ziyarat add nahi ki.</p>';

    $status("Content successfully load ho gaya.");
  }

  function ensureZiyaratSections() {
    const dashboard = $("dashboard");
    if (!dashboard) return;

    let wrap = $("ziyarat-admin-sections");

    if (!wrap) {
      wrap = document.createElement("section");
      wrap.id = "ziyarat-admin-sections";
      wrap.className =
        "my-6 rounded-2xl border border-yellow-700/40 bg-slate-950/60 p-4 md:p-6";

      wrap.innerHTML = `
        <h2 class="text-xl md:text-2xl font-bold text-amber-300 mb-5">
          Makkah & Madinah Ziyarat Management
        </h2>

        <div class="mb-6">
          <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h3 class="text-lg font-bold text-amber-200">Makkah Ziyarat</h3>
            <button id="new-makkah-ziyarat" class="btn2 px-4 py-2" type="button">
              + Add Makkah Ziyarat
            </button>
          </div>
          <div id="ziyarat-makkah-list" class="grid grid-cols-1 lg:grid-cols-2 gap-3"></div>
        </div>

        <div>
          <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h3 class="text-lg font-bold text-amber-200">Madinah Ziyarat</h3>
            <button id="new-madinah-ziyarat" class="btn2 px-4 py-2" type="button">
              + Add Madinah Ziyarat
            </button>
          </div>
          <div id="ziyarat-madinah-list" class="grid grid-cols-1 lg:grid-cols-2 gap-3"></div>
        </div>
      `;

      dashboard.appendChild(wrap);

      $("new-makkah-ziyarat").addEventListener("click", () => {
        openEditor("ziyarat", null, "makkah");
      });

      $("new-madinah-ziyarat").addEventListener("click", () => {
        openEditor("ziyarat", null, "madinah");
      });
    }
  }

  function itemHtml(x, type) {
    const imgs = Array.isArray(x.images)
      ? x.images
      : (x.image_url ? [x.image_url] : []);

    const vids = Array.isArray(x.videos)
      ? x.videos
      : (x.videos ? [x.videos] : []);

    const category = type === "hotel"
      ? `Hotel • ${esc(x.city)}`
      : type === "ziyarat"
        ? `Ziyarat • ${esc(x.city)}`
        : "Umrah Package";

    return `
      <div class="border border-yellow-700/30 rounded-xl p-3 flex gap-3 items-start">
        <img src="${esc(imgs[0] || "")}"
          class="w-16 h-16 object-cover rounded-lg bg-black/30"
          alt="" onerror="this.style.display='none'">

        <div class="min-w-0 flex-1">
          <p class="font-bold text-white">${esc(x.name)}</p>
          <p class="text-xs text-slate-400 mt-1">
            ${category} • ${x.is_visible ? "Visible" : "Hidden"}
            • 📷 ${imgs.length} Photos • 🎬 ${vids.length} Videos
          </p>

          <div class="flex flex-wrap gap-2 mt-3">
            <button class="btn2 text-xs"
              data-edit="${type}:${x.id}" type="button">Edit</button>

            <button class="btn2 text-xs"
              data-toggle="${type}:${x.id}" type="button">
              ${x.is_visible ? "Hide" : "Show"}
            </button>

            <button
              class="text-xs text-red-300 border border-red-800/60 rounded-lg px-3 py-2"
              data-delete="${type}:${x.id}" type="button">Delete</button>
          </div>
        </div>
      </div>`;
  }

  function setField(id, value) {
    const el = $(id);
    if (el) el.value = value ?? "";
  }

  async function openEditor(type, item = null, defaultCity = "makkah") {
    if (!$("editor")) {
      alert("Editor form nahi mila. admin.html file check karein.");
      return;
    }

    $("editor").reset();
    setField("record-id", item?.id || "");
    setField("record-type", type);

    if ($("editor-title")) {
      $("editor-title").textContent =
        `${item ? "Edit " : "Add "}${typeLabel(type)}`;
    }

    $("city-wrap")?.classList.toggle("hidden", type === "package");
    $("view-wrap")?.classList.toggle("hidden", type !== "hotel");

    setField("f-name", item?.name || "");
    setField("f-city", item?.city || defaultCity);
    setField("f-badge", item?.badge || "");
    setField("f-description", item?.description || "");
    setField("f-view", item?.view_text || "");
    setField("f-price", item?.price || "");
    setField("f-order", item?.sort_order ?? 0);

    const vids = item?.videos;
    setField(
      "f-videos",
      (Array.isArray(vids) ? vids : vids ? [vids] : []).join("\n")
    );

    const pdfs = item?.pdfs;
    setField("f-pdfs", Array.isArray(pdfs) ? (pdfs[0] || "") : (pdfs || ""));

    if ($("f-visible")) $("f-visible").checked = item?.is_visible ?? true;
    if ($("f-files")) $("f-files").value = "";
    if ($("f-video-files")) $("f-video-files").value = "";
    if ($("preview-images")) $("preview-images").innerHTML = "";
    if ($("preview-videos")) $("preview-videos").innerHTML = "";
    if ($("editor-msg")) $("editor-msg").textContent = "";

    $("editor-wrap")?.classList.remove("hidden");
  }

  async function uploadPhotos(files) {
    const urls = [];

    for (const file of Array.from(files || [])) {
      if (!file.type.startsWith("image/")) continue;

      if (file.size > 5 * MB) {
        throw new Error(`${file.name} 5MB se bari hai. Photo compress karein.`);
      }

      const ext = file.name.split(".").pop()
        .toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";

      const path = `website/${crypto.randomUUID()}.${ext}`;

      const { error } = await db.storage.from("website-photos").upload(
        path,
        file,
        { upsert: false, contentType: file.type }
      );

      if (error) throw new Error("Photo upload failed: " + error.message);

      urls.push(
        db.storage.from("website-photos").getPublicUrl(path).data.publicUrl
      );
    }

    return urls;
  }

  async function uploadVideos(files) {
    const urls = [];

    for (const file of Array.from(files || [])) {
      if (!["video/mp4", "video/webm", "video/ogg"].includes(file.type)) {
        throw new Error(`${file.name}: MP4, WebM ya OGG video use karein.`);
      }

      if (file.size > 50 * MB) {
        throw new Error(`${file.name} 50MB se bari hai. Video compress karein.`);
      }

      const ext = file.name.split(".").pop()
        .toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";

      const path = `website/videos/${crypto.randomUUID()}.${ext}`;

      const { error } = await db.storage.from("website-photos").upload(
        path,
        file,
        { upsert: false, contentType: file.type }
      );

      if (error) throw new Error("Video upload failed: " + error.message);

      urls.push(
        db.storage.from("website-photos").getPublicUrl(path).data.publicUrl
      );
    }

    return urls;
  }

  function previewImages() {
    const files = Array.from($("f-files")?.files || []);
    if (!$("preview-images")) return;

    $("preview-images").innerHTML = "";

    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;

      const url = URL.createObjectURL(file);
      const img = document.createElement("img");

      img.src = url;
      img.alt = file.name;
      img.className =
        "w-20 h-20 object-cover rounded-lg border border-yellow-700/40";
      img.onload = () => URL.revokeObjectURL(url);

      $("preview-images").appendChild(img);
    }
  }

  function previewVideos() {
    const files = Array.from($("f-video-files")?.files || []);
    if (!$("preview-videos")) return;

    $("preview-videos").innerHTML = "";

    for (const file of files) {
      if (!file.type.startsWith("video/")) continue;

      const url = URL.createObjectURL(file);
      const wrap = document.createElement("div");
      wrap.className = "border border-yellow-700/30 rounded-xl p-3";

      const title = document.createElement("p");
      title.className = "text-sm text-amber-200 mb-2";
      title.textContent = file.name;

      const video = document.createElement("video");
      video.src = url;
      video.controls = true;
      video.preload = "metadata";
      video.className = "w-full max-h-64 rounded-lg bg-black";
      video.onloadedmetadata = () => URL.revokeObjectURL(url);

      wrap.append(title, video);
      $("preview-videos").appendChild(wrap);
    }
  }

  $("login-form")?.addEventListener("submit", async e => {
    e.preventDefault();

    if ($("login-msg")) $("login-msg").textContent = "Logging in...";

    const { error } = await db.auth.signInWithPassword({
      email: $("email").value.trim(),
      password: $("password").value
    });

    if (!error) {
      if ($("login-msg")) $("login-msg").textContent = "";
      await showSession();
    } else {
      $("login-msg").textContent = error.message;
    }
  });

  $("logout")?.addEventListener("click", async () => {
    await db.auth.signOut();
    await showSession();
  });

  $("refresh")?.addEventListener("click", async () => {
    await Promise.all([load(), loadUsage(), loadAnalytics()]);
  });

  $("usage-refresh")?.addEventListener("click", loadUsage);

  $("new-hotel")?.addEventListener("click", () => openEditor("hotel"));
  $("new-package")?.addEventListener("click", () => openEditor("package"));

  $("close-editor")?.addEventListener("click", () => {
    $("editor-wrap")?.classList.add("hidden");
  });

  $("cancel-editor")?.addEventListener("click", () => {
    $("editor-wrap")?.classList.add("hidden");
  });

  $("f-files")?.addEventListener("change", previewImages);
  $("f-video-files")?.addEventListener("change", previewVideos);

  document.addEventListener("click", async e => {
    const target = e.target;
    if (!(target instanceof Element)) return;

    const ed = target.closest("[data-edit]");

    if (ed) {
      const [type, id] = ed.dataset.edit.split(":");
      const item = recordArray(type).find(x => String(x.id) === id);

      if (item) openEditor(type, item);
      return;
    }

    const tg = target.closest("[data-toggle]");

    if (tg) {
      const [type, id] = tg.dataset.toggle.split(":");
      const item = recordArray(type).find(x => String(x.id) === id);

      if (!item) return;

      tg.disabled = true;

      const { error } = await db.from(table(type))
        .update({ is_visible: !item.is_visible })
        .eq("id", id);

      if (error) {
        $status("Update error: " + error.message);
      }

      await load();
      return;
    }

    const del = target.closest("[data-delete]");

    if (del) {
      const [type, id] = del.dataset.delete.split(":");

      if (!confirm("Kya aap waqai is content ko delete karna chahte hain?")) {
        return;
      }

      const { error } = await db.from(table(type)).delete().eq("id", id);

      if (error) {
        $status("Delete error: " + error.message);
        return;
      }

      await load();
      $status("Content delete ho gaya.");
    }
  });

  $("editor")?.addEventListener("submit", async e => {
    e.preventDefault();

    const type = $("record-type").value;
    const t = table(type);
    const id = $("record-id").value;
    const btn = $("editor").querySelector('[type="submit"]');

    if (btn) {
      btn.disabled = true;
      btn.textContent = "Saving...";
    }

    if ($("editor-msg")) $("editor-msg").textContent = "";

    try {
      const existingItem = id
        ? recordArray(type).find(x => String(x.id) === id)
        : null;

      const newImgs = $("f-files")?.files.length
        ? await uploadPhotos($("f-files").files)
        : [];

      const existingImages = Array.isArray(existingItem?.images)
        ? existingItem.images
        : existingItem?.image_url
          ? [existingItem.image_url]
          : [];

      // Nayi photos upload na hon to purani photos preserve rahengi.
      const finalImages = newImgs.length ? newImgs : existingImages;

      const videoInput = $("f-videos")?.value.trim() || "";
      const manualVideos = videoInput
        ? videoInput.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
        : [];

      const existingVideos = Array.isArray(existingItem?.videos)
        ? existingItem.videos
        : existingItem?.videos
          ? [existingItem.videos]
          : [];

      const uploadedVideos = $("f-video-files")?.files.length
        ? await uploadVideos($("f-video-files").files)
        : [];

      const finalVideos = [
        ...new Set([
          ...existingVideos.filter(v => manualVideos.includes(v)),
          ...manualVideos,
          ...uploadedVideos
        ])
      ];

      const pdfInput = $("f-pdfs")?.value.trim() || "";

      const row = {
        name: $("f-name").value.trim(),
        badge: $("f-badge")?.value.trim() || "",
        description: $("f-description")?.value.trim() || "",
        price: $("f-price")?.value.trim() || "",
        image_url: finalImages[0] || null,
        images: finalImages,
        videos: finalVideos,
        pdfs: pdfInput ? [pdfInput] : [],
        sort_order: Number($("f-order")?.value) || 0,
        is_visible: $("f-visible")?.checked ?? true,
        updated_at: new Date().toISOString()
      };

      if (!row.name) throw new Error("Name enter karein.");

      if (type === "hotel") {
        row.city = $("f-city").value;
        row.view_text = $("f-view")?.value.trim() || "";
      }

      if (type === "ziyarat") {
        row.city = $("f-city").value;

        if (!["makkah", "madinah"].includes(row.city)) {
          throw new Error("Ziyarat ke liye Makkah ya Madinah select karein.");
        }
      }

      const res = id
        ? await db.from(t).update(row).eq("id", id)
        : await db.from(t).insert(row);

      if (res.error) throw res.error;

      $("editor-wrap")?.classList.add("hidden");

      await Promise.all([load(), loadUsage(), loadAnalytics()]);

      $status("Content successfully save ho gaya.");
    } catch (err) {
      console.error("Save error:", err);
      if ($("editor-msg")) {
        $("editor-msg").textContent = err.message || "Save failed.";
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Save Changes";
      }
    }
  });

  showSession();
})();
