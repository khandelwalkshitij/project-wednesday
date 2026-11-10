// Small DOM helpers: element lookup and creation, file download and upload.
export function $(id) { return document.getElementById(id); }

export function el(tag, text, cls) { var e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; }

export function download(name, text, type) { var a = el('a'); a.href = URL.createObjectURL(new Blob([text], { type: type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000); }

export function readFile(input, cb) { var f = input.files[0]; if (!f) return; var r = new FileReader(); r.onload = function () { cb(String(r.result)); input.value = ''; }; r.readAsText(f); }
