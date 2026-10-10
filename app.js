const $ = id => document.getElementById(id);
const cfg = window.QUOTE_BOOK_CONFIG || {};
const sharedConfigured = Boolean(cfg.url && cfg.publishableKey);
const DEMO_KEY = 'quote-book-local-v1';
const NAME_KEY = 'quote-book-invite-v1';
let client = null;
let room = null;
let items = [];
let editId = null;
let focusId = null;
let actorId = null;
let busy = false;
let sessionToken = null;

async function signedInFetch(input, options = {}) {
  const requestUrl = new URL(typeof input === 'string' ? input : input.url);
  const projectUrl = new URL(cfg.url);
  const isDatabaseRequest = requestUrl.origin === projectUrl.origin && requestUrl.pathname.startsWith('/rest/v1/');
  if (!isDatabaseRequest) return fetch(input, options);
  if (!sessionToken) throw Error('Sign-in is not ready. Refresh the page and wait for the setup message.');
  const headers = new Headers(options.headers || (input instanceof Request ? input.headers : undefined));
  headers.set('Authorization', `Bearer ${sessionToken}`);
  const response = await fetch(input, { ...options, headers });
  if (!response.ok) {
    const error = await response.clone().json().catch(() => null);
    if (error?.message?.includes('permission denied for function')) {
      error.message += ' (signed-in request; app v3)';
      return new Response(JSON.stringify(error), { status: response.status, statusText: response.statusText, headers: response.headers });
    }
  }
  return response;
}

