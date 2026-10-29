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
      $("login-msg").textContent = "Pehle cms-config.js mein Supabase URL aur anon key configure karein.";
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

  let busy = false;

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
    const pct = Math.max(0, Math.min(100, limit ? (used / limit) * 100 : 0));
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

  async function loadUsage() {
    const status = $("usage-status");
    if (status) status.textContent = "Usage data load ho raha hai...";

    try {
      const { data, error } = await db.rpc("admin_usage_monitor");
      if (error || !data) {
        if (status) status.textContent = "Usage load nahi hua.";
        return;
      }

      paintUsage("db-usage", Number(data.database_bytes || 0), 500 * MB, "Database size estimate.");
      paintUsage("storage-usage", Number(data.storage_bytes || 0), GB, `${Number(data.storage_files || 0)} files.`);

      if (status) {
        status.textContent = `Last checked: ${new Date(data.measured_at || Date.now()).toLocaleString()}`;
      }
    } catch (error) {
      console.error("Usage monitor error:", error);
    }
  }

  function ensureAnalyticsPanel() {
    const dashboard = $("dashboard");
    if (!dashboard || $("website-analytics-panel")) return;

    const panel = document.createElement("section");
    panel.id = "website-analytics-panel";
    panel.className = "panel mb-6 p-4 md:p-6";

    panel.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <p class="text-xs text-slate-400">WEBSITE PERFORMANCE</p>
          <h2 class="text-xl md:text-2xl font-bold gold mt-1">Website Visitor Analytics</h2>
          <p class="text-sm text-slate-300 mt-1">Visitors, page visits aur photo/video views</p>
        </div>
        <button id="analytics-refresh" class="btn2" type="button"><i class="fa-solid fa-rotate mr-1"></i> Refresh Analytics</button>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <div class="section-card"><p class="text-sm text-slate-300">Today Visitors</p><p id="an-today" class="text-3xl font-bold gold mt-2">—</p></div>
        <div class="section-card"><p class="text-sm text-slate-300">Monthly Visitors</p><p id="an-month" class="text-3xl font-bold gold mt-2">—</p></div>
        <div class="section-card"><p class="text-sm text-slate-300">Yearly Visitors</p><p id="an-year" class="text-3xl font-bold gold mt-2">—</p></div>
        <div class="section-card"><p class="text-sm text-slate-300">Total Visitors</p><p id="an-total" class="text-3xl font-bold gold mt-2">—</p></div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div class="section-card"><h3 class="font-bold gold mb-2"><i class="fa-solid fa-photo-film mr-1"></i> Photo & Video Views</h3><p id="an-media" class="text-3xl font-bold">—</p></div>
        <div class="section-card"><h3 class="font-bold gold mb-2"><i class="fa-solid fa-users mr-1"></i> Currently Active Visitors</h3><p id="an-active" class="text-3xl font-bold">—</p></div>
      </div>

      <div class="section-card mt-4"><h3 class="font-bold gold mb-3"><i class="fa-solid fa-chart-line mr-1"></i> Daily Visits — Last 30 Days</h3><div id="an-chart" class="space-y-3"><p class="text-sm text-slate-400">Analytics load ho rahi hai...</p></div></div>
      <div class="section-card mt-4"><h3 class="font-bold gold mb-3"><i class="fa-solid fa-file-lines mr-1"></i> Page-wise Visits</h3><div id="an-pages" class="overflow-x-auto text-sm"><p class="text-slate-400">Analytics load ho rahi hai...</p></div></div>
      <div class="section-card mt-4"><h3 class="font-bold gold mb-3"><i class="fa-solid fa-video mr-1"></i> Individual Photo & Video Views</h3><div id="an-media-list" class="overflow-x-auto text-sm"><p class="text-slate-400">Analytics load ho rahi hai...</p></div></div>
      <p id="an-status" role="status" class="text-xs text-amber-200 mt-4">Analytics load ho rahi hai...</p>
    `;

    const resourcePanel = $("usage-refresh")?.closest("section");
    if (resourcePanel) {
      let monitorRow = dashboard.querySelector(".monitor-row");
      if (!monitorRow) {
        monitorRow = document.createElement("div");
        monitorRow.className = "monitor-row";
        resourcePanel.parentNode.insertBefore(monitorRow, resourcePanel);
        monitorRow.appendChild(resourcePanel);
      }
      monitorRow.prepend(panel);
    } else {
      dashboard.prepend(panel);
    }

    $("analytics-refresh")?.addEventListener("click", loadAnalytics);
  }

  function drawDailyChart(daily) {
    const container = $("an-chart");
    if (!container) return;
    if (!Array.isArray(daily) || !daily.length) {
      container.innerHTML = '<p class="text-sm text-slate-400">Daily visitor data available nahi hai.</p>';
      return;
    }
    const max = Math.max(1, ...daily.map(item => Number(item.views || 0)));
    container.innerHTML = daily.map(item => {
      const value = Number(item.views || 0);
      const width = Math.max(0, (value / max) * 100);
      return `
        <div>
          <div class="flex justify-between gap-3 text-xs mb-1"><span>${esc(item.day || "")}</span><span>${value.toLocaleString()} visits</span></div>
          <div class="h-2 rounded-full bg-slate-800 overflow-hidden"><div class="h-full rounded-full bg-amber-400" style="width:${width}%"></div></div>
        </div>
      `;
    }).join("");
  }

  function drawMediaTable(media) {
    const container = $("an-media-list");
    if (!container) return;
    if (!Array.isArray(media) || !media.length) {
      container.innerHTML = '<p class="text-slate-400">Abhi media views record nahi huay.</p>';
      return;
    }
    container.innerHTML = `
      <table class="w-full text-left">
        <thead><tr class="border-b border-yellow-700/30 gold"><th class="p-2">Content</th><th class="p-2">Category</th><th class="p-2">Media</th><th class="p-2 text-right">Views</th></tr></thead>
        <tbody>
          ${media.map(item => `
            <tr class="border-b border-slate-800">
              <td class="p-2 break-words">${esc(item.content_name || item.media_url || "Media")}</td>
              <td class="p-2">${esc(item.content_type || "—")}</td>
              <td class="p-2">${esc(item.media_type || "—")}</td>
              <td class="p-2 text-right font-bold gold">${Number(item.views || 0).toLocaleString()}</td>
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
      container.innerHTML = '<p class="text-slate-400">Page-wise report available nahi hai.</p>';
      return;
    }
    container.innerHTML = `
      <table class="w-full text-left">
        <thead><tr class="border-b border-yellow-700/30 gold"><th class="p-2">Page</th><th class="p-2 text-right">Visits</th></tr></thead>
        <tbody>
          ${pages.map(page => `
            <tr class="border-b border-slate-800">
              <td class="p-2 break-all">${esc(page.page_path || "/")}</td>
              <td class="p-2 text-right">${Number(page.visits || 0).toLocaleString()}</td>
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
      if (error || !data) return;

      if ($("an-today")) $("an-today").textContent = Number(data.today_visits || 0).toLocaleString();
      if ($("an-month")) $("an-month").textContent = Number(data.month_visits || 0).toLocaleString();
      if ($("an-total")) $("an-total").textContent = Number(data.total_visits || 0).toLocaleString();
      if ($("an-media")) $("an-media").textContent = Number(data.media_views || 0).toLocaleString();
      if ($("an-year")) $("an-year").textContent = data.yearly_visits == null ? "SQL update required" : Number(data.yearly_visits).toLocaleString();
      if ($("an-active")) $("an-active").textContent = data.active_visitors == null ? "SQL update required" : Number(data.active_visitors).toLocaleString();

      drawDailyChart(data.daily || []);
      drawMediaTable(data.media || []);
      drawPagesTable(data.pages || []);
    } catch (error) {
      console.error("Analytics error:", error);
    }
  }

  function itemHtml(item, type) {
    const images = getImages(item);
    const videos = getVideos(item);

    const category = type === "hotel"
      ? `<i class="fa-solid fa-hotel mr-1"></i> Hotel • ${esc(item.city || "—")}`
      : type === "ziyarat"
        ? `<i class="fa-solid fa-mosque mr-1"></i> Ziyarat • ${esc(item.city || "—")}`
        : `<i class="fa-solid fa-kaaba mr-1"></i> Umrah Package`;

    let mediaPreviews = "";
    
    images.forEach(url => {
      mediaPreviews += `<img src="${esc(url)}" class="w-16 h-16 object-cover rounded-lg border border-yellow-700/40 shrink-0" alt="Photo" loading="lazy" onerror="this.style.display='none'">`;
    });

    videos.forEach(url => {
      mediaPreviews += `<video src="${esc(url)}" class="w-20 h-16 object-cover rounded-lg border border-yellow-700/40 shrink-0 bg-black" preload="metadata"></video>`;
    });

    if (!mediaPreviews) {
      mediaPreviews = `<div class="w-16 h-16 rounded-lg bg-slate-900 border border-yellow-700/30 flex items-center justify-center shrink-0"><i class="fa-solid fa-image text-gold text-lg"></i></div>`;
    }

    return `
      <article class="border border-yellow-700/30 rounded-xl p-3 flex flex-col sm:flex-row gap-4 items-start">
        <div class="flex flex-wrap gap-2 max-w-xs overflow-x-auto">
          ${mediaPreviews}
        </div>

        <div class="min-w-0 flex-1">
          <p class="font-bold text-white text-base break-words">${esc(item.name || "Untitled")}</p>
          <p class="text-xs text-slate-400 mt-1">${category}</p>
          
          <div class="flex flex-wrap gap-2 mt-2 text-xs">
            <span class="status-pill">${item.is_visible ? "Visible" : "Hidden"}</span>
            <span class="status-pill"><i class="fa-solid fa-image mr-1"></i> ${images.length} Photos</span>
            <span class="status-pill"><i class="fa-solid fa-video mr-1"></i> ${videos.length} Videos</span>
          </div>

          <div class="flex flex-wrap gap-2 mt-3">
            <button class="btn2 text-xs px-3 py-1.5" data-edit="${type}:${esc(item.id)}" type="button"><i class="fa-solid fa-pen-to-square mr-1"></i> Edit</button>
            <button class="btn2 text-xs px-3 py-1.5" data-toggle="${type}:${esc(item.id)}" type="button">${item.is_visible ? '<i class="fa-solid fa-eye-slash mr-1"></i> Hide' : '<i class="fa-solid fa-eye mr-1"></i> Show'}</button>
            <button class="text-xs text-red-300 border border-red-800/60 rounded-lg px-3 py-1.5 hover:bg-red-950/40 transition" data-delete="${type}:${esc(item.id)}" type="button"><i class="fa-solid fa-trash mr-1"></i> Delete</button>
          </div>
        </div>
      </article>
    `;
  }

  async function load() {
    setStatus("Hotels, packages aur ziyarat load ho rahe hain...");
    try {
      const results = await Promise.all([
        db.from("website_hotels").select("*").order("sort_order", { ascending: true }),
        db.from("website_packages").select("*").order("sort_order", { ascending: true }),
        db.from("website_ziyarat").select("*").order("sort_order", { ascending: true })
      ]);

      records.hotels = results[0].data || [];
      records.packages = results[1].data || [];
      records.ziyarat = results[2].data || [];

      if ($("hotels-list")) {
        $("hotels-list").innerHTML = records.hotels.map(item => itemHtml(item, "hotel")).join("") || '<p class="text-sm text-slate-400">Abhi hotels add nahi kiye.</p>';
      }

      if ($("packages-list")) {
        $("packages-list").innerHTML = records.packages.map(item => itemHtml(item, "package")).join("") || '<p class="text-sm text-slate-400">Abhi Umrah packages add nahi kiye.</p>';
      }

      renderZiyarat();
      setStatus("Hotels, packages aur ziyarat successfully load ho gaye.");
    } catch (error) {
      setStatus("Content load error: " + error.message);
    }
  }

  function renderZiyarat() {
    const makkahList = $("makkah-ziyarat-list");
    const madinahList = $("madinah-ziyarat-list");

    const makkah = records.ziyarat.filter(item => item.city === "makkah");
    const madinah = records.ziyarat.filter(item => item.city === "madinah");

    if (makkahList) makkahList.innerHTML = makkah.map(item => itemHtml(item, "ziyarat")).join("") || '<p class="text-sm text-slate-400">Makkah Ziyarat add nahi ki.</p>';
    if (madinahList) madinahList.innerHTML = madinah.map(item => itemHtml(item, "ziyarat")).join("") || '<p class="text-sm text-slate-400">Madinah Ziyarat add nahi ki.</p>';
  }

  function openEditor(type, item = null, defaultCity = "makkah") {
    if (!$("editor")) return;
    $("editor").reset();
    setField("record-id", item?.id || "");
    setField("record-type", type);
    if ($("editor-title")) $("editor-title").textContent = `${item ? "Edit " : "Add "}${typeLabel(type)}`;

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

    if ($("f-visible")) $("f-visible").checked = item?.is_visible ?? true;
    if ($("preview-images")) $("preview-images").innerHTML = "";
    if ($("preview-videos")) $("preview-videos").innerHTML = "";

    const oldImages = getImages(item);
    if ($("preview-images") && oldImages.length) {
      $("preview-images").innerHTML = oldImages.map(url => `
        <div class="relative"><img src="${esc(url)}" class="w-20 h-20 object-cover rounded-lg border border-yellow-700/40" loading="lazy"></div>
      `).join("");
    }

    $("editor-wrap")?.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  function closeEditor() {
    $("editor-wrap")?.classList.add("hidden");
    document.body.style.overflow = "";
  }

  window.openEditor = openEditor;

  async function uploadFile(file, folder, allowedTypes, maxBytes) {
    if (!allowedTypes.includes(file.type)) throw new Error(`${file.name}: Format supported nahi hai.`);
    if (file.size > maxBytes) throw new Error(`${file.name}: File size zyaada hai.`);

    const ext = file.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") || "file";
    const path = `${folder}/${crypto.randomUUID()}.${ext}`;

    const { data, error } = await db.storage.from("website-photos").upload(path, file, { contentType: file.type });
    if (error) throw error;

    const { data: publicData } = db.storage.from("website-photos").getPublicUrl(data.path);
    return publicData.publicUrl;
  }

  async function uploadPhotos(files) {
    const urls = [];
    for (const file of Array.from(files || [])) {
      urls.push(await uploadFile(file, "website", ["image/jpeg", "image/png", "image/webp", "image/gif"], 5 * MB));
    }
    return urls;
  }

  async function uploadVideos(files) {
    const urls = [];
    for (const file of Array.from(files || [])) {
      urls.push(await uploadFile(file, "website/videos", ["video/mp4", "video/webm", "video/ogg"], 50 * MB));
    }
    return urls;
  }

  async function showSession() {
    try {
      const { data } = await db.auth.getSession();
      const session = data?.session;
      if (!session) {
        setVisible($("login-panel"), true);
        setVisible($("dashboard"), false);
        return;
      }

      setVisible($("login-panel"), false);
      setVisible($("dashboard"), true);
      ensureAnalyticsPanel();

      await Promise.all([load(), loadUsage(), loadAnalytics()]);
    } catch (error) {
      setVisible($("login-panel"), true);
      setVisible($("dashboard"), false);
    }
  }

  $("login-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    try {
      const { error } = await db.auth.signInWithPassword({
        email: $("email")?.value.trim() || "",
        password: $("password")?.value || ""
      });
      if (error) throw error;
      await showSession();
    } catch (error) {
      if ($("login-msg")) $("login-msg").textContent = error.message || "Login failed.";
    }
  });

  $("logout")?.addEventListener("click", async () => {
    await db.auth.signOut();
    closeEditor();
    await showSession();
  });

  $("new-hotel")?.addEventListener("click", () => openEditor("hotel"));
  $("new-package")?.addEventListener("click", () => openEditor("package"));
  $("new-ziyarat")?.addEventListener("click", () => openEditor("ziyarat", null, "makkah"));
  $("new-ziyarat-secondary")?.addEventListener("click", () => openEditor("ziyarat", null, "makkah"));
  $("close-editor")?.addEventListener("click", closeEditor);
  $("cancel-editor")?.addEventListener("click", closeEditor);

  // Global click handler for Edit, Hide/Show, and Delete actions
  document.addEventListener("click", async event => {
    const target = event.target.closest("button");
    if (!target) return;

    if (target.dataset.edit) {
      const [type, id] = target.dataset.edit.split(":");
      const item = recordArray(type).find(r => String(r.id) === String(id));
      if (item) openEditor(type, item, item.city || "makkah");
      return;
    }

    if (target.dataset.toggle) {
      const [type, id] = target.dataset.toggle.split(":");
      const item = recordArray(type).find(r => String(r.id) === String(id));
      if (!item) return;

      target.disabled = true;
      try {
        const { error } = await db.from(table(type)).update({
          is_visible: !item.is_visible,
          updated_at: new Date().toISOString()
        }).eq("id", id);

        if (error) throw error;
        await load();
        setStatus("Visibility successfully update ho gayi.");
      } catch (error) {
        setStatus("Error: " + error.message);
      } finally {
        target.disabled = false;
      }
      return;
    }

    if (target.dataset.delete) {
      const [type, id] = target.dataset.delete.split(":");
      const item = recordArray(type).find(r => String(r.id) === String(id));
      if (!item) return;

      if (!window.confirm(`Kya aap "${item.name}" ko delete karna chahte hain?`)) return;

      target.disabled = true;
      try {
        const { error } = await db.from(table(type)).delete().eq("id", id);
        if (error) throw error;
        await load();
        setStatus("Record successfully delete ho gaya.");
      } catch (error) {
        setStatus("Error: " + error.message);
      } finally {
        target.disabled = false;
      }
    }
  });

  $("editor")?.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;
    busy = true;

    try {
      const type = $("record-type")?.value;
      const id = $("record-id")?.value;
      const existingItem = id ? recordArray(type).find(i => String(i.id) === String(id)) : null;

      const photos = Array.from($("f-files")?.files || []);
      const uploadedImages = photos.length ? await uploadPhotos(photos) : [];
      const finalImages = uploadedImages.length ? [...getImages(existingItem), ...uploadedImages] : getImages(existingItem);

      const row = {
        name: $("f-name")?.value.trim(),
        badge: $("f-badge")?.value.trim() || "",
        description: $("f-description")?.value.trim(),
        price: $("f-price")?.value.trim() || "",
        image_url: finalImages[0] || null,
        images: finalImages,
        videos: getVideos(existingItem),
        pdfs: [$("f-pdfs")?.value.trim()].filter(Boolean),
        sort_order: Number($("f-order")?.value) || 0,
        is_visible: $("f-visible")?.checked ?? true,
        updated_at: new Date().toISOString()
      };

      if (type === "hotel" || type === "ziyarat") row.city = $("f-city")?.value;
      if (type === "hotel") row.view_text = $("f-view")?.value.trim() || "";

      const query = db.from(table(type));
      const res = id ? await query.update(row).eq("id", id) : await query.insert(row);
      if (res.error) throw res.error;

      closeEditor();
      await Promise.all([load(), loadUsage(), loadAnalytics()]);
      setStatus("Successfully save ho gaya.");
    } catch (error) {
      setEditorMessage(error.message);
    } finally {
      busy = false;
    }
  });

  showSession();
})();
