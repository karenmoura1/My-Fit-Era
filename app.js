/* js/app.js — Lógica principal do My Fit Era */

/* ============================================================
   CONFIG SUPABASE — altere apenas estas duas linhas
   ============================================================ */
const SUPABASE_URL = 'https://lxxflynttlympjucsvqj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_dWlOpET0lCMbzeFdkq93gg_gMFEZgLh';

/* ============================================================
   CHART COLORS
   ============================================================ */
const CHART = {
  accent:  '#2563EB',
  success: '#16A34A',
  warning: '#D97706',
  danger:  '#DC2626',
  muted:   '#64748B',
  palette: ['#2563EB','#64748B','#16A34A','#D97706','#DC2626','#4F46E5','#0891B2']
};

/* ============================================================
   SUPABASE INIT
   ============================================================ */
const supaConfigured = () => SUPABASE_URL && SUPABASE_KEY;
let supa = null;
if (supaConfigured()) {
  supa = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
}

/* ============================================================
   STORAGE / DB LOCAL
   ============================================================ */
const KEY    = 'habitsAppV4';
const KEY_V3 = 'habitsAppV3';
const KEY_V2 = 'habitsAppV2';
const KEY_V1 = 'habitsAppV1';
const uid = () => 'h' + Math.random().toString(36).slice(2, 9);

function normalizeMeal(meal) {
  if (!meal.options || !meal.options.length) {
    meal.options = [{ id: uid(), name: 'Opção 1', foods: [...(meal.foods || [])] }];
    delete meal.foods;
  }
  meal.options.forEach(opt => { if (!opt.id) opt.id = uid(); if (!opt.foods) opt.foods = []; });
  return meal;
}
function normalizeDietPlan() { if (!db.dietPlan) return; db.dietPlan.forEach(normalizeMeal); }
function getMealOptions(meal) { normalizeMeal(meal); return meal.options; }
function getMealRecordOption(meal, mealRec) {
  const opts = getMealOptions(meal);
  if (!opts.length) return null;
  let optId = mealRec?.optionId;
  if (!optId || !opts.find(o => o.id === optId)) optId = opts[0].id;
  return opts.find(o => o.id === optId) || opts[0];
}
function getMealActiveFoods(meal, mealRec) {
  const opt = getMealRecordOption(meal, mealRec);
  return opt ? (opt.foods || []) : [];
}

let db = JSON.parse(localStorage.getItem(KEY)) || migrateOrDefault();
if (!db.alertConfig)     db.alertConfig     = { threshold: 0.5, window: 7 };
if (!db.dismissedAlerts) db.dismissedAlerts = {};
if (!db.dietPlan)        db.dietPlan        = [];
if (!db.goals)           db.goals           = {};
if (!db.unlockedAchievements) db.unlockedAchievements = {};
normalizeDietPlan();

let currentUser = null;
let bodyMetrics  = [];
let saveTimer    = null;
let chartBody    = null;
let authMode     = 'login';
let panelBeforeSettings = 'today';

function migrateOrDefault() {
  const v3 = JSON.parse(localStorage.getItem(KEY_V3));
  if (v3) { v3.dietPlan = v3.dietPlan || []; v3.dietPlan.forEach(normalizeMeal); return v3; }
  const v2 = JSON.parse(localStorage.getItem(KEY_V2));
  if (v2) { v2.contextTags = v2.contextTags || []; v2.dietPlan = []; return v2; }
  const v1 = JSON.parse(localStorage.getItem(KEY_V1));
  if (v1) { v1.habits = v1.habits.map(h => ({...h, freq:'daily', days:[0,1,2,3,4,5,6], times:7})); v1.contextTags = ['Trabalho presencial','Home office']; v1.dietPlan = []; return v1; }
  return {
    habits: [
      {id:'h1', name:'Não comer doce',  perMeal:true,  freq:'daily', days:[0,1,2,3,4,5,6], times:7},
      {id:'h2', name:'Beber 2L de água',perMeal:false, freq:'daily', days:[0,1,2,3,4,5,6], times:7},
      {id:'h3', name:'Academia',        perMeal:false, freq:'weekly',days:[], times:3}
    ],
    contextTags: ['Trabalho presencial','Home office','Viagem','Reunião à noite','Final de semana social','TPM','Mal dormido'],
    reasons: ['Ansiedade','Estresse','Fome','Festa/Evento social','Cansaço','Sem motivo'],
    meals:   ['Café da manhã','Almoço','Lanche da tarde','Jantar','Madrugada'],
    dietPlan: [
      { id:'mp1', name:'Café da manhã',    time:'07:00', emoji:'☕', options:[{id:'mp1o1', name:'Cardápio padrão', foods:[{name:'Ovos mexidos',amount:'3 unidades'},{name:'Pão integral',amount:'2 fatias'},{name:'Café preto',amount:'200ml'}]}]},
      { id:'mp2', name:'Lanche da manhã',  time:'10:00', emoji:'🍎', options:[{id:'mp2o1', name:'Cardápio padrão', foods:[{name:'Maçã',amount:'1 unidade'},{name:'Castanhas',amount:'20g'}]}]},
      { id:'mp3', name:'Almoço',           time:'12:30', emoji:'🍽️', options:[
          {id:'mp3o1', name:'Opção A — Frango', foods:[{name:'Frango grelhado',amount:'150g'},{name:'Arroz integral',amount:'100g'},{name:'Feijão',amount:'80g'},{name:'Salada',amount:'à vontade'}]},
          {id:'mp3o2', name:'Opção B — Peixe',  foods:[{name:'Peixe grelhado',amount:'150g'},{name:'Batata doce',amount:'120g'},{name:'Salada',amount:'à vontade'}]}
        ]},
      { id:'mp4', name:'Lanche da tarde',  time:'16:00', emoji:'🥤', options:[{id:'mp4o1', name:'Cardápio padrão', foods:[{name:'Iogurte natural',amount:'170g'},{name:'Granola',amount:'30g'}]}]},
      { id:'mp5', name:'Jantar',           time:'20:00', emoji:'🥗', options:[{id:'mp5o1', name:'Cardápio padrão', foods:[{name:'Peixe assado',amount:'120g'},{name:'Batata doce',amount:'100g'},{name:'Legumes refogados',amount:'150g'}]}]}
    ],
    records:         {},
    alertConfig:     { threshold: 0.5, window: 7 },
    dismissedAlerts: {},
    goals:           {},
    unlockedAchievements: {}
  };
}

const save = () => {
  localStorage.setItem(KEY, JSON.stringify(db));
  if (currentUser && supa) scheduleCloudSave();
};
const scheduleCloudSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(syncAppDataToCloud, 700); };

/* ============================================================
   CLOUD STATUS
   ============================================================ */
function setCloudStatus(text, cls) {
  const el = document.getElementById('cloudStatus');
  const tx = document.getElementById('cloudStatusText');
  if (!el || !tx) return;
  el.className = 'sync-line ' + (cls || '');
  tx.textContent = text;
}

/* ============================================================
   CONTA / AUTH
   ============================================================ */
function toggleAccountMenu(e) {
  e.stopPropagation();
  const dd   = document.getElementById('accountDropdown');
  const open = dd.classList.toggle('show');
  document.getElementById('accountTrigger')?.setAttribute('aria-expanded', open ? 'true' : 'false');
}
function closeAccountMenu() {
  document.getElementById('accountDropdown')?.classList.remove('show');
  document.getElementById('accountTrigger')?.setAttribute('aria-expanded', 'false');
}
function openSettings()  { closeAccountMenu(); const active = document.querySelector('.panel.active'); if (active && active.id !== 'settings') panelBeforeSettings = active.id; switchPanel('settings'); }
function closeSettings() { switchPanel(panelBeforeSettings || 'today'); }
document.addEventListener('click', () => closeAccountMenu());

function setAuthMode(mode) {
  authMode = mode;
  document.getElementById('btnAuthLogin').classList.toggle('active', mode === 'login');
  document.getElementById('btnAuthSignup').classList.toggle('active', mode === 'signup');
  document.getElementById('loginBtn').textContent = mode === 'login' ? 'Entrar' : 'Criar conta';
}

async function checkAuth() {
  if (!supaConfigured()) { setCloudStatus('Configure SUPABASE_URL e SUPABASE_KEY', 'err'); document.getElementById('loginScreen').style.display = 'flex'; return null; }
  const { data: { session } } = await supa.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').classList.add('show');
    document.getElementById('userEmail').textContent = session.user.email || '';
    await loadFromCloud();
    return session.user;
  }
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('mainApp').classList.remove('show');
  return null;
}

document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!supaConfigured()) { showLoginError('Configure SUPABASE_URL e SUPABASE_KEY.'); return; }
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPass').value;
  const btn   = document.getElementById('loginBtn');
  document.getElementById('loginError').classList.remove('show');
  btn.disabled = true; btn.textContent = '⏳ Aguarde...';
  try {
    if (authMode === 'signup') {
      const { error } = await supa.auth.signUp({ email, password: pass });
      if (error) throw error;
      showLoginError('Conta criada! Confirme o e-mail se necessário, depois entre.', false);
      setAuthMode('login');
    } else {
      const { error } = await supa.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
      await checkAuth(); loadEntries(); updateAlertBadge();
    }
  } catch (err) {
    showLoginError(err.message === 'Invalid login credentials' ? 'Email ou senha incorretos' : (err.message || 'Erro ao autenticar'));
  }
  btn.disabled = false; btn.textContent = authMode === 'login' ? 'Entrar' : 'Criar conta';
});

function showLoginError(msg, isError = true) {
  const el = document.getElementById('loginError');
  el.textContent = msg; el.classList.add('show');
  if (!isError) el.style.background = '#f0fff4';
}

async function logout() {
  if (!confirm('Sair da conta?')) return;
  if (supa) await supa.auth.signOut();
  currentUser = null; bodyMetrics = []; location.reload();
}

async function loadFromCloud() {
  if (!currentUser || !supa) return;
  setCloudStatus('Sincronizando...', 'sync');
  try {
    const [{ data: appRow, error: appErr }, { data: metrics, error: metErr }] = await Promise.all([
      supa.from('app_data').select('data').eq('user_id', currentUser.id).maybeSingle(),
      supa.from('body_metrics').select('*').eq('user_id', currentUser.id).order('recorded_at', { ascending: true })
    ]);
    if (appErr) throw appErr; if (metErr) throw metErr;
    if (appRow?.data && typeof appRow.data === 'object' && Object.keys(appRow.data).length) {
      db = appRow.data;
      if (!db.dietPlan)        db.dietPlan        = [];
      normalizeDietPlan();
      if (!db.alertConfig)          db.alertConfig          = { threshold: 0.5, window: 7 };
      if (!db.dismissedAlerts)      db.dismissedAlerts      = {};
      if (!db.goals)                db.goals                = {};
      if (!db.unlockedAchievements) db.unlockedAchievements = {};
      localStorage.setItem(KEY, JSON.stringify(db));
    } else if (Object.keys(db.records || {}).length || (db.habits && db.habits.length)) {
      await syncAppDataToCloud();
    }
    bodyMetrics = metrics || [];
    setCloudStatus('Sincronizado com a nuvem', 'ok');
  } catch (e) { console.error(e); setCloudStatus('Erro na nuvem — dados locais ativos', 'err'); }
}

async function syncAppDataToCloud() {
  if (!currentUser || !supa) return;
  setCloudStatus('Salvando...', 'sync');
  try {
    const { error } = await supa.from('app_data').upsert({ user_id: currentUser.id, data: db, updated_at: new Date().toISOString() });
    if (error) throw error;
    setCloudStatus('Salvo na nuvem', 'ok');
  } catch (e) { console.error(e); setCloudStatus('Falha ao salvar na nuvem', 'err'); }
}

/* ============================================================
   UTILITÁRIOS
   ============================================================ */
