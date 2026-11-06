# 환경 운영일지 · 법령 개정 자동 확인

매일 아침 GitHub Actions가 법제처 국가법령정보 Open API로 추적 법령을 확인합니다.
결과는 `data/laws.json`에 저장되고, 웹앱의 「법령 개정」 탭이 이 파일을 읽어 새 개정과 시행 예정 개정을 보여 줍니다.

```
index.html                       웹앱 (GitHub Pages로 공개)
data/tracked.json                추적할 법령 목록 ← 여기만 고치면 대상이 바뀝니다
data/laws.json                   자동 확인 결과 (봇이 갱신, 직접 고치지 않음)
scripts/check-laws.mjs           법제처 조회 스크립트 (Node 20, 외부 패키지 없음)
.github/workflows/check-laws.yml 매일 06:17(한국시간) 자동 실행 설정
```

## 1. 법제처 Open API 인증값(OC) 받기

1. https://open.law.go.kr 회원가입 후 로그인
2. 상단 메뉴 **OPEN API → OPEN API 신청**에서 활용 신청
   - 사용할 API로 **법령**(현행법령, 시행일법령)을 고릅니다. 고시도 보려면 **행정규칙**도 함께 고릅니다.
   - 서버 IP나 도메인을 묻는 항목이 있으면 신청 화면 안내를 따릅니다. GitHub Actions는 실행할 때마다 IP가 바뀌니, 특정 IP만 허용하는 방식이면 아래 "문제 해결"을 보세요.
3. 승인되면 **OC 값**을 확인합니다. 보통 가입 이메일의 `@` 앞부분입니다(예: `hong123@gmail.com` → `hong123`). 마이페이지 또는 신청 내역에 표시된 값을 따르세요.
4. 브라우저 주소창에 아래 주소를 넣어 JSON이 나오면 성공입니다.
   `https://www.law.go.kr/DRF/lawSearch.do?OC=내OC값&target=law&type=JSON&query=화학물질관리법`

## 2. GitHub 저장소 만들기

1. GitHub에서 **New repository** → 이름 예: `env-ops-app` → **Public** → Create
2. **Add file → Upload files**로 `index.html`, `README.md`, `data/`, `scripts/` 폴더를 끌어다 놓고 Commit
3. `.github` 폴더는 숨김 폴더라 업로드에서 빠지기 쉽습니다. **Add file → Create new file**을 누르고 파일 이름 칸에 `.github/workflows/check-laws.yml`을 입력한 뒤, 같은 파일 내용을 붙여넣고 Commit

## 3. OC 값을 비밀값으로 등록

**Settings → Secrets and variables → Actions → New repository secret**
- Name: `LAW_OC`
- Secret: 1단계에서 받은 OC 값

코드에 직접 적지 않기 때문에 저장소가 공개여도 OC 값은 보이지 않습니다.

## 4. 웹앱 공개 (GitHub Pages)

**Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `/(root)` → Save**
1~2분 뒤 `https://내아이디.github.io/env-ops-app/` 에서 앱이 열립니다.

## 5. 첫 실행

**Actions 탭 → 법령 개정 확인 → Run workflow**
- 초록색 체크면 `data/laws.json`이 채워집니다. 웹앱 「법령 개정」 탭에서 "자동 확인 결과 다시 불러오기"를 누르세요.
- 첫 실행은 현재 버전을 기준으로 저장만 합니다. 이후 실행부터 바뀐 법령이 "검토 전"으로 뜹니다. 시행 예정 개정은 첫 실행부터 보입니다.
- 새 개정이 감지된 날은 워크플로가 일부러 **실패(빨간색)**로 끝납니다. GitHub가 실패를 이메일로 알려 주므로 그게 곧 "법령 개정 알림"입니다. 데이터 저장은 그 전에 끝나 있습니다.

## 추적 법령 바꾸기

GitHub에서 `data/tracked.json`을 열어 연필 아이콘으로 편집합니다. 법제처에 등록된 **정식 명칭과 정확히 같아야** 하고, 법률·시행령·시행규칙은 한 줄씩 따로 적습니다.

## 문제 해결

| 증상 (Actions 로그) | 원인과 조치 |
|---|---|
| `LAW_OC 환경변수가 없어요` | 3단계 Secret 이름이 `LAW_OC`인지 확인 |
| `JSON이 아닌 응답 (인증값·IP 등록 확인)` | OC 값 오타, API 신청 미승인, 또는 IP·도메인 제한. 1-4의 주소가 내 브라우저에서 되는지 먼저 확인. 내 PC에서는 되는데 Actions에서만 안 되면 IP 제한일 가능성이 큽니다. 법제처에 등록 방식을 문의하거나, 고정 IP가 있는 중계 서버를 `LAW_API_BASE` 환경변수로 지정 |
| `같은 이름의 현행 법령 없음` | `tracked.json`의 법령명이 정식 명칭과 다름 (띄어쓰기·가운뎃점 `·` 확인) |
| `git push` 실패 | Settings → Actions → General → Workflow permissions → **Read and write permissions** |
| 예약 실행이 멈춤 | 공개 저장소는 60일간 활동이 없으면 예약 실행이 꺼집니다. Actions 탭에서 다시 Enable |

## 주의

- 자동 감지는 "법령이 바뀌었다"는 신호입니다. 개정 내용, 부칙(경과조치), 사업장 영향은 법제처 원문으로 확인해 탭의 "수정"에서 기록하세요.
- 앱의 운영일지·법정 일정 기록은 각자 브라우저에만 저장되며, 기본 데이터는 시연용 가상 데이터입니다.
- 데이터 출처: 법제처 국가법령정보 공동활용 (https://open.law.go.kr)
