# 릴리스 체크리스트

## 배포 전

- [ ] `python tools/bump_version.py X.Y.Z --note "내용"` 실행
- [ ] `version.json`의 `min_supported_version` 확인
- [ ] 일반 업데이트는 `force_update=false`
- [ ] 점검이 아니면 `maintenance=false`
- [ ] `node --check update-client.js server-api.js sw.js`
- [ ] `python -m json.tool version.json`
- [ ] 모바일 가로 대기화면과 7개 탭 확인
- [ ] 저장 키 `hy-ui-state`가 새 빌드에서도 열리는지 확인

## 배포 후

- [ ] GitHub Actions 클라이언트 배포 성공
- [ ] GitHub Actions Supabase 배포 성공 또는 의도된 건너뛰기
- [ ] `/admin/update-status.html` 네 항목 정상
- [ ] `/system/status`의 client_latest와 version.json 일치
- [ ] 새 commit SHA가 build-info.json에 표시
- [ ] 기존 탭에서 60초 이내 업데이트 감지
- [ ] 시네마틱 중에는 업데이트가 적용되지 않음
- [ ] 시네마틱 종료 후 자동 적용
- [ ] localStorage 진행 기록 유지
- [ ] 오프라인 재실행 가능

## 긴급 롤백

1. GitHub에서 직전 정상 커밋을 revert하고 `main`에 반영한다.
2. `version.json`의 버전은 새로운 패치 버전으로 올린다. 예: 잘못된 38.1.0 → 복구판 38.1.1.
3. 데이터 계약이 깨졌다면 `min_supported_version`도 복구판으로 올린다.
4. 운영 화면에서 실제 빌드 SHA와 API 버전을 확인한다.
5. 필요하면 `maintenance=true`를 먼저 배포한 뒤 복구한다.
