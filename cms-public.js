(function () {
  const cfg = window.CMS_CONFIG || {};
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY ||
      cfg.SUPABASE_URL.includes("PASTE_") || cfg.SUPABASE_ANON_KEY.includes("PASTE_") ||
      !window.supabase) return;

  const db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
  const wa = (name, kind) => "https://wa.me/923357476744?text=" +
    encodeURIComponent("Assalamu Alaikum Makki Madni Travel & Tours! Please share details/rates for " + name + ".");

  // Init Lightbox on DOM ready
  function initLightbox() {
    if (!document.getElementById("media-lightbox")) {
      const box = document.createElement("div");
      box.id = "media-lightbox";
      box.className = "hidden fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4";
      box.innerHTML = `<div class="relative max-w-4xl w-full max-h-[85vh] flex flex-col items-center">
        <button onclick="document.getElementById('media-lightbox').classList.add('hidden')" class="absolute -top-12 right-0 text-white text-2xl font-bold bg-gold-500 text-navy-950 px-4 py-1 rounded-full cursor-pointer">✕ Close</button>
        <div id="lightbox-content" class="w-full h-full flex items-center justify-center overflow-auto"></div>
      </div>`;
      document.body.appendChild(box);
    }
  }

  window.openLightbox = function(imgsJson, videosJson, pdfsJson) {
    let html = '';
    if(imgsJson && imgsJson.length){
      html += `<div class="grid grid-cols-1 md:grid-cols-2 gap-4 w-full overflow-y-auto max-h-[75vh] p-2">`;
      imgsJson.forEach(url => {
        html += `<div class="bg-navy-950 rounded-xl overflow-hidden border border-gold-500/30 p-2 flex items-center justify-center">
          <img src="${esc(url)}" class="max-h-80 w-full object-contain rounded-lg cursor-pointer hover:scale-105 transition" onclick="window.open('${esc(url)}','_blank')">
        </div>`;
      });
      html += `</div>`;
    }
    if(videosJson && videosJson.length){
      html += `<div class="mt-4 w-full text-center"><h4 class="text-gold-400 font-bold mb-2">Videos / Virtual Tours</h4>`;
      videosJson.forEach(v => {
        html += `<a href="${esc(v)}" target="_blank" class="block text-gold-300 underline mb-1">${esc(v)}</a>`;
      });
      html += `</div>`;
    }
    document.getElementById("lightbox-content").innerHTML = html || '<p class="text-white">No media available</p>';
    document.getElementById("media-lightbox").classList.remove("hidden");
  }

  function hotelCard(h, city) {
    const name=esc(h.name), imgs = h.images && h.images.length ? h.images : (h.image_url ? [h.image_url] : []);
    const badge=esc(h.badge || (city==="makkah" ? "Makkah Hotel" : "Madinah Hotel"));
    return `<article class="bg-navy-${city==="makkah"?"900":"950"} rounded-2xl overflow-hidden gold-border-glow flex flex-col justify-between">
      <div>
        <div class="relative h-64 overflow-hidden bg-black/50 cursor-pointer" onclick='openLightbox(${JSON.stringify(imgs)}, ${JSON.stringify(h.videos||[])}, ${JSON.stringify(h.pdfs||[])})'>
          <img loading="lazy" src="${esc(imgs[0]||"")}" alt="${name}" class="w-full h-full object-contain p-2" onerror="this.style.display='none'">
          <span class="absolute top-4 left-4 bg-gold-500 text-navy-950 text-xs font-black px-3 py-1 rounded-full uppercase">${badge}</span>
          ${imgs.length > 1 ? `<span class="absolute bottom-4 right-4 bg-navy-950/90 text-gold-300 text-[10px] font-bold px-2.5 py-1 rounded-md border border-gold-500/40">📷 +${imgs.length-1} Photos (Click to View)</span>`:""}
        </div>
        <div class="p-6">
          <h3 class="font-cinzel text-xl font-bold text-white mb-2">${name}</h3>
          <p class="text-xs text-gold-400/90 font-medium mb-3"><i class="fa-solid ${city==="makkah"?"fa-kaaba":"fa-mosque"} mr-1"></i> ${esc(h.view_text || (city==="makkah"?"Haram / Kaaba view details on request":"Near Masjid an-Nabawi"))}</p>
          <p class="text-slate-300 text-xs leading-relaxed">${esc(h.description)}</p>
          ${h.price ? `<p class="text-gold-300 font-bold mt-3">${esc(h.price)}</p>` : ""}
        </div>
      </div>
      <div class="p-6 pt-0"><a href="${wa(name,"hotel")}" target="_blank" rel="noopener" class="w-full gold-button py-3 rounded-xl text-navy-950 font-bold text-xs uppercase text-center block"><i class="fa-brands fa-whatsapp text-base"></i> Inquire Rates on WhatsApp</a></div>
    </article>`;
  }

  function packageCard(p, i) {
    const name=esc(p.name), price=esc(p.price || "Direct Quote");
    const imgs = p.images && p.images.length ? p.images : (p.image_url ? [p.image_url] : []);
    return `<article class="pkg-card bg-navy-900 rounded-2xl overflow-hidden gold-border-glow p-8 flex flex-col justify-between relative">
      ${i===0?'<span class="absolute top-0 right-0 bg-gold-500 text-navy-950 text-[10px] font-black px-4 py-1 rounded-bl-xl uppercase tracking-widest">Featured</span>':""}
      <div>
        ${p.badge?`<div class="text-gold-400 font-cinzel text-xs uppercase tracking-widest font-bold mb-1">${esc(p.badge)}</div>`:""}
        ${imgs.length ? `
          <div class="relative h-44 overflow-hidden bg-black/50 rounded-xl mb-5 cursor-pointer" onclick='openLightbox(${JSON.stringify(imgs)}, ${JSON.stringify(p.videos||[])}, ${JSON.stringify(p.pdfs||[])})'>
            <img loading="lazy" src="${esc(imgs[0])}" alt="${name}" class="w-full h-full object-contain p-1" onerror="this.style.display='none'">
            ${imgs.length > 1 ? `<span class="absolute bottom-2 right-2 bg-navy-950/90 text-gold-300 text-[10px] font-bold px-2 py-0.5 rounded border border-gold-500/40">📷 +${imgs.length-1} Photos</span>`:""}
          </div>`:""}
        <h3 class="font-cinzel text-2xl font-bold text-white mb-4">${name}</h3>
        <div class="mb-6 bg-navy-950/60 p-4 rounded-xl border border-gold-500/20"><p class="text-xs text-slate-400 uppercase tracking-wider">Package Price</p><p class="text-2xl font-black text-gold-300 font-cinzel">${price}</p></div>
        <p class="text-xs text-slate-300 leading-relaxed mb-6 whitespace-pre-line">${esc(p.description)}</p>
      </div>
      <a href="${wa(name,"package")}" target="_blank" rel="noopener" class="w-full gold-button py-3.5 rounded-xl text-navy-950 font-extrabold text-xs uppercase tracking-wider text-center block">Get Quote on WhatsApp</a>
    </article>`;
  }

  async function load() {
    initLightbox();
    try {
      const [hotels, packages] = await Promise.all([
        db.from("website_hotels").select("*").eq("is_visible", true).order("sort_order").order("created_at"),
        db.from("website_packages").select("*").eq("is_visible", true).order("sort_order").order("created_at")
      ]);
      if (!hotels.error) {
        const m = (hotels.data || []).filter(x=>x.city==="makkah");
        const d = (hotels.data || []).filter(x=>x.city==="madinah");
        const mg = document.getElementById("cms-makkah-hotels-grid");
        const dg = document.getElementById("cms-madinah-hotels-grid");
        if(mg) mg.innerHTML=m.length ? m.map(x=>hotelCard(x,"makkah")).join("") : '<p class="text-slate-300 text-sm">Makkah hotel details are being updated.</p>';
        if(dg) dg.innerHTML=d.length ? d.map(x=>hotelCard(x,"madinah")).join("") : '<p class="text-slate-300 text-sm">Madinah hotel details are being updated.</p>';
      }
      if (!packages.error) {
        const list = packages.data || [];
        const pg = document.getElementById("cms-packages-grid");
        if(pg) pg.innerHTML=list.length ? list.map(packageCard).join("") : '<p class="text-slate-300 text-sm">Umrah packages are being updated.</p>';
      }
    } catch (e) { console.warn("Website CMS unavailable", e); }
  }
  document.addEventListener("DOMContentLoaded", load);
})();
