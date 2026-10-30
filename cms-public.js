
(function () {
  "use strict";

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

  // =========================================================
  // BASIC HELPERS
  // =========================================================

  const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));

  const wa = (name, details = "") => {
    const message = [
      "Assalamu Alaikum Makki Madni Travel & Tours!",
      "I am interested in: " + name,
      details,
      "Please share availability and further details. (Website Inquiry)"
    ].filter(Boolean).join("\n");
    return "https://wa.me/923357476744?text=" + encodeURIComponent(message);
  };

  function normalizeList(value) {
    if (Array.isArray(value)) return value;

    if (typeof value === "string" && value.trim()) {
      try {
        const parsed = JSON.parse(value);

        if (Array.isArray(parsed)) return parsed;
        if (typeof parsed === "string") return [parsed];
      } catch (_) {
        return [value.trim()];
      }
    }

    return [];
  }

  function mediaUrl(item) {
    if (typeof item === "string") return item.trim();

    if (item && typeof item === "object") {
      return String(
        item.url ||
        item.publicUrl ||
        item.public_url ||
        item.src ||
        ""
      ).trim();
    }

    return "";
  }

  function getImages(item) {
    const images = normalizeList(item.images)
      .map(mediaUrl)
      .filter(Boolean);

    if (images.length) return images;

    return item.image_url
      ? [String(item.image_url).trim()]
      : [];
  }

  function getVideos(item) {
    return normalizeList(item.videos)
      .map(mediaUrl)
      .filter(Boolean);
  }

  function getPdfs(item) {
    return normalizeList(item.pdfs)
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
        [
          "youtube.com",
          "m.youtube.com",
          "youtube-nocookie.com"
        ].includes(host)
      ) {
        if (parsed.pathname === "/watch") {
          id = parsed.searchParams.get("v") || "";
        } else {
          const parts = parsed.pathname.split("/").filter(Boolean);

          if (
            ["embed", "shorts", "live", "v"].includes(parts[0])
          ) {
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

  // =========================================================
  // ANALYTICS
  // =========================================================

  function getVisitorKey() {
    const storageKey = "mmt_website_visitor_key";

    try {
      let key = localStorage.getItem(storageKey);

      if (!key) {
        key =
          "visitor_" +
          (window.crypto && window.crypto.randomUUID
            ? window.crypto.randomUUID()
            : Date.now().toString(36) +
              "_" +
              Math.random().toString(36).slice(2));

        localStorage.setItem(storageKey, key);
      }

      return key;
    } catch (_) {
      // Fallback when browser storage is unavailable.
      return (
        "visitor_" +
        Date.now().toString(36) +
        "_" +
        Math.random().toString(36).slice(2)
      );
    }
  }

  const visitorKey = getVisitorKey();

  function currentPagePath() {
    return (
      window.location.pathname +
      window.location.search
    ).slice(0, 500);
  }

  async function trackEvent({
    eventType,
    contentType = null,
    contentId = null,
    contentName = null,
    mediaType = null,
    mediaUrl: mediaURL = null
  }) {
    try {
      const { error } = await db.rpc("website_track_event", {
        p_event_type: eventType,
        p_visitor_key: visitorKey,
        p_page_path: currentPagePath(),
        p_content_type: contentType,
        p_content_id: contentId,
        p_content_name: contentName,
        p_media_type: mediaType,
        p_media_url: mediaURL
      });

      if (error) {
        console.warn("Website analytics event failed:", error.message);
      }
    } catch (error) {
      console.warn("Website analytics unavailable:", error);
    }
  }

  // Avoid sending the same page-view RPC repeatedly in this page session.
  // The database should also apply its own daily duplicate rules.
  function trackPageView() {
    const pageKey = "mmt_page_view_" + currentPagePath();

    try {
      if (sessionStorage.getItem(pageKey)) return;
      sessionStorage.setItem(pageKey, "1");
    } catch (_) {
      // Continue to track if sessionStorage is unavailable.
    }

    trackEvent({
      eventType: "page_view"
    });
  }

  // Prevent repeated play/click callbacks for the same media element.
  function trackMediaOnce(element, details) {
    if (!element || element.dataset.analyticsTracked === "1") return;

    element.dataset.analyticsTracked = "1";

    trackEvent({
      eventType: "media_view",
      contentType: details.contentType,
      contentId: details.contentId,
      contentName: details.contentName,
      mediaType: details.mediaType,
      mediaUrl: details.mediaUrl
    });
  }

  // =========================================================
  // LIGHTBOX
  // =========================================================

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
          ✕ Close
        </button>

        <div id="lightbox-content"
          class="w-full max-h-[85vh] flex flex-col items-center justify-center overflow-y-auto">
        </div>
      </div>
    `;

    box.addEventListener("click", function (event) {
      if (event.target === box) {
        window.closeMediaLightbox();
      }
    });

    document.body.appendChild(box);

    if (!window.__mediaLightboxKeyboardBound) {
      window.__mediaLightboxKeyboardBound = true;
      document.addEventListener("keydown", function (event) {
        const lightbox = document.getElementById("media-lightbox");
        if (!lightbox || lightbox.classList.contains("hidden")) return;
        if (event.key === "ArrowRight") window.changeLightboxImage(1);
        if (event.key === "ArrowLeft") window.changeLightboxImage(-1);
        if (event.key === "Escape") window.closeMediaLightbox();
      });
    }
  }

  window.closeMediaLightbox = function () {
    const box = document.getElementById("media-lightbox");
    const content = document.getElementById("lightbox-content");

    if (content) {
      content.querySelectorAll("video").forEach((video) => video.pause());
      content.querySelectorAll("iframe").forEach((frame) => {
        frame.src = "about:blank";
      });

      content.innerHTML = "";
    }

    if (box) box.classList.add("hidden");
  };

  let activeLightboxImages = [];
  let activeLightboxIndex = 0;
  let activeLightboxMeta = {};

  function renderLightboxPhoto() {
    const content = document.getElementById("lightbox-photo-viewer");
    if (!content || !activeLightboxImages.length) return;

    const url = activeLightboxImages[activeLightboxIndex];
    const total = activeLightboxImages.length;
    const meta = activeLightboxMeta;

    content.innerHTML = `
      <div class="w-full flex flex-col items-center gap-3">
        <div class="w-full flex items-center justify-between gap-3 px-1">
          <span class="text-yellow-400 font-bold text-sm">${esc(meta.contentName || "Gallery")}</span>
          <span class="text-white bg-gray-800 border border-yellow-500/40 rounded-full px-3 py-1 text-xs font-bold">
            ${activeLightboxIndex + 1} / ${total}
          </span>
        </div>
        <div class="relative w-full flex items-center justify-center bg-black rounded-2xl border border-yellow-500/30 overflow-hidden" style="height:min(68vh,680px);min-height:260px">
          <img id="lightbox-current-image" src="${esc(url)}" alt="${esc(meta.contentName || "Gallery")} photo ${activeLightboxIndex + 1}"
            class="max-w-full max-h-full w-auto h-auto object-contain" style="max-width:100%;max-height:68vh"
            data-analytics-content-type="${esc(meta.contentType)}"
            data-analytics-content-id="${esc(meta.contentId)}"
            data-analytics-content-name="${esc(meta.contentName)}"
            data-analytics-media-url="${esc(url)}">
          ${total > 1 ? `
            <button type="button" onclick="window.changeLightboxImage(-1)" aria-label="Previous photo"
              class="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-black/75 border border-yellow-400 text-yellow-300 text-2xl flex items-center justify-center hover:bg-yellow-500 hover:text-black">‹</button>
            <button type="button" onclick="window.changeLightboxImage(1)" aria-label="Next photo"
              class="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-black/75 border border-yellow-400 text-yellow-300 text-2xl flex items-center justify-center hover:bg-yellow-500 hover:text-black">›</button>
          ` : ""}
        </div>
        ${total > 1 ? `
          <div class="w-full flex items-center justify-between gap-3">
            <button type="button" onclick="window.changeLightboxImage(-1)" class="px-4 py-2 rounded-full border border-yellow-500/50 text-yellow-300 text-xs font-bold hover:bg-yellow-500 hover:text-black">← Previous</button>
            <span class="text-slate-400 text-xs">Click next to view all photos</span>
            <button type="button" onclick="window.changeLightboxImage(1)" class="px-4 py-2 rounded-full bg-yellow-500 text-black text-xs font-black hover:bg-yellow-400">Next →</button>
          </div>
        ` : ""}
      </div>
    `;

    const img = document.getElementById("lightbox-current-image");
    const track = () => trackMediaOnce(img, {
      contentType: img.dataset.analyticsContentType,
      contentId: img.dataset.analyticsContentId,
      contentName: img.dataset.analyticsContentName,
      mediaType: "photo",
      mediaUrl: img.dataset.analyticsMediaUrl
    });
    img.addEventListener("load", track, { once: true });
    if (img.complete && img.naturalWidth > 0) track();
  }

  window.changeLightboxImage = function (direction) {
    if (!activeLightboxImages.length) return;
    activeLightboxIndex = (activeLightboxIndex + direction + activeLightboxImages.length) % activeLightboxImages.length;
    renderLightboxPhoto();
  };

  window.openLightbox = function (
    images,
    videos,
    contentType = "unknown",
    contentId = "",
    contentName = "Website media"
  ) {
    initLightbox();

    const imgs = normalizeList(images).map(mediaUrl).filter(Boolean);
    const vids = normalizeList(videos).map(mediaUrl).filter(Boolean);
    const content = document.getElementById("lightbox-content");

    activeLightboxImages = imgs;
    activeLightboxIndex = 0;
    activeLightboxMeta = { contentType, contentId, contentName };

    let html = "";
    if (imgs.length) {
      html += `<div id="lightbox-photo-viewer" class="w-full"></div>`;
    }

    if (vids.length) {
      html += `
        <div class="w-full mt-7 space-y-4">
          <h3 class="text-yellow-400 font-bold text-lg">Videos / Virtual Tours</h3>
      `;

      vids.forEach((url, index) => {
        const embed = getYouTubeEmbed(url);
        if (embed) {
          html += `
            <div class="w-full">
              <p class="text-xs text-yellow-300 mb-2">Video ${index + 1}</p>
              <div class="w-full aspect-video">
                <iframe src="${esc(embed)}" title="${esc(contentName)} virtual tour"
                  class="analytics-lightbox-video w-full h-full rounded-xl border border-yellow-500/30" loading="lazy"
                  data-analytics-content-type="${esc(contentType)}" data-analytics-content-id="${esc(contentId)}"
                  data-analytics-content-name="${esc(contentName)}" data-analytics-media-url="${esc(url)}"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
              </div>
            </div>
          `;
        } else {
          html += `
            <div class="w-full">
              <p class="text-xs text-yellow-300 mb-2">Video ${index + 1}</p>
              <video src="${esc(url)}" controls playsinline preload="metadata"
                data-analytics-content-type="${esc(contentType)}" data-analytics-content-id="${esc(contentId)}"
                data-analytics-content-name="${esc(contentName)}" data-analytics-media-url="${esc(url)}"
                class="analytics-lightbox-video w-full max-h-[65vh] bg-black rounded-xl border border-yellow-500/30">Your browser does not support this video.</video>
            </div>
          `;
        }
      });
      html += `</div>`;
    }

    content.innerHTML = html || '<p class="text-white text-center">No media available.</p>';

    // Render the first photo in the dedicated viewer; arrows move one photo at a time.
    if (imgs.length) renderLightboxPhoto();

    // Local videos: count only when playback starts.
    content.querySelectorAll("video.analytics-lightbox-video").forEach((video) => {
      video.addEventListener("play", function () {
        trackMediaOnce(video, {
          contentType: video.dataset.analyticsContentType,
          contentId: video.dataset.analyticsContentId,
          contentName: video.dataset.analyticsContentName,
          mediaType: "video",
          mediaUrl: video.dataset.analyticsMediaUrl
        });
      });
    });

    // YouTube videos are counted when opened in the lightbox.
    content.querySelectorAll("iframe.analytics-lightbox-video").forEach((frame) => {
      trackMediaOnce(frame, {
        contentType: frame.dataset.analyticsContentType,
        contentId: frame.dataset.analyticsContentId,
        contentName: frame.dataset.analyticsContentName,
        mediaType: "video",
        mediaUrl: frame.dataset.analyticsMediaUrl
      });
    });

    document.getElementById("media-lightbox").classList.remove("hidden");
  };

  // =========================================================
  // PHOTO GALLERY
  // =========================================================

  function imageGallery(
    images,
    videos,
    heightClass,
    roundedClass,
    contentType = "unknown",
    contentId = "",
    contentName = "Website media"
  ) {
    if (!images.length && !videos.length) return "";

    const args = safeJson([
      images,
      videos,
      contentType,
      String(contentId || ""),
      contentName
    ]);

    return `
      <div
        class="relative ${heightClass} overflow-hidden bg-black/60 ${roundedClass} cursor-pointer"
        onclick='window.openLightbox(...${args})'
        role="button"
        tabindex="0"
        aria-label="View photos and videos"
        onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.openLightbox(...${args});}">

        ${
          images.length
            ? `
              <img
                src="${esc(images[0])}"
                alt="${esc(contentName)} photo"
                loading="lazy"
                class="w-full h-full object-contain p-2"
                onerror="this.style.display='none'">
            `
            : `
              <div class="w-full h-full min-h-32 flex items-center justify-center text-yellow-300">
                <span class="text-4xl">▶</span>
              </div>
            `
        }

        <span class="absolute top-3 left-3 bg-yellow-500 text-gray-950 text-xs font-black px-3 py-1 rounded-full">
          VIEW MEDIA
        </span>

        ${
          images.length > 1 || videos.length
            ? `
              <span class="absolute bottom-3 right-3 bg-black/90 text-yellow-300 text-xs font-bold px-3 py-2 rounded-lg border border-yellow-500/40">
                📷 ${images.length} Photos · 🎥 ${videos.length} Videos
              </span>
            `
            : ""
        }
      </div>
    `;
  }

  // =========================================================
  // VIDEO PLAYERS
  // =========================================================

  function videoPlayers(
    videos,
    extraClass = "",
    contentType = "unknown",
    contentId = "",
    contentName = "Website media"
  ) {
    if (!videos.length) return "";

    return `
      <div class="space-y-3 ${extraClass}">
        ${
          videos.length > 1
            ? `
              <p class="text-xs font-bold text-yellow-400 uppercase tracking-wider">
                🎥 Videos & Virtual Tours (${videos.length})
              </p>
            `
            : ""
        }

        ${videos.map((url) => {
          const embed = getYouTubeEmbed(url);

          if (embed) {
            // YouTube views are tracked when the visitor opens the video.
            // Embedded autoplay/playback tracking needs the YouTube API.
            return `
              <button
                type="button"
                class="w-full text-left"
                onclick='window.openLightbox([], ${safeJson([url])}, ${safeJson(contentType)}, ${safeJson(String(contentId || ""))}, ${safeJson(contentName)})'
                aria-label="Open virtual tour">

                <div class="w-full aspect-video bg-black rounded-xl overflow-hidden border border-yellow-500/30 flex items-center justify-center">
                  <div class="text-center p-4">
                    <div class="text-4xl text-yellow-400 mb-2">▶</div>
                    <p class="text-white text-sm font-bold">Watch Virtual Tour</p>
                    <p class="text-yellow-300 text-xs mt-1">Open video</p>
                  </div>
                </div>
              </button>
            `;
          }

          return `
            <div class="w-full bg-black rounded-xl overflow-hidden border border-yellow-500/30">
              <video
                src="${esc(url)}"
                controls
                playsinline
                preload="metadata"
                data-analytics-content-type="${esc(contentType)}"
                data-analytics-content-id="${esc(contentId)}"
                data-analytics-content-name="${esc(contentName)}"
                data-analytics-media-url="${esc(url)}"
                class="analytics-inline-video block w-full max-h-80 object-contain">
                Your browser does not support this video.
              </video>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  // Track inline video only when the visitor starts playing it.
  document.addEventListener("play", function (event) {
    const video = event.target;

    if (!video || !video.matches("video.analytics-inline-video")) return;

    trackMediaOnce(video, {
      contentType: video.dataset.analyticsContentType,
      contentId: video.dataset.analyticsContentId,
      contentName: video.dataset.analyticsContentName,
      mediaType: "video",
      mediaUrl: video.dataset.analyticsMediaUrl
    });
  }, true);

  // =========================================================
  // HOTEL CARDS
  // =========================================================

  function hotelCard(h, city) {
    const name = esc(h.name);
    const images = getImages(h);
    const videos = getVideos(h);
    const id = h.id || "";

    const badge = esc(
      h.badge ||
      (city === "makkah" ? "Makkah Hotel" : "Madinah Hotel")
    );

    const icon = city === "makkah" ? "fa-kaaba" : "fa-mosque";

    const mediaHtml = `
      ${imageGallery(
        images,
        videos,
        "h-64",
        "",
        "hotel",
        id,
        h.name || "Hotel"
      )}

      ${videoPlayers(
        videos,
        images.length ? "mt-4 px-3 pb-3" : "p-3",
        "hotel",
        id,
        h.name || "Hotel"
      )}

      ${
        !images.length && !videos.length
          ? `
            <div class="h-40 bg-black/30 flex items-center justify-center text-slate-400 text-sm">
              Photos and videos coming soon
            </div>
          `
          : ""
      }
    `;

    return `
      <article class="bg-navy-900 rounded-2xl overflow-hidden gold-border-glow flex flex-col justify-between">

        <div>
          <div class="relative">
            ${mediaHtml}

            <span class="absolute top-4 left-4 z-10 bg-yellow-500 text-gray-950 text-xs font-black px-3 py-1 rounded-full uppercase">
              ${badge}
            </span>
          </div>

          <div class="p-6">
            <h3 class="font-cinzel text-xl font-bold text-white mb-2">
              ${name}
            </h3>

            <p class="text-xs text-yellow-400 font-medium mb-3">
              <i class="fa-solid ${icon} mr-1"></i>
              ${esc(
                h.view_text ||
                (
                  city === "makkah"
                    ? "Haram / Kaaba view details on request"
                    : "Near Masjid an-Nabawi"
                )
              )}
            </p>

            <p class="text-slate-300 text-xs leading-relaxed whitespace-pre-line">
              ${esc(h.description)}
            </p>

            ${
              h.price
                ? `<p class="text-yellow-300 font-bold mt-3">${esc(h.price)}</p>`
                : ""
            }
          </div>
        </div>

        <div class="p-6 pt-0">
          <a
            href="${wa(h.name || "Hotel")}"
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

  // =========================================================
  // UMRAH PACKAGE CARDS
  // =========================================================

  function packageCard(p, index) {
    const name = esc(p.name);
    const price = esc(p.price || "Direct Quote");
    const images = getImages(p);
    const videos = getVideos(p);
    const id = p.id || "";

    return `
      <article class="pkg-card bg-navy-900 rounded-2xl overflow-hidden gold-border-glow p-6 sm:p-8 flex flex-col justify-between relative">

        ${
          index === 0
            ? `
              <span class="absolute top-0 right-0 z-10 bg-yellow-500 text-gray-950 text-[10px] font-black px-4 py-1 rounded-bl-xl uppercase tracking-widest">
                Featured
              </span>
            `
            : ""
        }

        <div>
          ${
            p.badge
              ? `
                <div class="text-yellow-400 font-cinzel text-xs uppercase tracking-widest font-bold mb-2">
                  ${esc(p.badge)}
                </div>
              `
              : ""
          }

          ${imageGallery(
            images,
            videos,
            "h-44",
            "rounded-xl mb-5",
            "package",
            id,
            p.name || "Umrah Package"
          )}

          ${videoPlayers(
            videos,
            images.length ? "mt-4 mb-5" : "mb-5",
            "package",
            id,
            p.name || "Umrah Package"
          )}

          <h3 class="font-cinzel text-2xl font-bold text-white mb-4">
            ${name}
          </h3>

          <div class="mb-6 bg-navy-950/60 p-4 rounded-xl border border-yellow-500/20">
            <p class="text-xs text-slate-400 uppercase tracking-wider">
              Package Price
            </p>

            <p class="text-2xl font-black text-yellow-300 font-cinzel">
              ${price}
            </p>
          </div>

          <p class="text-xs text-slate-300 leading-relaxed mb-6 whitespace-pre-line">
            ${esc(p.description)}
          </p>
        </div>

        <a
          href="${wa(p.name || "Umrah Package", `Package Price: ${p.price || "Please quote"}\nDetails: ${p.description || "Please share package details."}`)}"
          target="_blank"
          rel="noopener noreferrer"
          class="w-full gold-button py-3.5 rounded-xl text-gray-950 font-extrabold text-xs uppercase tracking-wider text-center block">
          Get Quote on WhatsApp
        </a>
      </article>
    `;
  }

  // =========================================================
  // MAKKAH / MADINAH ZIYARAT CARDS
  // =========================================================

  function ziyaratCard(item, city) {
    const name = esc(item.name);
    const images = getImages(item);
    const videos = getVideos(item);
    const pdfs = getPdfs(item);
    const id = item.id || "";

    const cityName = city === "makkah" ? "Makkah" : "Madinah";

    const mediaHtml = `
      ${imageGallery(
        images,
        videos,
        "h-56",
        "",
        "ziyarat",
        id,
        item.name || cityName + " Ziyarat"
      )}

      ${videoPlayers(
        videos,
        "p-4",
        "ziyarat",
        id,
        item.name || cityName + " Ziyarat"
      )}

      ${
        !images.length && !videos.length
          ? `
            <div class="h-32 bg-black/30 flex items-center justify-center text-slate-400 text-sm">
              Ziyarat photos and videos coming soon
            </div>
          `
          : ""
      }
    `;

    return `
      <article class="bg-navy-900 rounded-2xl overflow-hidden gold-border-glow flex flex-col justify-between">

        <div>
          <div class="relative">
            ${mediaHtml}

            <span class="absolute top-4 left-4 z-10 bg-yellow-500 text-gray-950 text-xs font-black px-3 py-1 rounded-full uppercase">
              ${esc(item.badge || cityName + " Ziyarat")}
            </span>
          </div>

          <div class="p-6">
            <h3 class="font-cinzel text-xl font-bold text-white mb-3">
              ${name}
            </h3>

            ${
              item.view_text
                ? `
                  <p class="text-xs text-yellow-400 font-medium mb-3">
                    <i class="fa-solid fa-location-dot mr-1"></i>
                    ${esc(item.view_text)}
                  </p>
                `
                : ""
            }

            <p class="text-slate-300 text-xs leading-relaxed whitespace-pre-line">
              ${esc(item.description)}
            </p>

            ${
              item.price
                ? `
                  <p class="text-yellow-300 font-bold mt-4">
                    ${esc(item.price)}
                  </p>
                `
                : ""
            }

            ${
              pdfs.length
                ? `
                  <div class="mt-4 space-y-2">
                    ${pdfs.map((url, index) => `
                      <a
                        href="${esc(url)}"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="block text-yellow-300 hover:text-yellow-200 text-xs underline">
                        <i class="fa-solid fa-file-pdf mr-2"></i>
                        View Ziyarat Document ${index + 1}
                      </a>
                    `).join("")}
                  </div>
                `
                : ""
            }
          </div>
        </div>

        <div class="p-6 pt-0">
          <a
            href="${wa(item.name || cityName + " Ziyarat")}"
            target="_blank"
            rel="noopener noreferrer"
            class="w-full gold-button py-3 rounded-xl text-gray-950 font-bold text-xs uppercase text-center block">
            <i class="fa-brands fa-whatsapp text-base"></i>
            Ask About This Ziyarat
          </a>
        </div>
      </article>
    `;
  }

  // =========================================================
  // RENDER HELPER
  // =========================================================

  function renderGrid(id, records, renderer, emptyMessage) {
    const element = document.getElementById(id);
    if (!element) return;

    element.innerHTML = records.length
      ? records.map(renderer).join("")
      : `
        <p class="text-slate-300 text-sm">
          ${esc(emptyMessage)}
        </p>
      `;
  }

  // =========================================================
  // LOAD ALL PUBLIC WEBSITE CONTENT
  // =========================================================

  async function load() {
    initLightbox();
    trackPageView();

    try {
      const [hotelsResult, packagesResult, ziyaratResult] =
        await Promise.all([
          db.from("website_hotels")
            .select("*")
            .eq("is_visible", true)
            .order("sort_order")
            .order("created_at"),

          db.from("website_packages")
            .select("*")
            .eq("is_visible", true)
            .order("sort_order")
            .order("created_at"),

          db.from("website_ziyarat")
            .select("*")
            .eq("is_visible", true)
            .order("sort_order")
            .order("created_at")
        ]);

      // -----------------------------------------------------
      // HOTELS
      // -----------------------------------------------------

      if (hotelsResult.error) {
        console.error(
          "Hotel loading error:",
          hotelsResult.error.message
        );
      } else {
        const hotels = hotelsResult.data || [];

        const makkahHotels = hotels.filter(
          (hotel) => hotel.city === "makkah"
        );

        const madinahHotels = hotels.filter(
          (hotel) => hotel.city === "madinah"
        );

        renderGrid(
          "cms-makkah-hotels-grid",
          makkahHotels,
          (hotel) => hotelCard(hotel, "makkah"),
          "Makkah hotel details are being updated."
        );

        renderGrid(
          "cms-madinah-hotels-grid",
          madinahHotels,
          (hotel) => hotelCard(hotel, "madinah"),
          "Madinah hotel details are being updated."
        );
      }

      // -----------------------------------------------------
      // UMRAH PACKAGES
      // -----------------------------------------------------

      if (packagesResult.error) {
        console.error(
          "Package loading error:",
          packagesResult.error.message
        );
      } else {
        const packages = packagesResult.data || [];

        renderGrid(
          "cms-packages-grid",
          packages,
          (item, index) => packageCard(item, index),
          "Umrah packages are being updated."
        );
      }

      // -----------------------------------------------------
      // ZIYARAT
      // -----------------------------------------------------

      if (ziyaratResult.error) {
        console.error(
          "Ziyarat loading error:",
          ziyaratResult.error.message
        );

        // Show a useful message only if the section exists.
        renderGrid(
          "cms-makkah-ziyarat-grid",
          [],
          () => "",
          "Ziyarat information is temporarily unavailable."
        );

        renderGrid(
          "cms-madinah-ziyarat-grid",
          [],
          () => "",
          "Ziyarat information is temporarily unavailable."
        );
      } else {
        const ziyaratItems = ziyaratResult.data || [];

        const makkahZiyarat = ziyaratItems.filter(
          (item) => item.city === "makkah"
        );

        const madinahZiyarat = ziyaratItems.filter(
          (item) => item.city === "madinah"
        );

        renderGrid(
          "cms-makkah-ziyarat-grid",
          makkahZiyarat,
          (item) => ziyaratCard(item, "makkah"),
          "Makkah Ziyarat details are being updated."
        );

        renderGrid(
          "cms-madinah-ziyarat-grid",
          madinahZiyarat,
          (item) => ziyaratCard(item, "madinah"),
          "Madinah Ziyarat details are being updated."
        );
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
