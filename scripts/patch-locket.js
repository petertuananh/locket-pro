const fs = require('fs');
const path = require('path');

function patchLocketJs() {
  const locketModulePath = path.join(__dirname, '..', 'node_modules', 'locket.js');
  const momentsJsPath = path.join(locketModulePath, 'lib', 'modules', 'moments.js');
  const locketPresetsPath = path.join(locketModulePath, 'caption_presets.json');
  const appPresetsPath = path.join(__dirname, '..', 'src', 'data', 'caption_presets.json');

  if (!fs.existsSync(momentsJsPath)) {
    console.log('node_modules/locket.js not found in current directory, skipping patch (will run during docker build).');
    return;
  }

  // 1. Sync caption_presets.json
  if (fs.existsSync(appPresetsPath)) {
    fs.copyFileSync(appPresetsPath, locketPresetsPath);
    console.log('✅ Synced src/data/caption_presets.json to node_modules/locket.js/caption_presets.json');
  }

  // 2. Patch moments.js
  let momentsCode = fs.readFileSync(momentsJsPath, 'utf8');
  let modified = false;

  // Always set payload.caption so Firestore and Locket clients always receive caption alongside overlays
  if (momentsCode.includes('if (cap && !overlays.length) payload.caption = cap;')) {
    momentsCode = momentsCode.replace(
      'if (cap && !overlays.length) payload.caption = cap;',
      'payload.caption = cap || caption || "";'
    );
    modified = true;
    console.log('✅ Patched payload.caption in locket.js to always preserve caption text');
  }

  // Ensure unknown or custom preset types fall back to standard caption overlay
  if (momentsCode.includes('let targetOverlayId;\n    let dataType;\n    if (noteType === NoteType.STANDARD) {')) {
    const targetBlock = 'let targetOverlayId;\n    let dataType;\n    if (noteType === NoteType.STANDARD) {';
    const replacementBlock = `let targetOverlayId;
    let dataType;
    if (noteType === NoteType.STANDARD || (presetInfo && (presetInfo.overlay_id === "caption:standard" || presetInfo.type === "standard"))) {
      targetOverlayId = "caption:standard";
      dataType = "standard";
    } else if (noteType === NoteType.STANDARD) {`;
    momentsCode = momentsCode.replace(targetBlock, replacementBlock);
    modified = true;
    console.log('✅ Patched buildOverlay in locket.js to safely map custom presets to standard');
  }

  if (modified) {
    fs.writeFileSync(momentsJsPath, momentsCode, 'utf8');
    console.log('🎉 Successfully applied all patches to locket.js!');
  } else {
    console.log('ℹ️ locket.js is already patched or patch target not matched.');
  }
}

try {
  patchLocketJs();
} catch (err) {
  console.error('Error patching locket.js:', err);
}
