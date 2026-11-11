// Documentation tab. The content is generated from docs/*.md by tools/build-docs.mjs (see docs-content.js), so the
// Markdown in docs/ is the single source. Links marked data-doc, anywhere in the page, open this tab at their target.
import { $ } from '../app/dom.js';
import { DOC_HTML } from './docs-content.js';
import { setView } from './map.js';

export var docDiv;

export function showDoc(hash) {
  setView('docs');
  var t = hash && document.getElementById(hash.replace(/^#/, ''));
  if (t && docDiv.contains(t)) t.scrollIntoView({ block: 'start' }); else docDiv.scrollTop = 0;
}

export function init() {
  docDiv = $('docs');
  if (!docDiv) return;
  docDiv.innerHTML = DOC_HTML;
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-doc]');
    if (!a) return;
    e.preventDefault(); showDoc(a.getAttribute('href'));
  });
}