const today         = () => new Date().toISOString().slice(0, 10);
const fmtDate       = d  => new Date(d+'T00:00').toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'});
const weekdays      = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const weekdaysShort = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const monthNames    = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function weekStart(date) {
  const d = new Date(date+'T00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0,10);
}
function weekDates(monday) {
  const arr = []; const d = new Date(monday+'T00:00');
  for (let i = 0; i < 7; i++) { arr.push(d.toISOString().slice(0,10)); d.setDate(d.getDate()+1); }
  return arr;
}
function isScheduled(habit, date) {
  if (habit.freq === 'daily') return true;
  if (habit.freq === 'weekdays') return habit.days.includes(new Date(date+'T00:00').getDay());
  return false;
}

/* ============================================================
   TABS / NAVEGAÇÃO
   ============================================================ */
function switchPanel(panelId) {
  document.querySelectorAll('.tab, .bottom-nav button').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(x => x.classList.remove('active'));
  if (panelId !== 'settings') {
    document.querySelectorAll(`[data-panel="${panelId}"]`).forEach(x => x.classList.add('active'));
  }
  document.getElementById(panelId).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (panelId === 'dashboard')    renderDashboard();
  if (panelId === 'history')      renderHistory();
  if (panelId === 'settings')     { renderSettings(); renderNotifSettings(); }
  if (panelId === 'insights')     renderInsights();
  if (panelId === 'diet')         loadDiet();
  if (panelId === 'body')         renderBodyPanel();
  if (panelId === 'goals')        renderGoalsPanel();
  if (panelId === 'achievements') renderAchievements();
}
document.querySelectorAll('.tab, .bottom-nav button').forEach(t => {
  t.addEventListener('click', () => switchPanel(t.dataset.panel));
});

/* ============================================================
   ENTRADA DIÁRIA
   ============================================================ */
document.getElementById('entryDate').value = today();
document.getElementById('entryDate').addEventListener('change', () => { loadEntries(); });
document.getElementById('dietDate').value  = today();
document.getElementById('dietDate').addEventListener('change', loadDiet);

function describeFreq(h) {
  if (h.freq === 'daily')    return 'Diário';
  if (h.freq === 'weekdays') return h.days.map(d => weekdaysShort[d]).join(', ');
  if (h.freq === 'weekly')   return `${h.times}x na semana`;
  return '';
}
let expandedHabits = new Set();
let expandedMeals  = new Set();

function toggleHabitExpand(id) { if (expandedHabits.has(id)) expandedHabits.delete(id); else expandedHabits.add(id); loadEntries(); }
function toggleMealExpand(id)  { if (expandedMeals.has(id))  expandedMeals.delete(id);  else expandedMeals.add(id);  loadDiet(); }

function weeklyCount(habitId, date) {
  let c = 0;
  weekDates(weekStart(date)).forEach(d => { if (db.records[d]?.[habitId]?.status === 'done') c++; });
  return c;
}

function loadEntries() {
  const date = document.getElementById('entryDate').value;
  const rec  = db.records[date] || {};
  const list = document.getElementById('entryList');
  const wpDiv= document.getElementById('weeklyProgress');

  const tagsDiv = document.getElementById('dayTagsPicker');
  if (db.contextTags.length) {
    const dayTags = (rec.tags || []);
    tagsDiv.innerHTML = db.contextTags.map(t =>
      `<div class="chip selectable ${dayTags.includes(t)?'active':''}" onclick="toggleDayTag('${t.replace(/'/g,"\\'")}'">${t}</div>`
    ).join('');
    document.getElementById('dayTagsSection').style.display = 'block';
  } else { document.getElementById('dayTagsSection').style.display = 'none'; }

  if (!db.habits.length) { list.innerHTML = '<div class="empty">Cadastre hábitos em Configurações.</div>'; wpDiv.innerHTML = ''; return; }

  const weeklyHabits = db.habits.filter(h => h.freq === 'weekly');
  if (weeklyHabits.length) {
    wpDiv.innerHTML = '<div class="weekly-progress"><strong style="font-size:0.8125rem;color:var(--text-muted);">Progresso da semana</strong>' +
      weeklyHabits.map(h => {
        const done = weeklyCount(h.id, date);
        const pct  = Math.min(100, (done/h.times)*100);
        return `<div style="margin-top:8px;"><strong>${h.name}</strong>: ${done}/${h.times}<div class="bar"><div style="width:${pct}%"></div></div></div>`;
      }).join('') + '</div>';
  } else { wpDiv.innerHTML = ''; }

  const scheduled = db.habits.filter(h => isScheduled(h, date) || h.freq === 'weekly');
  const optional  = db.habits.filter(h => !scheduled.includes(h));

  const renderHabit = (h, isOpt) => {
    const r        = rec[h.id] || {};
    const isDone   = r.status === 'done';
    const collapsed= isDone && !expandedHabits.has(h.id);
    const cls      = isDone ? 'done' : r.status === 'fail' ? 'failed' : '';
    const optCls   = isOpt ? 'optional' : '';
    const clickExpand = isDone ? `onclick="toggleHabitExpand('${h.id}')"` : '';
    const fullUi = `
      <div class="habit-full">
        <div class="habit-head">
          <div class="habit-name">${h.name} <span class="freq-tag">${describeFreq(h)}</span> ${h.perMeal ? '<span class="meal-tag">refeição</span>' : ''} ${isOpt?'<span class="badge badge-skip">avulso</span>':''}</div>
          <div class="toggle-group" onclick="event.stopPropagation()">
            <button type="button" class="toggle-btn toggle-done ${r.status==='done'?'active-done':''}" onclick="setStatus('${h.id}','done')">Cumpri</button>
            <button type="button" class="toggle-btn toggle-fail ${r.status==='fail'?'active-fail':''}" onclick="setStatus('${h.id}','fail')">Errei</button>
            ${h.freq!=='weekly' ? `<button type="button" class="toggle-btn toggle-skip ${r.status==='skip'?'active-skip':''}" onclick="setStatus('${h.id}','skip')">Pular</button>`:''}
          </div>
        </div>
        <div class="reason-area" style="display:${r.status==='fail'?'block':'none'}">
          <div class="form-row">
            ${h.perMeal ? `<div><label>Refeição</label><select id="meal-${h.id}"><option value="">--</option>${db.meals.map(m=>`<option ${r.meal===m?'selected':''}>${m}</option>`).join('')}</select></div>`:''}
            <div><label>Motivo</label><select id="reason-${h.id}"><option value="">--</option>${db.reasons.map(rs=>`<option ${r.reason===rs?'selected':''}>${rs}</option>`).join('')}</select></div>
          </div>
          <div><label>Observação</label><input type="text" id="note-${h.id}" value="${r.note||''}" placeholder="Detalhes..." style="width:100%;"></div>
        </div>
      </div>`;
    const compactUi = `<div class="habit-compact"><div class="status-bar done"></div><div class="habit-name-compact">${h.name}</div></div>`;
    return `<div class="habit-entry ${cls} ${optCls} ${collapsed?'collapsed':''}" ${clickExpand}>${compactUi}${fullUi}</div>`;
  };

  let html = scheduled.filter(h => rec[h.id]?.status !== 'done').map(h => renderHabit(h, false)).join('');
  const optPending = optional.filter(h => rec[h.id]?.status && rec[h.id]?.status !== 'done');
  const optDone    = optional.filter(h => rec[h.id]?.status === 'done');
  if (optPending.length) { html += `<h3 style="margin-top:18px; color:#4a5568;">Avulsos</h3>`; html += optPending.map(h => renderHabit(h, true)).join(''); }
  const doneAll = [...scheduled.filter(h => rec[h.id]?.status === 'done'), ...optDone];
  if (doneAll.length) { html += `<div class="done-section-title">Concluídos (${doneAll.length})</div>`; html += doneAll.map(h => renderHabit(h, optDone.includes(h))).join(''); }
  const remaining = optional.filter(h => !rec[h.id]?.status);
  if (remaining.length) {
    html += `<details style="margin-top:14px;"><summary style="cursor:pointer; color:var(--accent); font-weight:500; padding:8px 0;">+ Registrar hábito avulso</summary>
      <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
        <select id="addOptHabit" style="flex:1; min-width:200px;">${remaining.map(h=>`<option value="${h.id}">${h.name}</option>`).join('')}</select>
        <button class="small" onclick="addOptional()">Adicionar</button>
      </div></details>`;
  }
  list.innerHTML = html;
  updateAlertBadge();
  loadMoodEnergy();
}

/* ============================================================
   HUMOR E ENERGIA
   ============================================================ */
function loadMoodEnergy() {
  const date = document.getElementById('entryDate').value;
  const rec  = db.records[date] || {};
  const mood   = rec.mood;
  const energy = rec.energy;
  document.querySelectorAll('#moodPicker .mood-btn').forEach(btn => {
    btn.classList.toggle('selected', parseInt(btn.dataset.value) === mood);
  });
  document.querySelectorAll('#energyPicker .mood-btn').forEach(btn => {
    btn.classList.toggle('selected', parseInt(btn.dataset.value) === energy);
  });
}
function setMood(value) {
  const date = document.getElementById('entryDate').value;
  if (!db.records[date]) db.records[date] = {};
  db.records[date].mood = db.records[date].mood === value ? null : value;
  loadMoodEnergy();
}
function setEnergy(value) {
  const date = document.getElementById('entryDate').value;
  if (!db.records[date]) db.records[date] = {};
  db.records[date].energy = db.records[date].energy === value ? null : value;
  loadMoodEnergy();
}

function toggleDayTag(tag) {
  const date = document.getElementById('entryDate').value;
  if (!db.records[date]) db.records[date] = {};
  if (!db.records[date].tags) db.records[date].tags = [];
  const i = db.records[date].tags.indexOf(tag);
  if (i >= 0) db.records[date].tags.splice(i, 1); else db.records[date].tags.push(tag);
  save(); loadEntries();
}
function addOptional() {
  const sel  = document.getElementById('addOptHabit'); if (!sel) return;
  const date = document.getElementById('entryDate').value;
  if (!db.records[date]) db.records[date] = {};
  if (!db.records[date][sel.value]) db.records[date][sel.value] = { status: 'done' };
  save(); loadEntries();
}
function setStatus(hid, st) {
  const date = document.getElementById('entryDate').value;
  if (!db.records[date]) db.records[date] = {};
  if (!db.records[date][hid]) db.records[date][hid] = {};
  if (db.records[date][hid].status === st) { db.records[date][hid].status = null; expandedHabits.delete(hid); }
  else { db.records[date][hid].status = st; if (st === 'done') expandedHabits.delete(hid); else expandedHabits.add(hid); }
  loadEntries();
}
function saveDay() {
  const date = document.getElementById('entryDate').value;
  if (!db.records[date]) db.records[date] = {};
  db.habits.forEach(h => {
    const r = db.records[date][h.id] || {};
    if (r.status === 'fail') {
      const reason = document.getElementById('reason-'+h.id);
      const meal   = document.getElementById('meal-'+h.id);
      const note   = document.getElementById('note-'+h.id);
      r.reason = reason ? reason.value : '';
      r.meal   = meal   ? meal.value   : '';
      r.note   = note   ? note.value   : '';
    }
    if (r.status) db.records[date][h.id] = r;
  });
  save(); showToast('Salvo'); updateAlertBadge();
}
function showToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = `position:fixed; bottom:90px; left:50%; transform:translateX(-50%); background:#1F2937; color:white; padding:10px 18px; border-radius:10px; z-index:200; font-weight:500; font-size:0.875rem; box-shadow:0 4px 12px rgba(0,0,0,0.12);`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1800);
}
function clearDay() {
  const date = document.getElementById('entryDate').value;
  if (confirm('Limpar registro de ' + date + '? (apenas hábitos)')) {
    if (db.records[date]) { const dietBackup = db.records[date].diet; db.records[date] = {}; if (dietBackup) db.records[date].diet = dietBackup; if (Object.keys(db.records[date]).length === 0) delete db.records[date]; }
    save(); loadEntries();
  }
}

/* ============================================================
   DIETA
   ============================================================ */
