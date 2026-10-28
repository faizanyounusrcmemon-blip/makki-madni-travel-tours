(() => {
 const cfg=window.CMS_CONFIG||{};
 const ready=cfg.SUPABASE_URL&&!cfg.SUPABASE_URL.includes("PASTE_")&&cfg.SUPABASE_ANON_KEY&&!cfg.SUPABASE_ANON_KEY.includes("PASTE_")&&window.supabase;
 const $=id=>document.getElementById(id);
 if(!ready){$("config-warning").classList.remove("hidden");$("login-msg").textContent="Pehle cms-config.js configure karein."; $("login-form").addEventListener("submit",e=>e.preventDefault());return;}
 const db=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
 let records={hotels:[],packages:[]};
 const esc=s=>String(s?="" "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const table=t=>t==="hotel"?"website_hotels":"website_packages";
 const msg=(s)=>$("status").textContent=s;

 async function showSession(){
   const {data:{session}}=await db.auth.getSession();
   if(!session){$("login-panel").classList.remove("hidden");$("dashboard").classList.add("hidden");return;}
   const {data:admin,error}=await db.from("website_admins").select("user_id").eq("user_id",session.user.id).maybeSingle();
   if(error||!admin){await db.auth.signOut();$("login-msg").textContent="Admin access nahi hai.";return;}
   $("login-panel").classList.add("hidden");$("dashboard").classList.remove("hidden");await load();
 }

 async function load(){
   msg("Loading...");
   const [h,p]=await Promise.all([db.from("website_hotels").select("*").order("sort_order").order("created_at"),db.from("website_packages").select("*").order("sort_order").order("created_at")]);
   if(h.error||p.error){msg("Load error: "+(h.error?.message||p.error?.message));return;}
   records.hotels=h.data||[];records.packages=p.data||[];
   $("hotels-list").innerHTML=records.hotels.map(x=>itemHtml(x,"hotel")).join("")||'<p class="text-sm text-slate-400">Abhi hotels add nahi kiye.</p>';
   $("packages-list").innerHTML=records.packages.map(x=>itemHtml(x,"package")).join("")||'<p class="text-sm text-slate-400">Abhi packages add nahi kiye.</p>';
   msg("Content loaded successfully.");
 }

 function itemHtml(x,type){
   let imgs = x.images || (x.image_url ? [x.image_url] : []);
   return `<div class="border border-yellow-700/30 rounded-xl p-3 flex gap-3 items-start">
     <img src="${esc(imgs[0]||"")}" class="w-16 h-16 object-cover rounded-lg bg-black/30" onerror="this.style.display='none'">
     <div class="min-w-0 flex-1">
       <p class="font-bold">${esc(x.name)}</p>
       <p class="text-xs text-slate-400">${type==="hotel"?esc(x.city):"Package"} · ${x.is_visible?"Visible":"Hidden"} · 📷 ${imgs.length} Pics</p>
       <div class="flex gap-2 mt-3">
         <button class="btn2 text-xs" data-edit="${type}:${x.id}">Edit</button>
         <button class="btn2 text-xs" data-toggle="${type}:${x.id}">${x.is_visible?"Hide":"Show"}</button>
         <button class="text-xs text-red-300 border border-red-800/60 rounded-lg px-3" data-delete="${type}:${x.id}">Delete</button>
       </div>
     </div>
   </div>`;
 }

 async function openEditor(type,item=null){
   $("editor").reset();$("record-id").value=item?.id||"";$("record-type").value=type;
   $("editor-title").textContent=(item?"Edit ":"Add ")+(type==="hotel"?"Hotel":"Umrah Package");
   $("city-wrap").classList.toggle("hidden",type!=="hotel");$("view-wrap").classList.toggle("hidden",type!=="hotel");
   $("f-name").value=item?.name||"";$("f-city").value=item?.city||"makkah";$("f-badge").value=item?.badge||"";
   $("f-description").value=item?.description||"";$("f-view").value=item?.view_text||"";$("f-price").value=item?.price||"";
   $("f-videos").value=Array.isArray(item?.videos)?item.videos.join(","):(item?.videos||"");
   $("f-pdfs").value=Array.isArray(item?.pdfs)?item.pdfs[0]||"":(item?.pdfs||"");
   $("f-order").value=item?.sort_order??0;$("f-visible").checked=item?.is_visible??true;
   $("editor-msg").textContent="";$("editor-wrap").classList.remove("hidden");
 }

 async function uploadPhotos(files){
   let urls=[];
   for(let file of files){
     if(file.size>5*1024*1024) continue;
     const ext=file.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g,"")||"jpg";
     const path=`website/${crypto.randomUUID()}.${ext}`;
     const {error}=await db.storage.from("website-photos").upload(path,file,{upsert:false,contentType:file.type});
     if(!error){
       const pub=db.storage.from("website-photos").getPublicUrl(path).data.publicUrl;
       urls.push(pub);
     }
   }
   return urls;
 }

 $("login-form").addEventListener("submit",async e=>{e.preventDefault();const {error}=await db.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});if(!error)await showSession();else $("login-msg").textContent=error.message;});
 $("logout").addEventListener("click",async()=>{await db.auth.signOut();await showSession();});
 $("refresh").addEventListener("click",load);
 $("new-hotel").addEventListener("click",()=>openEditor("hotel"));
 $("new-package").addEventListener("click",()=>openEditor("package"));
 $("close-editor").addEventListener("click",()=>$("editor-wrap").classList.add("hidden"));
 $("cancel-editor").addEventListener("click",()=>$("editor-wrap").classList.add("hidden"));

 document.addEventListener("click",async e=>{
   const ed=e.target.closest("[data-edit]"); if(ed){const [type,id]=ed.dataset.edit.split(":");const item=records[type==="hotel"?"hotels":"packages"].find(x=>x.id===id);if(item)openEditor(type,item);return;}
   const tg=e.target.closest("[data-toggle]");if(tg){const [type,id]=tg.dataset.toggle.split(":");const t=table(type);const arr=type==="hotel"?records.hotels:records.packages;const item=arr.find(x=>x.id===id);if(!item)return;await db.from(t).update({is_visible:!item.is_visible}).eq("id",id);await load();return;}
   const del=e.target.closest("[data-delete]");if(del){const [type,id]=del.dataset.delete.split(":");if(!confirm("Delete this item?"))return;await db.from(table(type)).delete().eq("id",id);await load();}
 });

 $("editor").addEventListener("submit",async e=>{
   e.preventDefault();const type=$("record-type").value;const t=table(type);const id=$("record-id").value;
   const btn=$("editor").querySelector('[type="submit"]');btn.disabled=true;btn.textContent="Saving...";
   try{
     const files=$("f-files").files;
     let newImgs = files.length > 0 ? await uploadPhotos(files) : [];
     
     // Purani images retain karein agar edit ho raha ho aur nayi files na select ki hon
     let existingItem = id ? records[type==="hotel"?"hotels":"packages"].find(x=>x.id===id) : null;
     let finalImages = newImgs.length > 0 ? newImgs : (existingItem?.images || (existingItem?.image_url?[existingItem.image_url]:[]));

     const row={
       name:$("f-name").value.trim(),
       badge:$("f-badge").value.trim(),
       description:$("f-description").value.trim(),
       price:$("f-price").value.trim(),
       image_url: finalImages[0] || null,
       images: finalImages,
       videos: $("f-videos").value.split(",").map(s=>s.trim()).filter(Boolean),
       pdfs: $("f-pdfs").value.trim()?[$("f-pdfs").value.trim()]:[],
       sort_order:Number($("f-order").value)||0,
       is_visible:$("f-visible").checked,
       updated_at:new Date().toISOString()
     };
     if(type==="hotel"){row.city=$("f-city").value;row.view_text=$("f-view").value.trim();}
     
     const res=id?await db.from(t).update(row).eq("id",id):await db.from(t).insert(row);
     if(res.error)throw res.error;
     $("editor-wrap").classList.add("hidden");await load();
   }catch(err){$("editor-msg").textContent=err.message||"Save failed.";}
   finally{btn.disabled=false;btn.textContent="Save Changes";}
 });
 showSession();
})();
