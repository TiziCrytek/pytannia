/* ============================================================
   ЛОГІКА САЙТУ
   Змінювати нічого не потрібно — усі тексти та питання в js/config.js
   ============================================================ */

(() => {
  'use strict';

  const cfg = window.INVITE;
  if (!cfg) return;

  const card = document.getElementById('card');
  const questions = Array.isArray(cfg.questions) ? cfg.questions : [];
  const answers = Object.create(null);

  let step = -1;   // -1 — привітання, 0..N-1 — питання, N — підсумок
  let busy = false;

  /* ---------------- дрібні хелпери ---------------- */

  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const val = (option) => (option.value !== undefined ? option.value : option.label);

  function render(html) {
    card.innerHTML = html;
    return card.firstElementChild;
  }

  function progress(index) {
    const total = Math.max(questions.length, 1);
    const pct = Math.round(((index + 1) / total) * 100);
    return `
      <div class="progress">
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <span class="progress-label">${index + 1}/${questions.length}</span>
      </div>`;
  }

  function record(question, value, label) {
    answers[question.id] = { value: value, label: String(label) };
  }

  function clear(question) {
    delete answers[question.id];
  }

  function next() {
    step += 1;
    if (step >= questions.length) showFinal();
    else showQuestion();
  }

  function shake(element) {
    element.classList.remove('is-shaking');
    void element.offsetWidth;
    element.classList.add('is-shaking');
    element.addEventListener('animationend', () => element.classList.remove('is-shaking'), { once: true });
  }

  /* ---------------- привітання ---------------- */

  function showIntro() {
    step = -1;
    const intro = cfg.intro || {};

    render(`
      <div class="view intro">
        ${intro.kicker ? `<p class="kicker">${esc(intro.kicker)}</p>` : ''}
        <h1 class="title">${esc(intro.title || 'Привіт')}</h1>
        <p class="lead">${esc(intro.text || '')}</p>
        <div class="intro-actions">
          <button class="btn btn-primary" type="button" data-start>${esc(intro.button || 'Почати')}</button>
        </div>
        ${intro.signature ? `<p class="hand">${esc(intro.signature)}</p>` : ''}
      </div>`);

    card.querySelector('[data-start]').addEventListener('click', () => {
      step = 0;
      showQuestion();
    });
  }

  /* ---------------- питання ---------------- */

  function showQuestion() {
    const question = questions[step];
    if (!question) return showFinal();

    const view = render(`
      <div class="view">
        ${progress(step)}
        <h2 class="question" tabindex="-1">${esc(question.text)}</h2>
        ${question.hint ? `<p class="hint">${esc(question.hint)}</p>` : ''}
        <div data-body></div>
      </div>`);

    const body = view.querySelector('[data-body]');

    switch (question.type) {
      case 'yesno': mountYesNo(body, question); break;
      case 'choice': mountChoice(body, question, false); break;
      case 'multi': mountChoice(body, question, true); break;
      case 'time': mountTime(body, question); break;
      case 'text': mountText(body, question); break;
      default:
        body.innerHTML = '<p class="hint">Невідомий тип питання — перевір js/config.js</p>';
    }

    const heading = view.querySelector('.question');
    if (heading) heading.focus({ preventScroll: true });
  }

  /* ---------- варіанти відповіді ---------- */

  function mountChoice(body, question, multi) {
    const options = Array.isArray(question.options) ? question.options : [];
    const max = multi ? (question.max || Infinity) : 1;
    const chosen = new Set();
    let customBox = null;

    const grid = document.createElement('div');
    grid.className = 'options' + (options.length <= 4 ? ' options--2' : '');

    const mark = (button, pressed) => button.setAttribute('aria-pressed', pressed ? 'true' : 'false');

    function advance(delay) {
      busy = true;
      setTimeout(() => {
        busy = false;
        next();
      }, reduced() ? 0 : (delay || 0));
    }

    function pick(option, button, delay) {
      mark(button, true);
      record(question, val(option), option.label);
      advance(delay === undefined ? 260 : delay);
    }

    function openCustom(option, button) {
      mark(button, true);

      if (customBox) {
        customBox.querySelector('textarea').focus();
        return;
      }

      customBox = document.createElement('div');
      customBox.className = 'custom-box';
      customBox.innerHTML = `
        <label class="field">
          <span class="field-label">${esc(option.customLabel || 'Свій варіант')}</span>
          <textarea class="input textarea" rows="2" maxlength="300"
            placeholder="${esc(option.customPlaceholder || '')}"></textarea>
        </label>
        <div class="card-footer">
          <button class="btn btn-primary" type="button" data-custom-ok>Далі</button>
        </div>`;

      const area = customBox.querySelector('textarea');
      const ok = customBox.querySelector('[data-custom-ok]');

      ok.addEventListener('click', () => {
        const text = area.value.trim();
        if (!text) {
          shake(area);
          area.focus();
          return;
        }
        record(question, text, `${option.label}: ${text}`);
        advance(120);
      });

      area.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') ok.click();
      });

      body.appendChild(customBox);
      area.focus({ preventScroll: true });

      if (window.innerWidth < 560) {
        customBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }

    options.forEach((option, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'opt';
      button.setAttribute('aria-pressed', 'false');
      button.innerHTML = `
        ${option.emoji ? `<span class="opt-emoji">${esc(option.emoji)}</span>` : ''}
        <span class="opt-label">${esc(option.label)}</span>
        <span class="opt-check" aria-hidden="true"></span>`;

      const labelEl = button.querySelector('.opt-label');
      let unlocked = !option.locked;
      let attempts = 0;

      button.addEventListener('click', () => {
        if (busy) return;

        /* варіант, який «не працює» */
        if (!unlocked) {
          attempts += 1;

          if (option.swapTo) {
            unlocked = true;
            labelEl.textContent = option.swapTo;
            button.classList.add('is-changed');
            record(question, option.swapTo, option.swapTo);
            mark(button, true);
            advance(1200);
            return;
          }

          if (option.unlockAfter && attempts >= option.unlockAfter && option.unlockLabel) {
            unlocked = true;
            labelEl.textContent = option.unlockLabel;
            button.classList.add('is-changed');
            shake(button);
            return;
          }

          const teases = Array.isArray(option.tease) ? option.tease : [];
          if (teases.length) labelEl.textContent = teases[Math.min(attempts, teases.length - 1)];
          shake(button);
          return;
        }

        /* варіант зі своїм текстом */
        if (option.custom && !multi) {
          openCustom(option, button);
          return;
        }

        if (!multi) {
          pick(option, button);
          return;
        }

        if (chosen.has(index)) {
          chosen.delete(index);
        } else {
          if (chosen.size >= max) return;
          chosen.add(index);
        }
        mark(button, chosen.has(index));
      });

      grid.appendChild(button);
    });

    body.appendChild(grid);

    if (!multi) return;

    const footer = document.createElement('div');
    footer.className = 'card-footer';
    footer.innerHTML = `
      <button class="btn btn-primary" type="button" data-ok>Далі</button>
      <button class="btn btn-ghost" type="button" data-skip>Пропустити</button>`;

    footer.querySelector('[data-ok]').addEventListener('click', () => {
      if (busy) return;
      const picked = Array.from(chosen).sort((a, b) => a - b);

      if (!picked.length) {
        clear(question);
      } else {
        record(
          question,
          picked.map((i) => val(options[i])),
          picked.map((i) => options[i].label).join(', '),
        );
      }
      advance(0);
    });

    footer.querySelector('[data-skip]').addEventListener('click', () => {
      if (busy) return;
      clear(question);
      advance(0);
    });

    body.appendChild(footer);
  }

  /* ---------- час ---------- */

  function mountTime(body, question) {
    const presets = Array.isArray(question.presets) ? question.presets : [];

    body.innerHTML = `
      <div class="chips">
        ${presets.map((t) => `<button class="chip" type="button" data-time="${esc(t)}" aria-pressed="false">${esc(t)}</button>`).join('')}
      </div>
      <label class="field">
        <span class="field-label">${esc(question.customLabel || 'або обери свій час')}</span>
        <input class="input" type="time" data-input />
      </label>
      <div class="card-footer">
        <button class="btn btn-primary" type="button" data-ok disabled>Далі</button>
      </div>`;

    const chips = Array.from(body.querySelectorAll('[data-time]'));
    const input = body.querySelector('[data-input]');
    const ok = body.querySelector('[data-ok]');

    const pick = (time, label) => {
      if (busy) return;
      record(question, time, label || time);
      busy = true;
      setTimeout(() => { busy = false; next(); }, reduced() ? 0 : 220);
    };

    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        chips.forEach((c) => c.setAttribute('aria-pressed', 'false'));
        chip.setAttribute('aria-pressed', 'true');
        pick(chip.dataset.time);
      });
    });

    input.addEventListener('input', () => {
      ok.disabled = !input.value;
      chips.forEach((c) => c.setAttribute('aria-pressed', 'false'));
    });

    ok.addEventListener('click', () => {
      if (!input.value) return;
      pick(input.value);
    });
  }

  /* ---------- вільна відповідь ---------- */

  function mountText(body, question) {
    body.innerHTML = `
      <label class="field">
        <textarea class="input textarea" rows="3" maxlength="${Number(question.maxlength) || 400}"
          placeholder="${esc(question.placeholder || '')}"></textarea>
      </label>
      <div class="card-footer">
        <button class="btn btn-primary" type="button" data-ok>Далі</button>
        <button class="btn btn-ghost" type="button" data-skip>Пропустити</button>
      </div>`;

    const area = body.querySelector('textarea');
    const ok = body.querySelector('[data-ok]');
    let done = false;

    const submit = () => {
      if (done) return;
      done = true;
      const text = area.value.trim();
      if (text) record(question, text, text);
      else clear(question);
      next();
    };

    ok.addEventListener('click', submit);
    body.querySelector('[data-skip]').addEventListener('click', () => {
      if (done) return;
      done = true;
      clear(question);
      next();
    });

    area.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') submit();
    });
  }

  /* ---------- так / ні ---------- */

  function mountYesNo(body, question) {
    body.innerHTML = `
      <div class="dodge" data-zone>
        <button class="btn btn-primary btn-yes" type="button" data-yes>${esc(question.yes || 'Так')}</button>
        <button class="btn btn-no" type="button" data-no tabindex="-1">${esc(question.no || 'Ні')}</button>
      </div>`;

    const zone = body.querySelector('[data-zone]');
    const yes = body.querySelector('[data-yes]');
    const no = body.querySelector('[data-no]');

    const labels = Array.isArray(question.noLabels) && question.noLabels.length
      ? question.noLabels
      : ['Ні', 'Точно ні?', 'Ну будь ласка 🥺'];

    const limit = Number(question.noLimit) || labels.length;
    let tries = 0;
    let surrendered = false;
    let pointer = { x: 0, y: 0 };
    let lastJump = 0;

    yes.addEventListener('click', () => {
      if (busy) return;
      record(question, true, question.yes || 'Так');
      confetti(46);
      busy = true;
      setTimeout(() => { busy = false; next(); }, reduced() ? 0 : 360);
    });

    /* ставить «ні» у випадкову точку всередині області:
       не наїжджаючи на «так» і не під курсором */
    function jump() {
      const box = zone.getBoundingClientRect();
      const btn = no.getBoundingClientRect();
      const yesBox = yes.getBoundingClientRect();
      const pad = 8;
      const gap = 16;
      const maxX = Math.max(box.width - btn.width - pad, pad);
      const maxY = Math.max(box.height - btn.height - pad, pad);

      // безпечні точки: тільки кути, над і під кнопкою «так» —
      // так «ні» не може накрити «так», якою б довгою не була її назва
      const spots = [
        { x: pad, y: pad },
        { x: maxX, y: pad },
        { x: pad, y: maxY },
        { x: maxX, y: maxY },
      ];

      const free = spots.filter((spot) => {
        const nx = box.left + spot.x;
        const ny = box.top + spot.y;
        return !(
          nx < yesBox.right + gap &&
          nx + btn.width > yesBox.left - gap &&
          ny < yesBox.bottom + gap &&
          ny + btn.height > yesBox.top - gap
        );
      });

      const pool = free.length ? free : spots;
      const scored = pool.map((spot) => ({
        spot: spot,
        dist: Math.hypot(
          box.left + spot.x + btn.width / 2 - pointer.x,
          box.top + spot.y + btn.height / 2 - pointer.y,
        ),
      }));

      const far = scored.filter((item) => item.dist > 120);
      const candidates = far.length
        ? far
        : [scored.sort((a, b) => b.dist - a.dist)[0]];

      const chosen = candidates[Math.floor(Math.random() * candidates.length)].spot;

      no.style.left = Math.round(chosen.x) + 'px';
      no.style.top = Math.round(chosen.y) + 'px';
      no.style.transform = `rotate(${(Math.random() * 12 - 6).toFixed(1)}deg)`;
    }

    function dodge() {
      if (surrendered) return;

      // не смикаємось частіше, ніж раз на пів кроку анімації
      const now = Date.now();
      if (now - lastJump < 160) return;
      lastJump = now;

      if (tries >= limit) {
        surrendered = true;
        no.textContent = question.surrender || 'Гаразд, так 🙈';
        no.classList.add('is-tired');
        no.style.transform = 'rotate(-3deg)';
        no.addEventListener('click', () => yes.click(), { once: true });
        return;
      }

      tries += 1;
      no.textContent = labels[Math.min(tries, labels.length - 1)];
      jump();
    }

    zone.addEventListener('pointermove', (event) => {
      pointer = { x: event.clientX, y: event.clientY };
      if (surrendered) return;
      const box = no.getBoundingClientRect();
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      const distance = Math.hypot(event.clientX - cx, event.clientY - cy);
      if (distance < Math.max(box.width, box.height) * 0.62 + 14) dodge();
    });

    // на телефоні «наведення» немає — тікаємо до натискання
    no.addEventListener('pointerdown', (event) => {
      if (surrendered) return;
      pointer = { x: event.clientX, y: event.clientY };
      event.preventDefault();
      dodge();
    });

    no.addEventListener('click', (event) => {
      if (!surrendered) event.preventDefault();
    });
  }

  /* ---------------- підсумок ---------------- */

  function answerText() {
    const lines = questions
      .filter((q) => answers[q.id])
      .map((q, i) => `${i + 1}. ${q.text}\n   → ${answers[q.id].label}`);

    return `🌷 Відповіді\n\n${lines.join('\n\n')}`;
  }

  function showFinal() {
    const final = cfg.final || {};
    const rows = questions
      .filter((q) => answers[q.id] && String(answers[q.id].label).trim())
      .map((q) => `
        <div class="plan-row">
          <span class="plan-q">${esc(q.short || q.text)}</span>
          <span class="plan-a">${esc(answers[q.id].label)}</span>
        </div>`).join('');

    render(`
      <div class="view final">
        ${final.kicker ? `<p class="kicker">${esc(final.kicker)}</p>` : ''}
        <h2 class="title">${esc(final.title || 'Готово')}</h2>
        <p class="lead">${esc(final.text || '')}</p>
        ${rows ? `<div class="plan">${rows}</div>` : ''}
        <div class="status" data-status aria-live="polite"></div>
        ${final.signature ? `<p class="hand">${esc(final.signature)}</p>` : ''}
      </div>`);

    confetti(70);
    deliver();
  }

  /* ---------------- надсилання відповідей ---------------- */

  function deliveryReady() {
    const d = cfg.delivery || {};
    if (d.method === 'telegram') return Boolean(d.telegram && d.telegram.token && d.telegram.chatId);
    if (d.method === 'web3forms') return Boolean(d.web3forms && d.web3forms.accessKey);
    return false;
  }

  function request(url, init) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    return fetch(url, { ...init, signal: controller.signal })
      .then((response) => response.text().then((raw) => {
        let data = {};
        try { data = raw ? JSON.parse(raw) : {}; } catch (error) { data = {}; }

        if (!response.ok) {
          throw new Error(data.description || data.message || `HTTP ${response.status}`);
        }
        return data;
      }))
      .finally(() => clearTimeout(timer));
  }

  function sendAnswers() {
    const d = cfg.delivery || {};
    const message = answerText();

    if (d.method === 'telegram') {
      // Telegram не пропускає JSON-запити з браузера (CORS), тому шлемо формою
      return request(`https://api.telegram.org/bot${d.telegram.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          chat_id: d.telegram.chatId,
          text: message,
          disable_web_page_preview: 'true',
        }).toString(),
      }).then((data) => {
        if (data.ok === false) throw new Error(data.description || 'telegram error');
        return data;
      });
    }

    if (d.method === 'web3forms') {
      return request('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          access_key: d.web3forms.accessKey,
          subject: d.subject || 'Відповіді',
          from_name: d.web3forms.fromName || 'Сайт',
          message: message,
        }),
      }).then((data) => {
        if (!data.success) throw new Error('web3forms error');
        return data;
      });
    }

    return Promise.reject(new Error('delivery is off'));
  }

  function renderStatus(state) {
    const box = card.querySelector('[data-status]');
    if (!box) return;

    const final = cfg.final || {};
    const messages = {
      sending: final.sending || 'Надсилаю…',
      ok: final.ok || 'Готово',
      fail: final.fail || 'Не вдалося надіслати',
      unconfigured: final.unconfigured || 'Надсилання не налаштоване',
    };

    box.className = `status status--${state}`;
    box.innerHTML = `
      <div class="status-line">
        <span class="status-dot" aria-hidden="true"></span>
        <span>${esc(messages[state] || '')}</span>
      </div>`;

    if (state !== 'fail' && state !== 'unconfigured') return;

    const actions = document.createElement('div');
    actions.className = 'status-actions';

    if (state === 'fail') {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'btn btn-ghost btn-sm';
      retry.textContent = final.retry || 'Спробувати ще';
      retry.addEventListener('click', deliver);
      actions.appendChild(retry);
    }

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'btn btn-ghost btn-sm';
    copy.textContent = final.copy || 'Скопіювати відповіді';
    copy.addEventListener('click', () => copyText(answerText(), final.copied || 'Скопійовано'));
    actions.appendChild(copy);

    box.appendChild(actions);
  }

  function deliver() {
    if (!deliveryReady()) {
      renderStatus('unconfigured');
      return;
    }

    renderStatus('sending');

    sendAnswers()
      .then(() => {
        renderStatus('ok');
        confetti(40);
      })
      .catch((error) => {
        console.warn('[invite] не вдалося надіслати відповіді:', error);
        renderStatus('fail');
      });
  }

  /* ---------------- буфер обміну та підказки ---------------- */

  function copyText(text, message) {
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      fallbackCopy(text);
      return;
    }

    navigator.clipboard.writeText(text)
      .then(() => toast(message))
      .catch(() => fallbackCopy(text));
  }

  function fallbackCopy(text) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-box">
        <p class="modal-title">Скопіюй вручну 👇</p>
        <textarea class="input textarea" rows="6" readonly></textarea>
        <button class="btn btn-primary" type="button">Закрити</button>
      </div>`;

    const area = modal.querySelector('textarea');
    area.value = text;

    modal.querySelector('button').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (event) => { if (event.target === modal) modal.remove(); });

    document.body.appendChild(modal);
    area.focus();
    area.select();
  }

  /* ---------------- конфеті та сповіщення ---------------- */

  function confetti(count) {
    if (reduced()) return;

    const colors = ['#ff6f96', '#ffb3c8', '#a992ff', '#ffd479', '#9be7c4', '#ffffff'];
    const layer = document.createElement('div');
    layer.className = 'confetti';

    for (let i = 0; i < count; i += 1) {
      const piece = document.createElement('i');
      const size = 6 + Math.random() * 8;
      piece.style.left = Math.random() * 100 + 'vw';
      piece.style.width = size + 'px';
      piece.style.height = size * (0.5 + Math.random()) + 'px';
      piece.style.background = colors[i % colors.length];
      piece.style.setProperty('--spin', Math.round(Math.random() * 720 - 360) + 'deg');
      piece.style.animationDelay = (Math.random() * 0.5).toFixed(2) + 's';
      piece.style.animationDuration = (2 + Math.random() * 1.5).toFixed(2) + 's';
      if (Math.random() > 0.65) piece.style.borderRadius = '50%';
      layer.appendChild(piece);
    }

    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 4600);
  }

  let toastTimer = 0;

  function toast(message) {
    let node = document.querySelector('.toast');
    if (!node) {
      node = document.createElement('div');
      node.className = 'toast';
      document.body.appendChild(node);
    }

    node.textContent = message;
    requestAnimationFrame(() => node.classList.add('is-on'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('is-on'), 3200);
  }

  /* ---------------- запуск ---------------- */

  function boot() {
    showIntro();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