function loadDiet() {
  const date    = document.getElementById('dietDate').value;
  const rec     = db.records[date] || {};
  const dietRec = rec.diet || { meals: {}, overallNote: '' };
  const noplanCard    = document.getElementById('noDietPlanCard');
  const dietMealsDiv  = document.getElementById('dietMeals');
  const summaryDiv    = document.getElementById('dietSummary');

  if (!db.dietPlan.length) { noplanCard.style.display = 'block'; dietMealsDiv.innerHTML = ''; summaryDiv.innerHTML = ''; document.getElementById('dietOverallNote').value = ''; return; }
  noplanCard.style.display = 'none';
  document.getElementById('dietOverallNote').value = dietRec.overallNote || '';

  const score  = dietDayScore(date);
  const counts = dietDayCounts(date);
  if (score !== null) {
    let msg = score === 100 ? 'Dieta 100% cumprida' : score >= 80 ? 'Excelente cumprimento' : score >= 60 ? 'Bom dia, com ajustes possíveis' : score >= 40 ? 'Dieta parcialmente seguida' : 'Dia difícil — amanhã é outro dia';
    summaryDiv.innerHTML = `<div class="diet-summary"><div class="big-num">${score}%</div><div class="desc">${msg}</div><div class="breakdown"><div>${counts.full} integral</div><div>${counts.partial} parcial</div><div>${counts.no} não fez</div><div>${counts.skip} ignorou</div><div>${counts.pending} pendente</div></div></div>`;
  } else {
    summaryDiv.innerHTML = `<div class="diet-summary"><div class="desc">Marque suas refeições do dia para começar</div></div>`;
  }

  const renderMeal = (meal) => {
    const r            = dietRec.meals[meal.id] || {};
    const options      = getMealOptions(meal);
    const selectedOpt  = getMealRecordOption(meal, r);
    const activeFoods  = selectedOpt ? (selectedOpt.foods || []) : [];
    const isFull       = r.followed === 'full';
    const collapsed    = isFull && !expandedMeals.has(meal.id);
    const cls          = isFull ? 'full' : r.followed === 'partial' ? 'partial' : r.followed === 'no' ? 'no' : r.followed === 'skip' ? 'skip' : '';
    const checkedFoods = r.foods || {};
    const clickExpand  = isFull ? `onclick="toggleMealExpand('${meal.id}')"` : '';
    const optionPicker = options.length > 1 ? `<div class="menu-option-picker" onclick="event.stopPropagation()">${options.map(opt => `<button type="button" class="menu-option-chip ${selectedOpt && selectedOpt.id === opt.id ? 'active' : ''}" onclick="selectMealOption('${meal.id}','${opt.id}')">${opt.name}</button>`).join('')}</div>` : '';
    const foodsHtml = activeFoods.map((food, i) => { const isChecked = checkedFoods[i] === true; return `<div class="food-item"><div class="food-checkbox ${isChecked?'checked':''}" onclick="toggleFood('${meal.id}', ${i})">${isChecked?'✓':''}</div><div class="food-name">${food.name}</div><div class="food-amount">${food.amount}</div></div>`; }).join('');
    const compactUi = `<div class="meal-compact"><div class="status-bar full"></div><span style="font-size:1.2em;">${meal.emoji || '🍽️'}</span><div class="meal-name-compact">${meal.name}${selectedOpt && options.length > 1 ? ` · ${selectedOpt.name}` : ''}</div></div>`;
    const fullUi = `<div class="meal-full"><div class="meal-header"><div class="meal-title"><div class="meal-emoji">${meal.emoji || '🍽️'}</div><div class="meal-name-time"><div class="meal-name">${meal.name}</div>${meal.time ? `<div class="meal-time">${meal.time}</div>` : ''}</div></div></div>${optionPicker}${activeFoods.length ? `<div class="food-list"><div class="food-list-header">${selectedOpt ? selectedOpt.name : 'Cardápio'}</div>${foodsHtml}</div>` : ''}<div class="meal-toggles" onclick="event.stopPropagation()"><button type="button" class="toggle-btn toggle-done ${r.followed==='full'?'active-done':''}" onclick="setMealStatus('${meal.id}','full')">100% segui</button><button type="button" class="toggle-btn toggle-partial ${r.followed==='partial'?'active-partial':''}" onclick="setMealStatus('${meal.id}','partial')">Parcial</button><button type="button" class="toggle-btn toggle-fail ${r.followed==='no'?'active-fail':''}" onclick="setMealStatus('${meal.id}','no')">Não fiz</button><button type="button" class="toggle-btn toggle-skip ${r.followed==='skip'?'active-skip':''}" onclick="setMealStatus('${meal.id}','skip')">Pular</button></div><div class="meal-note-area" onclick="event.stopPropagation()"><label style="font-size:0.8125rem;">Observação desta refeição</label><textarea id="mealNote-${meal.id}" placeholder="Substituições, observações...">${r.note || ''}</textarea></div></div>`;
    return `<div class="meal-card ${cls} ${collapsed?'collapsed':''}" ${clickExpand}>${compactUi}${fullUi}</div>`;
  };

  const sorted       = [...db.dietPlan].sort((a,b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
  const pendingMeals = sorted.filter(m => dietRec.meals[m.id]?.followed !== 'full');
  const doneMeals    = sorted.filter(m => dietRec.meals[m.id]?.followed === 'full');
  let html = pendingMeals.map(renderMeal).join('');
  if (doneMeals.length) { html += `<div class="done-section-title">Concluídas (${doneMeals.length})</div>`; html += doneMeals.map(renderMeal).join(''); }
  dietMealsDiv.innerHTML = html;
}

function setMealStatus(mealId, status) {
  const date = document.getElementById('dietDate').value;
  if (!db.records[date]) db.records[date] = {};
  if (!db.records[date].diet) db.records[date].diet = { meals: {}, overallNote: '' };
  if (!db.records[date].diet.meals[mealId]) db.records[date].diet.meals[mealId] = {};
  if (db.records[date].diet.meals[mealId].followed === status) { db.records[date].diet.meals[mealId].followed = null; expandedMeals.delete(mealId); }
  else {
    db.records[date].diet.meals[mealId].followed = status;
    if (status === 'full') expandedMeals.delete(mealId); else expandedMeals.add(mealId);
    const meal = db.dietPlan.find(m => m.id === mealId);
    const rec  = db.records[date].diet.meals[mealId];
    const activeFoods = meal ? getMealActiveFoods(meal, rec) : [];
    if (meal && activeFoods.length) {
      const foods = {};
      if (status === 'full') { activeFoods.forEach((_, i) => foods[i] = true); }
      else if (status === 'no' || status === 'skip') { activeFoods.forEach((_, i) => foods[i] = false); }
      if (status !== 'partial') db.records[date].diet.meals[mealId].foods = foods;
    }
  }
  loadDiet();
}
function selectMealOption(mealId, optionId) {
  const date = document.getElementById('dietDate').value;
  if (!db.records[date]) db.records[date] = {};
  if (!db.records[date].diet) db.records[date].diet = { meals: {}, overallNote: '' };
  if (!db.records[date].diet.meals[mealId]) db.records[date].diet.meals[mealId] = {};
  db.records[date].diet.meals[mealId].optionId = optionId;
  db.records[date].diet.meals[mealId].foods    = {};
  loadDiet();
}
function toggleFood(mealId, foodIdx) {
  const date = document.getElementById('dietDate').value;
  if (!db.records[date]) db.records[date] = {};
  if (!db.records[date].diet) db.records[date].diet = { meals: {}, overallNote: '' };
  if (!db.records[date].diet.meals[mealId]) db.records[date].diet.meals[mealId] = {};
  if (!db.records[date].diet.meals[mealId].foods) db.records[date].diet.meals[mealId].foods = {};
  const cur = db.records[date].diet.meals[mealId].foods[foodIdx];
  db.records[date].diet.meals[mealId].foods[foodIdx] = !cur;
  const meal = db.dietPlan.find(m => m.id === mealId);
  const rec  = db.records[date].diet.meals[mealId];
  const activeFoods = meal ? getMealActiveFoods(meal, rec) : [];
  if (meal && activeFoods.length) {
    const checked = activeFoods.filter((_, i) => db.records[date].diet.meals[mealId].foods[i]).length;
    const total   = activeFoods.length;
    if (checked === total) db.records[date].diet.meals[mealId].followed = 'full';
    else if (checked === 0) { if (db.records[date].diet.meals[mealId].followed === 'full') db.records[date].diet.meals[mealId].followed = null; }
    else db.records[date].diet.meals[mealId].followed = 'partial';
  }
  loadDiet();
}
function saveDiet() {
  const date = document.getElementById('dietDate').value;
  if (!db.records[date]) db.records[date] = {};
  if (!db.records[date].diet) db.records[date].diet = { meals: {}, overallNote: '' };
  db.dietPlan.forEach(meal => { const noteEl = document.getElementById('mealNote-'+meal.id); if (noteEl) { if (!db.records[date].diet.meals[meal.id]) db.records[date].diet.meals[meal.id] = {}; db.records[date].diet.meals[meal.id].note = noteEl.value; } });
  db.records[date].diet.overallNote = document.getElementById('dietOverallNote').value;
  save(); showToast('Dieta salva');
}
function clearDiet() {
  const date = document.getElementById('dietDate').value;
  if (confirm('Limpar registro de dieta de ' + date + '?')) { if (db.records[date]) { delete db.records[date].diet; if (Object.keys(db.records[date]).length === 0) delete db.records[date]; } save(); loadDiet(); }
}
function dietDayScore(date) {
  const rec = db.records[date]?.diet; if (!rec || !rec.meals) return null;
  let sum = 0, count = 0;
  db.dietPlan.forEach(meal => { const r = rec.meals[meal.id]; if (!r || !r.followed || r.followed === 'skip') return; count++; if (r.followed === 'full') sum += 100; else if (r.followed === 'partial') sum += 50; });
  return count > 0 ? Math.round(sum/count) : null;
}
function dietDayCounts(date) {
  const rec = db.records[date]?.diet;
  const counts = { full:0, partial:0, no:0, skip:0, pending:0 };
  if (!rec || !rec.meals) { counts.pending = db.dietPlan.length; return counts; }
  db.dietPlan.forEach(meal => { const r = rec.meals[meal.id]; if (!r || !r.followed) counts.pending++; else counts[r.followed]++; });
  return counts;
}
function mealComplianceRate(mealId) {
  let sum = 0, count = 0;
  Object.values(db.records).forEach(rec => { const r = rec.diet?.meals?.[mealId]; if (!r || !r.followed || r.followed === 'skip') return; count++; if (r.followed === 'full') sum += 100; else if (r.followed === 'partial') sum += 50; });
  return count >= 2 ? { rate: sum/count, n: count } : null;
}

/* ============================================================
   CONFIGURAÇÕES
   ============================================================ */
function renderSettings() {
  document.getElementById('habitList').innerHTML = db.habits.map(h => `
    <div class="habit-card-cfg">
      <div class="info"><div class="nm">${h.name}${h.perMeal ? ' <span style="color:var(--text-subtle);font-weight:500;">· refeição</span>' : ''}</div><div class="freq">${describeFreq(h)}</div></div>
      <div style="display:flex; gap:6px;"><button class="small" onclick="editHabit('${h.id}')">✏️</button><button class="small danger" onclick="delHabit('${h.id}')">🗑️</button></div>
    </div>`).join('') || '<div class="empty">Nenhum hábito.</div>';

  const sortedPlan = [...db.dietPlan].sort((a,b) => (a.time||'99:99').localeCompare(b.time||'99:99'));
  document.getElementById('mealPlanList').innerHTML = sortedPlan.map(m => `
    <div class="meal-cfg-card">
      <div class="meal-cfg-header">
        <div style="display:flex; align-items:center; gap:8px; flex:1;"><span style="font-size:1.4em;">${m.emoji || '🍽️'}</span><div><div class="nm">${m.name}</div>${m.time ? `<div style="font-size:0.82em; color:#718096;">⏰ ${m.time}</div>` : ''}</div></div>
        <div style="display:flex; gap:6px;"><button class="small" onclick="editMealPlan('${m.id}')">✏️ Editar</button><button class="small danger" onclick="delMealPlan('${m.id}')">🗑️</button></div>
      </div>
      ${getMealOptions(m).map(opt => `<div style="margin-top:10px; padding-top:8px; border-top:1px dashed #e2e8f0;"><div style="font-size:0.8125rem; font-weight:600; color:var(--text-muted); margin-bottom:6px;">${opt.name}</div>${opt.foods && opt.foods.length ? opt.foods.map(f => `<div class="food-cfg-row"><span class="nm">${f.name}</span><span class="amt">${f.amount}</span></div>`).join('') : '<div style="font-size:0.82em; color:#a0aec0;">Sem alimentos</div>'}</div>`).join('')}
    </div>`).join('') || '<div class="empty">Nenhuma refeição cadastrada.</div>';

  document.getElementById('tagList').innerHTML    = db.contextTags.map((t,i) => `<div class="chip">${t}<button onclick="delTag(${i})">×</button></div>`).join('') || '<span style="color:#a0aec0;">Nenhuma tag.</span>';
  document.getElementById('reasonList').innerHTML = db.reasons.map((r,i) => `<div class="chip">${r}<button onclick="delReason(${i})">×</button></div>`).join('') || '<span style="color:#a0aec0;">Nenhum motivo.</span>';
  document.getElementById('mealList').innerHTML   = db.meals.map((m,i) => `<div class="chip">${m}<button onclick="delMeal(${i})">×</button></div>`).join('') || '<span style="color:#a0aec0;">Nenhuma refeição.</span>';
  document.getElementById('alertThreshold').value = db.alertConfig.threshold;
  document.getElementById('alertWindow').value    = db.alertConfig.window;
}
function saveAlertConfig() { db.alertConfig.threshold = parseFloat(document.getElementById('alertThreshold').value); db.alertConfig.window = parseInt(document.getElementById('alertWindow').value); save(); showToast('Salvo'); updateAlertBadge(); }

/* ===== Modal Hábito ===== */
function openHabitModal(habit) {
  document.getElementById('habitModal').classList.add('show');
  document.getElementById('habitModalTitle').textContent = habit ? 'Editar hábito' : 'Novo hábito';
  document.getElementById('habitId').value   = habit ? habit.id : '';
  document.getElementById('habitName').value = habit ? habit.name : '';
  document.getElementById('habitFreq').value = habit ? habit.freq : 'daily';
  document.getElementById('habitTimes').value= habit ? habit.times : 2;
  document.getElementById('habitMeal').checked = habit ? !!habit.perMeal : false;
  const wp = document.getElementById('weekdayPick');
  wp.innerHTML = weekdays.map((w,i) => `<label><input type="checkbox" value="${i}" ${habit && habit.days.includes(i)?'checked':''}> ${weekdaysShort[i]}</label>`).join('');
  onFreqChange();
}
function closeHabitModal() { document.getElementById('habitModal').classList.remove('show'); }
function onFreqChange()   { const f = document.getElementById('habitFreq').value; document.getElementById('weekdaysWrap').hidden = f !== 'weekdays'; document.getElementById('weeklyWrap').hidden = f !== 'weekly'; }
function saveHabit() {
  const id      = document.getElementById('habitId').value;
  const name    = document.getElementById('habitName').value.trim();
  if (!name) { alert('Informe o nome'); return; }
  const freq    = document.getElementById('habitFreq').value;
  const times   = parseInt(document.getElementById('habitTimes').value) || 1;
  const perMeal = document.getElementById('habitMeal').checked;
  const days    = Array.from(document.querySelectorAll('#weekdayPick input:checked')).map(c => parseInt(c.value));
  if (freq === 'weekdays' && !days.length) { alert('Selecione pelo menos um dia'); return; }
  const data = { name, freq, perMeal, days: freq === 'weekdays' ? days : (freq === 'daily' ? [0,1,2,3,4,5,6] : []), times: freq === 'weekly' ? times : (freq === 'daily' ? 7 : days.length) };
  if (id) Object.assign(db.habits.find(x => x.id === id), data); else db.habits.push({ id: uid(), ...data });
  save(); closeHabitModal(); renderSettings(); loadEntries();
}
function editHabit(id) { const h = db.habits.find(x => x.id === id); if (h) openHabitModal(h); }
function delHabit(id)  { if (confirm('Remover hábito?')) { db.habits = db.habits.filter(h => h.id !== id); save(); renderSettings(); loadEntries(); } }

/* ===== Modal Refeição ===== */
let editingMealOptions = [];
function openMealModal(meal) {
  document.getElementById('mealModal').classList.add('show');
  document.getElementById('mealModalTitle').textContent = meal ? 'Editar refeição' : 'Nova refeição';
  document.getElementById('mealPlanId').value    = meal ? meal.id : '';
  document.getElementById('mealPlanName').value  = meal ? meal.name : '';
  document.getElementById('mealPlanTime').value  = meal ? (meal.time || '') : '';
  document.getElementById('mealPlanEmoji').value = meal ? (meal.emoji || '') : '';
  editingMealOptions = meal ? JSON.parse(JSON.stringify(getMealOptions(meal))) : [{ id: uid(), name: 'Opção 1', foods: [] }];
  renderMealOptionsEditor();
}
function closeMealModal() { document.getElementById('mealModal').classList.remove('show'); editingMealOptions = []; }
function renderMealOptionsEditor() {
  const div = document.getElementById('mealOptionsList');
  if (!editingMealOptions.length) { div.innerHTML = '<div style="font-size:0.85em; color:#a0aec0; padding:8px;">Adicione pelo menos uma opção</div>'; return; }
  div.innerHTML = editingMealOptions.map((opt, oi) => `
    <div class="menu-option-card">
      <div class="menu-option-head">
        <input type="text" value="${opt.name.replace(/"/g,'&quot;')}" placeholder="Nome da opção" onchange="updateMealOptionName(${oi}, this.value)" style="flex:1;">
        ${editingMealOptions.length > 1 ? `<button type="button" class="small danger" onclick="removeMealOption(${oi})">Remover</button>` : ''}
      </div>
      ${(opt.foods || []).map((f, fi) => `<div class="food-cfg-row"><input type="text" value="${f.name.replace(/"/g,'&quot;')}" onchange="updateOptionFood(${oi},${fi},'name',this.value)" style="flex:1; font-size:0.9em; padding:6px 10px;"><input type="text" value="${(f.amount||'').replace(/"/g,'&quot;')}" onchange="updateOptionFood(${oi},${fi},'amount',this.value)" style="max-width:120px; font-size:0.9em; padding:6px 10px;"><button type="button" class="small danger" onclick="removeOptionFood(${oi},${fi})">×</button></div>`).join('') || '<div style="font-size:0.82em; color:#a0aec0; margin-bottom:8px;">Nenhum alimento</div>'}
      <div class="form-row" style="margin-top:8px;">
        <input type="text" id="newFoodName-${oi}" placeholder="Alimento">
        <input type="text" id="newFoodAmount-${oi}" placeholder="Qtd" style="max-width:100px;">
        <button type="button" onclick="addFoodToOption(${oi})" style="flex:0; min-width:50px;">+</button>
      </div>
    </div>`).join('');
}
function updateMealOptionName(oi, value) { editingMealOptions[oi].name = value; }
function addMealOption() { editingMealOptions.push({ id: uid(), name: `Opção ${editingMealOptions.length + 1}`, foods: [] }); renderMealOptionsEditor(); }
function removeMealOption(oi) { if (editingMealOptions.length <= 1) { alert('Mantenha pelo menos uma opção'); return; } editingMealOptions.splice(oi, 1); renderMealOptionsEditor(); }
function updateOptionFood(oi, fi, field, value) { editingMealOptions[oi].foods[fi][field] = value; }
function removeOptionFood(oi, fi) { editingMealOptions[oi].foods.splice(fi, 1); renderMealOptionsEditor(); }
function addFoodToOption(oi) {
  const name   = document.getElementById(`newFoodName-${oi}`)?.value.trim();
  const amount = document.getElementById(`newFoodAmount-${oi}`)?.value.trim();
  if (!name) { alert('Informe o nome do alimento'); return; }
  if (!editingMealOptions[oi].foods) editingMealOptions[oi].foods = [];
  editingMealOptions[oi].foods.push({ name, amount: amount || 'à vontade' });
  renderMealOptionsEditor();
}
function saveMealPlan() {
  const id   = document.getElementById('mealPlanId').value;
  const name = document.getElementById('mealPlanName').value.trim();
  if (!name) { alert('Informe o nome'); return; }
  const options = editingMealOptions.map(opt => ({ id: opt.id || uid(), name: (opt.name || '').trim() || 'Opção', foods: (opt.foods || []).filter(f => f.name && f.name.trim()) })).filter(opt => opt.name);
  if (!options.length) { alert('Adicione pelo menos uma opção'); return; }
  const data = { name, time: document.getElementById('mealPlanTime').value, emoji: document.getElementById('mealPlanEmoji').value.trim() || '🍽️', options };
  if (id) { const m = db.dietPlan.find(x => x.id === id); Object.assign(m, data); delete m.foods; } else { db.dietPlan.push({ id: uid(), ...data }); }
  normalizeDietPlan(); save(); closeMealModal(); renderSettings(); loadDiet(); showToast('Refeição salva');
}
function editMealPlan(id) { const m = db.dietPlan.find(x => x.id === id); if (m) openMealModal(m); }
function delMealPlan(id)  { if (confirm('Remover esta refeição do plano?')) { db.dietPlan = db.dietPlan.filter(m => m.id !== id); save(); renderSettings(); loadDiet(); } }

function addTag()    { const v = document.getElementById('newTag').value.trim();    if (v && !db.contextTags.includes(v)) { db.contextTags.push(v); save(); renderSettings(); } document.getElementById('newTag').value = ''; }
function delTag(i)   { db.contextTags.splice(i,1); save(); renderSettings(); }
function addReason() { const v = document.getElementById('newReason').value.trim(); if (v && !db.reasons.includes(v))     { db.reasons.push(v);     save(); renderSettings(); } document.getElementById('newReason').value = ''; }
function delReason(i){ db.reasons.splice(i,1);      save(); renderSettings(); }
function addMeal()   { const v = document.getElementById('newMeal').value.trim();   if (v && !db.meals.includes(v))       { db.meals.push(v);       save(); renderSettings(); } document.getElementById('newMeal').value = ''; }
function delMeal(i)  { db.meals.splice(i,1);         save(); renderSettings(); }

/* ============================================================
   NOTIFICAÇÕES — UI INTEGRADA
   ============================================================ */
async function renderNotifSettings() {
  const statusEl   = document.getElementById('notifStatus');
  const statusText = document.getElementById('notifStatusText');
  const enableWrap = document.getElementById('notifEnableWrap');
  const remList    = document.getElementById('notifRemindersList');
  const quickWrap  = document.getElementById('notifQuickWrap');
  const perm = Notifications.getPermissionStatus();

  if (perm === 'unsupported') {
    statusEl.className = 'notif-status denied';
    statusText.textContent = 'Seu navegador não suporta notificações.';
    enableWrap.style.display = 'none'; return;
  }
  if (perm === 'denied') {
    statusEl.className = 'notif-status denied';
    statusText.textContent = 'Permissão bloqueada. Reative nas configurações do navegador (🔒 na barra de endereço).';
    enableWrap.style.display = 'none'; return;
  }
  if (perm === 'granted') {
    statusEl.className = 'notif-status active';
    statusText.textContent = 'Notificações ativadas ✓';
    document.getElementById('btnEnableNotif').style.display = 'none';
    remList.style.display   = 'block';
    quickWrap.style.display = 'block';
    renderRemindersList();
    return;
  }
  statusEl.className = 'notif-status';
  statusText.textContent = 'Permissão ainda não concedida.';
  enableWrap.style.display = 'block';
  remList.style.display    = 'none';
  quickWrap.style.display  = 'none';
}

function renderRemindersList() {
  const cfg   = Notifications.loadConfig();
  const items = document.getElementById('notifRemindersItems');

  const rows = cfg.reminders.map((r, idx) => {
    const typeLabel = r.time != null ? 'Horário fixo' : 'Intervalo';
    const typeControl = r.time != null
      ? `<input type="time" value="${r.time}"
           style="padding:4px 8px; font-size:0.85rem; min-height:32px; width:110px;"
           onchange="updateReminderField(${idx}, 'time', this.value)">`
      : `<div style="display:flex; align-items:center; gap:4px;">
           <input type="number" value="${r.interval}" min="5" max="480"
             style="padding:4px 8px; font-size:0.85rem; min-height:32px; width:74px;"
             onchange="updateReminderField(${idx}, 'interval', parseInt(this.value))">
           <span style="font-size:0.8rem; color:var(--text-muted);">min</span>
         </div>`;

    return `
      <div style="background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); padding:12px; margin-bottom:8px;">

        <!-- linha 1: nome + ativo + excluir -->
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
          <input type="text" value="${r.label.replace(/"/g,'&quot;')}"
            style="flex:1; min-width:140px; padding:6px 10px; font-size:0.875rem; min-height:34px; font-weight:500;"
            onchange="updateReminderField(${idx}, 'label', this.value)"
            placeholder="Nome do lembrete">
          <label style="display:flex; align-items:center; gap:5px; cursor:pointer; font-weight:normal; font-size:0.875rem; white-space:nowrap;">
            <input type="checkbox" ${r.active ? 'checked' : ''} style="width:auto; padding:0;"
              onchange="updateReminderField(${idx}, 'active', this.checked)">
            Ativo
          </label>
          <button class="small danger" onclick="deleteReminder(${idx})" title="Excluir lembrete"
            style="padding:4px 8px; min-height:32px; min-width:32px;">🗑️</button>
        </div>

        <!-- linha 2: mensagem -->
        <div style="margin-bottom:10px;">
          <label style="font-size:0.75rem; color:var(--text-muted); margin-bottom:4px;">Mensagem</label>
          <input type="text" value="${r.message.replace(/"/g,'&quot;')}"
            style="width:100%; padding:6px 10px; font-size:0.85rem; min-height:34px;"
            onchange="updateReminderField(${idx}, 'message', this.value)"
            placeholder="Texto da notificação">
        </div>

        <!-- linha 3: tipo + horário/intervalo -->
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:6px;">
            <label style="font-size:0.75rem; color:var(--text-muted); margin:0;">Tipo</label>
            <select style="padding:4px 8px; font-size:0.85rem; min-height:32px;"
              onchange="changeReminderType(${idx}, this.value)">
              <option value="time"     ${r.time != null ? 'selected' : ''}>Horário fixo</option>
              <option value="interval" ${r.time == null ? 'selected' : ''}>Intervalo</option>
            </select>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <label style="font-size:0.75rem; color:var(--text-muted); margin:0;">${typeLabel}</label>
            ${typeControl}
          </div>
        </div>

      </div>`;
  }).join('');

  items.innerHTML = rows + `
    <button onclick="addReminder()" class="ghost"
      style="width:100%; margin-top:4px; font-size:0.875rem;">
      + Novo lembrete
    </button>`;
}

/* ===== CRUD de lembretes ===== */
function updateReminderField(idx, field, value) {
  const cfg = Notifications.loadConfig();
  if (!cfg.reminders[idx]) return;
  cfg.reminders[idx][field] = value;
  Notifications.saveConfig(cfg);
  /* Re-renderiza só se mudou tipo ou ativo (os inputs de texto atualizam inline) */
  if (field === 'active') return; // checkbox já reflete sozinho
}

function changeReminderType(idx, type) {
  const cfg = Notifications.loadConfig();
  const r   = cfg.reminders[idx];
  if (!r) return;
  if (type === 'time') {
    r.time     = '08:00';
    delete r.interval;
  } else {
    r.interval = 60;
    r.time     = null;
  }
  Notifications.saveConfig(cfg);
  renderRemindersList();
}

function deleteReminder(idx) {
  const cfg = Notifications.loadConfig();
  if (!confirm(`Excluir lembrete "${cfg.reminders[idx]?.label}"?`)) return;
  cfg.reminders.splice(idx, 1);
  Notifications.saveConfig(cfg);
  Notifications.applyConfig(cfg);
  renderRemindersList();
}

function addReminder() {
  const cfg = Notifications.loadConfig();
  cfg.reminders.push({
    id:      'custom_' + Date.now(),
    label:   'Novo lembrete',
    time:    '09:00',
    active:  false,
    message: '🏋️ Lembrete do My Fit Era!'
  });
  Notifications.saveConfig(cfg);
  renderRemindersList();
  /* Rola até o novo item */
  setTimeout(() => {
    const items = document.getElementById('notifRemindersItems');
    if (items) items.lastElementChild?.previousElementSibling?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 80);
}

async function enableNotifications() {
  const result = await Notifications.requestPermission();
  if (result.status === 'granted') {
    showToast('Notificações ativadas!');
    await Notifications.init();
    renderNotifSettings();
  } else if (result.status === 'denied') {
    showToast('Permissão negada — verifique as configurações do navegador.');
  }
}

function saveNotifConfig() {
  const cfg = Notifications.loadConfig();
  cfg.enabled = true;
  Notifications.saveConfig(cfg);
  Notifications.applyConfig(cfg);
  showToast('Lembretes salvos e aplicados!');
}

function testNotification() {
  Notifications.sendNotification('🏋️ My Fit Era', 'Teste funcionando! Suas notificações estão ativas.', { tag: 'test' });
  showToast('Notificação enviada!');
}

function sendQuickReminder() {
  const msg     = document.getElementById('notifQuickMsg').value.trim() || 'Lembrete do My Fit Era!';
  const minutes = parseInt(document.getElementById('notifQuickMin').value) || 30;
  Notifications.sendIn(minutes * 60, '🏋️ My Fit Era', msg);
  const fb = document.getElementById('notifQuickFeedback');
  fb.textContent = `✓ Lembrete agendado para daqui ${minutes} minuto${minutes > 1 ? 's' : ''}.`;
  setTimeout(() => { fb.textContent = ''; }, 4000);
}

/* ============================================================
   METAS
   ============================================================ */
function renderGoalsPanel() {
  renderGoalsList();
  renderGoalsProgress('week');
  renderGoalsProgress('month');
}

function renderGoalsList() {
  const div = document.getElementById('goalsList');
  const items = [
    ...db.habits.map(h => ({ id: h.id, name: h.name, type: 'habit' })),
    { id: 'diet', name: 'Dieta (cumprimento geral)', type: 'diet' }
  ];
  div.innerHTML = items.map(item => {
    const goal = db.goals[item.id] ?? 80;
    return `<div class="goal-row">
      <div class="goal-name">${item.name}</div>
      <div class="goal-input-wrap">
        <input type="number" min="10" max="100" step="5" value="${goal}"
          id="goal-input-${item.id}"
          style="width:70px; padding:6px 10px; text-align:center; font-size:0.9rem; min-height:34px;">
        <span style="font-size:0.875rem; color:var(--text-muted);">% meta</span>
      </div>
    </div>`;
  }).join('');
}

function saveGoals() {
  const items = [
    ...db.habits.map(h => h.id),
    'diet'
  ];
  items.forEach(id => {
    const el = document.getElementById('goal-input-' + id);
    if (el) db.goals[id] = Math.max(10, Math.min(100, parseInt(el.value) || 80));
  });
  save();
  showToast('Metas salvas!');
  renderGoalsProgress('week');
  renderGoalsProgress('month');
}

function renderGoalsProgress(period) {
  const divId = period === 'week' ? 'goalsWeekProgress' : 'goalsMonthProgress';
  const div = document.getElementById(divId);
  const now = new Date();

  /* Datas do período */
  let dates = [];
  if (period === 'week') {
    const mon = weekStart(today());
    dates = weekDates(mon);
  } else {
    const y = now.getFullYear(), m = now.getMonth();
    let d = new Date(y, m, 1);
    while (d.getMonth() === m) {
      dates.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }
  }

  const items = [
    ...db.habits.map(h => ({ id: h.id, name: h.name, type: 'habit' })),
    { id: 'diet', name: '🥗 Dieta', type: 'diet' }
  ];

  const rows = items.map(item => {
    const goal = db.goals[item.id] ?? 80;
    let actual = 0;

    if (item.type === 'diet') {
      const ds = dates.map(d => dietDayScore(d)).filter(s => s !== null);
      actual = ds.length ? Math.round(ds.reduce((a, b) => a + b, 0) / ds.length) : 0;
    } else {
      const rate = habitSuccessRate(item.id, dates);
      actual = rate ? Math.round(rate.rate * 100) : 0;
    }

    const pct   = Math.min(100, Math.round((actual / goal) * 100));
    const color = actual >= goal ? 'var(--success)' : actual >= goal * 0.7 ? 'var(--warning)' : 'var(--danger)';
    const badge = actual >= goal
      ? `<span style="color:var(--success); font-size:0.8rem;">✓ Meta atingida</span>`
      : `<span style="color:var(--text-muted); font-size:0.8rem;">${actual}% de ${goal}%</span>`;

    return `<div class="goal-progress-row">
      <div class="goal-progress-name">
        <span>${item.name}</span>
        ${badge}
      </div>
      <div class="goal-bar-outer">
        <div class="goal-bar-inner" style="width:${pct}%; background:${color};"></div>
      </div>
    </div>`;
  }).join('');

  div.innerHTML = rows || '<div class="empty">Defina metas primeiro.</div>';
}

/* ============================================================
   CONQUISTAS
   ============================================================ */
function defineAchievements() {
  const allDates   = Object.keys(db.records).sort();
  const totalDays  = allDates.length;
  const scores     = allDates.map(d => dayScore(d)).filter(s => s !== null);
  const avg        = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const dietScores = allDates.map(d => dietDayScore(d)).filter(s => s !== null);
  const dietAvg    = dietScores.length ? dietScores.reduce((a, b) => a + b, 0) / dietScores.length : 0;

  /* Streak atual de 100% */
  let streak100 = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const s = dayScore(d.toISOString().slice(0, 10));
    if (s === null) { if (i === 0) continue; else break; }
    if (s === 100) streak100++; else break;
  }

  /* Streak diário de qualquer registro */
  let streakAny = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    if (db.records[d.toISOString().slice(0, 10)]) streakAny++;
    else break;
  }

  /* Streak de dieta >= 80% */
  let dietStreak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const s = dietDayScore(d.toISOString().slice(0, 10));
    if (s === null) { if (i === 0) continue; else break; }
    if (s >= 80) dietStreak++; else break;
  }

  /* Total de dias com 100% */
  const perfect = scores.filter(s => s === 100).length;

  /* Total de erros */
  let totalFails = 0;
  Object.values(db.records).forEach(r => Object.entries(r).forEach(([k, x]) => {
    if (k !== 'tags' && k !== 'diet' && k !== 'mood' && k !== 'energy' && x.status === 'fail') totalFails++;
  }));

  return [
    /* Primeiros passos */
    { id: 'first_day',      icon: '🌱', title: 'Primeiro passo',       desc: 'Registrou o primeiro dia.',                      unlocked: totalDays >= 1,    progress: Math.min(1, totalDays),                   target: 1   },
    { id: 'one_week',       icon: '📅', title: 'Uma semana',            desc: '7 dias registrados.',                            unlocked: totalDays >= 7,    progress: Math.min(7, totalDays),                   target: 7   },
    { id: 'one_month',      icon: '📆', title: 'Um mês consistente',    desc: '30 dias registrados.',                           unlocked: totalDays >= 30,   progress: Math.min(30, totalDays),                  target: 30  },
    { id: 'three_months',   icon: '🗓️', title: 'Trimestre de ferro',    desc: '90 dias registrados.',                           unlocked: totalDays >= 90,   progress: Math.min(90, totalDays),                  target: 90  },
    /* Streak perfeito */
    { id: 'streak3',        icon: '🔥', title: 'Fogo aceso',            desc: '3 dias consecutivos com 100%.',                  unlocked: streak100 >= 3,    progress: Math.min(3, streak100),                   target: 3   },
    { id: 'streak7',        icon: '⚡', title: 'Semana impecável',       desc: '7 dias consecutivos com 100%.',                  unlocked: streak100 >= 7,    progress: Math.min(7, streak100),                   target: 7   },
    { id: 'streak30',       icon: '🏆', title: 'Mês lendário',          desc: '30 dias consecutivos com 100%.',                 unlocked: streak100 >= 30,   progress: Math.min(30, streak100),                  target: 30  },
    /* Dias perfeitos acumulados */
    { id: 'perfect10',      icon: '⭐', title: 'Colecionador de estrelas', desc: '10 dias com 100% no total.',                  unlocked: perfect >= 10,     progress: Math.min(10, perfect),                    target: 10  },
    { id: 'perfect50',      icon: '🌟', title: 'Estrela dourada',        desc: '50 dias com 100% no total.',                    unlocked: perfect >= 50,     progress: Math.min(50, perfect),                    target: 50  },
    /* Média geral */
    { id: 'avg70',          icon: '📈', title: 'Acima da média',         desc: 'Média geral de hábitos acima de 70%.',           unlocked: avg >= 70,         progress: Math.min(70, Math.round(avg)),             target: 70  },
    { id: 'avg90',          icon: '🎯', title: 'Alta performance',       desc: 'Média geral de hábitos acima de 90%.',           unlocked: avg >= 90,         progress: Math.min(90, Math.round(avg)),             target: 90  },
    /* Dieta */
    { id: 'diet_start',     icon: '🥗', title: 'Adepto da dieta',        desc: '7 dias de dieta registrados.',                   unlocked: dietScores.length >= 7,  progress: Math.min(7, dietScores.length),      target: 7   },
    { id: 'diet_streak7',   icon: '🥦', title: 'Semana verde',           desc: '7 dias consecutivos com dieta ≥ 80%.',           unlocked: dietStreak >= 7,   progress: Math.min(7, dietStreak),                  target: 7   },
    { id: 'diet_avg80',     icon: '🏅', title: 'Nutricional',            desc: 'Média de dieta acima de 80%.',                   unlocked: dietAvg >= 80,     progress: Math.min(80, Math.round(dietAvg)),         target: 80  },
    /* Humor e energia */
    { id: 'mood_tracked',   icon: '😊', title: 'Autoconhecimento',       desc: 'Registrou humor ou energia por 7 dias.',         unlocked: allDates.filter(d => db.records[d]?.mood || db.records[d]?.energy).length >= 7,
                                                                                                                                  progress: Math.min(7, allDates.filter(d => db.records[d]?.mood || db.records[d]?.energy).length), target: 7 },
    /* Sem erros */
    { id: 'no_fails_week',  icon: '🛡️', title: 'Semana blindada',        desc: '7 dias sem nenhum erro registrado.',             unlocked: (() => { let c=0; for(let i=0;i<7;i++){const d=new Date();d.setDate(d.getDate()-i);const rec=db.records[d.toISOString().slice(0,10)];if(!rec)return false;if(Object.entries(rec).some(([k,x])=>k!=='tags'&&k!=='diet'&&k!=='mood'&&k!=='energy'&&x.status==='fail'))return false;c++;}return c>=7;})(), progress: 0, target: 1 },
  ];
}

