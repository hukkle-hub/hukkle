# 흥양기 v69.0 검수 보고서

검수 환경: 1279 × 599 모바일 가로 화면, Chrome/Playwright

## 결과

- 전체 화면 왕복 50회: 통과
- 카드 데이터: 125종, 중복 ID 0건, 1~6성 스킬 규칙 통과
- 제작 전용: 전투력 최상위 5종 표시, 달걀귀신 실제 제작·재료/동전 차감·편성 해금 통과
- 미제작 4종: 보유 카드와 파티 편성에서 제외 확인
- 파티 보유 카드: 2열, 제목/적합도 겹침 없음, 패널 밖 넘침 없음
- 여자만: 현실 이동 → 단서 3개 → 5단계 던전 → 보스전 → 승리 저장 통과
- 던전 단계: 순차 잠금, 단계 선택창 2개 선택지, 화면 안 배치 통과
- 스킬 모션: 공격 참격, 파훼 균열, 수호 결계 각각 발동 확인
- 7성 현현: 공명 100 개방, 전면 컷인, 승리 연결 통과
- 5개 지역 보스전: 모두 승리, 결계 체력 0 초과, 5~10턴 범위 통과
- 콘솔·페이지 오류: 0건

## 자동 검수 명령

- `npm run qa:mobile`
- `npm run qa:yeojaman`
- `npm run qa:combat`

## 주요 결과물

- `qa-screenshots/report.json`
- `qa-yeojaman/report.json`
- `qa-combat/report.json`
- `qa-yeojaman/03b-dungeon-stage.png`
- `qa-yeojaman/06b-seven-star-manifest.png`
