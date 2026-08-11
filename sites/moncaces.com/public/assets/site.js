// MonCACES.com — interactions communes (menu mobile + formulaire de lead)
document.addEventListener('DOMContentLoaded', () => {
  const burger = document.querySelector('.burger');
  const nav = document.querySelector('nav.main');
  if (burger && nav) {
    burger.addEventListener('click', () => nav.classList.toggle('open'));
  }

  const form = document.querySelector('form.lead');
  if (form) {
    // Pré-sélection de la formation via ?formation=...
    const params = new URLSearchParams(location.search);
    const wanted = params.get('formation');
    const select = form.querySelector('select[name="formation"]');
    if (wanted && select) {
      [...select.options].forEach((o) => {
        if (o.value.toLowerCase().includes(wanted.toLowerCase())) select.value = o.value;
      });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = document.getElementById('form-status');
      const data = Object.fromEntries(new FormData(form).entries());
      status.textContent = 'Envoi en cours…';
      status.className = '';
      try {
        const res = await fetch('/api/lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const out = await res.json();
        if (out.ok) {
          status.textContent = '✔ ' + out.message;
          status.className = 'ok';
          form.reset();
        } else {
          status.textContent = '✖ ' + (out.error || 'Erreur lors de l\'envoi.');
          status.className = 'err';
        }
      } catch {
        status.textContent = '✖ Erreur réseau. Réessayez ou appelez-nous.';
        status.className = 'err';
      }
    });
  }
});