function renderAchievements() {
  if (!db.unlockedAchievements) db.unlockedAchievements = {};
  const all  = defineAchievements();
  const now  = new Date().toLocaleDateString('pt-BR');

  /* Desbloquear novas conquistas e registrar data */
  all.forEach(a => {
    if (a.unlocked && !db.unlockedAchievements[a.id]) {
      db.unlockedAchievements[a.id] = new Date().toISOString().slice(0, 10);
      save();
    }
  });

  const unlocked = all.filter(a => a.unlocked);
  const locked   = all.filter(a => !a.unlocked);

  document.getElementById('achievementCount').textContent = `${unlocked.length}/${all.length}`;

  const renderCard = (a, isLocked) => {
    const dateStr = db.unlockedAchievements[a.id]
      ? new Date(db.unlockedAchievements[a.id] + 'T00:00').toLocaleDateString('pt-BR')
      : null;
    const progressBar = isLocked && a.target > 1
      ? `<div class="achievement-progress"><div class="achievement-progress-bar" style="width:${Math.round((a.progress/a.target)*100)}%"></div></div>
         <div style="font-size:0.72rem; color:var(--text-subtle); margin-top:3px;">${a.progress}/${a.target}</div>`
      : '';
    return `<div class="achievement-card ${isLocked ? 'locked' : 'unlocked'}">
      <div class="achievement-icon">${a.icon}</div>
      <div class="achievement-info">
        <div class="achievement-title">${a.title}</div>
        <div class="achievement-desc">${a.desc}</div>
        ${dateStr ? `<div class="achievement-date">Desbloqueada em ${dateStr}</div>` : ''}
        ${progressBar}
      </div>
    </div>`;
  };

  const listEl = document.getElementById('achievementsList');
  const nextEl = document.getElementById('achievementsNext');

  listEl.innerHTML = unlocked.length
    ? `<div class="achievement-grid">${unlocked.map(a => renderCard(a, false)).join('')}</div>`
    : '<div class="empty">Nenhuma conquista ainda — continue registrando!</div>';

  nextEl.innerHTML = locked.length
    ? `<div class="achievement-grid">${locked.slice(0, 6).map(a => renderCard(a, true)).join('')}</div>`
    : '<div class="empty" style="color:var(--success);">🎉 Todas as conquistas desbloqueadas!</div>';
}

