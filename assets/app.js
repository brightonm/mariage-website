(() => {
  'use strict';

  const ITER = 300000;
  const MARKER = '<!--ok-->';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // --- Déchiffrement (compatible `openssl enc -aes-256-cbc -pbkdf2`) ---
  async function decrypt(b64, password) {
    const raw = Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0));
    const salt = raw.slice(8, 16);
    const data = raw.slice(16);
    const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, km, 384);
    const key = await crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-CBC', false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: bits.slice(32, 48) }, key, data);
    const html = new TextDecoder().decode(plain);
    if (!html.startsWith(MARKER)) throw new Error('bad password');
    return html.slice(MARKER.length);
  }

  // --- Accès ---
  const form = $('#gate-form');
  const msg = $('#gate-msg');
  let encrypted = null;

  async function unlock(password) {
    if (!encrypted) {
      const res = await fetch('assets/content.enc', { cache: 'no-cache' });
      if (!res.ok) throw new Error('missing content');
      encrypted = await res.text();
    }
    const html = await decrypt(encrypted, password);
    $('#app').innerHTML = html;
    $('#app').hidden = false;
    $('#gate').remove();
    document.body.classList.remove('locked');
    try { sessionStorage.setItem('pw', password); } catch (e) {}
    initSite();
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    msg.textContent = '';
    const btn = $('button', form);
    btn.disabled = true;
    try {
      await unlock($('#gate-pw').value.trim());
    } catch (err) {
      msg.textContent = err.message === 'missing content'
        ? 'Le contenu est momentanément indisponible.'
        : 'Mot de passe incorrect. Vérifiez votre invitation.';
      btn.disabled = false;
      $('#gate-pw').select();
    }
  });

  try {
    const saved = sessionStorage.getItem('pw');
    if (saved) unlock(saved).catch(() => sessionStorage.removeItem('pw'));
  } catch (e) {}

  // --- Site (après déchiffrement) ---
  function initSite() {
    const tabs = $$('[data-tab]');
    const panels = $$('.panel');

    function show(id) {
      if (!panels.some(p => p.id === id)) id = 'accueil';
      panels.forEach(p => p.classList.toggle('active', p.id === id));
      tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === id));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    document.addEventListener('click', e => {
      const t = e.target.closest('[data-tab]');
      if (!t) return;
      e.preventDefault();
      history.replaceState(null, '', '#' + t.dataset.tab);
      show(t.dataset.tab);
    });
    show(location.hash.slice(1) || 'accueil');

    const cfg = $('#cfg').dataset;

    // Compte à rebours
    const cd = $('#countdown');
    if (cd && cfg.date) {
      const target = new Date(cfg.date).getTime();
      const tick = () => {
        const d = Math.max(0, target - Date.now());
        const v = [Math.floor(d / 864e5), Math.floor(d / 36e5) % 24, Math.floor(d / 6e4) % 60];
        $$('[data-u]', cd).forEach((el, i) => { el.textContent = v[i]; });
      };
      tick();
      setInterval(tick, 30000);
    }

    // Réponse (RSVP) -> Google Sheets via Apps Script
    const rsvp = $('#rsvp-form');
    if (rsvp) {
      const status = $('#rsvp-status');
      const toggle = () => {
        const yes = rsvp.elements.presence.value === 'oui';
        $('#rsvp-details').hidden = !yes;
      };
      rsvp.addEventListener('change', toggle);
      toggle();

      rsvp.addEventListener('submit', async e => {
        e.preventDefault();
        if (rsvp.elements.website.value) return; // anti-spam
        if (!cfg.rsvp) {
          status.textContent = "Le formulaire n'est pas encore configuré.";
          return;
        }
        const btn = $('button[type=submit]', rsvp);
        btn.disabled = true;
        status.textContent = 'Envoi en cours…';
        try {
          await fetch(cfg.rsvp, { method: 'POST', mode: 'no-cors', body: new URLSearchParams(new FormData(rsvp)) });
          rsvp.hidden = true;
          const yes = rsvp.elements.presence.value === 'oui';
          $('#rsvp-thanks').textContent = yes
            ? 'Grazie mille ! Nous avons hâte de fêter ça avec vous.'
            : 'Merci de nous avoir répondu. Vous nous manquerez.';
          $('#rsvp-thanks').hidden = false;
        } catch (err) {
          status.textContent = "Oups, l'envoi a échoué. Réessayez ou écrivez-nous directement.";
          btn.disabled = false;
        }
      });
    }
  }
})();
