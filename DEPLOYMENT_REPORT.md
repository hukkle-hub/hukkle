# 흥양기 v38 서버 주도 업데이트 구현 보고서

## 구현 완료

- 흥양기 UI v6를 v38 클라이언트로 승격
- `version.json`/`build-info.json` 이중 버전 판별
- 실행 중 60초 주기, 온라인 복귀, 화면 재활성화 시 업데이트 확인
- 버전 번호가 같아도 Git commit SHA가 바뀌면 새 빌드 감지
- 대기/메뉴 안전 화면에서 5초 후 자동 적용
- 지도·인벤토리·카드·도감 시네마틱 동안 업데이트 잠금
- 향후 전투용 `HYUpdate.setBusy(true/false)` API
- 업데이트 직전 `hy-`, `hy_`, `heungyanggi`, `흥양기` 저장 키 백업
- 일반/필수 업데이트, 최소 지원 버전, 점검 모드
- 버전별 서비스워커 캐시와 오프라인 폴백
- MP4 Range 요청 캐시 제외
- GitHub Pages 자동 배포 워크플로
- Supabase Edge Function 자동 배포 및 운영 정책 secrets 동기화
- DB보다 먼저 응답하는 `/system/status`와 `/health`
- `x-client-version` 호환성 검사와 HTTP 426
- 운영자용 `/admin/update-status.html`
- 설치, 기존 API 안전 패치, 자동 백업, 롤백, 버전 상승 도구

## 검수

- JSON 3종 파싱 통과
- GitHub Actions YAML 2종 파싱 통과
- JavaScript 3종 문법 검사 통과
- 업데이트 클라이언트 실행 스모크 통과
- 현재 UI 저장 키 `hy-ui-state` 백업 통과
- 안전 구간 잠금/해제 통과
- API 공통 클라이언트 `x-client-version` 헤더 통과
- 서비스워커 정책 검사 통과
- API 패치 멱등성 통과
- 패치된 API TypeScript 파싱 통과
- 설치→백업→롤백 전체 복원 통과
- 버전 상승 도구 통과
- 자산 20개 무결성 통과

## 미완료/배포 후 확인

현재 대화의 GitHub 연결은 조회는 가능하지만 branch/file 쓰기 호출이 `403 Resource not accessible by integration`으로 거부됐다. 따라서 원격 `main`과 실제 Supabase에는 이 패키지를 직접 반영하지 못했다.

또한 실행 환경의 Chromium 정책이 로컬/가상 URL 이동을 `ERR_BLOCKED_BY_ADMINISTRATOR`로 막아, 실제 HTTPS 주소에서의 서비스워커 E2E는 배포 후 운영 화면에서 마지막 확인이 필요하다.

## 배포 후 기대 동작

1. `main` 푸시
2. Pages/Edge Function 워크플로 자동 실행
3. 빌드 SHA와 서버 정책 갱신
4. 실행 중 사용자에게 60초 이내 새 빌드 감지
5. 시네마틱/전투가 아니면 5초 후 저장 백업 및 자동 재시작
6. 시네마틱/전투 중이면 안전 화면이 될 때까지 보류