/* ============================================================
   EXPORTAR RESUMO
   ============================================================ */
function exportSummaryText() {
  const period = document.getElementById('exportPeriod').value;
  const now    = new Date();
  let dates    = [];

  if (period === 'week') {
    for (let i = 6; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); dates.push(d.toISOString().slice(0, 10)); }
  } else if (period === 'month') {
    for (let i = 29; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); dates.push(d.toISOString().slice(0, 10)); }
  } else {
    for (let i = 89; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); dates.push(d.toISOString().slice(0, 10)); }
  }

  const periodLabel = period === 'week' ? 'última semana' : period === 'month' ? 'último mês' : 'últimos 3 meses';
  const scores      = dates.map(d => dayScore(d)).filter(s => s !== null);
  const dietScores  = dates.map(d => dietDayScore(d)).filter(s => s !== null);
  const avg         = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const dietAvg     = dietScores.length ? Math.round(dietScores.reduce((a, b) => a + b, 0) / dietScores.length) : null;

  /* Streak atual */
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const s = dayScore(d.toISOString().slice(0, 10));
    if (s === null) { if (i === 0) continue; else break; }
    if (s === 100) streak++; else break;
  }

  /* Por hábito */
  const habitLines = db.habits.map(h => {
    const rate = habitSuccessRate(h.id, dates);
    return rate ? `  • ${h.name}: ${Math.round(rate.rate * 100)}% (${rate.done}/${rate.n} dias)` : `  • ${h.name}: sem dados`;
  }).join('\n');

  /* Por refeição */
  const dietLines = db.dietPlan.map(m => {
    const r = mealComplianceRate(m.id);
    return r ? `  • ${m.name}: ${Math.round(r.rate)}%` : null;
  }).filter(Boolean).join('\n');

  /* Humor e energia médios */
  const moodVals   = dates.map(d => db.records[d]?.mood).filter(Boolean);
  const energyVals = dates.map(d => db.records[d]?.energy).filter(Boolean);
  const moodAvg    = moodVals.length ? (moodVals.reduce((a, b) => a + b, 0) / moodVals.length).toFixed(1) : null;
  const energyAvg  = energyVals.length ? (energyVals.reduce((a, b) => a + b, 0) / energyVals.length).toFixed(1) : null;
  const moodEmojis = ['', '😔', '😕', '😐', '🙂', '😄'];
  const energyEmojis = ['', '🪫', '😴', '⚡', '🔋', '🚀'];

  /* Conquistas desbloqueadas no período */
  const newAchievements = Object.entries(db.unlockedAchievements)
    .filter(([, date]) => dates.includes(date))
    .map(([id]) => defineAchievements().find(a => a.id === id))
    .filter(Boolean)
    .map(a => `  ${a.icon} ${a.title}`)
    .join('\n');

  const lines = [
    `📊 RELATÓRIO MY FIT ERA — ${periodLabel.toUpperCase()}`,
    `Gerado em: ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
    `Período: ${fmtDate(dates[0])} a ${fmtDate(dates[dates.length - 1])}`,
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '📌 RESUMO GERAL',
    `  Dias registrados: ${scores.length}`,
    avg !== null ? `  Cumprimento de hábitos: ${avg}%` : '  Cumprimento de hábitos: sem dados',
    dietAvg !== null ? `  Cumprimento de dieta: ${dietAvg}%` : '  Cumprimento de dieta: sem dados',
    streak > 0 ? `  Sequência atual (100%): ${streak} dias` : '',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '🎯 HÁBITOS',
    habitLines || '  Nenhum hábito cadastrado.',
    '',
  ];

  if (db.dietPlan.length && dietLines) {
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('🥗 DIETA POR REFEIÇÃO');
    lines.push(dietLines);
    lines.push('');
  }

  if (moodAvg || energyAvg) {
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('😊 BEM-ESTAR');
    if (moodAvg)   lines.push(`  Humor médio: ${moodAvg}/5 ${moodEmojis[Math.round(parseFloat(moodAvg))] || ''}`);
    if (energyAvg) lines.push(`  Energia média: ${energyAvg}/5 ${energyEmojis[Math.round(parseFloat(energyAvg))] || ''}`);
    lines.push('');
  }

  if (newAchievements) {
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('🏆 CONQUISTAS DO PERÍODO');
    lines.push(newAchievements);
    lines.push('');
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('Gerado pelo My Fit Era');

  const text = lines.filter(l => l !== null).join('\n');

  /* Mostrar preview */
  const preview = document.getElementById('exportPreview');
  preview.style.display = 'block';
  preview.textContent = text;

  /* Copiar para área de transferência */
  navigator.clipboard.writeText(text).then(() => {
    showToast('Resumo copiado!');
  }).catch(() => {
    showToast('Selecione o texto acima e copie manualmente.');
  });
}

/* ============================================================
   DASHBOARD
   ============================================================ */
let charts = {};
function dayScore(date) {
  const rec = db.records[date]; if (!rec) return null;
  let done = 0, total = 0;
  db.habits.forEach(h => {
    if (h.freq === 'weekly') return;
    if (!isScheduled(h, date)) { const s = rec[h.id]?.status; if (s === 'done') { done++; total++; } else if (s === 'fail') { total++; } return; }
    const s = rec[h.id]?.status; if (s === 'skip') return; total++; if (s === 'done') done++;
  });
  return total ? Math.round((done/total)*100) : null;
}

function renderDashboard() {
  const tScore = dayScore(today());
  document.getElementById('sToday').textContent = tScore === null ? '-' : tScore + '%';
  let streak = 0;
  for (let i = 0; i < 365; i++) { const d = new Date(); d.setDate(d.getDate() - i); const s = dayScore(d.toISOString().slice(0,10)); if (s === null) { if (i===0) continue; else break; } if (s === 100) streak++; else break; }
  document.getElementById('sStreak').textContent = streak;
  const dates  = Object.keys(db.records).sort();
  const scores = dates.map(d => ({ d, s: dayScore(d) })).filter(x => x.s !== null);
  const avg    = scores.length ? Math.round(scores.reduce((a,b) => a+b.s, 0) / scores.length) : 0;
  document.getElementById('sAvg').textContent = avg + '%';
  let totalFails = 0;
  Object.values(db.records).forEach(r => Object.entries(r).forEach(([k,x]) => { if (k!=='tags' && k!=='diet' && x.status==='fail') totalFails++; }));
  document.getElementById('sFails').textContent = totalFails;
  if (scores.length) {
    const best  = scores.reduce((a,b) => a.s > b.s ? a : b);
    const worst = scores.reduce((a,b) => a.s < b.s ? a : b);
    document.getElementById('sBest').textContent  = `${best.s}% (${fmtDate(best.d)})`;
    document.getElementById('sWorst').textContent = `${worst.s}% (${fmtDate(worst.d)})`;
  } else { document.getElementById('sBest').textContent = '-'; document.getElementById('sWorst').textContent = '-'; }

  const dietToday  = dietDayScore(today());
  document.getElementById('sDietToday').textContent = dietToday === null ? '-' : dietToday + '%';
  const dietScores = dates.map(d => dietDayScore(d)).filter(s => s !== null);
  const dietAvg    = dietScores.length ? Math.round(dietScores.reduce((a,b) => a+b, 0) / dietScores.length) : 0;
  document.getElementById('sDietAvg').textContent = dietScores.length ? dietAvg + '%' : '-';
  let dStreak = 0;
  for (let i = 0; i < 365; i++) { const d = new Date(); d.setDate(d.getDate() - i); const s = dietDayScore(d.toISOString().slice(0,10)); if (s === null) { if (i===0) continue; else break; } if (s >= 80) dStreak++; else break; }
  document.getElementById('sDietStreak').textContent = dStreak;
  if (db.dietPlan.length) {
    const mealRates = db.dietPlan.map(m => ({ name: m.name, rate: mealComplianceRate(m.id) })).filter(x => x.rate);
    if (mealRates.length) { const best = mealRates.sort((a,b) => b.rate.rate - a.rate.rate)[0]; const bestEl = document.getElementById('sDietBest'); bestEl.textContent = `${best.name} (${Math.round(best.rate.rate)}%)`; bestEl.title = best.name; }
    else document.getElementById('sDietBest').textContent = '-';
  } else document.getElementById('sDietBest').textContent = '-';

  const last30 = [];
  for (let i = 29; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate()-i); last30.push(d.toISOString().slice(0,10)); }
  drawChart('chartDaily','line',{labels:last30.map(x=>fmtDate(x)),datasets:[{label:'Pontuação %',data:last30.map(x=>dayScore(x)),borderColor:CHART.accent,backgroundColor:'rgba(37,99,235,0.08)',fill:true,tension:0.3,spanGaps:true,pointRadius:2}]},{scales:{y:{min:0,max:100}}});
  drawChart('chartDietDaily','line',{labels:last30.map(x=>fmtDate(x)),datasets:[{label:'Dieta %',data:last30.map(x=>dietDayScore(x)),borderColor:CHART.muted,backgroundColor:'rgba(100,116,139,0.1)',fill:true,tension:0.3,spanGaps:true,pointRadius:2}]},{scales:{y:{min:0,max:100}}});
  if (db.dietPlan.length) { const mealRates = db.dietPlan.map(m => ({ name:m.name, rate:mealComplianceRate(m.id) })); drawChart('chartMealsCompliance','bar',{labels:mealRates.map(m=>m.name),datasets:[{label:'% cumprimento',data:mealRates.map(m=>m.rate?Math.round(m.rate.rate):0),backgroundColor:CHART.muted}]},{scales:{y:{min:0,max:100}},indexAxis:window.innerWidth<600?'y':'x'}); }
  const habitStats = db.habits.map(h => { let done=0,expected=0; if (h.freq==='weekly') { const w=new Set(); Object.keys(db.records).forEach(d=>w.add(weekStart(d))); w.forEach(mon => { const wDone=weekDates(mon).reduce((a,d)=>a+(db.records[d]?.[h.id]?.status==='done'?1:0),0); done+=Math.min(wDone,h.times); expected+=h.times; }); } else { Object.keys(db.records).forEach(d => { if (!isScheduled(h,d)) return; const s=db.records[d][h.id]?.status; if (s==='skip') return; expected++; if (s==='done') done++; }); } return {name:h.name,pct:expected?Math.round((done/expected)*100):0}; });
  drawChart('chartHabits','bar',{labels:habitStats.map(h=>h.name),datasets:[{label:'% Cumprimento',data:habitStats.map(h=>h.pct),backgroundColor:CHART.accent}]},{scales:{y:{min:0,max:100}},indexAxis:window.innerWidth<600?'y':'x'});
  const wdScores=Array.from({length:7},()=>[]); const wdFails=Array(7).fill(0);
  scores.forEach(({d,s})=>wdScores[new Date(d+'T00:00').getDay()].push(s));
  Object.entries(db.records).forEach(([d,rec])=>{ const wd=new Date(d+'T00:00').getDay(); Object.entries(rec).forEach(([k,x])=>{ if(k!=='tags'&&k!=='diet'&&x.status==='fail') wdFails[wd]++; }); });
  const wdAvg=wdScores.map(arr=>arr.length?Math.round(arr.reduce((a,b)=>a+b,0)/arr.length):0);
  drawChart('chartWeekday','bar',{labels:weekdaysShort,datasets:[{label:'Média %',data:wdAvg,backgroundColor:CHART.success}]},{scales:{y:{min:0,max:100}}});
  drawChart('chartWeekdayFails','bar',{labels:weekdaysShort,datasets:[{label:'Erros',data:wdFails,backgroundColor:CHART.danger}]});
  const reasonCount={};
  Object.values(db.records).forEach(r=>Object.entries(r).forEach(([k,x])=>{ if(k!=='tags'&&k!=='diet'&&x.status==='fail'&&x.reason) reasonCount[x.reason]=(reasonCount[x.reason]||0)+1; }));
  drawChart('chartReason','doughnut',{labels:Object.keys(reasonCount),datasets:[{data:Object.values(reasonCount),backgroundColor:CHART.palette}]});
  const mealCount={};
  Object.values(db.records).forEach(r=>Object.entries(r).forEach(([k,x])=>{ if(k!=='tags'&&k!=='diet'&&x.status==='fail'&&x.meal) mealCount[x.meal]=(mealCount[x.meal]||0)+1; }));
  drawChart('chartMeal','bar',{labels:Object.keys(mealCount),datasets:[{label:'Erros',data:Object.values(mealCount),backgroundColor:CHART.warning}]});
  const hm=document.getElementById('heatmap');
  if (!db.habits.length) { hm.innerHTML='<div class="empty">Sem dados.</div>'; } else {
    const matrix={}; db.habits.forEach(h=>matrix[h.id]=Array(7).fill(0));
    Object.entries(db.records).forEach(([d,rec])=>{ const wd=new Date(d+'T00:00').getDay(); Object.entries(rec).forEach(([hid,x])=>{ if(hid!=='tags'&&hid!=='diet'&&x.status==='fail'&&matrix[hid]) matrix[hid][wd]++; }); });
    let max=0; Object.values(matrix).forEach(row=>row.forEach(v=>{ if(v>max) max=v; }));
    const isMobile=window.innerWidth<600;
    let html=`<div style="overflow-x:auto;"><div class="heatmap" style="grid-template-columns: ${isMobile?'100px':'180px'} repeat(7, minmax(38px,1fr)); min-width:${isMobile?'400px':'600px'};"><div></div>`+weekdaysShort.map(w=>`<div style="text-align:center; font-weight:600; font-size:0.78em; padding:5px;">${w}</div>`).join('');
    db.habits.forEach(h=>{ html+=`<div style="padding:6px; font-weight:600; font-size:0.82em;">${h.name}</div>`; matrix[h.id].forEach(v=>{ const i=max?v/max:0; const bg=v===0?'#f7fafc':`rgba(235,51,73,${0.2+i*0.7})`; const color=i>0.5?'white':'#2d3748'; html+=`<div class="heat-cell" style="background:${bg}; color:${color};">${v}</div>`; }); });
    html+=`</div></div>`; hm.innerHTML=html;
  }
}
function drawChart(id, type, data, opts={}) {
  if (charts[id]) charts[id].destroy();
  const ctx = document.getElementById(id); if (!ctx) return;
  const isMobile = window.innerWidth < 600;
  charts[id] = new Chart(ctx, { type, data, options: Object.assign({ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{boxWidth:isMobile?10:14,font:{size:isMobile?10:12}}}}}, opts) });
}

/* ============================================================
   INSIGHTS — funções de análise
   ============================================================ */
function pearson(x, y) { const n=x.length; if(n<3) return 0; const sx=x.reduce((a,b)=>a+b,0); const sy=y.reduce((a,b)=>a+b,0); const sxy=x.reduce((a,b,i)=>a+b*y[i],0); const sx2=x.reduce((a,b)=>a+b*b,0); const sy2=y.reduce((a,b)=>a+b*b,0); const num=n*sxy-sx*sy; const den=Math.sqrt((n*sx2-sx*sx)*(n*sy2-sy*sy)); return den?num/den:0; }
function trendSlope(values) { const n=values.length; if(n<3) return 0; const x=values.map((_,i)=>i); const sx=x.reduce((a,b)=>a+b,0); const sy=values.reduce((a,b)=>a+b,0); const sxy=x.reduce((a,b,i)=>a+b*values[i],0); const sx2=x.reduce((a,b)=>a+b*b,0); const den=n*sx2-sx*sx; return den?(n*sxy-sx*sy)/den:0; }
function habitDayValue(habitId, date) { const s=db.records[date]?.[habitId]?.status; if(s==='done') return 1; if(s==='fail') return 0; return null; }
function habitSuccessRate(habitId, dates) { let done=0,total=0; dates.forEach(d=>{const v=habitDayValue(habitId,d); if(v!==null){total++;if(v===1)done++;}}); return total>=2?{rate:done/total,n:total,done}:null; }
function habitCorrelation(idA, idB) { const dates=Object.keys(db.records); const xs=[],ys=[]; dates.forEach(d=>{const a=habitDayValue(idA,d);const b=habitDayValue(idB,d); if(a!==null&&b!==null){xs.push(a);ys.push(b);}}); if(xs.length<5) return null; return {r:pearson(xs,ys),n:xs.length}; }
function dietHabitCorrelation(habitId) { const dates=Object.keys(db.records); const xs=[],ys=[]; dates.forEach(d=>{const habitV=habitDayValue(habitId,d);const dietS=dietDayScore(d); if(habitV!==null&&dietS!==null){xs.push(dietS/100);ys.push(habitV);}}); if(xs.length<5) return null; return {r:pearson(xs,ys),n:xs.length}; }
function conditionalRate(habitTarget, conditionFn) { const dates=Object.keys(db.records); let wcd=0,wct=0,wod=0,wot=0; dates.forEach(d=>{const v=habitDayValue(habitTarget,d);if(v===null)return; if(conditionFn(d)){wct++;if(v===1)wcd++;}else{wot++;if(v===1)wod++;}}); if(wct<2||wot<2) return null; return {withRate:wcd/wct,withoutRate:wod/wot,diff:(wcd/wct)-(wod/wot),nWith:wct,nWithout:wot}; }
function overallTrend(days=30) { const lastN=[]; for(let i=days-1;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);lastN.push(dayScore(d.toISOString().slice(0,10)));} const valid=lastN.map((v,i)=>v!==null?{i,v}:null).filter(x=>x); if(valid.length<5) return null; const slope=trendSlope(valid.map(x=>x.v)); const half=Math.floor(valid.length/2); const avg1=valid.slice(0,half).map(x=>x.v).reduce((a,b)=>a+b,0)/half; const avg2=valid.slice(half).map(x=>x.v).reduce((a,b)=>a+b,0)/(valid.length-half); return {slope,weeklyChange:slope*7,days:valid.length,firstAvg:avg1,secondAvg:avg2}; }
function periodComparison() { const now=new Date(); const calc=(offset,length)=>{const arr=[];for(let i=0;i<length;i++){const d=new Date(now);d.setDate(d.getDate()-i-offset);const s=dayScore(d.toISOString().slice(0,10));if(s!==null)arr.push(s);}return arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:null;}; return {last7:calc(0,7),prev7:calc(7,7),last30:calc(0,30),prev30:calc(30,30)}; }
function habitTrendCompare() { const now=new Date(); const dL=[],dP=[]; for(let i=0;i<7;i++){const d1=new Date(now);d1.setDate(d1.getDate()-i);const d2=new Date(now);d2.setDate(d2.getDate()-i-7);dL.push(d1.toISOString().slice(0,10));dP.push(d2.toISOString().slice(0,10));} return db.habits.map(h=>{const a=habitSuccessRate(h.id,dL);const b=habitSuccessRate(h.id,dP);if(!a||!b) return {habit:h,current:a,prev:b,diff:null};return {habit:h,current:a,prev:b,diff:a.rate-b.rate};}); }
function tagImpact(tag, habitId) { return conditionalRate(habitId, d=>(db.records[d]?.tags||[]).includes(tag)); }
function habitWeekdayPattern(habitId) { const wd=Array.from({length:7},()=>({done:0,fail:0})); Object.entries(db.records).forEach(([d,rec])=>{const day=new Date(d+'T00:00').getDay();const s=rec[habitId]?.status;if(s==='done')wd[day].done++;else if(s==='fail')wd[day].fail++;}); return wd.map(w=>({total:w.done+w.fail,rate:(w.done+w.fail)?w.done/(w.done+w.fail):null,fails:w.fail})); }

/* ===== ALERTAS ===== */
function detectAlerts() {
  const alerts=[]; const now=new Date(); const win=db.alertConfig.window; const threshold=db.alertConfig.threshold;
  db.habits.forEach(h=>{ const dates=[]; for(let i=0;i<win;i++){const d=new Date(now);d.setDate(d.getDate()-i);dates.push(d.toISOString().slice(0,10));} const recent=habitSuccessRate(h.id,dates); if(!recent||recent.n<3) return; if(recent.rate<threshold){const pDates=[];for(let i=win;i<win*2;i++){const d=new Date(now);d.setDate(d.getDate()-i);pDates.push(d.toISOString().slice(0,10));}const prev=habitSuccessRate(h.id,pDates);const dropping=prev&&prev.rate>recent.rate+0.15;const severity=recent.rate<0.3?'high':recent.rate<0.5?'medium':'low';const pct=Math.round(recent.rate*100);const prevPct=prev?Math.round(prev.rate*100):null;alerts.push({id:`drop_${h.id}`,priority:severity==='high'?1:2,severity,title:dropping?`Queda em ${h.name}`:`${h.name} em baixa`,desc:dropping?`Caiu de <strong>${prevPct}%</strong> para <strong>${pct}%</strong> nos últimos ${win} dias.`:`Apenas <strong>${pct}%</strong> de cumprimento (${recent.done}/${recent.n}).`});} });
  const dietDates=[]; for(let i=0;i<win;i++){const d=new Date(now);d.setDate(d.getDate()-i);dietDates.push(d.toISOString().slice(0,10));}
  const dietRecent=dietDates.map(d=>dietDayScore(d)).filter(s=>s!==null);
  if(dietRecent.length>=3){const dietAvg=dietRecent.reduce((a,b)=>a+b,0)/dietRecent.length;if(dietAvg<threshold*100){alerts.push({id:'diet_drop',priority:dietAvg<30?1:2,severity:dietAvg<30?'high':'medium',title:'Dieta em baixa',desc:`Cumprimento médio de <strong>${Math.round(dietAvg)}%</strong> nos últimos ${win} dias (${dietRecent.length} com registro).`});}}
  db.dietPlan.forEach(meal=>{const r=mealComplianceRate(meal.id);if(r&&r.n>=5&&r.rate<50){alerts.push({id:`meal_${meal.id}`,priority:3,severity:'low',title:`${meal.name} é seu ponto fraco`,desc:`Apenas <strong>${Math.round(r.rate)}%</strong> de cumprimento (${r.n} registros).`});}});
  let streak=0; for(let i=0;i<365;i++){const d=new Date();d.setDate(d.getDate()-i);const s=dayScore(d.toISOString().slice(0,10));if(s===null){if(i===0)continue;else break;}if(s===100)streak++;else break;}
  if(streak>=3){const todayRec=db.records[today()]||{};const pending=db.habits.filter(h=>{if(h.freq==='weekly'||!isScheduled(h,today()))return false;const s=todayRec[h.id]?.status;return s!=='done'&&s!=='skip';});if(pending.length>0){alerts.push({id:'streak_risk',priority:1,severity:'high',title:`Streak de ${streak} dias em risco!`,desc:`${pending.length} hábito${pending.length>1?'s':''} pendente: <strong>${pending.map(h=>h.name).join(', ')}</strong>.`});}}
  const todayWd=new Date(today()+'T00:00').getDay(); const daysIntoWeek=todayWd===0?7:todayWd;
  db.habits.filter(h=>h.freq==='weekly').forEach(h=>{const done=weeklyCount(h.id,today());if(done<h.times){const remaining=h.times-done;const daysLeft=7-daysIntoWeek+1;if(daysLeft<=remaining){alerts.push({id:`weekly_${h.id}`,priority:daysLeft<remaining?1:2,severity:daysLeft<remaining?'high':'medium',title:`${h.name}: meta semanal apertada`,desc:`Faltam <strong>${remaining}</strong> sessões e só restam <strong>${daysLeft}</strong> dia${daysLeft>1?'s':''}.`});}}});
  db.contextTags.forEach(tag=>{db.habits.forEach(h=>{const imp=tagImpact(tag,h.id);if(imp&&imp.nWith>=3&&imp.nWithout>=3&&imp.diff<-0.3){alerts.push({id:`tag_${tag.replace(/\s/g,'_')}_${h.id}`,priority:2,severity:'medium',title:`"${tag}" derruba ${h.name}`,desc:`Em dias com essa tag, você cumpre <strong>${Math.round(imp.diff*100)}%</strong> menos.`});}});});
  const t=overallTrend(30); if(t&&t.weeklyChange<-3){alerts.push({id:'overall_drop',priority:1,severity:'high',title:'Tendência geral em queda',desc:`Sua pontuação caiu <strong>${Math.abs(t.weeklyChange).toFixed(1)}%</strong> por semana nos últimos ${t.days} dias.`});}
  return alerts.filter(a=>!db.dismissedAlerts[a.id]||(Date.now()-db.dismissedAlerts[a.id])>24*3600*1000).sort((a,b)=>a.priority-b.priority);
}
function dismissAlert(id) { db.dismissedAlerts[id]=Date.now(); save(); renderAlerts(); updateAlertBadge(); }
function renderAlerts() {
  const div=document.getElementById('alertsList'); const alerts=detectAlerts();
  document.getElementById('alertCount').textContent=alerts.length;
  if(!alerts.length){div.innerHTML='<div class="empty"><strong style="color:var(--success);">Tudo certo</strong><br>Nenhum alerta ativo.</div>';return;}
  div.innerHTML=alerts.map(a=>`<div class="alert-card ${a.severity}"><div class="alert-content"><div class="alert-pill">${a.severity==='high'?'Urgente':a.severity==='medium'?'Atenção':'Aviso'}</div><div class="alert-title">${a.title}</div><div class="alert-desc">${a.desc}</div></div><button class="small ghost" onclick="dismissAlert('${a.id}')" style="padding:4px 8px; min-height:auto; font-size:0.75em;">✕</button></div>`).join('');

  /* Dispara notificação push para alertas urgentes ainda não notificados */
  alerts.filter(a => a.severity === 'high' && !db.dismissedAlerts['notified_' + a.id]).forEach(a => {
    Notifications.alertHabit(a.title, a.desc.replace(/<[^>]+>/g, ''));
    db.dismissedAlerts['notified_' + a.id] = Date.now();
  });
}
function updateAlertBadge() { const alerts=detectAlerts(); const high=alerts.filter(a=>a.severity==='high').length; ['alertBadgeTop','alertBadgeBottom'].forEach(id=>{const el=document.getElementById(id);if(!el)return;if(!alerts.length){el.style.display='none';return;}el.style.display='inline-block';el.textContent=alerts.length;el.style.background=high>0?'#e53e3e':'#f7971e';}); }

/* ===== PREVISÕES ===== */
let predictionDate = today();
let predictionTags = [];
function predictHabit(habitId, targetDate, plannedTags=[]) {
  const habit=db.habits.find(h=>h.id===habitId); if(!habit) return null;
  const targetWd=new Date(targetDate+'T00:00').getDay();
  const allDates=Object.keys(db.records); let baseProb=0.5; let confidence=0; const factors=[];
  const overall=habitSuccessRate(habitId,allDates); if(overall&&overall.n>=5){baseProb=overall.rate;confidence+=1;factors.push({name:'Histórico geral',value:overall.rate,weight:1});}
  const sameWdDates=allDates.filter(d=>new Date(d+'T00:00').getDay()===targetWd); const sameWd=habitSuccessRate(habitId,sameWdDates); if(sameWd&&sameWd.n>=3){factors.push({name:`${weekdays[targetWd]}s`,value:sameWd.rate,weight:2});confidence+=2;}
  const recent7=[]; for(let i=1;i<=7;i++){const d=new Date();d.setDate(d.getDate()-i);recent7.push(d.toISOString().slice(0,10));} const recent=habitSuccessRate(habitId,recent7); if(recent&&recent.n>=3){factors.push({name:'Últimos 7 dias',value:recent.rate,weight:1.5});confidence+=1.5;}
  let tagImpactSum=0,tagImpactCount=0; plannedTags.forEach(tag=>{const imp=tagImpact(tag,habitId);if(imp&&imp.nWith>=2){tagImpactSum+=imp.diff;tagImpactCount++;factors.push({name:`Tag "${tag}"`,value:imp.withRate,weight:1.5,isTag:true,diff:imp.diff});}});
  if(habit.freq==='weekly'){const done=weeklyCount(habitId,targetDate);const remaining=habit.times-done;if(remaining<=0)return {habit,probability:0.3,confidence:'media',factors,message:`Meta semanal já atingida (${done}/${habit.times})`,alreadyMet:true};const tWdAdj=targetWd===0?7:targetWd;const daysLeft=7-tWdAdj+1;const urgency=Math.min(1,remaining/daysLeft);factors.push({name:'Urgência semanal',value:0.5+urgency*0.3,weight:1});}
  const wf=factors.filter(f=>!f.isTag);let totalW=0,wSum=0;wf.forEach(f=>{wSum+=f.value*f.weight;totalW+=f.weight;});let probability=totalW>0?wSum/totalW:baseProb;if(tagImpactCount>0){probability=Math.max(0,Math.min(1,probability+(tagImpactSum/tagImpactCount)*0.6));}
  if(habit.freq==='weekdays'&&!habit.days.includes(targetWd))return{habit,probability:0,confidence:'alta',factors,message:`Não agendado para ${weekdays[targetWd]}`,notScheduled:true};
  return {habit,probability,confidence:confidence>=4?'alta':confidence>=2?'media':'baixa',factors};
}
function renderPredictions() {
  const sel=document.getElementById('predDaySelector');let html='';
  for(let i=0;i<7;i++){const d=new Date();d.setDate(d.getDate()+i);const ds=d.toISOString().slice(0,10);const wd=weekdaysShort[d.getDay()];const label=i===0?'Hoje':i===1?'Amanhã':`${wd} ${d.getDate()}`;html+=`<button class="pred-day-btn ${ds===predictionDate?'active':''}" onclick="setPredDate('${ds}')">${label}</button>`;}
  sel.innerHTML=html;
  const tagDiv=document.getElementById('predTagPicker');
  if(db.contextTags.length){tagDiv.innerHTML=db.contextTags.map(t=>`<div class="chip selectable ${predictionTags.includes(t)?'active':''}" onclick="togglePredTag('${t.replace(/'/g,"\\'")}')">${t}</div>`).join('');document.getElementById('predContextSection').style.display='block';}
  else document.getElementById('predContextSection').style.display='none';
  const list=document.getElementById('predictionsList');
  if(!db.habits.length){list.innerHTML='<div class="empty">Cadastre hábitos primeiro.</div>';return;}
  const predictions=db.habits.map(h=>predictHabit(h.id,predictionDate,predictionTags)).filter(p=>p);
  const probs=predictions.filter(p=>!p.notScheduled&&!p.alreadyMet).map(p=>p.probability);
  const overallProb=probs.length?probs.reduce((a,b)=>a+b,0)/probs.length:null;
  list.innerHTML=predictions.map(p=>{
    if(p.notScheduled) return `<div class="pred-card" style="opacity:0.5;"><div class="pred-row"><div class="pred-icon">😴</div><div class="pred-info"><div class="pred-name">${p.habit.name}</div><div class="pred-confidence">${p.message}</div></div></div></div>`;
    if(p.alreadyMet)   return `<div class="pred-card" style="background:#f0fff4;"><div class="pred-row"><div class="pred-info"><div class="pred-name">${p.habit.name}</div><div class="pred-confidence">${p.message}</div></div></div></div>`;
    const pct=Math.round(p.probability*100); const cls=pct>=70?'high':pct>=40?'medium':'low'; const icon=pct>=70?'💪':pct>=40?'🤔':'⚠️';
    const fl=p.factors.slice(0,3).map(f=>{if(f.isTag){const sym=f.diff>0?'↑':'↓';const color=f.diff>0?CHART.success:CHART.danger;return`<span style="color:${color};">${sym} ${f.name} (${f.diff>0?'+':''}${Math.round(f.diff*100)}%)</span>`;} return`${f.name}: ${Math.round(f.value*100)}%`;}).join(' · ');
    return `<div class="pred-card"><div class="pred-row"><div class="pred-icon">${icon}</div><div class="pred-info"><div class="pred-name">${p.habit.name}</div><div class="pred-bar-wrap"><div class="pred-bar ${cls}" style="width:${pct}%;">${pct}%</div></div><div class="pred-confidence">Confiança: ${p.confidence} · ${fl}</div></div></div></div>`;
  }).join('');
  const od=document.getElementById('predOverall');
  if(overallProb!==null){const pct=Math.round(overallProb*100);const msg=pct>=70?'Dia provavelmente bom 🚀':pct>=40?'Dia mediano.':'Dia desafiador.';od.innerHTML=`<div class="stat"><div class="v">${pct}%</div><div class="l">Probabilidade média do dia<br><strong>${msg}</strong></div></div>`;}else od.innerHTML='';
}
function setPredDate(d)    { predictionDate=d; renderPredictions(); }
function togglePredTag(tag){ const i=predictionTags.indexOf(tag);if(i>=0)predictionTags.splice(i,1);else predictionTags.push(tag);renderPredictions(); }