function localDateTime(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function displayDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
function readLocal() {
  try { const rows = JSON.parse(localStorage.getItem(DEMO_KEY)); return Array.isArray(rows) ? rows : []; }
  catch { return []; }
}
function saveLocal(rows) {
  localStorage.setItem(DEMO_KEY, JSON.stringify(rows));
}
function status(id, message) { $(id).textContent = message; }
function setBusy(value) {
  busy = value;
  $('saveButton').disabled = value;
  $('createRoom').disabled = value;
  $('joinToggle').disabled = value;
  $('joinForm').querySelector('button').disabled = value;
}
function normalizeInvite(raw) {
  try { const url = new URL(raw); return url.searchParams.get('invite') || ''; }
  catch { return raw.trim(); }
}
function render() {
  const term = $('search').value.trim().toLocaleLowerCase();
  const visible = items.filter(q => [q.quote_text,q.speaker,q.place].some(v => (v||'').toLocaleLowerCase().includes(term)));
  $('count').textContent = String(items.length);
  $('quotes').replaceChildren();
  $('empty').hidden = visible.length > 0;
  $('empty').textContent = items.length ? 'No quotes match that search.' : 'Your future inside jokes go here.';
  for (const quote of visible) {
    const card = document.createElement('article');
    card.className = 'quote-card' + (quote.id === focusId ? ' featured' : '');
    const body = document.createElement('p'); body.className = 'quote-content'; body.textContent = `“${quote.quote_text}”`;
    const meta = document.createElement('div'); meta.className = 'quote-meta';
    const speaker = document.createElement('strong'); speaker.textContent = `— ${quote.speaker}`;
    const place = document.createElement('span'); place.textContent = quote.place || 'Somewhere unforgettable';
    const date = document.createElement('time'); date.dateTime = quote.said_at; date.textContent = displayDate(quote.said_at);
    meta.append(speaker, place, date);
    const actions = document.createElement('div'); actions.className = 'quote-actions';
    if (!sharedConfigured || quote.created_by === actorId) {
      const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Edit'; edit.addEventListener('click', () => beginEdit(quote));
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Delete'; remove.addEventListener('click', () => deleteQuote(quote));
      actions.append(edit, remove);
    }
    card.append(body, meta, actions); $('quotes').append(card);
  }
}
function beginEdit(quote) {
  editId = quote.id;
  $('quoteText').value = quote.quote_text;
  $('speaker').value = quote.speaker;
  $('place').value = quote.place || '';
  $('saidAt').value = localDateTime(new Date(quote.said_at));
  $('formTitle').textContent = 'Edit quote';
  $('saveButton').textContent = 'Save changes';
  $('cancelEdit').hidden = false;
  $('quoteText').focus();
  $('quoteText').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function resetForm() {
  editId = null;
  $('quoteForm').reset();
  $('saidAt').value = localDateTime();
  $('formTitle').textContent = 'Add a quote';
  $('saveButton').textContent = 'Save quote';
  $('cancelEdit').hidden = true;
}
async function refresh() {
  if (!room) return;
  const { data, error } = await client.from('quotes').select('id,quote_text,speaker,place,said_at,created_at,created_by').eq('room_id', room.room_id).order('said_at', { ascending: false }).limit(1000);
  if (error) throw error;
  items = data || [];
  render();
}
async function saveQuote(event) {
  event.preventDefault();
  if (busy) return;
  const quote_text = $('quoteText').value.trim();
  const speaker = $('speaker').value.trim();
  const place = $('place').value.trim();
  const date = new Date($('saidAt').value);
  if (!quote_text || !speaker || Number.isNaN(date.getTime())) { status('formMessage','Enter a quote, speaker, and valid date/time.'); return; }
  const fields = { quote_text, speaker, place, said_at: date.toISOString() };
  setBusy(true); status('formMessage','Saving…');
  try {
    if (sharedConfigured) {
      if (!room) throw Error('Create or join a shared book first.');
      const result = editId
        ? await client.from('quotes').update(fields).eq('id', editId).eq('room_id', room.room_id).select('id').single()
        : await client.from('quotes').insert({ ...fields, room_id: room.room_id, created_by: actorId }).select('id').single();
      if (result.error) throw result.error;
      await refresh();
    } else {
      if (editId) items = items.map(q => q.id === editId ? { ...q, ...fields } : q);
      else items.unshift({ ...fields, id: crypto.randomUUID(), created_at: new Date().toISOString(), created_by: 'local' });
      items.sort((a,b) => new Date(b.said_at) - new Date(a.said_at));
      saveLocal(items); render();
    }
    resetForm(); status('formMessage','Saved. This one belongs in the archives.');
  } catch (error) { status('formMessage',`Could not save: ${error.message}`); }
  finally { setBusy(false); }
}
async function deleteQuote(quote) {
  const dialog = $('confirmDialog'); dialog.showModal();
  const confirmed = await new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'delete'), { once: true }));
  if (!confirmed) return;
  try {
    if (sharedConfigured) {
      const { error } = await client.from('quotes').delete().eq('id', quote.id).eq('room_id', room.room_id);
      if (error) throw error;
      await refresh();
    } else { items = items.filter(q => q.id !== quote.id); saveLocal(items); render(); }
    status('listMessage','Quote deleted.');
  } catch (error) { status('listMessage',`Could not delete: ${error.message}`); }
}
function setRoom(value) {
  room = value;
  $('setup').hidden = Boolean(room);
  $('sharePanel').hidden = !room;
  $('inviteLink').value = room ? makeInviteLink(room.invite_code) : '';
  $('modeBadge').textContent = room ? 'Shared book' : 'Join or create';
  $('storageNote').textContent = room ? 'Shared between devices with this invite link. Keep the link private.' : 'Create or join a book to start saving shared quotes.';
}
async function createRoom() {
  if (busy) return;
  setBusy(true); status('setupMessage','Creating your book…');
  try {
    const { data, error } = await client.rpc('create_quote_room');
    if (error) throw error;
    const value = Array.isArray(data) ? data[0] : data;
    if (!value?.room_id || !value?.invite_code) throw Error('No invite was returned.');
    localStorage.setItem(NAME_KEY, value.invite_code);
    setRoom(value); await refresh(); status('setupMessage','Book created. Share the invite link with your friend.');
  } catch (error) { status('setupMessage',`Could not create the book: ${error.message}`); }
  finally { setBusy(false); }
}
async function joinRoom(event, raw) {
  event?.preventDefault();
  const code = normalizeInvite(raw || $('inviteInput').value);
  if (!/^[a-f0-9-]{36,72}$/i.test(code)) { status('setupMessage','Paste a valid invite link or code.'); return; }
  status('setupMessage','Joining the book…');
  const { data, error } = await client.rpc('join_quote_room', { p_invite_code: code });
  if (error) { status('setupMessage',`Could not join: ${error.message}`); return; }
  localStorage.setItem(NAME_KEY, code);
  setRoom({ room_id: data, invite_code: code });
  history.replaceState({},'',location.pathname);
  try { await refresh(); } catch (err) { status('listMessage',`Could not load quotes: ${err.message}`); }
}
async function initializeShared() {
  setBusy(true);
  $('setup').hidden = false;
  $('modeBadge').textContent = 'Connecting';
  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    client = createClient(cfg.url, cfg.publishableKey, { global: { fetch: signedInFetch } });
    client.auth.onAuthStateChange((_event, session) => { sessionToken = session?.access_token || null; });
    let { data: { session } } = await client.auth.getSession();
    if (!session) {
      const result = await client.auth.signInAnonymously();
      if (result.error) throw result.error;
      session = result.data.session;
    }
    actorId = session.user.id;
    sessionToken = session.access_token;
    const inviteFromLink = new URL(location.href).searchParams.get('invite');
    if (inviteFromLink) { await joinRoom(null, inviteFromLink); return; }
    const { data, error } = await client.rpc('get_quote_room');
    if (error) throw error;
    const value = Array.isArray(data) ? data[0] : data;
    if (value?.room_id) { setRoom(value); await refresh(); }
    else { setRoom(null); status('setupMessage','Create a book, or join with your friend’s invite link.'); }
  } catch (error) { setRoom(null); status('setupMessage',`Could not connect: ${error.message}. Check config.js and the database setup.`); }
  finally { setBusy(false); }
}

