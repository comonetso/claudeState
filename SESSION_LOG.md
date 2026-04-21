# cloudState → claudeState 세션 핸드오프

> 이 문서는 `/finish` 후 디렉토리명 변경 → 새 세션에서 작업을 이어가기 위한 핸드오프 로그입니다.
> 작성일: 2026-04-21

---

## ⚠️ 최우선 작업: 프로젝트명 오타 수정

**현재 이름(잘못됨):** `cloudState` / `cloud-state` / `com.comonetso.cloudstate`
**올바른 이름:** `claudeState` / `claude-state` / `com.comonetso.claudestate`

이유: Claude 사용량을 표시하는 위젯인데 `cloud`로 오타가 나 있었음.

### 이름 변경 체크리스트 (새 세션에서 진행)

1. **디렉토리명**: `cloudState` → `claudeState` (사용자가 `/finish` 단계에서 수동 변경)
2. **`package.json`**:
   - `name`: `cloud-state` → `claude-state`
   - `productName`: `cloudState` → `claudeState`
   - `build.appId`: `com.comonetso.cloudstate` → `com.comonetso.claudestate`
   - `build.productName`: `cloudState` → `claudeState`
   - `build.nsis.shortcutName`: `cloudState` → `claudeState`
   - `build.portable.artifactName`: `cloudState-${version}-portable.exe` → `claudeState-${version}-portable.exe`
3. **`src/main.js`**: 모든 `[cloudState]` 로그 태그 → `[claudeState]`, 툴팁 `'cloudState'` → `'claudeState'`, `cloudstate.log` → `claudestate.log`
4. **`src/settings/index.html`**: 타이틀 등 `cloudState` → `claudeState`
5. **`src/widget/*.html`**: 해당 문자열 확인
6. **Windows 사용자 데이터 경로**: Electron은 `productName` 기반으로 `%APPDATA%\cloudState` 폴더를 생성했음. 이름 변경 후 새 폴더 `%APPDATA%\claudeState`가 생기므로, 기존 자격증명(`creds.enc`)과 `state.json`을 **수동으로 복사** 또는 설정 창에서 재입력 필요.
7. **재빌드**: `npm run dist` 재실행해서 `dist/claudeState-0.1.0-*.exe` 생성

---

## 완성된 기능 (현재 상태)

### 작동 검증 완료
- ✅ Electron 33 기반 200×40 프레임리스 위젯 (항상 위, 드래그 가능)
- ✅ claude.ai 내부 API 크롤링: `GET https://claude.ai/api/organizations/{orgId}/usage`
  - 응답 필드: `five_hour.utilization`, `seven_day.utilization`, `seven_day_sonnet`, `seven_day_opus`, `resets_at`
- ✅ 세션(S) / 주간(W) 사용률 + 재설정 시각 표시 ("오후 4:00" 같은 절대 시간)
- ✅ 트레이: 설정 / 지금 새로고침 / 위치 초기화 / 로그 보기 / 로그 폴더 열기 / 종료
- ✅ `safeStorage`(DPAPI) 기반 암호화된 자격증명 저장 (`creds.enc`)
- ✅ 새로고침 간격 설정 (10~3600초, 기본 300초)
- ✅ 위젯 위치 저장/복원 + 멀티모니터 화면 밖 검증 (`inAnyDisplay`)
- ✅ 쿠키 만료(401/403) 감지 → 빨간색 펄스 테마
- ✅ 로그 뷰어 cmd (배치 파일 + UTF-8 `chcp 65001` 방식)
- ✅ VSCode 터미널 `ELECTRON_RUN_AS_NODE=1` 우회 런처 (`scripts/run.js`)
- ✅ electron-builder로 NSIS 설치본 + 포터블 빌드 (`npm run dist`)

### 로그 정리 상태 (마지막 커밋 전 수정분)
- 제거: 위치 저장/복원 로그, API 응답 JSON 덤프, normalized 덤프, 트레이 아이콘 로드 로그, 자격증명 없음 로그
- 유지: `갱신: 세션 X% / 주간 Y%` 한 줄 요약, 모든 에러/경고, 쿠키 만료 감지

---