/* ===== COMPARAÇÃO TEMPORAL ===== */
function dateRangeAvg(s,e){const sc=[];let d=new Date(s+'T00:00');const end=new Date(e+'T00:00');while(d<=end){const sc2=dayScore(d.toISOString().slice(0,10));if(sc2!==null)sc.push(sc2);d.setDate(d.getDate()+1);}return sc.length?{avg:sc.reduce((a,b)=>a+b,0)/sc.length,n:sc.length}:null;}
function monthRange(y,m){const start=new Date(y,m,1);const end=new Date(y,m+1,0);return{start:start.toISOString().slice(0,10),end:end.toISOString().slice(0,10),label:`${monthNames[m]}/${y}`};}
function renderTemporalCompare(){
  const now=new Date();const cY=now.getFullYear();const cM=now.getMonth();
  const tm=monthRange(cY,cM);const pmY=cM===0?cY-1:cY;const pmM=cM===0?11:cM-1;const pm=monthRange(pmY,pmM);
  const tmD=dateRangeAvg(tm.start,tm.end);const pmD=dateRangeAvg(pm.start,pm.end);
  const mDiv=document.getElementById('monthVsMonth');
  if(!tmD&&!pmD){mDiv.innerHTML='<div class="empty">Sem dados.</div>';}else{let dH='';if(tmD&&pmD){const diff=tmD.avg-pmD.avg;const cls=diff>1?'pos':diff<-1?'neg':'neutral';dH=`<div class="year-diff ${cls}">${diff>0?'↑':diff<0?'↓':'→'} ${diff>0?'+':''}${diff.toFixed(1)} pontos</div>`;}mDiv.innerHTML=`<div class="year-grid"><div class="year-side"><div class="year-label">${pm.label}</div><div class="year-value">${pmD?pmD.avg.toFixed(0)+'%':'-'}</div><div class="year-extra">${pmD?pmD.n+' dias':'sem dados'}</div></div><div class="year-vs">vs</div><div class="year-side current"><div class="year-label">${tm.label}</div><div class="year-value">${tmD?tmD.avg.toFixed(0)+'%':'-'}</div><div class="year-extra">${tmD?tmD.n+' dias':'sem dados'}</div></div></div>${dH}`;}
  const todayD=new Date();const s1=new Date(todayD);s1.setDate(s1.getDate()-29);const s2=new Date(todayD);s2.setFullYear(s2.getFullYear()-1);s2.setDate(s2.getDate()-29);const e2=new Date(todayD);e2.setFullYear(e2.getFullYear()-1);
  const tyA=dateRangeAvg(s1.toISOString().slice(0,10),todayD.toISOString().slice(0,10));const lyA=dateRangeAvg(s2.toISOString().slice(0,10),e2.toISOString().slice(0,10));
  const yDiv=document.getElementById('yearVsYear');
  if(!tyA&&!lyA){yDiv.innerHTML='<div class="empty">Continue registrando!</div>';}else{let dH='';if(tyA&&lyA){const diff=tyA.avg-lyA.avg;const cls=diff>1?'pos':diff<-1?'neg':'neutral';dH=`<div class="year-diff ${cls}">${diff>0?'↑':diff<0?'↓':'→'} ${diff>0?'+':''}${diff.toFixed(1)} pontos</div>`;}yDiv.innerHTML=`<div class="year-grid"><div class="year-side"><div class="year-label">${cY-1} (mesmo período)</div><div class="year-value">${lyA?lyA.avg.toFixed(0)+'%':'-'}</div></div><div class="year-vs">vs</div><div class="year-side current"><div class="year-label">${cY}</div><div class="year-value">${tyA?tyA.avg.toFixed(0)+'%':'-'}</div></div></div>${dH}`;}
  const mDivs=[];for(let i=11;i>=0;i--){const d=new Date(cY,cM-i,1);const m=monthRange(d.getFullYear(),d.getMonth());const data=dateRangeAvg(m.start,m.end);if(data){const prev=new Date(d);prev.setMonth(prev.getMonth()-1);const pmr=monthRange(prev.getFullYear(),prev.getMonth());const prevD=dateRangeAvg(pmr.start,pmr.end);let vsH='';if(prevD){const diff=data.avg-prevD.avg;const cls=diff>1?'up':diff<-1?'down':'neutral';vsH=`<div class="m-vs ${cls}">${diff>1?'↑':diff<-1?'↓':'→'} ${diff>0?'+':''}${diff.toFixed(0)}%</div>`;}mDivs.push(`<div class="month-cell"><div class="m-name">${m.label}</div><div class="m-val">${data.avg.toFixed(0)}%</div>${vsH}</div>`);}}
  document.getElementById('monthHistory').innerHTML=mDivs.length?mDivs.join(''):'<div class="empty">Registre alguns meses.</div>';
}

