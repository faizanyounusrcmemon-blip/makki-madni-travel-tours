(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const cfg = window.CMS_CONFIG || {};
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.supabase) {
    $('login-msg').textContent = 'cms-config.js mein Supabase URL aur anon key configure karein.';
    return;
  }
  const db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true }
  });
  let users = [];
  const msg = (id, text, good=false) => { $(id).textContent = text; $(id).className = `text-sm mt-3 ${good ? 'text-emerald-300' : 'text-rose-300'}`; };
  async function api(method='GET', body=null) {
    const { data: { session } } = await db.auth.getSession();
    if (!session?.access_token) throw new Error('Session expired. Dobara login karein.');
    const response = await fetch('/api/admin-users', {
      method,
      headers: { Authorization: `Bearer ${session.access_token}`, ...(body ? {'Content-Type':'application/json'} : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Request failed.');
    return result;
  }
  function render() {
    $('users-body').innerHTML = users.length ? users.map(user => `<tr><td>${escapeHtml(user.name || '—')}</td><td>${escapeHtml(user.email)}</td><td>${user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</td><td><span class="${user.email_confirmed ? 'text-emerald-300' : 'text-amber-300'}">${user.email_confirmed ? 'Confirmed' : 'Pending'}</span></td><td><button class="btn2" data-edit="${escapeHtml(user.id)}"><i class="fa-solid fa-pen"></i> Edit</button></td></tr>`).join('') : '<tr><td colspan="5" class="muted">No users found.</td></tr>';
    $('users-body').querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => openEdit(button.dataset.edit)));
  }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  async function loadUsers() {
    $('users-body').innerHTML = '<tr><td colspan="5" class="muted">Loading...</td></tr>';
    try { const result = await api(); users = result.users || []; render(); }
    catch (error) { $('users-body').innerHTML = `<tr><td colspan="5" class="text-rose-300">${escapeHtml(error.message)}</td></tr>`; }
  }
  function openEdit(id) {
    const user = users.find(item => item.id === id); if (!user) return;
    $('edit-id').value = user.id; $('edit-name').value = user.name || ''; $('edit-email').value = user.email; $('edit-password').value = '';
    $('edit-panel').classList.remove('hidden'); $('edit-panel').scrollIntoView({behavior:'smooth',block:'center'});
  }
  async function showSession() {
    const { data: { session } } = await db.auth.getSession();
    $('login').classList.toggle('hidden', !!session); $('app').classList.toggle('hidden', !session); $('logout').classList.toggle('hidden', !session);
    if (session) await loadUsers();
  }
  $('login-form').addEventListener('submit', async event => {
    event.preventDefault(); msg('login-msg','Signing in...',true);
    const { error } = await db.auth.signInWithPassword({email:$('login-email').value.trim(),password:$('login-password').value});
    if (error) { msg('login-msg',error.message); return; }
    await showSession();
  });
  $('logout').addEventListener('click', async () => { await db.auth.signOut(); $('edit-panel').classList.add('hidden'); await showSession(); });
  $('refresh').addEventListener('click', loadUsers);
  $('create-form').addEventListener('submit', async event => {
    event.preventDefault(); const button = event.submitter; button.disabled = true; msg('create-msg','Creating user...',true);
    try {
      const result = await api('POST',{name:$('new-name').value,email:$('new-email').value,password:$('new-password').value});
      msg('create-msg',result.message || 'User created.',true); $('create-form').reset(); await loadUsers();
    } catch(error) { msg('create-msg',error.message); } finally { button.disabled = false; }
  });
  $('edit-form').addEventListener('submit', async event => {
    event.preventDefault(); const button = event.submitter; button.disabled = true; msg('edit-msg','Saving...',true);
    const payload = {id:$('edit-id').value,name:$('edit-name').value,email:$('edit-email').value};
    if ($('edit-password').value) payload.password = $('edit-password').value;
    try { const result = await api('PATCH',payload); msg('edit-msg',result.message || 'Updated successfully.',true); $('edit-password').value=''; await loadUsers(); }
    catch(error) { msg('edit-msg',error.message); } finally { button.disabled = false; }
  });
  $('cancel-edit').addEventListener('click',()=>$('edit-panel').classList.add('hidden'));
  showSession();
})();