## 디렉토리 구조

```
cloudState/  (→ claudeState로 변경 예정)
├── package.json                # electron-builder 설정 포함
├── icon.jpg                    # 원본 아이콘 (1.28 MB)
├── build/icon.png              # make-icon.js가 생성한 256×256 빌드용 아이콘
├── scripts/
│   ├── run.js                  # ELECTRON_RUN_AS_NODE 제거 후 Electron 실행
│   ├── make-icon.js            # 빌드 아이콘 생성 런처
│   └── make-icon.entry.js      # nativeImage JPG→PNG 변환 로직
├── src/
│   ├── main.js                 # 메인 프로세스 (329줄 → 로그 정리 후 ~300줄)
│   ├── preload.js              # contextBridge IPC
│   ├── api.js                  # claude.ai 크롤링 + normalizeUsage()
│   ├── storage.js              # safeStorage 래핑
│   ├── widget/{index.html, widget.js, widget.css}
│   └── settings/{index.html, settings.js, settings.css}
└── dist/                       # 빌드 산출물 (gitignore됨)
```

---

## 핵심 API 응답 구조 (claude.ai)

```json
{
  "five_hour":        { "utilization": 19, "resets_at": "2026-04-21T07:00:00Z" },
  "seven_day":        { "utilization": 26, "resets_at": "2026-04-25T11:00:00Z" },
  "seven_day_sonnet": { "utilization": 23, "resets_at": "..." },
  "seven_day_opus":   null,
  "extra_usage":      { "is_enabled": false, "monthly_limit": null }
}
```

`normalizeUsage()` (`src/api.js:90`)가 이것을 읽어서 `{sessionPercent, sessionResetAt, weeklyPercent, weeklyResetAt, sonnetPercent, opusPercent, ...}` 형태로 변환.

---

## 중요 환경 주의사항

- **VSCode 통합 터미널**: `ELECTRON_RUN_AS_NODE=1` 환경변수가 설정되어 있어서 `electron .`을 직접 실행하면 `app`이 undefined가 됨. 반드시 `npm start` (= `node scripts/run.js`) 사용.
- **자격증명**: `sk-ant-sid02-zAVdLiFRSvynx_OjouUEOw-...` (세션 쿠키) / `da39b20c-1aee-4add-bbc6-7d876b5492fb` (orgId). 현재 `%APPDATA%\cloud-state\creds.enc`에 DPAPI 암호화 저장됨. 이름 변경 후 경로 바뀌니 설정 창에서 재입력.

---

## 개발 명령어

```bash
npm start              # 앱 실행
npm run dev            # DevTools 포함 실행
npm run make-icon      # build/icon.png 생성
npm run pack           # 언팩만 (dist/win-unpacked/)
npm run dist           # NSIS 설치본 + 포터블 exe 생성
```

앱 종료: `powershell -Command "Get-Process electron | Stop-Process -Force"`
(`/IM` 플래그는 Git Bash가 경로로 오해함)

---

## 사용자 규칙 (메모리에 저장됨 — 새 세션에서도 자동 로드)

1. **한글 사고/답변**, 영어 혼용 금지
2. 코드 변경 전 **선 브리핑 + 컨펌**
3. 탐색/조회는 자율 허용
4. **"무중단" 요청 시** — 컨펌 없이 쭉 진행
5. VSCode 터미널 Electron 이슈 주의

메모리 경로(구): `C:\Users\bluec\.claude\projects\f--workspace-Etc-Project-Electron-Project-cloudState\memory\`
→ 디렉토리명 변경 시 메모리 경로도 바뀜. 새 세션이 열리면 **새 경로에 메모리를 다시 생성해야 할 수 있음**. `MEMORY.md`를 참조해서 동일 내용 복제 권장.

---

## 새 세션에서 시작하기

1. 디렉토리 `claudeState`로 이동 후 `npm start` 로 정상 동작 확인
2. `SESSION_LOG.md`(이 파일) 읽기
3. 위 **"이름 변경 체크리스트"** 항목부터 진행
4. 변경 후 재빌드, 기존 `dist/cloudState-*.exe` 삭제
5. 자격증명 재설정 (설정 창)