/* ===== ANÁLISE DA DIETA ===== */
function renderDietAnalysis(){
  const div=document.getElementById('dietAnalysis');
  if(!db.dietPlan.length){div.innerHTML='<div class="empty">Cadastre seu plano alimentar primeiro.</div>';return;}
  const dates=Object.keys(db.records);const dietScores=dates.map(d=>dietDayScore(d)).filter(s=>s!==null);
  if(!dietScores.length){div.innerHTML='<div class="empty">Registre algumas refeições para ver análises.</div>';return;}
  const avg=Math.round(dietScores.reduce((a,b)=>a+b,0)/dietScores.length);
  const mealAnalysis=db.dietPlan.map(m=>({meal:m,rate:mealComplianceRate(m.id)})).filter(x=>x.rate).sort((a,b)=>b.rate.rate-a.rate.rate);
  const best=mealAnalysis[0];const worst=mealAnalysis[mealAnalysis.length-1];
  let html=`<div class="grid grid-3" style="margin-bottom:14px;"><div class="stat"><div class="v">${avg}%</div><div class="l">Média geral · ${dietScores.length} dias</div></div><div class="stat stat-success"><div class="v stat-truncate" title="${best?best.meal.name:''}">${best?`${best.meal.name} (${Math.round(best.rate.rate)}%)`:'-'}</div><div class="l">Melhor refeição</div></div><div class="stat stat-danger"><div class="v stat-truncate" title="${worst&&worst.rate.rate<80?worst.meal.name:''}">${worst&&worst.rate.rate<80?`${worst.meal.name} (${Math.round(worst.rate.rate)}%)`:'-'}</div><div class="l">Mais difícil</div></div></div><h3 style="margin-bottom:10px; font-size:1em; color:#4a5568;">📊 Cumprimento por refeição</h3>`;
  mealAnalysis.forEach(({meal,rate})=>{const pct=Math.round(rate.rate);const color=pct>=80?CHART.success:pct>=50?CHART.warning:CHART.danger;html+=`<div class="trend-row"><div class="trend-name">${meal.emoji||'🍽️'} ${meal.name}</div><div class="trend-bar-wrap"><div class="trend-bar" style="width:${pct}%; background:${color};"></div></div><div class="trend-pct">${pct}%</div></div>`;});
  div.innerHTML=html;
}

function renderInsights(){renderAlerts();renderDietAnalysis();renderPredictions();renderTemporalCompare();renderTrendSummary();renderPeriodCompare();renderHabitTrends();renderCorrelations();renderTagImpact();renderWeekdayPatterns();renderAutoInsights();updateAlertBadge();}

