# 설치·배포 방법

## 1. 저장소에 적용

Windows에서는 이 패키지의 `apply_server_update.bat` 위로 로컬 `hukkle` 저장소 폴더를 끌어다 놓는다.

명령줄에서는:

```bash
python tools/apply_to_repo.py /path/to/hukkle
```

적용기는 다음을 자동 수행한다.

1. 기존 파일을 `.hy-backups/server-update-v1-날짜시간/`에 백업
2. 흥양기 UI v6와 업데이트 클라이언트 복사
3. GitHub Actions 두 개 설치
4. 기존 `api/index.ts`에 상태/버전 정책 삽입
5. 설치 결과와 SHA-256 검증
6. 복구용 설치 매니페스트 생성

되돌리기:

```bash
python tools/rollback.py /path/to/hukkle
```

또는 `rollback_server_update.bat` 위로 저장소 폴더를 끌어다 놓는다.

## 2. GitHub Pages 최초 1회 설정

저장소의 **Settings → Pages → Build and deployment → Source**를 `GitHub Actions`로 설정한다.

이후 `main`에 푸시할 때마다 `Deploy Heungyanggi Client` 워크플로가 실행되고 다음 주소가 갱신된다.

```text
https://hukkle-hub.github.io/hukkle/
```

## 3. Supabase 자동 배포 최초 1회 설정

저장소 **Settings → Secrets and variables → Actions**에서 설정한다.

### Repository secret

```text
SUPABASE_ACCESS_TOKEN = Supabase Personal Access Token
```

### Repository variable

```text
SUPABASE_PROJECT_REF = ybflkszmymalhafzzdbs
```

이 두 값이 없으면 클라이언트 배포는 정상 진행되고, Supabase 워크플로만 안전하게 건너뛴다.

## 4. 최초 배포

```bash
git add .
git commit -m "feat: add server-driven live update system"
git push origin main
```

GitHub Actions에서 다음 두 작업을 확인한다.

- `Deploy Heungyanggi Client`
- `Deploy Heungyanggi API`

## 5. 새 버전 배포

코드와 자산 수정 후:

```bash
python tools/bump_version.py 38.0.1 \
  --note "대기화면 애니메이션 보정" \
  --note "지도 전환 안정화"

git add .
git commit -m "release: v38.0.1"
git push origin main
```

푸시가 끝나면 Pages에 새 commit SHA가 들어가고, 실행 중 클라이언트는 최대 약 60초 안에 새 빌드를 확인한다. 안전한 메뉴 화면에서는 저장을 백업한 뒤 자동 적용한다.

## 6. 배포 확인

운영 화면:

```text
https://hukkle-hub.github.io/hukkle/admin/update-status.html
```

직접 상태 API:

```text
https://ybflkszmymalhafzzdbs.supabase.co/functions/v1/hy/system/status
```

## 7. 운영 값 변경

`version.json`만 수정해서 배포 정책을 바꿀 수 있다.

- `version`: 최신 클라이언트 버전
- `content_version`: 카드/던전/밸런스 데이터 버전
- `min_supported_version`: 서버 접속을 허용할 최저 버전
- `force_update`: 업데이트 닫기 버튼 제거
- `maintenance`: 점검 화면 표시
- `maintenance_message`: 점검 안내
- `release_notes`: 게임 내 업데이트 내용
- `check_interval_seconds`: 업데이트 확인 주기
- `auto_apply`: `safe`이면 안전 화면에서 자동 적용

## 주의

- 기존 Edge Function 규칙대로 `verify_jwt=false`를 유지한다.
- API 번들을 base64 압축으로 재포장하지 않고 원본 TypeScript 파일 그대로 배포한다.
- 전투/정산 구현 시 `HYUpdate.setBusy(true)`로 업데이트를 잠그고 저장 완료 후 해제한다.
- `version.json`의 버전을 올리지 않아도 commit SHA가 바뀌면 새 빌드로 감지된다.
