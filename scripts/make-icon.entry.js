const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(() => {
  try {
    const src = path.join(__dirname, '..', 'icon.jpg');
    const outDir = path.join(__dirname, '..', 'build');
    const outPng = path.join(outDir, 'icon.png');

    if (!fs.existsSync(src)) {
      console.error(`[make-icon] 원본 없음: ${src}`);
      app.exit(1);
      return;
    }

    fs.mkdirSync(outDir, { recursive: true });

    let img = nativeImage.createFromPath(src);
    if (img.isEmpty()) {
      console.error(`[make-icon] 이미지 로드 실패: ${src}`);
      app.exit(1);
      return;
    }

    const size = img.getSize();
    const target = 256;
    if (size.width !== target || size.height !== target) {
      img = img.resize({ width: target, height: target, quality: 'best' });
    }

    fs.writeFileSync(outPng, img.toPNG());
    console.log(`[make-icon] 생성: ${outPng} (${target}x${target})`);
    app.exit(0);
  } catch (e) {
    console.error('[make-icon] 실패:', e);
    app.exit(1);
  }
});
