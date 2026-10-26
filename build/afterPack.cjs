// electron-builder afterPack 훅: Windows 실행 파일(Worksheet.exe)의 아이콘을 앱 아이콘으로 바꾼다.
// 리눅스에서 빌드할 때는 wine 이 없어서 electron-builder 가 실행 파일 아이콘을 넣지 못하므로,
// 순수 JavaScript 로 PE 리소스를 고치는 resedit 을 쓴다.

const fs = require('fs');
const path = require('path');
const ResEdit = require('resedit');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const icoPath = path.join(__dirname, 'icon.ico');

  const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exe);
  const icon = ResEdit.Data.IconFile.from(fs.readFileSync(icoPath));
  // 기존 아이콘 그룹(보통 id 1)의 id 와 언어를 그대로 써서 바꿔 끼운다
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const target = groups[0] ?? { id: 1, lang: 1033 };
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    res.entries,
    target.id,
    target.lang,
    icon.icons.map((i) => i.data),
  );
  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log(`  • 실행 파일 아이콘을 바꿨어요  file=${path.basename(exePath)}`);
};
