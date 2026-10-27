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
  function hotelCard(h, city) {
    const name=esc(h.name), image=esc(h.image_url || ""), badge=esc(h.badge || (city==="makkah" ? "Makkah Hotel" : "Madinah Hotel"));
    return `<article class="bg-navy-${city==="makkah"?"900":"950"} rounded-2xl overflow-hidden gold-border-glow flex flex-col justify-between">
      <div><div class="relative h-64 overflow-hidden"><img loading="lazy" src="${image}" alt="${name}" class="w-full h-full object-cover" onerror="this.style.display='none'">
      <span class="absolute top-4 left-4 bg-gold-500 text-navy-950 text-xs font-black px-3 py-1 rounded-full uppercase">${badge}</span></div>
      <div class="p-6"><h3 class="font-cinzel text-xl font-bold text-white mb-2">${name}</h3>
      <p class="text-xs text-gold-400/90 font-medium mb-3"><i class="fa-solid ${city==="makkah"?"fa-kaaba":"fa-mosque"} mr-1"></i> ${esc(h.view_text || (city==="makkah"?"Haram / Kaaba view details on request":"Near Masjid an-Nabawi"))}</p>
      <p class="text-slate-300 text-xs leading-relaxed">${esc(h.description)}</p>
      ${h.price ? `<p class="text-gold-300 font-bold mt-3">${esc(h.price)}</p>` : ""}</div></div>
      <div class="p-6 pt-0"><a href="${wa(name,"hotel")}" target="_blank" rel="noopener" class="w-full gold-button py-3 rounded-xl text-navy-950 font-bold text-xs uppercase text-center block"><i class="fa-brands fa-whatsapp text-base"></i> Inquire Rates on WhatsApp</a></div></article>`;
  }
  function packageCard(p, i) {
    const name=esc(p.name), price=esc(p.price || "Direct Quote");
    return `<article class="pkg-card bg-navy-900 rounded-2xl overflow-hidden gold-border-glow p-8 flex flex-col justify-between relative">
      ${i===0?'<span class="absolute top-0 right-0 bg-gold-500 text-navy-950 text-[10px] font-black px-4 py-1 rounded-bl-xl uppercase tracking-widest">Featured</span>':""}
      <div>${p.badge?`<div class="text-gold-400 font-cinzel text-xs uppercase tracking-widest font-bold mb-1">${esc(p.badge)}</div>`:""}
      ${p.image_url?`<img loading="lazy" src="${esc(p.image_url)}" alt="${name}" class="w-full h-44 object-cover rounded-xl mb-5" onerror="this.style.display='none'">`:""}
      <h3 class="font-cinzel text-2xl font-bold text-white mb-4">${name}</h3>
      <div class="mb-6 bg-navy-950/60 p-4 rounded-xl border border-gold-500/20"><p class="text-xs text-slate-400 uppercase tracking-wider">Package Price</p><p class="text-2xl font-black text-gold-300 font-cinzel">${price}</p></div>
      <p class="text-xs text-slate-300 leading-relaxed mb-6 whitespace-pre-line">${esc(p.description)}</p></div>
      <a href="${wa(name,"package")}" target="_blank" rel="noopener" class="w-full gold-button py-3.5 rounded-xl text-navy-950 font-extrabold text-xs uppercase tracking-wider text-center block">Get Quote on WhatsApp</a></article>`;
  }
  async function load() {
    try {
      const [hotels, packages] = await Promise.all([
        db.from("website_hotels").select("*").eq("is_visible", true).order("sort_order").order("created_at"),
        db.from("website_packages").select("*").eq("is_visible", true).order("sort_order").order("created_at")
      ]);
      if (!hotels.error) {
        const m = (hotels.data || []).filter(x=>x.city==="makkah");
        const d = (hotels.data || []).filter(x=>x.city==="madinah");
        document.getElementById("cms-makkah-hotels-grid").innerHTML=m.length ? m.map(x=>hotelCard(x,"makkah")).join("") : '<p class="text-slate-300 text-sm">Makkah hotel details are being updated. Please contact us on WhatsApp.</p>';
        document.getElementById("cms-madinah-hotels-grid").innerHTML=d.length ? d.map(x=>hotelCard(x,"madinah")).join("") : '<p class="text-slate-300 text-sm">Madinah hotel details are being updated. Please contact us on WhatsApp.</p>';
      }
      if (!packages.error) {
        const list = packages.data || [];
        document.getElementById("cms-packages-grid").innerHTML=list.length ? list.map(packageCard).join("") : '<p class="text-slate-300 text-sm">Umrah packages are being updated. Please contact us on WhatsApp.</p>';
      }
    } catch (e) { console.warn("Website CMS unavailable; showing built-in website content.", e); }
  }
  document.addEventListener("DOMContentLoaded", load);
})();