function renderTrendSummary(){
  const t=overallTrend(30);const div=document.getElementById('trendSummary');
  if(!t){div.innerHTML='<div class="empty">Registre pelo menos 5 dias.</div>';if(charts.chartTrend)charts.chartTrend.destroy();return;}
  const arrow=t.weeklyChange>1?'↑':t.weeklyChange<-1?'↓':'→';const status=t.weeklyChange>1?'Em alta':t.weeklyChange<-1?'Em queda':'Estável';const color=t.weeklyChange>1?CHART.success:t.weeklyChange<-1?CHART.danger:CHART.muted;
  div.innerHTML=`<div style="display:flex; gap:16px; align-items:center; flex-wrap:wrap;"><div style="font-size:3em;">${arrow}</div><div style="flex:1;"><div style="font-size:1.4em; font-weight:700; color:${color};">${status}</div><div style="color:#4a5568; line-height:1.5; margin-top:4px;">Variação semanal: <strong>${t.weeklyChange>0?'+':''}${t.weeklyChange.toFixed(1)}%</strong><br>1ª metade: ${t.firstAvg.toFixed(1)}% · 2ª: ${t.secondAvg.toFixed(1)}%</div></div></div>`;
  const labels=[],values=[];for(let i=29;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);labels.push(fmtDate(d.toISOString().slice(0,10)));values.push(dayScore(d.toISOString().slice(0,10)));}
  const validIdx=values.map((v,i)=>v!==null?i:null).filter(x=>x!==null);const validVals=validIdx.map(i=>values[i]);const slope=trendSlope(validVals);const meanY=validVals.reduce((a,b)=>a+b,0)/validVals.length;const meanX=validIdx.reduce((a,b)=>a+b,0)/validIdx.length;const intercept=meanY-slope*meanX;
  drawChart('chartTrend','line',{labels,datasets:[{label:'Real',data:values,borderColor:CHART.accent,backgroundColor:'rgba(37,99,235,0.08)',fill:true,tension:0.3,spanGaps:true,pointRadius:2},{label:'Tendência',data:values.map((_,i)=>slope*i+intercept),borderColor:color,borderDash:[6,4],borderWidth:2,pointRadius:0,fill:false}]},{scales:{y:{min:0,max:100}}});
}
function renderPeriodCompare(){const p=periodComparison();const div=document.getElementById('periodCompare');const card=(label,current,prev)=>{if(current===null||prev===null)return`<div class="stat"><div class="v">-</div><div class="l">${label}</div></div>`;const diff=current-prev;const cls=diff>1?'green':diff<-1?'red':'';const arrow=diff>1?'↑':diff<-1?'↓':'→';return`<div class="stat ${cls}"><div class="v">${current.toFixed(0)}%</div><div class="l">${label}<br><small>${arrow} ${diff>0?'+':''}${diff.toFixed(1)}% vs anterior</small></div></div>`;};div.innerHTML=card('Últimos 7 dias',p.last7,p.prev7)+card('Últimos 30 dias',p.last30,p.prev30);}
function renderHabitTrends(){const trends=habitTrendCompare();const div=document.getElementById('habitTrends');if(!trends.length){div.innerHTML='<div class="empty">Sem hábitos.</div>';return;}div.innerHTML=trends.map(t=>{if(!t.current&&!t.prev)return`<div class="trend-row"><div class="trend-name">${t.habit.name}</div><div style="color:#a0aec0;">Sem dados</div></div>`;const cur=t.current?Math.round(t.current.rate*100):0;const prev=t.prev?Math.round(t.prev.rate*100):0;const diff=t.diff!==null?Math.round(t.diff*100):0;const arrow=diff>5?'🔼':diff<-5?'🔽':'➡️';const color=diff>5?CHART.success:diff<-5?CHART.danger:CHART.muted;return`<div class="trend-row"><div class="trend-name">${t.habit.name}</div><div class="trend-bar-wrap"><div class="trend-bar" style="width:${cur}%; background:${color};"></div></div><div class="trend-pct">${cur}%</div><div style="color:${color};">${arrow}</div></div>`;}).join('');}
function renderCorrelations(){const div=document.getElementById('correlations');const pairs=[];for(let i=0;i<db.habits.length;i++){for(let j=i+1;j<db.habits.length;j++){const c=habitCorrelation(db.habits[i].id,db.habits[j].id);if(c&&Math.abs(c.r)>0.05)pairs.push({a:db.habits[i].name,b:db.habits[j].name,r:c.r,n:c.n,type:'habit'});}}db.habits.forEach(h=>{const c=dietHabitCorrelation(h.id);if(c&&Math.abs(c.r)>0.1)pairs.push({a:'🥗 Dieta',b:h.name,r:c.r,n:c.n,type:'diet'});});pairs.sort((x,y)=>Math.abs(y.r)-Math.abs(x.r));if(!pairs.length){div.innerHTML='<div class="empty">Mais dias para correlações.</div>';return;}div.innerHTML=pairs.slice(0,12).map(p=>{const cls=p.r>0.2?'pos':p.r<-0.2?'neg':'neutral';let interpret;if(p.r>0.5)interpret=`<strong>${p.a}</strong> e <strong>${p.b}</strong> andam fortemente juntos.`;else if(p.r>0.2)interpret=`<strong>${p.a}</strong> e <strong>${p.b}</strong> têm correlação positiva.`;else if(p.r<-0.5)interpret=`<strong>${p.a}</strong> e <strong>${p.b}</strong> são fortemente opostos.`;else if(p.r<-0.2)interpret=`<strong>${p.a}</strong> e <strong>${p.b}</strong> têm leve oposição.`;else interpret=`<strong>${p.a}</strong> e <strong>${p.b}</strong> são independentes.`;return`<div class="corr-row"><div class="desc">${interpret}<br><small style="color:#a0aec0;">${p.n} dias com ambos</small></div><div class="value ${cls}">${p.r>0?'+':''}${p.r.toFixed(2)}</div></div>`;}).join('');}
function renderTagImpact(){const div=document.getElementById('tagImpact');if(!db.contextTags.length){div.innerHTML='<div class="empty">Adicione tags em Configurações.</div>';return;}const allImpacts=[];db.contextTags.forEach(tag=>{db.habits.forEach(h=>{const imp=tagImpact(tag,h.id);if(imp&&Math.abs(imp.diff)>0.05)allImpacts.push({tag,habit:h.name,...imp});});const dietImp=(()=>{const dates=Object.keys(db.records);let ws=0,wn=0,os=0,on=0;dates.forEach(d=>{const s=dietDayScore(d);if(s===null)return;const hasT=(db.records[d]?.tags||[]).includes(tag);if(hasT){ws+=s;wn++;}else{os+=s;on++;}});if(wn<2||on<2)return null;return{withRate:(ws/wn)/100,withoutRate:(os/on)/100,diff:((ws/wn)-(os/on))/100,nWith:wn,nWithout:on};})();if(dietImp&&Math.abs(dietImp.diff)>0.05)allImpacts.push({tag,habit:'🥗 Dieta',...dietImp});});if(!allImpacts.length){div.innerHTML='<div class="empty">Marque tags em alguns dias.</div>';return;}allImpacts.sort((a,b)=>Math.abs(b.diff)-Math.abs(a.diff));div.innerHTML=allImpacts.slice(0,15).map(imp=>{const pct=Math.round(imp.diff*100);const cls=imp.diff>0.1?'pos':imp.diff<-0.1?'neg':'neutral';const verb=imp.diff>0?'cumpre mais':'cumpre menos';return`<div class="corr-row"><div class="desc">Em dias com <strong>${imp.tag}</strong>, você ${verb} <strong>${imp.habit}</strong>.<br><small style="color:#718096;">${Math.round(imp.withRate*100)}% com tag · ${Math.round(imp.withoutRate*100)}% sem</small></div><div class="value ${cls}">${pct>0?'+':''}${pct}%</div></div>`;}).join('');}
function renderWeekdayPatterns(){const div=document.getElementById('weekdayPatterns');if(!db.habits.length){div.innerHTML='<div class="empty">Sem hábitos.</div>';return;}let html='';db.habits.forEach(h=>{const wd=habitWeekdayPattern(h.id);const totalFails=wd.reduce((a,b)=>a+b.fails,0);if(!totalFails)return;const worst=wd.map((w,i)=>({i,fails:w.fails})).sort((a,b)=>b.fails-a.fails)[0];if(worst.fails===0)return;const pct=Math.round((worst.fails/totalFails)*100);html+=`<div class="corr-row"><div class="desc"><strong>${h.name}</strong>: falha mais às <strong>${weekdays[worst.i]}s</strong>.<br><small style="color:#718096;">${worst.fails} de ${totalFails} erros (${pct}%)</small></div><div class="value neg">${pct}%</div></div>`;});div.innerHTML=html||'<div class="empty">Sem padrões.</div>';}
function renderAutoInsights(){const div=document.getElementById('autoInsights');const insights=[];const t=overallTrend(30);if(t){if(t.weeklyChange>2)insights.push({type:'positive',text:`<strong>Em alta!</strong> +${t.weeklyChange.toFixed(1)}% por semana.`});else if(t.weeklyChange<-2)insights.push({type:'negative',text:`<strong>Tendência de queda.</strong> ${t.weeklyChange.toFixed(1)}% por semana.`});}const dietScores=Object.keys(db.records).map(d=>dietDayScore(d)).filter(s=>s!==null);if(dietScores.length>=5){const dAvg=dietScores.reduce((a,b)=>a+b,0)/dietScores.length;if(dAvg>=80)insights.push({type:'positive',text:`Dieta em excelente nível: média de <strong>${Math.round(dAvg)}%</strong>.`});else if(dAvg<50)insights.push({type:'warning',text:`Dieta abaixo do esperado: ${Math.round(dAvg)}% de média.`});}const p=periodComparison();if(p.last7!==null&&p.prev7!==null){const diff=p.last7-p.prev7;if(diff>5)insights.push({type:'positive',text:`Esta semana: <strong>${p.last7.toFixed(0)}%</strong> vs ${p.prev7.toFixed(0)}% anterior.`});else if(diff<-5)insights.push({type:'warning',text:`Esta semana caiu para <strong>${p.last7.toFixed(0)}%</strong>.`});}if(!insights.length){div.innerHTML='<div class="empty">Registre mais dias.</div>';return;}div.innerHTML=insights.map(i=>`<div class="insight-card ${i.type}"><div class="content">${i.text}</div></div>`).join('');}

/* ============================================================
   COMPOSIÇÃO CORPORAL
   ============================================================ */
function initBodyForm() { const el=document.getElementById('bodyDate'); if(el&&!el.value)el.value=today(); }
function clearBodyForm(){ document.getElementById('bodyDate').value=today(); document.getElementById('bodyWeight').value=''; document.getElementById('bodyMuscle').value=''; document.getElementById('bodyFat').value=''; document.getElementById('bodyNotes').value=''; }
async function saveBodyMetric(){
  if(!currentUser||!supa){alert('Faça login e configure o Supabase para salvar medições.');return;}
  const recorded_at=document.getElementById('bodyDate').value||today(); const weight_kg=parseFloat(document.getElementById('bodyWeight').value); const muscle_pct=parseFloat(document.getElementById('bodyMuscle').value); const fat_pct=parseFloat(document.getElementById('bodyFat').value); const notes=(document.getElementById('bodyNotes').value||'').trim()||null;
  if(isNaN(weight_kg)&&isNaN(muscle_pct)&&isNaN(fat_pct)){alert('Informe pelo menos um valor.');return;}
  setCloudStatus('Salvando...','sync');
  const {error}=await supa.from('body_metrics').upsert({user_id:currentUser.id,recorded_at,weight_kg:isNaN(weight_kg)?null:weight_kg,muscle_pct:isNaN(muscle_pct)?null:muscle_pct,fat_pct:isNaN(fat_pct)?null:fat_pct,notes},{onConflict:'user_id,recorded_at'});
  if(error){alert('Erro: '+error.message);setCloudStatus('Erro','err');return;}
  const {data,error:loadErr}=await supa.from('body_metrics').select('*').eq('user_id',currentUser.id).order('recorded_at',{ascending:true});
  if(!loadErr)bodyMetrics=data||[];
  clearBodyForm();setCloudStatus('Salvo','ok');renderBodyPanel();
}
async function deleteBodyMetric(id){if(!confirm('Excluir?'))return;const {error}=await supa.from('body_metrics').delete().eq('id',id);if(error){alert(error.message);return;}bodyMetrics=bodyMetrics.filter(m=>m.id!==id);renderBodyPanel();}
function renderBodyPanel(){
  initBodyForm();const sorted=[...bodyMetrics].sort((a,b)=>a.recorded_at.localeCompare(b.recorded_at));const last=sorted[sorted.length-1];
  document.getElementById('bodyLastWeight').textContent=last?.weight_kg!=null?Number(last.weight_kg).toFixed(1):'—';
  document.getElementById('bodyLastMuscle').textContent=last?.muscle_pct!=null?Number(last.muscle_pct).toFixed(1)+'%':'—';
  document.getElementById('bodyLastFat').textContent=last?.fat_pct!=null?Number(last.fat_pct).toFixed(1)+'%':'—';
  const listEl=document.getElementById('bodyHistoryList');
  if(!sorted.length){listEl.innerHTML='<div class="empty">Nenhuma medição ainda.</div>';}
  else{listEl.innerHTML=[...sorted].reverse().map(m=>`<div style="background:#f7fafc; padding:12px; border-radius:10px; margin-bottom:8px; border:1px solid #e2e8f0;"><div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;"><strong>${new Date(m.recorded_at+'T00:00').toLocaleDateString('pt-BR')}</strong><button class="small danger" onclick="deleteBodyMetric('${m.id}')">Excluir</button></div><div style="margin-top:8px; display:flex; gap:12px; flex-wrap:wrap; font-size:0.95em;">${m.weight_kg!=null?`<span>⚖️ <strong>${Number(m.weight_kg).toFixed(1)}</strong> kg</span>`:''} ${m.muscle_pct!=null?`<span>💪 <strong>${Number(m.muscle_pct).toFixed(1)}%</strong></span>`:''} ${m.fat_pct!=null?`<span>📉 <strong>${Number(m.fat_pct).toFixed(1)}%</strong></span>`:''}</div>${m.notes?`<p style="margin-top:8px; color:#718096; font-size:0.88em;">${m.notes}</p>`:''}</div>`).join('');}
  renderBodyChart(sorted);
}
function renderBodyChart(rows){
  const canvas=document.getElementById('chartBody');if(!canvas)return;if(chartBody){chartBody.destroy();chartBody=null;}if(!rows.length)return;
  const labels=rows.map(r=>fmtDate(r.recorded_at));const datasets=[];const w=rows.map(r=>r.weight_kg);
  if(w.some(v=>v!=null))datasets.push({label:'Peso (kg)',data:w,borderColor:CHART.accent,backgroundColor:'rgba(37,99,235,0.08)',tension:0.3,pointRadius:4,spanGaps:true,yAxisID:'y'});
  const mu=rows.map(r=>r.muscle_pct);const fa=rows.map(r=>r.fat_pct);
  if(mu.some(v=>v!=null))datasets.push({label:'Músculo (%)',data:mu,borderColor:CHART.success,backgroundColor:'rgba(22,163,74,0.08)',tension:0.3,pointRadius:3,spanGaps:true,yAxisID:'y1'});
  if(fa.some(v=>v!=null))datasets.push({label:'Gordura (%)',data:fa,borderColor:CHART.warning,backgroundColor:'rgba(217,119,6,0.08)',tension:0.3,pointRadius:3,spanGaps:true,yAxisID:'y1'});
  chartBody=new Chart(canvas,{type:'line',data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}},scales:{y:{type:'linear',position:'left',title:{display:true,text:'kg'}},y1:{type:'linear',position:'right',grid:{drawOnChartArea:false},title:{display:true,text:'%'},min:0,max:100}}}});
}

/* ============================================================
   HISTÓRICO
   ============================================================ */
function renderHistory(){
  const moodEmoji   = ['','😔','😕','😐','🙂','😄'];
  const energyEmoji = ['','🪫','😴','⚡','🔋','🚀'];
  const dates=Object.keys(db.records).sort().reverse();if(!dates.length){document.getElementById('historyTable').innerHTML='<div class="empty">Nenhum registro.</div>';return;}
  let html='';dates.forEach(d=>{const s=dayScore(d);const ds=dietDayScore(d);const wd=weekdaysShort[new Date(d+'T00:00').getDay()];const rec=db.records[d];const tags=(rec.tags||[]).map(t=>`<span class="badge badge-extra">${t}</span>`).join(' ');const items=db.habits.map(h=>{const r=rec[h.id];if(!r||!r.status)return null;if(r.status==='done')return`<span class="badge badge-ok">${h.name}</span>`;if(r.status==='skip')return`<span class="badge badge-skip">${h.name}</span>`;return`<span class="badge badge-fail">${h.name}</span>`;}).filter(Boolean);let dietItems='';if(rec.diet?.meals){const dItems=db.dietPlan.map(m=>{const r=rec.diet.meals[m.id];if(!r||!r.followed)return null;if(r.followed==='full')return`<span class="badge badge-diet">${m.name}</span>`;if(r.followed==='partial')return`<span class="badge badge-partial">${m.name}</span>`;if(r.followed==='no')return`<span class="badge badge-fail">${m.name}</span>`;return null;}).filter(Boolean);if(dItems.length)dietItems=`<div style="margin-top:8px; padding-top:8px; border-top:1px dashed #e2e8f0;"><small style="color:#38b2ac; font-weight:600;">🥗 Dieta:</small><br>${dItems.join(' ')}</div>`;}
  const moodStr = rec.mood   ? `<span title="Humor" style="font-size:1.1em;">${moodEmoji[rec.mood]}</span>`   : '';
  const energyStr = rec.energy ? `<span title="Energia" style="font-size:1.1em;">${energyEmoji[rec.energy]}</span>` : '';
  const wellbeing = (moodStr || energyStr) ? `<span style="margin-left:4px;">${moodStr}${energyStr}</span>` : '';
  html+=`<div style="background:white; padding:14px; border-radius:10px; margin-bottom:10px; border:1px solid #e2e8f0;"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:8px;"><div><strong>${new Date(d+'T00:00').toLocaleDateString('pt-BR')}</strong> <small style="color:#718096;">${wd}</small>${wellbeing}</div><div style="display:flex; gap:6px;">${s!==null?`<div style="background:var(--accent-soft); color:var(--accent); padding:4px 10px; border-radius:8px; font-weight:600; font-size:0.8125rem;">Háb. ${s}%</div>`:''}${ds!==null?`<div style="background:var(--bg); color:var(--text-muted); border:1px solid var(--border); padding:4px 10px; border-radius:8px; font-weight:600; font-size:0.8125rem;">Dieta ${ds}%</div>`:''}</div></div>${tags?`<div style="margin-bottom:8px;">${tags}</div>`:''}<div style="display:flex; flex-direction:column; gap:6px;">${items.join('')||'<em style="color:#a0aec0;">-</em>'}</div>${dietItems}</div>`;});
  document.getElementById('historyTable').innerHTML=html;
}

/* ============================================================
   IMPORT / EXPORT
   ============================================================ */
function exportData(){ const blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='habitos-'+today()+'.json'; a.click(); }
function importData(e){ const f=e.target.files[0];if(!f)return; const r=new FileReader(); r.onload=ev=>{try{const d=JSON.parse(ev.target.result);if(confirm('Substituir todos os dados?')){db=d;save();location.reload();}}catch{alert('Inválido');}}; r.readAsText(f); }
function resetAll(){ if(confirm('⚠️ Apagar tudo?')){if(confirm('Tem certeza?')){localStorage.removeItem(KEY);location.reload();}}}

/* ============================================================
   RESIZE
   ============================================================ */
window.addEventListener('resize', () => {
  clearTimeout(window._rzTm);
  window._rzTm = setTimeout(() => {
    if(document.getElementById('dashboard').classList.contains('active')) renderDashboard();
    if(document.getElementById('insights').classList.contains('active'))  renderInsights();
  }, 250);
});

/* ============================================================
   INIT
   ============================================================ */
(async function initApp() {
  /* Inicializa sistema de notificações */
  await Notifications.init();

  /* Auth */
  await checkAuth();

  if(document.getElementById('mainApp').classList.contains('show')){
    loadEntries();
    updateAlertBadge();
    initBodyForm();
    renderAchievements();
  }
})();