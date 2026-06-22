/* js/notifications.js
   Sistema completo de notificações do My Fit Era
   — permissão, agendamentos pontuais, lembretes recorrentes e notificações de alerta */

const Notifications = (() => {

  /* ========= ESTADO ========= */
  let swRegistration = null;
  let scheduleTimers  = [];    // setTimeout IDs de notificações pontuais
  let recurringTimers = [];    // setInterval IDs de lembretes recorrentes

  /* ========= CONFIGURAÇÃO PADRÃO ========= */
  /* Salva/carrega em localStorage junto com o db do app */
  const CONFIG_KEY = 'myfitera_notif_config';

  function loadConfig() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG_KEY)) || defaultConfig();
    } catch {
      return defaultConfig();
    }
  }

  function saveConfig(cfg) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  }

  function defaultConfig() {
    return {
      enabled: false,
      reminders: [
        { id: 'morning',   label: 'Lembrete matinal',      time: '08:00', active: false, message: '🌅 Bom dia! Não esqueça de registrar seus hábitos hoje.' },
        { id: 'lunch',     label: 'Lembrete do almoço',    time: '12:00', active: false, message: '☀️ Hora do almoço — registre sua dieta!' },
        { id: 'evening',   label: 'Lembrete da tarde',     time: '18:00', active: false, message: '🌆 Como foi o dia? Marque seus hábitos!' },
        { id: 'night',     label: 'Lembrete noturno',      time: '21:00', active: false, message: '🌙 Antes de dormir, complete o registro do dia.' },
        { id: 'water',     label: 'Beber água (a cada 2h)', time: null,   active: false, message: '💧 Hora de beber água!', interval: 120 },
        { id: 'posture',   label: 'Postura (a cada 1h)',   time: null,    active: false, message: '🪑 Verifique sua postura!',  interval: 60  }
      ]
    };
  }

  /* ========= SERVICE WORKER ========= */
  async function registerSW() {
    if (!('serviceWorker' in navigator)) return null;
    try {
      swRegistration = await navigator.serviceWorker.register('/sw/service-worker.js', { scope: '/' });
      console.log('[Notif] Service Worker registrado.');
      return swRegistration;
    } catch (err) {
      console.warn('[Notif] SW não registrado:', err);
      return null;
    }
  }

  /* ========= PERMISSÃO ========= */
  async function requestPermission() {
    if (!('Notification' in window)) {
      return { status: 'unsupported', message: 'Seu navegador não suporta notificações.' };
    }

    if (Notification.permission === 'granted') {
      return { status: 'granted' };
    }

    if (Notification.permission === 'denied') {
      return { status: 'denied', message: 'Permissão bloqueada. Reative nas configurações do navegador.' };
    }

    const result = await Notification.requestPermission();
    return { status: result };
  }

  function getPermissionStatus() {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission; // 'default' | 'granted' | 'denied'
  }

  /* ========= ENVIAR NOTIFICAÇÃO ========= */
  function sendNotification(title, body, options = {}) {
    if (Notification.permission !== 'granted') return;

    const notifOptions = {
      body,
      icon: options.icon || '/icon-192.png',
      tag:  options.tag  || 'myfitera-' + Date.now(),
      ...options
    };

    /* Prefere usar o SW (funciona em background) */
    if (swRegistration?.showNotification) {
      swRegistration.showNotification(title, notifOptions);
    } else {
      new Notification(title, notifOptions);
    }
  }

  /* ========= AGENDAR LEMBRETES DIÁRIOS (horário fixo) ========= */
  function scheduleDaily(reminderId, timeStr, message) {
    const [h, m] = timeStr.split(':').map(Number);
    const now  = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);

    if (next <= now) next.setDate(next.getDate() + 1); // amanhã se já passou

    const delay = next - now;

    const timer = setTimeout(() => {
      sendNotification('🏋️ My Fit Era', message, { tag: reminderId });
      /* Re-agenda para o próximo dia (24h depois) */
      scheduleDaily(reminderId, timeStr, message);
    }, delay);

    scheduleTimers.push({ id: reminderId, timer });
    console.log(`[Notif] Agendado "${reminderId}" para ${next.toLocaleTimeString('pt-BR')}`);
  }

  /* ========= LEMBRETES RECORRENTES (intervalo fixo em minutos) ========= */
  function startRecurring(reminderId, intervalMin, message) {
    const ms = intervalMin * 60 * 1000;
    const timer = setInterval(() => {
      sendNotification('🏋️ My Fit Era', message, { tag: reminderId });
    }, ms);
    recurringTimers.push({ id: reminderId, timer });
    console.log(`[Notif] Recorrente "${reminderId}" a cada ${intervalMin} min.`);
  }

  /* ========= PARAR LEMBRETE ========= */
  function stopReminder(reminderId) {
    scheduleTimers = scheduleTimers.filter(t => {
      if (t.id === reminderId) { clearTimeout(t.timer); return false; }
      return true;
    });
    recurringTimers = recurringTimers.filter(t => {
      if (t.id === reminderId) { clearInterval(t.timer); return false; }
      return true;
    });
  }

  /* ========= APLICAR CONFIGURAÇÃO SALVA ========= */
  function applyConfig(cfg) {
    /* Para tudo antes de reaplicar */
    scheduleTimers.forEach(t => clearTimeout(t.timer));
    recurringTimers.forEach(t => clearInterval(t.timer));
    scheduleTimers  = [];
    recurringTimers = [];

    if (!cfg.enabled || Notification.permission !== 'granted') return;

    cfg.reminders.forEach(r => {
      if (!r.active) return;
      if (r.time) {
        scheduleDaily(r.id, r.time, r.message);
      } else if (r.interval) {
        startRecurring(r.id, r.interval, r.message);
      }
    });
  }

  /* ========= NOTIFICAÇÃO DE ALERTA DE HÁBITO ========= */
  /* Chamada pelo sistema de alertas do app quando detecta queda num hábito */
  function alertHabit(habitName, message) {
    sendNotification(`⚠️ Atenção: ${habitName}`, message, { tag: 'alert-habit-' + habitName });
  }

  /* ========= LEMBRETE PONTUAL (uso direto da UI) ========= */
  function sendIn(seconds, title, body) {
    if (Notification.permission !== 'granted') return;
    setTimeout(() => sendNotification(title, body, { tag: 'pontual-' + Date.now() }), seconds * 1000);
  }

  /* ========= INICIALIZAÇÃO ========= */
  async function init() {
    await registerSW();
    const cfg = loadConfig();
    applyConfig(cfg);
    return cfg;
  }

  /* ========= API PÚBLICA ========= */
  return {
    init,
    requestPermission,
    getPermissionStatus,
    sendNotification,
    sendIn,
    alertHabit,
    loadConfig,
    saveConfig,
    applyConfig,
    stopReminder,
    scheduleDaily,
    startRecurring
  };

})();