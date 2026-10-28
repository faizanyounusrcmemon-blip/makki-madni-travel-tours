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

  if (!ready) {
    $("config-warning")?.classList.remove("hidden");
    if ($("login-msg")) $("login-msg").textContent = "Pehle cms-config.js configure karein.";
    $("login-form")?.addEventListener("submit", e => e.preventDefault());
    return;
  }

  const db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
  auth: {
    storage: window.sessionStorage,
    persistSession: true,
    autoRefreshToken: true
  }
});
  let records = { hotels: [], packages: [] };

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));

  const table = type => type === "hotel" ? "website_hotels" : "website_packages";
  const msg = s => { if ($("status")) $("status").textContent = s; };

  const MB = 1024 * 1024;
  const GB = 1024 * MB;
  const fmtBytes = bytes => {
    const n = Math.max(0, Number(bytes) || 0);
    if (n < 1024) return `${n} B`;
    if (n < MB) return `${(n / 1024).toFixed(1)} KB`;
    if (n < GB) return `${(n / MB).toFixed(2)} MB`;
    return `${(n / GB).toFixed(2)} GB`;
  };
  const clampPct = (used, limit) => Math.max(0, Math.min(100, (used / limit) * 100));
  const paintUsage = (prefix, used, limit, extra = "") => {
    const usedEl = $(`${prefix}-used`);
    const freeEl = $(`${prefix}-free`);
    const pctEl = $(`${prefix}-percent`);
    const barEl = $(`${prefix}-bar`);
    if (usedEl) usedEl.textContent = fmtBytes(used);
    if (freeEl) freeEl.textContent = fmtBytes(Math.max(0, limit - used));
    if (pctEl) pctEl.textContent = `${clampPct(used, limit).toFixed(1)}% used`;
    if (barEl) {
      barEl.style.width = `${clampPct(used, limit)}%`;
      barEl.classList.toggle("usage-danger", used / limit >= 0.9);
    }
    const note = $(`${prefix}-note`);
    if (note && extra) note.textContent = extra;
  };

  async function loadUsage() {
    const status = $("usage-status");
    if (status) status.textContent = "Usage data load ho raha hai...";
    const { data, error } = await db.rpc("admin_usage_monitor");
    if (error || !data) {
      if (status) status.textContent =
        "Usage load nahi hua. SQL setup run karein aur confirm karein ke current Auth user website_admins mein listed hai.";
      console.error("admin_usage_monitor error:", error);
      return;
    }

    const dbUsed = Number(data.database_bytes || 0);
    const storageUsed = Number(data.storage_bytes || 0);
    // Supabase Free plan quota estimates: 500 MiB database and 1 GiB Storage.
    paintUsage("db-usage", dbUsed, 500 * MB, "Database size: PostgreSQL current database size; Supabase dashboard metrics may update on a different schedule.");
    paintUsage("storage-usage", storageUsed, GB, `${Number(data.storage_files || 0)} files in bucket "${data.bucket_id || "website-photos"}". Includes images/videos in this bucket.`);
    if (status) status.textContent = `Last checked: ${new Date(data.measured_at || Date.now()).toLocaleString()}. Current estimate; billing usage may differ.`;
  }

  async function showSession() {
    const { data: { session }, error } = await db.auth.getSession();
    if (error) {
      $("login-panel").classList.remove("hidden");
      $("dashboard").classList.add("hidden");
      $("login-msg").textContent = error.message;
      return;
    }
    if (!session) {
      $("login-panel").classList.remove("hidden");
      $("dashboard").classList.add("hidden");
      return;
    }

    const { data: admin, error: adminError } = await db
      .from("website_admins").select("user_id")
      .eq("user_id", session.user.id).maybeSingle();

    if (adminError || !admin) {
      await db.auth.signOut();
      $("login-panel").classList.remove("hidden");
      $("dashboard").classList.add("hidden");
      $("login-msg").textContent = "Admin access nahi hai.";
      return;
    }

    $("login-panel").classList.add("hidden");
    $("dashboard").classList.remove("hidden");
    await Promise.all([load(), loadUsage()]);
  }

  async function load() {
    msg("Loading...");
    const [h, p] = await Promise.all([
      db.from("website_hotels").select("*").order("sort_order").order("created_at"),
      db.from("website_packages").select("*").order("sort_order").order("created_at")
    ]);
    if (h.error || p.error) {
      msg("Load error: " + (h.error?.message || p.error?.message));
      return;
    }
    records.hotels = h.data || [];
    records.packages = p.data || [];
    $("hotels-list").innerHTML = records.hotels.map(x => itemHtml(x, "hotel")).join("") ||
      '<p class="text-sm text-slate-400">Abhi hotels add nahi kiye.</p>';
    $("packages-list").innerHTML = records.packages.map(x => itemHtml(x, "package")).join("") ||
      '<p class="text-sm text-slate-400">Abhi packages add nahi kiye.</p>';
    msg("Content loaded successfully.");
  }

  function itemHtml(x, type) {
    const imgs = Array.isArray(x.images) ? x.images : (x.image_url ? [x.image_url] : []);
    const vids = Array.isArray(x.videos) ? x.videos : (x.videos ? [x.videos] : []);
    return `
      <div class="border border-yellow-700/30 rounded-xl p-3 flex gap-3 items-start">
        <img src="${esc(imgs[0] || "")}" class="w-16 h-16 object-cover rounded-lg bg-black/30" onerror="this.style.display='none'">
        <div class="min-w-0 flex-1">
          <p class="font-bold">${esc(x.name)}</p>
          <p class="text-xs text-slate-400">${type === "hotel" ? esc(x.city) : "Package"} • ${x.is_visible ? "Visible" : "Hidden"} • 📷 ${imgs.length} Pics • 🎬 ${vids.length} Videos</p>
          <div class="flex flex-wrap gap-2 mt-3">
            <button class="btn2 text-xs" data-edit="${type}:${x.id}" type="button">Edit</button>
            <button class="btn2 text-xs" data-toggle="${type}:${x.id}" type="button">${x.is_visible ? "Hide" : "Show"}</button>
            <button class="text-xs text-red-300 border border-red-800/60 rounded-lg px-3" data-delete="${type}:${x.id}" type="button">Delete</button>
          </div>
        </div>
      </div>`;
  }

  async function openEditor(type, item = null) {
    $("editor").reset();
    $("record-id").value = item?.id || "";
    $("record-type").value = type;
    $("editor-title").textContent = (item ? "Edit " : "Add ") + (type === "hotel" ? "Hotel" : "Umrah Package");
    $("city-wrap").classList.toggle("hidden", type !== "hotel");
    $("view-wrap").classList.toggle("hidden", type !== "hotel");
    $("f-name").value = item?.name || "";
    $("f-city").value = item?.city || "makkah";
    $("f-badge").value = item?.badge || "";
    $("f-description").value = item?.description || "";
    $("f-view").value = item?.view_text || "";
    $("f-price").value = item?.price || "";
    const vids = item?.videos;
    $("f-videos").value = (Array.isArray(vids) ? vids : vids ? [vids] : []).join("\n");
    const pdfs = item?.pdfs;
    $("f-pdfs").value = Array.isArray(pdfs) ? (pdfs[0] || "") : (pdfs || "");
    $("f-order").value = item?.sort_order ?? 0;
    $("f-visible").checked = item?.is_visible ?? true;
    $("f-files").value = "";
    $("f-video-files").value = "";
    $("preview-images").innerHTML = "";
    $("preview-videos").innerHTML = "";
    $("editor-msg").textContent = "";
    $("editor-wrap").classList.remove("hidden");
  }

  async function uploadPhotos(files) {
    const urls = [];
    for (const file of Array.from(files || [])) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > 5 * MB) throw new Error(file.name + " 5MB se bari hai. Photo compress karein.");
      const ext = file.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `website/${crypto.randomUUID()}.${ext}`;
      const { error } = await db.storage.from("website-photos").upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw new Error("Photo upload failed: " + error.message);
      urls.push(db.storage.from("website-photos").getPublicUrl(path).data.publicUrl);
    }
    return urls;
  }

  async function uploadVideos(files) {
    const urls = [];
    for (const file of Array.from(files || [])) {
      if (!["video/mp4", "video/webm", "video/ogg"].includes(file.type))
        throw new Error(file.name + " supported video format nahi hai. MP4/WebM/OGG use karein.");
      if (file.size > 50 * MB) throw new Error(file.name + " 50MB se bari hai. Video compress karein.");
      const ext = file.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
      const path = `website/videos/${crypto.randomUUID()}.${ext}`;
      const { error } = await db.storage.from("website-photos").upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw new Error("Video upload failed: " + error.message);
      urls.push(db.storage.from("website-photos").getPublicUrl(path).data.publicUrl);
    }
    return urls;
  }

  $("login-form").addEventListener("submit", async e => {
    e.preventDefault();
    $("login-msg").textContent = "Logging in...";
    const { error } = await db.auth.signInWithPassword({
      email: $("email").value.trim(), password: $("password").value
    });
    if (!error) {
      $("login-msg").textContent = "";
      await showSession();
    } else $("login-msg").textContent = error.message;
  });

  $("logout").addEventListener("click", async () => { await db.auth.signOut(); await showSession(); });
  $("refresh").addEventListener("click", async () => { await Promise.all([load(), loadUsage()]); });
  $("usage-refresh")?.addEventListener("click", loadUsage);
  $("new-hotel").addEventListener("click", () => openEditor("hotel"));
  $("new-package").addEventListener("click", () => openEditor("package"));
  $("close-editor").addEventListener("click", () => $("editor-wrap").classList.add("hidden"));
  $("cancel-editor").addEventListener("click", () => $("editor-wrap").classList.add("hidden"));

  $("f-files").addEventListener("change", () => {
    const files = Array.from($("f-files").files || []);
    $("preview-images").innerHTML = "";
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      const url = URL.createObjectURL(file);
      const img = document.createElement("img");
      img.src = url;
      img.className = "w-20 h-20 object-cover rounded-lg border border-yellow-700/40";
      img.onload = () => URL.revokeObjectURL(url);
      $("preview-images").appendChild(img);
    }
  });

  $("f-video-files").addEventListener("change", () => {
    const files = Array.from($("f-video-files").files || []);
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
      video.src = url; video.controls = true; video.preload = "metadata";
      video.className = "w-full max-h-64 rounded-lg bg-black";
      video.onloadedmetadata = () => URL.revokeObjectURL(url);
      wrap.append(title, video);
      $("preview-videos").appendChild(wrap);
    }
  });

  document.addEventListener("click", async e => {
    const ed = e.target.closest("[data-edit]");
    if (ed) {
      const [type, id] = ed.dataset.edit.split(":");
      const item = (type === "hotel" ? records.hotels : records.packages).find(x => String(x.id) === id);
      if (item) openEditor(type, item);
      return;
    }
    const tg = e.target.closest("[data-toggle]");
    if (tg) {
      const [type, id] = tg.dataset.toggle.split(":");
      const arr = type === "hotel" ? records.hotels : records.packages;
      const item = arr.find(x => String(x.id) === id);
      if (!item) return;
      tg.disabled = true;
      const { error } = await db.from(table(type)).update({ is_visible: !item.is_visible }).eq("id", id);
      if (error) msg("Update error: " + error.message);
      await load();
      return;
    }
    const del = e.target.closest("[data-delete]");
    if (del) {
      const [type, id] = del.dataset.delete.split(":");
      if (!confirm("Delete this item?")) return;
      const { error } = await db.from(table(type)).delete().eq("id", id);
      if (error) { msg("Delete error: " + error.message); return; }
      await load();
    }
  });

  $("editor").addEventListener("submit", async e => {
    e.preventDefault();
    const type = $("record-type").value, t = table(type), id = $("record-id").value;
    const btn = $("editor").querySelector('[type="submit"]');
    btn.disabled = true; btn.textContent = "Saving..."; $("editor-msg").textContent = "";
    try {
      const newImgs = $("f-files").files.length ? await uploadPhotos($("f-files").files) : [];
      const existingItem = id ? (type === "hotel" ? records.hotels : records.packages).find(x => String(x.id) === id) : null;
      const finalImages = newImgs.length ? newImgs : (existingItem?.images || (existingItem?.image_url ? [existingItem.image_url] : []));
      const videoInput = $("f-videos").value.trim();
      const manualVideos = videoInput ? videoInput.split(/[\n,]+/).map(s => s.trim()).filter(Boolean) : [];
      const existingVideos = Array.isArray(existingItem?.videos) ? existingItem.videos : (existingItem?.videos ? [existingItem.videos] : []);
      const uploadedVideos = $("f-video-files").files.length ? await uploadVideos($("f-video-files").files) : [];
      const preservedVideos = existingVideos.filter(v => manualVideos.includes(v));
      const finalVideos = [...new Set([...preservedVideos, ...manualVideos, ...uploadedVideos])];
      const pdfInput = $("f-pdfs").value.trim();
      const row = {
        name: $("f-name").value.trim(), badge: $("f-badge").value.trim(),
        description: $("f-description").value.trim(), price: $("f-price").value.trim(),
        image_url: finalImages[0] || null, images: finalImages, videos: finalVideos,
        pdfs: pdfInput ? [pdfInput] : [], sort_order: Number($("f-order").value) || 0,
        is_visible: $("f-visible").checked, updated_at: new Date().toISOString()
      };
      if (type === "hotel") { row.city = $("f-city").value; row.view_text = $("f-view").value.trim(); }
      const res = id ? await db.from(t).update(row).eq("id", id) : await db.from(t).insert(row);
      if (res.error) throw res.error;
      $("editor-wrap").classList.add("hidden");
      await Promise.all([load(), loadUsage()]);
      msg("Content saved successfully.");
    } catch (err) {
      $("editor-msg").textContent = err.message || "Save failed.";
    } finally {
      btn.disabled = false; btn.textContent = "Save Changes";
    }
  });

  showSession();
})();
