// Windows 98 style tooltips for the ? buttons.
export function init() {
  // ------------------------------------------------------------ Global Win98 Infotip Handler (unclipped)
  (function initInfotip() {
    var tip = document.createElement('div');
    tip.id = 'win98-infotip';
    tip.hidden = true;
    document.body.appendChild(tip);

    var curTarget = null;
    function show(btn) {
      var html = btn.getAttribute('data-tip');
      if (!html) return;
      curTarget = btn;
      tip.innerHTML = html;
      tip.hidden = false;
      var r = btn.getBoundingClientRect();
      var tw = tip.offsetWidth || 300, th = tip.offsetHeight || 90;
      var left = r.left;
      if (left + tw > window.innerWidth - 10) left = window.innerWidth - tw - 10;
      if (left < 6) left = 6;
      var top = r.bottom + 5;
      if (top + th > window.innerHeight - 8) top = Math.max(6, r.top - th - 5);
      tip.style.left = Math.round(left) + 'px';
      tip.style.top = Math.round(top) + 'px';
    }
    function hide() {
      tip.hidden = true;
      curTarget = null;
    }
    document.addEventListener('pointerover', function (e) {
      var btn = e.target && e.target.closest && e.target.closest('.info-btn');
      if (btn) show(btn);
    });
    document.addEventListener('pointerout', function (e) {
      var btn = e.target && e.target.closest && e.target.closest('.info-btn');
      if (btn && btn === curTarget) hide();
    });
    document.addEventListener('focusin', function (e) {
      if (e.target && e.target.classList && e.target.classList.contains('info-btn')) show(e.target);
    });
    document.addEventListener('focusout', function (e) {
      if (e.target && e.target.classList && e.target.classList.contains('info-btn')) hide();
    });
  })();
}
