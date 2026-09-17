# claudeState

Claude 사용량(5시간 세션 + 주간)과 Codex 사용량을 작업표시줄 옆에 작게 띄워놓는 Windows 위젯.

위젯 우클릭으로 설정/숨기기 가능, 일반 창 위에 항상 표시되지만 작업표시줄은 건드리지 않습니다.

**[⬇ Windows(x64)용 내려받기](https://github.com/comonetso/claudeState/releases/latest/download/claudeState-Setup-x64.exe)** · [릴리즈 노트](https://github.com/comonetso/claudeState/releases/latest)

> English README: [README.md](README.md)

---

## 주요 기능

- **한눈에 두 줄** — 5시간 세션 + 7일 주간 사용률, 리셋까지 남은 시간
- **Codex 사용량** — PC에 [Codex CLI](https://github.com/openai/codex)가 설치돼 있으면 오른쪽 열에 Codex 5시간·주간 사용률을 함께 표시 (설정 불필요)
- **상세 패널** — 위젯에 마우스를 올리면 리셋 시각, 막대 그래프, 모델별(Sonnet / Opus) 수치를 보여주는 패널이 뜸
- **전체화면 자동 숨김** — 동영상·게임 등 전체화면 창이 위젯을 덮으면 숨고, 벗어나면 다시 나타남
- **쿠키 만료 경보** — 세션 쿠키가 죽으면 위젯이 빨간색으로 깜빡임
- **트레이 + 컨텍스트 메뉴** — 위젯 표시/숨기기, 새로고침, 위치 초기화, 로그 보기
- **자동 실행** — Windows 시작 시 자동 실행 (옵션)
- **다국어** — 한국어 / 영어, 설정에서 즉시 전환
- **투명도 조절** — 30% – 100% 슬라이더
- **자격증명 암호화** — OS 자격증명 저장소(Windows DPAPI, `safeStorage`) 사용
- **멀티모니터 대응** — 음수 X 좌표까지 기억
- **자동 업데이트** — 새 버전을 받아 두면 확인 창과 위젯의 ⬆ 표시로 알리고, 재시작하면 조용히 설치
- **텔레그램 알림** — 5시간 세션이 리셋되는 순간 텔레그램 메시지로 통보, 타이밍 놓치지 않고 바로 시작 가능

---

## 위젯 레이아웃

Codex CLI가 없을 때 (막대 그래프 표시):

```
┌────────────────────────────────────────────────┐
│ S  ▓▓▓▓░░░░░░  19%   오후 4:00 (2시간 14분 후) │
│ W  ▓▓▓░░░░░░░  26%   오후 8:00 (토)           │
└────────────────────────────────────────────────┘
```

Codex CLI가 있을 때 (왼쪽 Claude, 오른쪽 Codex — 막대 대신 남은 시간만):

```
┌──────────────────────────────────────────────────────┐
│ S ✳  3% 3시간 26분 후  │ ⬡ 12% 1시간 5분 후        │
│ W ✳ 70% 1일 23시간 후  │ ⬡ 40% 6일 23시간 후       │
└──────────────────────────────────────────────────────┘
```

- `S` = 5시간 세션, `W` = 7일 주간 전체
- 5시간 한도가 없는 Codex 플랜(Pro Lite 등)은 Codex `S` 칸에 **"5시간 제한 미적용"** 이 표시됩니다.

---

## 설치

### A안 — 설치본 내려받기 (권장)

**[claudeState-Setup-x64.exe](https://github.com/comonetso/claudeState/releases/latest/download/claudeState-Setup-x64.exe)** 를 받아 실행. 이 링크는 항상 최신 버전을 받습니다.

NSIS 기반, 설치 경로 선택 가능, 바탕화면/시작메뉴 바로가기 선택 가능. Windows x64 전용.

### B안 — 소스에서 실행

```bash
git clone https://github.com/comonetso/claudeState.git
cd claudeState
npm install
npm start
```

로컬 빌드:

```bash
npm run dist     # NSIS 설치본 → dist/
npm run pack     # 언팩 빌드 → dist/win-unpacked/
```

---

## 최초 설정

처음 실행하면 위젯에 **"설정 필요"** 표시. 위젯 우클릭 → **설정** 에서 아래 두 값을 입력하면 됩니다.

> ⚠️ 세션 쿠키는 비밀번호처럼 취급하세요. 채팅/스크린샷/공개 저장소 어디에도 절대 붙여넣지 마세요.

Codex는 따로 설정할 것이 없습니다. Codex CLI에 로그인돼 있으면(`codex login`) 그 인증을 그대로 씁니다.

### 1. Session Cookie (`sessionKey`)

1. [https://claude.ai](https://claude.ai)에 로그인.
2. 개발자도구 열기 — `F12` 또는 우클릭 → **검사**.
3. **Application** 탭(Chrome/Edge) 또는 **Storage** 탭(Firefox)으로 이동.
4. 좌측에서 **Cookies** → `https://claude.ai` 선택.
5. `sessionKey`라는 이름의 행을 찾습니다.
6. **Value** 컬럼의 값을 복사 — `sk-ant-sid0…` 으로 시작합니다.

복사한 값을 설정 창의 **Session Cookie** 칸에 붙여넣기.

**참고**: 쿠키는 주기적으로 로테이션됩니다. 위젯이 빨갛게 깜빡이며 "쿠키 만료"가 뜨면 1~6번 과정을 반복해서 새 값으로 덮어쓰세요.

### 2. Organization ID (UUID)

아래 두 가지 방법 중 편한 쪽으로.

#### 방법 A — 계정 페이지에서 (가장 쉬움)

1. [https://claude.ai/settings/account](https://claude.ai/settings/account) 접속.
2. **Organization ID** 행을 찾아 UUID 복사.

#### 방법 B — Network 탭에서

1. 개발자도구 **Network** 탭을 연 상태에서 [https://claude.ai/settings/usage](https://claude.ai/settings/usage) 방문.
2. Network 목록에서 `usage`라는 이름의 요청을 찾습니다.
3. 클릭해서 **Request URL**을 봅니다.
4. URL에서 `/api/organizations/` 와 `/usage` 사이의 UUID를 복사.

어느 방법을 쓰든 `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` 형식의 UUID가 나옵니다 (예: `9f3c2a6e-4b7d-4c5f-8f0a-2f5e6c1a9d42`).

이 값을 설정 창의 **Organization ID** 칸에 붙여넣고 **저장** 누르면 끝.

### 3. (선택) 새로고침 간격 / 언어 / 투명도 / 자동 실행

- 새로고침 간격 — 10 ~ 3600초 (기본 300). Claude와 Codex를 같은 주기로 조회하되, Codex는 1분보다 자주 조회하지 않습니다.
- 언어 — 한국어(기본) / English, 실시간 전환
- 위젯 투명도 — 30% ~ 100%
- Windows 시작 시 자동 실행 — 기본 ON

쿠키는 `safeStorage` (Windows DPAPI)로 암호화되어 `%APPDATA%\claudeState\creds.enc`에 저장됩니다.

---

## 사용

| 동작 | 방법 |
|---|---|
| 위젯 이동 | 좌클릭 드래그 |
| 상세 패널 | 위젯에 마우스를 잠깐 올려두기 |
| 컨텍스트 메뉴 | 위젯 우클릭 |
| 지금 새로고침 | 위젯 더블클릭 또는 트레이 → 지금 새로고침 |
| 숨기기/표시 | 트레이 → "위젯 표시" 체크박스 또는 위젯 우클릭 → 숨기기 |
| 위치 초기화 | 트레이 → "위치 초기화" |
| 로그 보기 | 트레이 → "로그 보기" (실시간 tail) |
| 업데이트 확인 | 트레이 → "업데이트 확인" |
| 업데이트 설치 | 위젯의 초록 ⬆ 클릭 또는 트레이 → "재시작하여 v… 설치" |
| 종료 | 트레이 → 종료 |

---

## 문제 해결

### "쿠키 만료" 빨간 깜빡임
claude.ai의 세션 쿠키가 로테이션된 상태. claude.ai 재로그인 → 새 `sessionKey` 복사 → 설정에 붙여넣기.

### 위젯이 안 보여요
- 트레이 아이콘 확인 후 우클릭 → "위젯 표시"
- 화면 밖으로 갔으면 트레이 → "위치 초기화"
- 전체화면 창이 떠 있으면 자동으로 숨습니다. 전체화면에서 나오면 1~2초 뒤 다시 나타납니다.

### Codex 열이 안 보여요
Codex CLI가 설치돼 있지 않거나 `PATH`에서 찾지 못하는 상태입니다. 터미널에서 `where codex` 가 경로를 출력하는지 확인하세요. 설치 직후라면 새로고침 주기가 한 번 돌 때 감지됩니다.

### 실행 후 작업표시줄이 얼어요
최근 빌드에서 `alwaysOnTop` 레벨을 `screen-saver` → `floating`으로 낮추고 `CalculateNativeWinOcclusion` 기능을 끈 뒤 해결. 그래도 재현되면 Windows 빌드 번호 + 디스플레이 구성을 Issue로 올려주세요.

### 중복 실행
두 번째 실행 시 토스트("이미 실행 중입니다. 트레이 아이콘을 확인하세요.")만 뜨고 기존 위젯을 다시 표시. 프로세스는 항상 하나.

### VSCode 통합 터미널에서 실행
VSCode가 `ELECTRON_RUN_AS_NODE=1`을 설정해 놓아서 `electron .`을 직접 실행하면 깨집니다. 반드시 `npm start` / `npm run dev`로 — `scripts/run.js`가 해당 환경변수를 제거한 뒤 Electron을 스폰합니다.

---

## 텔레그램 알림 (세션 리셋 알림)

Claude 5시간 세션은 **리셋 후 첫 메시지를 보낸 순간부터** 카운트가 시작됩니다.
리셋 타이밍을 정확히 알면 바로 시작해서 5시간을 풀로 활용할 수 있습니다.

### 설정 방법

**Step 1 — 텔레그램 봇 만들기 (최초 1회)**

1. 텔레그램에서 **@BotFather** 검색 후 대화 시작.
2. `/newbot` 전송 → 봇 이름/아이디 지정.
3. BotFather가 토큰(`1234567890:ABCdef...` 형식)을 발급해줍니다 — 복사.

**Step 2 — 봇과 계정 연결**

1. claudeState 우클릭 → **설정** → 스크롤 내려서 **텔레그램 알림** 섹션.
2. Bot Token 입력란에 토큰 붙여넣기.
3. 텔레그램에서 **방금 만든 봇**을 찾아 **`/start`** 또는 아무 메시지나 전송.
   > ⚠️ 이 단계를 빠뜨리면 앱이 Chat ID를 찾지 못합니다.
4. 설정창에서 **"내 텔레그램과 연결"** 클릭 → 앱이 `getUpdates`로 Chat ID를 자동 감지하여 저장.
5. 상태가 **"연결됨: [이름]"** 으로 바뀌면 성공.
6. **"테스트 메시지 전송"** 으로 최종 확인.

### 받게 되는 메시지

5시간 세션이 리셋되면:

```
✅ Claude 세션 리셋

지금 시작하면 5시간 풀로 사용 가능합니다.
주간 사용률: 33%
```

별도 폴링/서비스 없이 기존 새로고침 주기(기본 5분)에서 리셋을 감지하면 자동 발송됩니다. 알림 대상은 Claude 세션뿐입니다.

---

## 자동 업데이트

`electron-updater`가 GitHub Releases의 `latest.yml`을 읽어 새 버전을 판별합니다.

- **앱 시작 시** (기동 10초 후) + **1시간마다** 최신 릴리즈를 조회합니다.
- 새 버전이 있으면 백그라운드로 다운로드합니다.
- 다운로드가 끝나면 **"지금 재시작 / 나중에"** 확인 창이 뜹니다. **지금 재시작**을 누르면 설치 마법사 없이 조용히 설치하고 다시 실행합니다.
- **나중에**를 누르면 같은 버전은 다시 묻지 않습니다. 위젯 우상단의 초록 **⬆** 를 누르거나(상세 패널에도 안내가 뜸), 트레이 → **"재시작하여 v… 설치"** 를 누르거나, 앱을 종료할 때 설치됩니다.
- 설치 경로가 `C:\Program Files` 아래라면 Windows 관리자 권한 확인(UAC)이 한 번 뜰 수 있습니다.
- 개발 실행(`npm start`)에서는 업데이트 체크를 스킵합니다. 패키지 빌드에서만 작동.

### 새 릴리즈 배포 (유지보수자용)

1. [package.json](package.json)의 `version` 을 올립니다.
2. 변경을 커밋하고 푸시합니다. `electron-builder`가 원격 기본 브랜치의 최신 커밋에 `v<버전>` 태그를 붙이므로, 푸시 전에 릴리즈하면 태그와 코드가 어긋납니다.
3. 로그인된 GitHub CLI 인증을 그 명령에만 넘겨 빌드 + 퍼블리시:
   ```powershell
   $env:GH_TOKEN = (gh auth token); npm run release
   ```
   ```bash
   GH_TOKEN="$(gh auth token)" npm run release
   ```
4. `electron-builder`가 NSIS 인스톨러(`claudeState-Setup-x64.exe`) + `latest.yml` + `*.blockmap`을 빌드해서 **바로 공개되는** GitHub Release로 업로드합니다(초안 아님). 사용자 앱은 다음 기동/1시간 주기 체크에서 자동 감지.

로컬에서 인스톨러만 만들고 **퍼블리시 없이** 빌드하려면 `npm run dist`.

업데이트 정보 파일은 **YAML (`latest.yml`)** 이며 `--publish=always` 빌드 시 `electron-builder`가 자동 생성 + 업로드합니다. 수동 관리 파일 없음. 설치 파일 이름에 버전이 없으므로 위의 다운로드 링크는 고칠 필요가 없습니다.

---

## 아키텍처 요약

- **Main** ([src/main.js](src/main.js)) — 위젯/상세 패널/설정창, 트레이, IPC, 로그 티, 새로고침 루프.
- **Preload** ([src/preload.js](src/preload.js)) — `contextBridge`로 `window.claudeState` API 노출.
- **Renderer** — [src/widget/](src/widget/), [src/panel/](src/panel/), [src/settings/](src/settings/). 컨텍스트 격리 ON, 노드 통합 OFF.
- **Claude API** ([src/api.js](src/api.js)) — `https://claude.ai/api/organizations/{orgId}/usage` 호출 후 `{sessionPercent, weeklyPercent, sonnetPercent, opusPercent, …}`로 정규화.
- **Codex** ([src/codex.js](src/codex.js)) — 설치된 Codex CLI를 `app-server` 모드로 띄워 JSON-RPC(`account/rateLimits/read`)로 한도를 조회. 네트워크 요청이 아니라 자식 프로세스.
- **작업표시줄/전체화면 대응** ([src/taskbarGuard.js](src/taskbarGuard.js)) — Win32 이벤트 훅으로 위젯이 작업표시줄 뒤로 밀리면 복원하고, 전체화면 창을 감지해 숨김.
- **업데이트** ([src/updater.js](src/updater.js)) — `electron-updater` 래퍼. 확인 창과 상태 전달.
- **텔레그램** ([src/telegram.js](src/telegram.js)) — 봇 연결·메시지 전송.
- **Storage** ([src/storage.js](src/storage.js))
  - 자격증명 → `safeStorage.encryptString` → `creds.enc`
  - 일반 상태(위치, 간격, 투명도, 언어, 자동실행) → `state.json`
- **i18n** ([src/i18n/](src/i18n/)) — `ko` / `en` JSON + 간단한 `t(key, ...args)` 헬퍼. 언어 변경 시 `i18n:changed` 브로드캐스트로 렌더러 즉시 반영.

### 새로고침 사이클

```
timer → refreshUsage()
  ├─ storage.getCredentials() → api.fetchUsage(cookie, orgId) → normalizeUsage()
  └─ codex.fetchRateLimits()   (Codex CLI 감지 시)
  → broadcast('usage:update', {status, data, codex})
  → widget/panel/settings 렌더러 갱신
```

API 401/403 → `AUTH_EXPIRED` → `status: 'auth_expired'` → 위젯 빨간 펄스. Codex 조회가 실패해도 Claude 표시는 그대로입니다.

---

## Claude API 응답 필드 메모

필드명이 직관적이지 않아 정규화합니다:

| 원본 | 의미 | 정규화 |
|---|---|---|
| `five_hour` | 5시간 세션 | `sessionPercent`, `sessionResetAt` |
| `seven_day` | 7일 주간 전체 | `weeklyPercent`, `weeklyResetAt` |
| `seven_day_sonnet` | Sonnet 7일 | `sonnetPercent`, `sonnetResetAt` |
| `seven_day_opus` | Opus 7일 (null 가능) | `opusPercent`, `opusResetAt` |
| `utilization` | 퍼센트 (not `percent_used`) | — |
| `resets_at` | ISO 타임스탬프 (not `reset_at`) | — |

Claude 응답 포맷이 바뀌면 [src/api.js](src/api.js)의 `normalizeUsage()` 하나만 고치면 됩니다.

## Codex 응답 필드 메모

`account/rateLimits/read` 는 `primary` / `secondary` 두 칸으로 한도를 주지만, **칸의 자리가 플랜마다 다릅니다.**

| 플랜 | `primary` | `secondary` |
|---|---|---|
| Plus | 300분 (5시간 창) | 10080분 (주간 창) |
| Pro Lite | 10080분 (주간 창) | 없음 |

그래서 자리가 아니라 창 길이(`windowDurationMins`)로 고릅니다 — 300분 = 5시간, 10080분 = 주간. 300분 창이 없으면 주간만 표시합니다. `usedPercent` 는 소진율, `resetsAt` 은 epoch **초**입니다. 수정할 곳은 [src/codex.js](src/codex.js)의 `normalize()` 입니다.

---

## 개인정보

앱이 직접 통신하는 곳은 아래뿐입니다.

- `https://claude.ai/api/…` — Claude 사용량 조회. 세션 쿠키는 이 요청의 `Cookie` 헤더 외에는 기기를 벗어나지 않습니다.
- `https://api.telegram.org` — 텔레그램 알림을 켠 경우에만.
- GitHub Releases — 업데이트 확인과 다운로드.

Codex 사용량은 앱이 직접 요청하지 않고, 설치된 Codex CLI에 물어봅니다. Codex 인증은 CLI가 자기 파일(`~/.codex/auth.json`)로 처리하며, 앱은 Codex 자격증명을 읽거나 저장하지 않습니다.

쿠키는 `safeStorage`(Windows DPAPI)로 디스크에 암호화 저장. `safeStorage.isEncryptionAvailable()`가 false일 때만 평문 JSON으로 폴백.

---

## 라이선스

MIT — [LICENSE](LICENSE) 참고.

---

## 크레딧

[Electron](https://www.electronjs.org/) + [electron-builder](https://www.electron.build/) 기반.
