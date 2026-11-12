/* 高専コマナビ — 起動とイベントの配線 */
'use strict';

(function init() {
  loadState();
  const h = (location.hash || '').slice(1);
  if (PAGES[h]) UI.page = h;
  renderAll();

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = ACT[el.dataset.act];
    if (fn) fn(el, e);
  });
  document.addEventListener('change', e => {
    const el = e.target.closest('[data-chg]');
    if (!el) return;
    const fn = CHG[el.dataset.chg];
    if (fn) fn(el, e);
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'subj-q') {
      UI.subjQuery = e.target.value;
      const box = $('#subj-table');
      if (box) box.innerHTML = subjectRows();
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (modalOpen()) closeModal();
    else if (UI.pick) { UI.pick = null; renderPage(); }
  });
  window.addEventListener('hashchange', () => {
    const p = (location.hash || '').slice(1);
    if (PAGES[p] && p !== UI.page) { UI.page = p; UI.pick = null; renderAll(); }
  });
  /* 別のタブで保存されたら読み直す */
  window.addEventListener('storage', e => {
    if (e.key !== STORE_KEY || modalOpen()) return;
    loadState(); renderAll();
  });
  initDnD();
})();
