
(function () {
  const cfg = window.CMS_CONFIG || {};

  if (
    !cfg.SUPABASE_URL ||
    !cfg.SUPABASE_ANON_KEY ||
    cfg.SUPABASE_URL.includes("PASTE_") ||
    cfg.SUPABASE_ANON_KEY.includes("PASTE_") ||
    !window.supabase
  ) {
    console.error("CMS configuration missing. Check cms-config.js");
    return;
  }

  const db = window.supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_ANON_KEY
  );

  const esc = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));

  const wa = (name) =>
    "https://wa.me/923357476744?text=" +
    encodeURIComponent(
      "Assalamu Alaikum Makki Madni Travel & Tours! Please share details/rates for " +
      name +
      ". (Website Inquiry)"
    );

  // Handles arrays and JSON strings returned from the database.
  function normalizeList(value) {
    if (Array.isArray(value)) return value;

    if (typeof value === "string" && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed;
        if (typeof parsed === "string") return [parsed];
      } catch (_) {
        // A plain URL is also accepted.
        return [value.trim()];
      }
    }

    return [];
  }

  function mediaUrl(item) {
    if (typeof item === "string") return item.trim();

    if (item && typeof item === "object") {
      return String(item.url || item.publicUrl || item.src || "").trim();
    }

    return "";
  }

  function getImages(item) {
    const images = normalizeList(item.images)
      .map(mediaUrl)
      .filter(Boolean);

    if (images.length) return images;

    return item.image_url ? [String(item.image_url).trim()] : [];
  }

  function getVideos(item) {
    return normalizeList(item.videos)
      .map(mediaUrl)
      .filter(Boolean);
  }

  function getYouTubeEmbed(url) {
    if (!url) return "";

    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, "");
      let id = "";

      if (host === "youtu.be") {
        id = parsed.pathname.split("/").filter(Boolean)[0] || "";
      } else if (
        host === "youtube.com" ||
        host === "m.youtube.com" ||
        host === "youtube-nocookie.com"
      ) {
        if (parsed.pathname === "/watch") {
          id = parsed.searchParams.get("v") || "";
        } else {
          const parts = parsed.pathname.split("/").filter(Boolean);
          if (["embed", "shorts", "live", "v"].includes(parts[0])) {
            id = parts[1] || "";
          }
        }
      }

      return /^[\w-]{11}$/.test(id)
        ? "https://www.youtube-nocookie.com/embed/" + id
        : "";
    } catch (_) {
      return "";
    }
  }

  function isVideoFile(url) {
    try {
      const pathname = new URL(url, window.location.href).pathname;
      return /\.(mp4|webm|ogg|ogv|m4v)$/i.test(pathname);
    } catch (_) {
      return /\.(mp4|webm|ogg|ogv|m4v)(?:[?#]|$)/i.test(url);
    }
  }

  function safeJson(value) {
    return JSON.stringify(value)
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026")
      .replace(/'/g, "\\u0027");
  }

  function initLightbox() {
    if (document.getElementById("media-lightbox")) return;

    const box = document.createElement("div");
    box.id = "media-lightbox";
    box.className =
      "hidden fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4";

    box.innerHTML = `
      <div class="relative max-w-5xl w-full max-h-[90vh] flex flex-col items-center">
        <button
          type="button"
          onclick="window.closeMediaLightbox()"
          class="absolute -top-12 right-0 z-10 text-white text-sm font-bold bg-yellow-600 hover:bg-yellow-500 px-4 py-2 rounded-full">
          ? Close
        </button>
        <div id="lightbox-content"
          class="w-full max-h-[85vh] flex flex-col items-center justify-center overflow-y-auto">
        </div>
      </div>
    `;

    box.addEventListener("click", function (event) {
      if (event.target === box) window.closeMediaLightbox();
    });

    document.body.appendChild(box);
  }

  window.closeMediaLightbox = function () {
    const box = document.getElementById("media-lightbox");
    const content = document.getElementById("lightbox-content");

    if (content) {
      content.querySelectorAll("video").forEach((video) => video.pause());
      content.innerHTML = "";
    }

    if (box) box.classList.add("hidden");
  };

  window.openLightbox = function (images, videos) {
    initLightbox();

    const imgs = normalizeList(images).map(mediaUrl).filter(Boolean);
    const vids = normalizeList(videos).map(mediaUrl).filter(Boolean);
    const content = document.getElementById("lightbox-content");

    let html = "";

    if (imgs.length) {
      html += `
        <h3 class="text-yellow-400 font-bold text-xl mb-3">Photos</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 w-full mb-6">
      `;

      imgs.forEach((url) => {
        html += `
          <div class="bg-gray-950 rounded-xl overflow-hidden border border-yellow-500/30 p-2">
            <img
              src="${esc(url)}"
              alt="Hotel or package photo"
              loading="lazy"
              class="max-h-80 w-full object-contain rounded-lg"
            >
          </div>
        `;
      });

      html += "</div>";
    }

    if (vids.length) {
      html += `
        <h3 class="text-yellow-400 font-bold text-xl mb-3">Videos / Virtual Tours</h3>
        <div class="w-full space-y-5 mb-5">
      `;

      vids.forEach((url) => {
        const embed = getYouTubeEmbed(url);

        if (embed) {
          html += `
            <div class="w-full aspect-video">
              <iframe
                src="${esc(embed)}"
                title="Virtual tour"
                class="w-full h-full rounded-xl border border-yellow-500/30"
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowfullscreen>
              </iframe>
            </div>
          `;
        } else {
          html += `
            <video
              src="${esc(url)}"
              controls
              playsinline
              preload="metadata"
              class="w-full max-h-[65vh] bg-black rounded-xl border border-yellow-500/30">
              Your browser does not support this video.
            </video>
          `;
        }
      });

      html += "</div>";
    }

    content.innerHTML =
      html || '<p class="text-white text-center">No media available.</p>';

    document.getElementById("media-lightbox").classList.remove("hidden");
  };

  function imageGallery(images, videos, heightClass, roundedClass) {
    if (!images.length) return "";

    return `
      <div
        class="relative ${heightClass} overflow-hidden bg-black/60 ${roundedClass} cursor-pointer"
        onclick='window.openLightbox(${safeJson(images)}, ${safeJson(videos)})'
        role="button"
        tabindex="0"
        aria-label="View photos and videos"
        onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.openLightbox(${safeJson(images)},${safeJson(videos)});}">

        <img
          src="${esc(images[0])}"
          alt="Hotel or package photo"
          loading="lazy"
          class="w-full h-full object-contain p-2"
          onerror="this.style.display='none'">

        <span class="absolute top-3 left-3 bg-yellow-500 text-gray-950 text-xs font-black px-3 py-1 rounded-full">
          VIEW PHOTOS
        </span>

        ${
          images.length > 1 || videos.length
            ? `<span class="absolute bottom-3 right-3 bg-black/90 text-yellow-300 text-xs font-bold px-3 py-2 rounded-lg border border-yellow-500/40">
                 ?? ${images.length} Photos · ?? ${videos.length} Videos
               </span>`
            : ""
        }
      </div>
    `;
  }

  function videoPlayers(videos, extraClass = "") {
    if (!videos.length) return "";

    return `
      <div class="space-y-3 ${extraClass}">
        ${
          videos.length > 1
            ? `<p class="text-xs font-bold text-yellow-400 uppercase tracking-wider">?? Videos & Virtual Tours (${videos.length})</p>`
            : ""
        }
        ${videos.map((url) => {
          const embed = getYouTubeEmbed(url);

          if (embed) {
            return `
              <div class="w-full aspect-video bg-black rounded-xl overflow-hidden border border-yellow-500/30">
                <iframe
                  src="${esc(embed)}"
                  title="Hotel or package virtual tour"
                  loading="lazy"
                  class="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowfullscreen>
                </iframe>
              </div>
            `;
          }

          return `
            <div class="w-full bg-black rounded-xl overflow-hidden border border-yellow-500/30">
              <video
                src="${esc(url)}"
                controls
                playsinline
                preload="metadata"
                class="block w-full max-h-80 object-contain">
                Your browser does not support this video.
              </video>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function hotelCard(h, city) {
    const name = esc(h.name);
    const images = getImages(h);
    const videos = getVideos(h);
    const badge = esc(
      h.badge || (city === "makkah" ? "Makkah Hotel" : "Madinah Hotel")
    );

    const cityName = city === "makkah" ? "Makkah" : "Madinah";
    const icon = city === "makkah" ? "fa-kaaba" : "fa-mosque";

    const mediaHtml = `
      ${imageGallery(images, videos, "h-64", "")}
      ${videoPlayers(videos, images.length ? "mt-4 px-3 pb-3" : "")}
      ${
        !images.length && !videos.length
          ? `<div class="h-40 bg-black/30 flex items-center justify-center text-slate-400 text-sm">Photos and videos coming soon</div>`
          : ""
      }
    `;

    return `
      <article class="bg-navy-${city === "makkah" ? "900" : "950"} rounded-2xl overflow-hidden gold-border-glow flex flex-col justify-between">
        <div>
          <div class="relative">
            ${mediaHtml}
            <span class="absolute top-4 left-4 z-10 bg-yellow-500 text-gray-950 text-xs font-black px-3 py-1 rounded-full uppercase">
              ${badge}
            </span>
          </div>

          <div class="p-6">
            <h3 class="font-cinzel text-xl font-bold text-white mb-2">${name}</h3>

            <p class="text-xs text-yellow-400 font-medium mb-3">
              <i class="fa-solid ${icon} mr-1"></i>
              ${esc(h.view_text || (city === "makkah"
                ? "Haram / Kaaba view details on request"
                : "Near Masjid an-Nabawi"))}
            </p>

            <p class="text-slate-300 text-xs leading-relaxed">${esc(h.description)}</p>

            ${h.price ? `<p class="text-yellow-300 font-bold mt-3">${esc(h.price)}</p>` : ""}
          </div>
        </div>

        <div class="p-6 pt-0">
          <a
            href="${wa(name)}"
            target="_blank"
            rel="noopener noreferrer"
            class="w-full gold-button py-3 rounded-xl text-gray-950 font-bold text-xs uppercase text-center block">
            <i class="fa-brands fa-whatsapp text-base"></i>
            Inquire Rates on WhatsApp
          </a>
        </div>
      </article>
    `;
  }

  function packageCard(p, i) {
    const name = esc(p.name);
    const price = esc(p.price || "Direct Quote");
    const images = getImages(p);
    const videos = getVideos(p);

    return `
      <article class="pkg-card bg-navy-900 rounded-2xl overflow-hidden gold-border-glow p-6 sm:p-8 flex flex-col justify-between relative">

        ${
          i === 0
            ? `<span class="absolute top-0 right-0 z-10 bg-yellow-500 text-gray-950 text-[10px] font-black px-4 py-1 rounded-bl-xl uppercase tracking-widest">Featured</span>`
            : ""
        }

        <div>
          ${p.badge ? `<div class="text-yellow-400 font-cinzel text-xs uppercase tracking-widest font-bold mb-2">${esc(p.badge)}</div>` : ""}

          ${imageGallery(images, videos, "h-44", "rounded-xl mb-5")}

          ${videoPlayers(videos, images.length ? "mt-4 mb-5" : "mb-5")}

          <h3 class="font-cinzel text-2xl font-bold text-white mb-4">${name}</h3>

          <div class="mb-6 bg-navy-950/60 p-4 rounded-xl border border-yellow-500/20">
            <p class="text-xs text-slate-400 uppercase tracking-wider">Package Price</p>
            <p class="text-2xl font-black text-yellow-300 font-cinzel">${price}</p>
          </div>

          <p class="text-xs text-slate-300 leading-relaxed mb-6 whitespace-pre-line">${esc(p.description)}</p>
        </div>

        <a
          href="${wa(name)}"
          target="_blank"
          rel="noopener noreferrer"
          class="w-full gold-button py-3.5 rounded-xl text-gray-950 font-extrabold text-xs uppercase tracking-wider text-center block">
          Get Quote on WhatsApp
        </a>
      </article>
    `;
  }

  async function load() {
    initLightbox();

    try {
      const [hotels, packages] = await Promise.all([
        db.from("website_hotels")
          .select("*")
          .eq("is_visible", true)
          .order("sort_order")
          .order("created_at"),

        db.from("website_packages")
          .select("*")
          .eq("is_visible", true)
          .order("sort_order")
          .order("created_at")
      ]);

      if (hotels.error) {
        console.error("Hotel loading error:", hotels.error.message);
      } else {
        const allHotels = hotels.data || [];
        const makkahHotels = allHotels.filter((h) => h.city === "makkah");
        const madinahHotels = allHotels.filter((h) => h.city === "madinah");

        const mg = document.getElementById("cms-makkah-hotels-grid");
        const dg = document.getElementById("cms-madinah-hotels-grid");

        if (mg) {
          mg.innerHTML = makkahHotels.length
            ? makkahHotels.map((h) => hotelCard(h, "makkah")).join("")
            : '<p class="text-slate-300 text-sm">Makkah hotel details are being updated.</p>';
        }

        if (dg) {
          dg.innerHTML = madinahHotels.length
            ? madinahHotels.map((h) => hotelCard(h, "madinah")).join("")
            : '<p class="text-slate-300 text-sm">Madinah hotel details are being updated.</p>';
        }
      }

      if (packages.error) {
        console.error("Package loading error:", packages.error.message);
      } else {
        const list = packages.data || [];
        const pg = document.getElementById("cms-packages-grid");

        if (pg) {
          pg.innerHTML = list.length
            ? list.map((p, i) => packageCard(p, i)).join("")
            : '<p class="text-slate-300 text-sm">Umrah packages are being updated.</p>';
        }
      }
    } catch (error) {
      console.error("Website CMS unavailable:", error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load);
  } else {
    load();
  }
})();