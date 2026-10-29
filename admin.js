
(() => {
  "use strict";

  const cfg = window.CMS_CONFIG || {};
  const $ = id => document.getElementById(id);
  const MB = 1024 * 1024;
  const GB = 1024 * MB;

  const ready = Boolean(
    cfg.SUPABASE_URL &&
    !String(cfg.SUPABASE_URL).includes("PASTE_") &&
    cfg.SUPABASE_ANON_KEY &&
    !String(cfg.SUPABASE_ANON_KEY).includes("PASTE_") &&
    window.supabase
  );

  if (!ready) {
    $("config-warning")?.classList.remove("hidden");

    if ($("login-msg")) {
      $("login-msg").textContent =
        "Pehle cms-config.js mein Supabase URL aur anon key configure karein.";
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
        autoRefreshToken: true,
        persistSession: true
      }
    }
  );

  let records = {
    hotels: [],
    packages: [],
    ziyarat: []
  };

  let busy = false;

  // --------------------------------------------------
  // HELPERS
  // --------------------------------------------------

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function setStatus(message) {
    if ($("status")) $("status").textContent = message;
  }

  function setEditorMessage(message) {
    if ($("editor-msg")) $("editor-msg").textContent = message;
  }

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

  function normalizeArray(value) {
    if (Array.isArray(value)) return value.filter(Boolean);

    if (typeof value === "string" && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.filter(Boolean);
      } catch (_) {
        return [value.trim()];
      }
    }

    return [];
  }

  function getImages(item) {
    const images = normalizeArray(item?.images);
    if (images.length) return images;

    return item?.image_url ? [item.image_url] : [];
  }

  function getVideos(item) {
    return normalizeArray(item?.videos);
  }

  function getPdfs(item) {
    return normalizeArray(item?.pdfs);
  }

  function setField(id, value) {
    const element = $(id);
    if (element) element.value = value ?? "";
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
    const noteEl = $(`${prefix}-note`);

    if (usedEl) usedEl.textContent = fmtBytes(used);
    if (freeEl) freeEl.textContent = fmtBytes(Math.max(0, limit - used));
    if (pctEl) pctEl.textContent = `${pct.toFixed(1)}% used`;

    if (barEl) {
      barEl.style.width = `${pct}%`;
      barEl.classList.toggle("usage-danger", pct >= 90);
    }

    if (noteEl && extra) noteEl.textContent = extra;
  }

  function setVisible(element, visible) {
    if (element) element.classList.toggle("hidden", !visible);
  }

  // --------------------------------------------------
  // SUPABASE RESOURCE MONITOR
  // --------------------------------------------------

  async function loadUsage() {
    const status = $("usage-status");

    if (status) status.textContent = "Usage data load ho raha hai...";

    try {
      const { data, error } = await db.rpc("admin_usage_monitor");

      if (error || !data) {
        if (status) {
          status.textContent =
            "Usage load nahi hua. admin_usage_monitor RPC aur admin permissions check karein.";
        }

        console.error("admin_usage_monitor:", error);
        return;
      }

      paintUsage(
        "db-usage",
        Number(data.database_bytes || 0),
        500 * MB,
        "Database size estimate; actual billing usage se farq ho sakta hai."
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
    } catch (error) {
      console.error("Usage monitor error:", error);

      if (status) {
        status.textContent = "Usage load karte waqt error hua.";
      }
    }
  }

  // --------------------------------------------------
  // WEBSITE ANALYTICS
  // --------------------------------------------------

  function ensureAnalyticsPanel() {
    const dashboard = $("dashboard");

    if (!dashboard || $("website-analytics-panel")) return;

    const panel = document.createElement("section");
    panel.id = "website-analytics-panel";
    panel.className =
      "panel mb-6 p-4 md:p-6";

    panel.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <p class="text-xs text-slate-400">WEBSITE PERFORMANCE</p>
          <h2 class="text-xl md:text-2xl font-bold gold mt-1">
            Website Visitor Analytics
          </h2>
          <p class="text-sm text-slate-300 mt-1">
            Visitors, page visits aur photo/video views
          </p>
        </div>
        <button id="analytics-refresh" class="btn2" type="button">
          ? Refresh Analytics
        </button>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <div class="section-card">
          <p class="text-sm text-slate-300">Today Visitors</p>
          <p id="an-today" class="text-3xl font-bold gold mt-2">?</p>
        </div>

        <div class="section-card">
          <p class="text-sm text-slate-300">Monthly Visitors</p>
          <p id="an-month" class="text-3xl font-bold gold mt-2">?</p>
        </div>

        <div class="section-card">
          <p class="text-sm text-slate-300">Yearly Visitors</p>
          <p id="an-year" class="text-3xl font-bold gold mt-2">?</p>
        </div>

        <div class="section-card">
          <p class="text-sm text-slate-300">Total Visitors</p>
          <p id="an-total" class="text-3xl font-bold gold mt-2">?</p>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div class="section-card">
          <h3 class="font-bold gold mb-2">Photo & Video Views</h3>
          <p id="an-media" class="text-3xl font-bold">?</p>
          <p class="text-xs text-slate-400 mt-2">
            Total media views returned by the analytics RPC.
          </p>
        </div>

        <div class="section-card">
          <h3 class="font-bold gold mb-2">Currently Active Visitors</h3>
          <p id="an-active" class="text-3xl font-bold">?</p>
          <p id="an-active-note" class="text-xs text-slate-400 mt-2">
            Active visitors ke liye SQL mein session tracking zaroori hai.
          </p>
        </div>
      </div>

      <div class="section-card mt-4">
        <h3 class="font-bold gold mb-3">Daily Visits ? Last 30 Days</h3>
        <div id="an-chart" class="space-y-3">
          <p class="text-sm text-slate-400">Analytics load ho rahi hai...</p>
        </div>
      </div>

      <div class="section-card mt-4">
        <h3 class="font-bold gold mb-3">Page-wise Visits</h3>
        <div id="an-pages" class="overflow-x-auto text-sm">
          <p class="text-slate-400">Analytics load ho rahi hai...</p>
        </div>
      </div>

      <div class="section-card mt-4">
        <h3 class="font-bold gold mb-3">Individual Photo & Video Views</h3>
        <div id="an-media-list" class="overflow-x-auto text-sm">
          <p class="text-slate-400">Analytics load ho rahi hai...</p>
        </div>
      </div>

      <p id="an-status" role="status" aria-live="polite"
        class="text-xs text-amber-200 mt-4">
        Analytics load ho rahi hai...
      </p>
    `;

    
  // Analytics aur Resource Monitor ko ek shared row mein rakhein.
  const resourcePanel = $("usage-refresh")?.closest("section");

  if (resourcePanel) {
    let monitorRow = dashboard.querySelector(".monitor-row");

    if (!monitorRow) {
      monitorRow = document.createElement("div");
      monitorRow.className = "monitor-row";

      // Resource Monitor ko uski original jagah se temporarily move karein.
      resourcePanel.parentNode.insertBefore(monitorRow, resourcePanel);
      monitorRow.appendChild(resourcePanel);
    }

    // Analytics panel ko Resource Monitor ke saath place karein.
    monitorRow.prepend(panel);
  } else {
    // Agar Resource Monitor nahi mila, Analytics ko normal show karein.
    dashboard.prepend(panel);
  }

  $("analytics-refresh")?.addEventListener("click", loadAnalytics);


    $("analytics-refresh")?.addEventListener("click", loadAnalytics);
  }

  function drawDailyChart(daily) {
    const container = $("an-chart");
    if (!container) return;

    if (!Array.isArray(daily) || !daily.length) {
      container.innerHTML =
        '<p class="text-sm text-slate-400">Daily visitor data abhi available nahi hai.</p>';
      return;
    }

    const max = Math.max(
      1,
      ...daily.map(item => Number(item.views || 0))
    );

    container.innerHTML = daily.map(item => {
      const value = Number(item.views || 0);
      const width = Math.max(0, (value / max) * 100);

      return `
        <div>
          <div class="flex justify-between gap-3 text-xs mb-1">
            <span>${esc(item.day || "")}</span>
            <span>${value.toLocaleString()} visits</span>
          </div>
          <div class="h-2 rounded-full bg-slate-800 overflow-hidden">
            <div class="h-full rounded-full bg-amber-400"
              style="width:${width}%"></div>
          </div>
        </div>
      `;
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
          <tr class="border-b border-yellow-700/30 gold">
            <th class="p-2">Content</th>
            <th class="p-2">Category</th>
            <th class="p-2">Media</th>
            <th class="p-2 text-right">Views</th>
          </tr>
        </thead>
        <tbody>
          ${media.map(item => `
            <tr class="border-b border-slate-800">
              <td class="p-2 break-words">
                ${esc(item.content_name || item.media_url || "Media")}
              </td>
              <td class="p-2">${esc(item.content_type || "?")}</td>
              <td class="p-2">${esc(item.media_type || "?")}</td>
              <td class="p-2 text-right font-bold gold">
                ${Number(item.views || 0).toLocaleString()}
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  function drawPagesTable(pages) {
    const container = $("an-pages");
    if (!container) return;

    if (!Array.isArray(pages) || !pages.length) {
      container.innerHTML =
        '<p class="text-slate-400">Page-wise report SQL RPC mein available nahi hai.</p>';
      return;
    }

    container.innerHTML = `
      <table class="w-full text-left">
        <thead>
          <tr class="border-b border-yellow-700/30 gold">
            <th class="p-2">Page</th>
            <th class="p-2 text-right">Visits</th>
          </tr>
        </thead>
        <tbody>
          ${pages.map(page => `
            <tr class="border-b border-slate-800">
              <td class="p-2 break-all">${esc(page.page_path || "/")}</td>
              <td class="p-2 text-right">
                ${Number(page.visits || 0).toLocaleString()}
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  async function loadAnalytics() {
    const status = $("an-status");

    if (status) status.textContent = "Analytics load ho rahi hai...";

    try {
      const { data, error } = await db.rpc("admin_website_analytics");

      if (error || !data) {
        if (status) {
          status.textContent =
            "Analytics load nahi hui. admin_website_analytics RPC aur admin permissions check karein.";
        }

        console.error("admin_website_analytics:", error);
        return;
      }

      if ($("an-today")) {
        $("an-today").textContent =
          Number(data.today_visits || 0).toLocaleString();
      }

      if ($("an-month")) {
        $("an-month").textContent =
          Number(data.month_visits || 0).toLocaleString();
      }

      if ($("an-total")) {
        $("an-total").textContent =
          Number(data.total_visits || 0).toLocaleString();
      }

      if ($("an-media")) {
        $("an-media").textContent =
          Number(data.media_views || 0).toLocaleString();
      }

      if ($("an-year")) {
        $("an-year").textContent =
          data.yearly_visits == null
            ? "SQL update required"
            : Number(data.yearly_visits).toLocaleString();
      }

      if ($("an-active")) {
        $("an-active").textContent =
          data.active_visitors == null
            ? "SQL update required"
            : Number(data.active_visitors).toLocaleString();
      }

      if (data.active_visitors != null && $("an-active-note")) {
        $("an-active-note").textContent =
          "Count SQL RPC se return hua hai.";
      }

      drawDailyChart(data.daily || []);
      drawMediaTable(data.media || []);
      drawPagesTable(data.pages || []);

      if (status) {
        status.textContent =
          `Analytics refreshed: ${new Date().toLocaleString()}`;
      }
    } catch (error) {
      console.error("Analytics error:", error);

      if (status) {
        status.textContent = "Analytics load karte waqt error hua.";
      }
    }
  }

  // --------------------------------------------------
  // CONTENT CARD HTML
  // --------------------------------------------------

  function itemHtml(item, type) {
    const images = getImages(item);
    const videos = getVideos(item);

    const category = type === "hotel"
      ? `Hotel ? ${esc(item.city || "?")}`
      : type === "ziyarat"
        ? `Ziyarat ? ${esc(item.city || "?")}`
        : "Umrah Package";

    const photoCount = images.length;
    const videoCount = videos.length;

    const thumbnail = images[0]
      ? `<img src="${esc(images[0])}"
          class="w-16 h-16 object-cover rounded-lg bg-black/30 shrink-0"
          alt="" loading="lazy"
          onerror="this.style.display='none'">`
      : `<div class="w-16 h-16 rounded-lg bg-slate-900 border border-yellow-700/30 flex items-center justify-center shrink-0">
           <span class="text-2xl">??</span>
         </div>`;

    return `
      <article class="border border-yellow-700/30 rounded-xl p-3 flex gap-3 items-start">
        ${thumbnail}

        <div class="min-w-0 flex-1">
          <p class="font-bold text-white break-words">${esc(item.name || "Untitled")}</p>

          <p class="text-xs text-slate-400 mt-1">
            ${category}
          </p>

          <div class="flex flex-wrap gap-2 mt-2 text-xs">
            <span class="status-pill">${item.is_visible ? "Visible" : "Hidden"}</span>
            <span class="status-pill"><i class="fa-solid fa-image mr-1"></i> ${photoCount}</span>
            <span class="status-pill"><i class="fa-solid fa-video mr-1"></i> ${videoCount}</span>
          </div>

          <div class="flex flex-wrap gap-2 mt-3">
            <button class="btn2 text-xs"
              data-edit="${type}:${esc(item.id)}" type="button">
              Edit
            </button>

            <button class="btn2 text-xs"
              data-toggle="${type}:${esc(item.id)}" type="button">
              ${item.is_visible ? "Hide" : "Show"}
            </button>

            <button
              class="text-xs text-red-300 border border-red-800/60 rounded-lg px-3 py-2"
              data-delete="${type}:${esc(item.id)}" type="button">
              Delete
            </button>
          </div>
        </div>
      </article>
    `;
  }

  // --------------------------------------------------
  // LOAD CONTENT FROM SUPABASE
  // --------------------------------------------------

  async function load() {
    setStatus("Hotels, packages aur ziyarat load ho rahe hain...");

    try {
      const results = await Promise.all([
        db.from("website_hotels")
          .select("*")
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),

        db.from("website_packages")
          .select("*")
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),

        db.from("website_ziyarat")
          .select("*")
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true })
      ]);

      const [hotelsResult, packagesResult, ziyaratResult] = results;

      if (hotelsResult.error) throw new Error(
        "Hotels: " + hotelsResult.error.message
      );

      if (packagesResult.error) throw new Error(
        "Packages: " + packagesResult.error.message
      );

      if (ziyaratResult.error) throw new Error(
        "Ziyarat: " + ziyaratResult.error.message
      );

      records.hotels = hotelsResult.data || [];
      records.packages = packagesResult.data || [];
      records.ziyarat = ziyaratResult.data || [];

      if ($("hotels-list")) {
        $("hotels-list").innerHTML =
          records.hotels.map(item => itemHtml(item, "hotel")).join("") ||
          '<p class="text-sm text-slate-400">Abhi hotels add nahi kiye.</p>';
      }

      if ($("packages-list")) {
        $("packages-list").innerHTML =
          records.packages.map(item => itemHtml(item, "package")).join("") ||
          '<p class="text-sm text-slate-400">Abhi Umrah packages add nahi kiye.</p>';
      }

      renderZiyarat();

      setStatus("Hotels, packages aur ziyarat successfully load ho gaye.");
    } catch (error) {
      console.error("Content load error:", error);
      setStatus("Content load error: " + error.message);
    }
  }

  function renderZiyarat() {
    const makkahList = $("makkah-ziyarat-list");
    const madinahList = $("madinah-ziyarat-list");

    const makkah = records.ziyarat.filter(item => item.city === "makkah");
    const madinah = records.ziyarat.filter(item => item.city === "madinah");

    if (makkahList) {
      makkahList.innerHTML =
        makkah.map(item => itemHtml(item, "ziyarat")).join("") ||
        '<p class="text-sm text-slate-400">Abhi Makkah Ziyarat add nahi ki.</p>';
    }

    if (madinahList) {
      madinahList.innerHTML =
        madinah.map(item => itemHtml(item, "ziyarat")).join("") ||
        '<p class="text-sm text-slate-400">Abhi Madinah Ziyarat add nahi ki.</p>';
    }
  }

  // --------------------------------------------------
  // EDITOR
  // --------------------------------------------------

  function openEditor(type, item = null, defaultCity = "makkah") {
    if (!$("editor")) {
      setStatus("Editor form nahi mila. admin.html check karein.");
      return;
    }

    $("editor").reset();

    setField("record-id", item?.id || "");
    setField("record-type", type);

    if ($("editor-title")) {
      $("editor-title").textContent =
        `${item ? "Edit " : "Add "}${typeLabel(type)}`;
    }

    setVisible($("city-wrap"), type !== "package");
    setVisible($("view-wrap"), type === "hotel");

    setField("f-name", item?.name || "");
    setField("f-city", item?.city || defaultCity);
    setField("f-badge", item?.badge || "");
    setField("f-description", item?.description || "");
    setField("f-view", item?.view_text || "");
    setField("f-price", item?.price || "");
    setField("f-order", item?.sort_order ?? 0);

    setField("f-videos", getVideos(item).join("\n"));
    setField("f-pdfs", getPdfs(item)[0] || "");

    if ($("f-visible")) {
      $("f-visible").checked = item?.is_visible ?? true;
    }

    if ($("f-files")) $("f-files").value = "";
    if ($("f-video-files")) $("f-video-files").value = "";

    if ($("preview-images")) {
      $("preview-images").innerHTML = "";
    }

    if ($("preview-videos")) {
      $("preview-videos").innerHTML = "";
    }

    setEditorMessage("");

    // Existing images remain unchanged unless new images are uploaded.
    const oldImages = getImages(item);

    if ($("preview-images") && oldImages.length) {
      $("preview-images").innerHTML = oldImages.map(url => `
        <div class="relative">
          <img src="${esc(url)}"
            alt="Existing image"
            class="w-20 h-20 object-cover rounded-lg border border-yellow-700/40"
            loading="lazy"
            onerror="this.style.display='none'">
        </div>
      `).join("");
    }

    $("editor-wrap")?.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  function closeEditor() {
    $("editor-wrap")?.classList.add("hidden");
    document.body.style.overflow = "";
    setEditorMessage("");
  }

  // Exposed for the Add Ziyarat buttons in admin.html.
  window.openEditor = openEditor;

  // --------------------------------------------------
  // STORAGE UPLOADS
  // --------------------------------------------------

  function randomFileName(file) {
    const ext = file.name.split(".").pop()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "file";

    return `${crypto.randomUUID()}.${ext}`;
  }

  async function uploadFile(file, folder, allowedTypes, maxBytes) {
    if (!allowedTypes.includes(file.type)) {
      throw new Error(`${file.name}: File format supported nahi hai.`);
    }

    if (file.size > maxBytes) {
      throw new Error(
        `${file.name}: File limit ${fmtBytes(maxBytes)} hai. File compress karein.`
      );
    }

    const path = `${folder}/${randomFileName(file)}`;

    const { data, error } = await db.storage
      .from("website-photos")
      .upload(path, file, {
        upsert: false,
        contentType: file.type
      });

    if (error) {
      throw new Error(`Upload failed (${file.name}): ${error.message}`);
    }

    const { data: publicData } = db.storage
      .from("website-photos")
      .getPublicUrl(data.path);

    if (!publicData?.publicUrl) {
      throw new Error(`${file.name}: Public URL generate nahi hua.`);
    }

    return publicData.publicUrl;
  }

  async function uploadPhotos(files) {
    const urls = [];

    for (const file of Array.from(files || [])) {
      urls.push(await uploadFile(
        file,
        "website",
        ["image/jpeg", "image/png", "image/webp", "image/gif"],
        5 * MB
      ));
    }

    return urls;
  }

  async function uploadVideos(files) {
    const urls = [];

    for (const file of Array.from(files || [])) {
      urls.push(await uploadFile(
        file,
        "website/videos",
        ["video/mp4", "video/webm", "video/ogg"],
        50 * MB
      ));
    }

    return urls;
  }

  // --------------------------------------------------
  // FILE PREVIEWS
  // --------------------------------------------------

  function previewImages() {
    const container = $("preview-images");
    if (!container) return;

    // Preserve existing image previews, then append newly selected files.
    const files = Array.from($("f-files")?.files || []);

    files.forEach(file => {
      if (!file.type.startsWith("image/")) return;

      const url = URL.createObjectURL(file);
      const image = document.createElement("img");

      image.src = url;
      image.alt = file.name;
      image.title = file.name;
      image.className =
        "w-20 h-20 object-cover rounded-lg border border-yellow-700/40";

      image.onload = () => URL.revokeObjectURL(url);

      container.appendChild(image);
    });
  }

  function previewVideos() {
    const container = $("preview-videos");
    if (!container) return;

    container.innerHTML = "";

    Array.from($("f-video-files")?.files || []).forEach(file => {
      if (!file.type.startsWith("video/")) return;

      const url = URL.createObjectURL(file);
      const wrapper = document.createElement("div");
      wrapper.className = "border border-yellow-700/30 rounded-xl p-3";

      const title = document.createElement("p");
      title.className = "text-sm gold mb-2";
      title.textContent = file.name;

      const video = document.createElement("video");
      video.src = url;
      video.controls = true;
      video.preload = "metadata";
      video.className = "w-full max-h-64 rounded-lg bg-black";

      video.onloadedmetadata = () => URL.revokeObjectURL(url);

      wrapper.append(title, video);
      container.appendChild(wrapper);
    });
  }

  // --------------------------------------------------
  // LOGIN / ADMIN AUTHORIZATION
  // --------------------------------------------------

  async function showSession() {
    try {
      const { data, error } = await db.auth.getSession();

      if (error) throw error;

      const session = data?.session;

      if (!session) {
        setVisible($("login-panel"), true);
        setVisible($("dashboard"), false);
        return;
      }

      const { data: admin, error: adminError } = await db
        .from("website_admins")
        .select("user_id")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (adminError || !admin) {
        await db.auth.signOut();

        setVisible($("login-panel"), true);
        setVisible($("dashboard"), false);

        if ($("login-msg")) {
          $("login-msg").textContent =
            "Is account ko website admin ki permission nahi hai.";
        }

        return;
      }

      setVisible($("login-panel"), false);
      setVisible($("dashboard"), true);

      ensureAnalyticsPanel();

      await Promise.all([
        load(),
        loadUsage(),
        loadAnalytics()
      ]);
    } catch (error) {
      console.error("Session check error:", error);

      setVisible($("login-panel"), true);
      setVisible($("dashboard"), false);

      if ($("login-msg")) {
        $("login-msg").textContent =
          "Login session verify nahi hui. Dobara login karein.";
      }
    }
  }

  $("login-form")?.addEventListener("submit", async event => {
    event.preventDefault();

    const button = $("login-form").querySelector('[type="submit"]');

    if (button) {
      button.disabled = true;
      button.textContent = "Checking...";
    }

    if ($("login-msg")) {
      $("login-msg").textContent = "Secure login ho raha hai...";
    }

    try {
      const { error } = await db.auth.signInWithPassword({
        email: $("email")?.value.trim() || "",
        password: $("password")?.value || ""
      });

      if (error) throw error;

      if ($("login-msg")) $("login-msg").textContent = "";

      await showSession();
    } catch (error) {
      console.error("Login error:", error);

      if ($("login-msg")) {
        $("login-msg").textContent =
          error.message || "Login failed.";
      }
    } finally {
      if (button) {
        button.disabled = false;
        button.innerHTML = '<i class="fa-solid fa-lock"></i> Secure Login';
      }
    }
  });

  $("logout")?.addEventListener("click", async () => {
    try {
      const { error } = await db.auth.signOut();
      if (error) throw error;

      closeEditor();
      await showSession();
    } catch (error) {
      console.error("Logout error:", error);
      setStatus("Logout error: " + error.message);
    }
  });

  // Keep the UI in sync if the auth session expires or changes.
  db.auth.onAuthStateChange(event => {
    if (event === "SIGNED_OUT") {
      setVisible($("login-panel"), true);
      setVisible($("dashboard"), false);
    }
  });

  // --------------------------------------------------
  // BUTTONS
  // --------------------------------------------------

  $("new-hotel")?.addEventListener("click", () => {
    openEditor("hotel");
  });

  $("new-package")?.addEventListener("click", () => {
    openEditor("package");
  });

  $("new-ziyarat")?.addEventListener("click", () => {
    openEditor("ziyarat", null, "makkah");
  });

  $("new-ziyarat-secondary")?.addEventListener("click", () => {
    openEditor("ziyarat", null, "makkah");
  });

  $("close-editor")?.addEventListener("click", closeEditor);
  $("cancel-editor")?.addEventListener("click", closeEditor);

  $("editor-wrap")?.addEventListener("click", event => {
    if (event.target === $("editor-wrap")) closeEditor();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !$("editor-wrap")?.classList.contains("hidden")) {
      closeEditor();
    }
  });

  $("f-files")?.addEventListener("change", previewImages);
  $("f-video-files")?.addEventListener("change", previewVideos);

  $("usage-refresh")?.addEventListener("click", loadUsage);

  $("refresh")?.addEventListener("click", async () => {
    await Promise.all([
      load(),
      loadUsage(),
      loadAnalytics()
    ]);
  });

  // --------------------------------------------------
  // EDIT / VISIBILITY / DELETE
  // --------------------------------------------------

  document.addEventListener("click", async event => {
    const target = event.target;

    if (!(target instanceof Element)) return;

    const editButton = target.closest("[data-edit]");

    if (editButton) {
      const [type, ...idParts] = editButton.dataset.edit.split(":");
      const id = idParts.join(":");

      const item = recordArray(type).find(
        record => String(record.id) === id
      );

      if (item) {
        openEditor(type, item, item.city || "makkah");
      }

      return;
    }

    const toggleButton = target.closest("[data-toggle]");

    if (toggleButton) {
      const [type, ...idParts] = toggleButton.dataset.toggle.split(":");
      const id = idParts.join(":");

      const item = recordArray(type).find(
        record => String(record.id) === id
      );

      if (!item) return;

      toggleButton.disabled = true;

      try {
        const { error } = await db
          .from(table(type))
          .update({
            is_visible: !item.is_visible,
            updated_at: new Date().toISOString()
          })
          .eq("id", id);

        if (error) throw error;

        await load();
        setStatus(`${typeLabel(type)} ki visibility update ho gayi.`);
      } catch (error) {
        console.error("Visibility update error:", error);
        setStatus("Visibility update error: " + error.message);
      } finally {
        toggleButton.disabled = false;
      }

      return;
    }

    const deleteButton = target.closest("[data-delete]");

    if (deleteButton) {
      const [type, ...idParts] = deleteButton.dataset.delete.split(":");
      const id = idParts.join(":");

      const item = recordArray(type).find(
        record => String(record.id) === id
      );

      if (!item) return;

      const confirmed = window.confirm(
        `Kya aap "${item.name}" ko permanently delete karna chahte hain?`
      );

      if (!confirmed) return;

      deleteButton.disabled = true;

      try {
        const { error } = await db
          .from(table(type))
          .delete()
          .eq("id", id);

        if (error) throw error;

        await load();

        setStatus(`${typeLabel(type)} delete ho gaya.`);
      } catch (error) {
        console.error("Delete error:", error);
        setStatus("Delete error: " + error.message);
      } finally {
        deleteButton.disabled = false;
      }
    }
  });

  // --------------------------------------------------
  // SAVE / UPDATE
  // --------------------------------------------------

  $("editor")?.addEventListener("submit", async event => {
    event.preventDefault();

    if (busy) return;

    const type = $("record-type")?.value;
    const id = $("record-id")?.value;
    const submitButton = $("editor").querySelector('[type="submit"]');

    if (!["hotel", "package", "ziyarat"].includes(type)) {
      setEditorMessage("Content type valid nahi hai.");
      return;
    }

    busy = true;

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Saving...";
    }

    setEditorMessage("");

    try {
      const existingItem = id
        ? recordArray(type).find(item => String(item.id) === String(id))
        : null;

      const existingImages = getImages(existingItem);
      const existingVideos = getVideos(existingItem);

      // Existing photos are preserved unless new photos are selected.
      const selectedPhotos = Array.from($("f-files")?.files || []);
      const uploadedImages = selectedPhotos.length
        ? await uploadPhotos(selectedPhotos)
        : [];

      const finalImages = uploadedImages.length
        ? [...existingImages, ...uploadedImages]
        : existingImages;

      // Keep existing videos and add manually entered URLs plus uploaded videos.
      const manualVideos = ($("f-videos")?.value || "")
        .split(/\n/)
        .map(value => value.trim())
        .filter(Boolean);

      const selectedVideos = Array.from($("f-video-files")?.files || []);
      const uploadedVideos = selectedVideos.length
        ? await uploadVideos(selectedVideos)
        : [];

      const finalVideos = [
        ...new Set([
          ...existingVideos,
          ...manualVideos,
          ...uploadedVideos
        ])
      ];

      const pdfInput = $("f-pdfs")?.value.trim() || "";
      const finalPdfs = pdfInput ? [pdfInput] : [];

      const name = $("f-name")?.value.trim() || "";
      const description = $("f-description")?.value.trim() || "";

      if (!name) {
        throw new Error("Name / Title enter karein.");
      }

      if (!description) {
        throw new Error("Description enter karein.");
      }

      const row = {
        name,
        badge: $("f-badge")?.value.trim() || "",
        description,
        price: $("f-price")?.value.trim() || "",
        image_url: finalImages[0] || null,
        images: finalImages,
        videos: finalVideos,
        pdfs: finalPdfs,
        sort_order: Number($("f-order")?.value) || 0,
        is_visible: $("f-visible")?.checked ?? true,
        updated_at: new Date().toISOString()
      };

      if (type === "hotel" || type === "ziyarat") {
        const city = $("f-city")?.value;

        if (!["makkah", "madinah"].includes(city)) {
          throw new Error("Makkah ya Madinah select karein.");
        }

        row.city = city;
      }

      if (type === "hotel") {
        row.view_text = $("f-view")?.value.trim() || "";
      }

      const query = db.from(table(type));

      const result = id
        ? await query.update(row).eq("id", id)
        : await query.insert(row);

      if (result.error) throw result.error;

      closeEditor();

      await Promise.all([
        load(),
        loadUsage(),
        loadAnalytics()
      ]);

      setStatus(
        `${typeLabel(type)} ${id ? "update" : "add"} ho gaya.`
      );
    } catch (error) {
      console.error("Save error:", error);

      setEditorMessage(
        error.message || "Save nahi ho saka. Dobara try karein."
      );
    } finally {
      busy = false;

      if (submitButton) {
        submitButton.disabled = false;
        submitButton.innerHTML =
          '<i class="fa-solid fa-floppy-disk"></i> Save Changes';
      }
    }
  });

  // --------------------------------------------------
  // INITIAL STARTUP
  // --------------------------------------------------

  showSession();
})();