$('quoteForm').addEventListener('submit',saveQuote);
$('cancelEdit').addEventListener('click',resetForm);
$('search').addEventListener('input',render);
$('randomButton').addEventListener('click',()=>{
  if (!items.length) { status('listMessage','Save your first quote, then try this.'); return; }
  $('search').value = ''; focusId = items[Math.floor(Math.random()*items.length)].id; render();
  document.querySelector('.quote-card.featured')?.scrollIntoView({ behavior:'smooth',block:'center' });
});
$('createRoom').addEventListener('click',createRoom);
$('joinToggle').addEventListener('click',()=>{ $('joinForm').hidden = !$('joinForm').hidden; if (!$('joinForm').hidden) $('inviteInput').focus(); });
$('joinForm').addEventListener('submit',event=>joinRoom(event));
function makeInviteLink(code) {
  const link = new URL(location.href);
  link.search = ''; link.hash = '';
  link.searchParams.set('invite',code);
  return link.href;
}
async function copyInvite() {
  if (!room?.invite_code) return;
  const input = $('inviteLink'); input.value = makeInviteLink(room.invite_code);
  try {
    if (!navigator.clipboard?.writeText) throw Error('Clipboard unavailable');
    await navigator.clipboard.writeText(input.value);
    status('shareMessage','Invite link copied. Paste it in a message to your friend.');
  } catch {
    input.focus(); input.select(); input.setSelectionRange(0,input.value.length);
    status('shareMessage','Press and hold the link, then choose Copy.');
  }
}
$('copyInvite').addEventListener('click',copyInvite);
$('inviteLink').addEventListener('click',()=>{ $('inviteLink').select(); });
$('shareButton').addEventListener('click',async()=>{
  if (!room?.invite_code) { status('listMessage','Create or join a shared book before inviting your friend.'); return; }
  const url = makeInviteLink(room.invite_code);
  if (!navigator.share) { await copyInvite(); return; }
  try { await navigator.share({ title:'Our Quote Book',url }); }
  catch (error) { if (error.name !== 'AbortError') await copyInvite(); }
});
$('exportButton').addEventListener('click',()=>{
  const blob = new Blob([JSON.stringify(items.map(({quote_text,speaker,place,said_at})=>({quote_text,speaker,place,said_at})),null,2)],{type:'application/json'});
  const href = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = href; a.download = `quote-book-${new Date().toISOString().slice(0,10)}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(href),1000);
});
$('importFile').addEventListener('change',async event=>{
  const file = event.target.files?.[0]; event.target.value = '';
  if (!file) return;
  try {
    if (file.size > 2_000_000) throw Error('File is too large.');
    const rows = JSON.parse(await file.text());
    if (!Array.isArray(rows) || rows.length > 1000) throw Error('Choose a Quote Book JSON export with up to 1,000 quotes.');
    const clean = rows.map(q => {
      if (typeof q.quote_text !== 'string' || !q.quote_text.trim() || q.quote_text.length > 1000 ||
          typeof q.speaker !== 'string' || !q.speaker.trim() || q.speaker.length > 80 ||
          typeof q.place !== 'string' || q.place.length > 120 ||
          !q.said_at || Number.isNaN(new Date(q.said_at).getTime())) throw Error('A quote has missing or invalid fields.');
      return { quote_text:q.quote_text.trim(),speaker:q.speaker.trim(),place:q.place.trim(),said_at:new Date(q.said_at).toISOString() };
    });
    if (sharedConfigured) {
      if (!room) throw Error('Create or join a shared book before importing.');
      for (let i=0;i<clean.length;i+=100) {
        const batch = clean.slice(i,i+100).map(q => ({...q,room_id:room.room_id,created_by:actorId}));
        const { error } = await client.from('quotes').insert(batch);
        if (error) throw error;
      }
      await refresh();
    } else {
      items = [...items,...clean.map(q => ({...q,id:crypto.randomUUID(),created_at:new Date().toISOString(),created_by:'local'}))];
      items.sort((a,b)=>new Date(b.said_at)-new Date(a.said_at));
      saveLocal(items); render();
    }
    status('listMessage',`Imported ${clean.length} quote${clean.length===1?'':'s'}.`);
  } catch (error) { status('listMessage',`Import failed: ${error.message}`); }
});
resetForm();
if (sharedConfigured) initializeShared();
else { items = readLocal(); render(); $('modeBadge').textContent='This device'; }
