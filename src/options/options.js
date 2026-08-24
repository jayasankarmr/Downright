/* Downright — options page. Reads and writes storage.sync directly. */
'use strict';

const api = globalThis.browser ?? globalThis.chrome;
const DEFAULTS = globalThis.DOWNRIGHT_DEFAULTS || {};

const CHECKBOXES = [
  'frontmatter', 'fmTitle', 'fmSource', 'fmAuthor', 'fmPublished',
  'fmDescription', 'fmClipped', 'titleHeading', 'toast',
];

const el = (id) => document.getElementById(id);
let saveTimer = null;

function showSaved() {
  const s = el('saved');
  s.hidden = false;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { s.hidden = true; }, 1500);
}

function applyToForm(values) {
  el('mode').value = values.mode === 'full' ? 'full' : 'article';
  el('images').checked = values.images !== 'skip';
  el('filenameTemplate').value = values.filenameTemplate || '{title}';
  for (const id of CHECKBOXES) el(id).checked = !!values[id];
  el('fm-fields').style.opacity = values.frontmatter ? '' : '0.45';
}

async function save() {
  const values = {
    mode: el('mode').value,
    images: el('images').checked ? 'keep' : 'skip',
    filenameTemplate: el('filenameTemplate').value.trim() || '{title}',
  };
  for (const id of CHECKBOXES) values[id] = el(id).checked;
  el('fm-fields').style.opacity = values.frontmatter ? '' : '0.45';
  try {
    await api.storage.sync.set(values);
    showSaved();
  } catch (e) { /* storage unavailable */ }
}

async function main() {
  let values;
  try {
    values = await api.storage.sync.get(DEFAULTS);
  } catch (e) {
    values = Object.assign({}, DEFAULTS);
  }
  applyToForm(values);

  el('mode').addEventListener('change', save);
  el('images').addEventListener('change', save);
  el('filenameTemplate').addEventListener('input', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 400);
  });
  for (const id of CHECKBOXES) el(id).addEventListener('change', save);

  el('reset').addEventListener('click', async () => {
    try {
      await api.storage.sync.set(Object.assign({}, DEFAULTS));
    } catch (e) { /* ignore */ }
    applyToForm(DEFAULTS);
    showSaved();
  });
}

main();
