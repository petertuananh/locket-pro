const fs = require('fs');
const path = require('path');

let presetsCache = null;
let categoriesCache = null;

function loadPresets() {
  if (presetsCache) return { presets: presetsCache, categories: categoriesCache };

  const presetPath = path.join(__dirname, '../data/caption_presets.json');
  try {
    const raw = fs.readFileSync(presetPath, 'utf8');
    const parsed = JSON.parse(raw);
    presetsCache = parsed;

    const categorySet = new Set();
    Object.values(parsed).forEach(item => {
      if (item.section) {
        categorySet.add(item.section);
      }
    });

    categoriesCache = Array.from(categorySet);
    return { presets: presetsCache, categories: categoriesCache };
  } catch (err) {
    console.error('Lỗi khi tải caption_presets.json:', err);
    return { presets: {}, categories: [] };
  }
}

function getAllPresets() {
  return loadPresets();
}

function getPresetByKey(key) {
  const { presets } = loadPresets();
  return presets[key] || null;
}

module.exports = {
  loadPresets,
  getAllPresets,
  getPresetByKey
};
