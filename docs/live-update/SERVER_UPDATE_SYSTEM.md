# 흥양기 서버 주도 업데이트 시스템 v1

## 목표

`main`에 게임 파일을 올리면 자동으로 웹 클라이언트를 배포하고, 이미 실행 중인 게임도 서버의 최신 버전을 감지해 저장을 보존한 뒤 새 빌드로 전환한다. 전투·시네마틱처럼 끊기면 안 되는 구간에서는 적용을 미루고, 대기화면과 메뉴처럼 안전한 화면에서만 자동 적용한다.

## 전체 흐름

```text
개발 PC
  └─ version.json 버전 상승 + 코드/자산 변경
       └─ GitHub main push
            ├─ Deploy Heungyanggi Client
            │    ├─ 파일/JSON/버전 검증
            │    ├─ 실제 commit SHA를 빌드에 삽입
            │    ├─ GitHub Pages 배포
            │    └─ release-sha256.txt 생성
            └─ Deploy Heungyanggi API
                 ├─ version.json 정책을 Supabase secrets에 동기화
                 ├─ Edge Function hy 배포
                 └─ /system/status 응답 검증

실행 중 클라이언트
  ├─ version.json + build-info.json을 no-store로 확인
  ├─ Supabase /system/status와 최소 지원 버전 확인
  ├─ 새 빌드 발견
  ├─ 로컬 진행 기록 백업
  ├─ 안전 화면이면 5초 후 자동 적용
  ├─ 진행 중 구간이면 완료될 때까지 보류
  └─ 새 서비스워커 활성화 후 재실행
```

## 구성 파일

| 파일 | 역할 |
|---|---|
| `version.json` | 최신 버전·콘텐츠 버전·점검·최소 지원 버전·릴리스 노트의 단일 기준 |
| `build-info.json` | 실제 배포 커밋 SHA와 배포 시각. Actions가 매 배포 때 다시 생성 |
| `update-client.js` | 업데이트 감지, 저장 백업, 안전 자동 적용, 강제 업데이트/점검 UI |
| `server-api.js` | `x-client-version`을 포함하는 Supabase API 공통 클라이언트 |
| `sw.js` | 버전별 캐시, 새 워커 대기, 제어 파일 network-first, 정적 자산 stale-while-revalidate |
| `admin/update-status.html` | 클라이언트·빌드·서비스워커·Supabase 상태 통합 확인 |
| `.github/workflows/deploy-pages.yml` | `main` 푸시 시 클라이언트 자동 배포 |
| `.github/workflows/deploy-supabase.yml` | API 또는 버전 정책 변경 시 Edge Function 자동 배포 |
| `tools/bump_version.py` | 릴리스 버전/메타/서비스워커 버전 동시 갱신 |
| `tools/patch_api_update.py` | 기존 `api/index.ts`에 `/system/status`와 버전 정책을 안전하게 삽입 |

## 업데이트 정책

### 일반 업데이트

`version.json`의 기본값은 다음과 같다.

```json
{
  "auto_apply": "safe",
  "auto_apply_delay_seconds": 5,
  "force_update": false
}
```

클라이언트가 새 버전을 발견하면 대기화면·지도·인벤토리·카드·도감 등 저장 가능한 화면에서 5초 후 자동 적용한다. 지도·가방·카드·도감 시네마틱 동안에는 `data-hy-update-lock`이 설정되어 적용이 미뤄진다.

향후 전투와 탐험을 붙일 때는 시작 시 아래를 호출한다.

```js
window.HYUpdate?.setBusy(true, 'battle');
```

정산과 저장이 끝나면 잠금을 해제한다.

```js
window.HYUpdate?.setBusy(false);
```

### 필수 업데이트

서버와 호환되지 않는 구버전을 막을 때 `min_supported_version`을 올린다.

```json
{
  "version": "38.2.0",
  "min_supported_version": "38.2.0",
  "force_update": true
}
```

API도 `x-client-version`을 비교해 지원 종료 버전에 HTTP 426과 `CLIENT_UPDATE_REQUIRED`를 반환한다.

### 점검 모드

```json
{
  "maintenance": true,
  "maintenance_message": "데이터 점검 중입니다. 잠시 뒤 다시 접속해 주세요."
}
```

푸시 후 클라이언트와 API 상태에 반영된다. 점검이 끝나면 `false`로 돌려 다시 푸시한다.

## 저장 보존

업데이트 직전 로컬 저장소에서 다음 접두사를 가진 키를 별도 백업한다.

- `hy-` 및 `hy_`
- `heungyanggi`
- `흥양기`

백업 키는 `hy_update_save_backup`이며 이전/새 버전과 빌드 정보가 함께 남는다. 현재 UI 저장 키 `hy-ui-state`도 포함된다.

서버 계정 저장이 완전히 연결된 뒤에는 업데이트 직전에 `HYServer.player()` 또는 별도의 저장 동기화 API를 호출하도록 확장한다.

## 캐시 원칙

- `version.json`, `build-info.json`, `update-client.js`, `sw.js`: 항상 네트워크 우선
- 문서 이동 요청: 네트워크 우선, 오프라인이면 캐시된 `index.html`
- 이미지·CSS·일반 자산: 캐시 우선 후 백그라운드 갱신
- MP4/오디오/Range 요청: 부분 응답 충돌 방지를 위해 서비스워커 캐시 제외
- 새 워커는 자동으로 기존 화면을 빼앗지 않고, 클라이언트가 저장 후 `SKIP_WAITING`을 보낼 때 활성화

## API 상태 응답

`GET /system/status` 또는 `GET /health`는 DB 마스터 로드 전에 응답한다.

```json
{
  "ok": true,
  "product": "흥양기",
  "service": "hy",
  "server_time": "2026-09-05T00:00:00.000Z",
  "api_version": "1.1.0",
  "content_version": "2026.09.05.1",
  "client_latest": "38.0.0",
  "client_min": "37.0.0",
  "force_update": false,
  "maintenance": false
}
```

이 엔드포인트가 정상이지만 `/master`가 실패하면 API 프로세스는 살아 있고 DB/마스터 데이터 계층에 문제가 있다는 뜻으로 분리 진단할 수 있다.

## 운영 화면

배포 후 다음 주소에서 상태를 확인한다.

```text
https://hukkle-hub.github.io/hukkle/admin/update-status.html
```

표시 항목:

- 서버 최신 클라이언트/콘텐츠 버전
- 실제 GitHub commit SHA
- Supabase API 응답 시간과 API 버전
- 서비스워커 활성/업데이트 대기 상태
- 최소 지원 버전, 강제 업데이트, 점검 모드
- 릴리스 노트와 확인 로그
