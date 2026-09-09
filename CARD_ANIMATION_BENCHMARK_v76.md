# 흥양기 카드 현현·전투 연출 벤치마크 v76

조사일: 2026-09-09

이 문서는 매출 순위를 임의로 단정한 표가 아니라, 2026년 현재 인지도·장르 영향력·연출 참고 가치가 높은 디지털 카드/덱빌딩 게임 15종을 선정한 구현 참고 자료다.

| 참고작 | 관찰한 강점 | 흥양기 적용 원칙 |
|---|---|---|
| Hearthstone | 카드가 손에서 전장으로 이동하고 효과가 대상에 도달하는 인과관계가 분명함 | 카드 상승 → 목표 표시 → 결과 수치 순서를 유지 |
| Marvel Snap | 프레임 브레이크, 3D/패럴랙스, 애니메이션, 테두리로 희귀도 상승을 시각화 | 7성 카드에만 문양·색·인물 컷인·강한 테두리를 함께 사용 |
| Magic: The Gathering Arena | 주문 종류와 색 정체성을 색·궤적·충돌점으로 즉시 구분 | 당·저승·물 진영 팔레트와 역할별 타격 형태를 분리 |
| Yu-Gi-Oh! Master Duel | 특수 소환 컷인과 카드 효과 연출의 위계를 분리 | 최초 현현 시네마와 반복 스킬 모션을 서로 다른 길이로 구성 |
| Pokémon TCG Pocket | 카드 수집 감상과 전투 가독성을 짧은 상호작용으로 연결 | 카드 원화를 먼저 보여 준 뒤 전투 인물 컷아웃으로 전환 |
| Legends of Runeterra | 챔피언 레벨업을 캐릭터 고유 순간으로 표현 | 카드 이름·진화 경로·고유 문양이 컷인 중앙에서 읽히게 구성 |
| Shadowverse: Worlds Beyond | 리더·추종자 등장과 필살기의 화면 점유가 명확함 | 7성만 화면 전체를 점유하고 일반 스킬은 전장을 가리지 않음 |
| Gwent | 프리미엄 카드의 반복 가능한 미세 움직임 | 전투 덱에서 7성 카드에 고유색 발광과 문양 배지 제공 |
| Slay the Spire 2 | 공격 예고와 상태 변화가 전투 판단으로 직결 | 보스 행동 예고·BREAK·수호 결과를 연출 뒤 즉시 갱신 |
| Balatro | 점수 증가와 배율 상승을 계층적인 수치 피드백으로 전달 | 치명타는 금색 수치, BREAK는 별도 대형 콜아웃으로 유지 |
| Monster Train 2 | 여러 유닛 효과가 순차 해결되어 복잡한 전투도 추적 가능 | 한 번에 한 카드만 현현하고 회복 구간을 둬 효과 중첩 방지 |
| Inscryption | 카드 배치의 물성과 짧은 카메라 움직임으로 몰입 강화 | 카드가 먼저 들어 올려지고 카메라가 역할에 맞춰 움직임 |
| KARDS | 진영별 시대·재질 감각과 절제된 전장 피드백 | 한국 민속·고흥 배경을 가리지 않는 낮은 채도의 진영색 사용 |
| Wildfrost | 작은 화면에서도 공격 순서와 대상이 명료함 | 모바일 가로 1279×599 기준에서 스킬명과 결과 수치를 최우선 배치 |
| Eternal | 속성색과 주문 궤적의 일관성이 학습 비용을 낮춤 | 같은 진화 경로는 같은 문법, 카드별로 색·속도·방향을 변주 |

## 구현 규격

- 카드별 고정 프로필: `signature`, 문양, 색 3종, 입장 방식, 카메라, 입자, 충돌 형태, 지속 시간.
- 125종은 카드 ID·진영·역할·진화 경로를 조합해 서로 다른 고정 프로필을 가진다.
- 7성 전용 스킬: 약 0.92~1.21초. 카드 상승, 문양 전개, 인물 등장, 스킬명, 충돌 순서.
- 최초 7성 현현: 약 2.1초. 반복 플레이에서는 전투 흐름을 끊지 않도록 축약.
- 모션 감소 설정에서는 약 0.32~0.76초로 줄이고 입자를 숨긴다.
- 소리는 추가하지 않는다. 사용자가 이미 겪은 비정상 음원 재생을 재발시키지 않으며 기존 음향 설정이 꺼져 있으면 완전 무음이다.

## 주요 조사 출처

- [Marvel Snap 카드 업그레이드와 시각 효과](https://marvelsnap.helpshift.com/hc/en/3-marvel-snap/faq/34-what-does-upgrading-a-card-do/)
- [Marvel: Inside the Art of Marvel Snap](https://www.marvel.com/articles/games/inside-the-art-of-marvel-snap)
- [Riot Games: Bringing Features to Life in Legends of Runeterra](https://www.riotgames.com/en/news/bringing-features-life-legends-runeterra)
- [Legends of Runeterra 챔피언 스킨·레벨업 연출](https://playruneterra.com/en-us/news/game-updates/universes-collide-introducing-champion-skins/)
- [KONAMI Master Duel 연출 설정 안내](https://ja-support1.konami.com/hc/ja/articles/4415136335641-Q-%E3%83%87%E3%83%A5%E3%82%A8%E3%83%AB%E4%B8%AD%E3%81%AE%E6%BC%94%E5%87%BA%E3%81%AE%E6%9C%89%E7%84%A1%E3%82%92%E5%88%87%E3%82%8A%E6%9B%BF%E3%81%88%E3%82%8B%E3%81%93%E3%81%A8%E3%81%AF%E3%81%A7%E3%81%8D%E3%81%BE%E3%81%99%E3%81%8B-%E9%81%8A%E6%88%AF%E7%8E%8B-%E3%83%9E%E3%82%B9%E3%82%BF%E3%83%BC%E3%83%87%E3%83%A5%E3%82%A8%E3%83%AB)
- [Shadowverse: Worlds Beyond 공식 영상](https://shadowverse-wb.com/en/special/movie/)
- [Pokémon TCG Pocket 공식 배틀 안내](https://support.pokemon.com/hc/en-us/articles/38906248102292-Pok%C3%A9mon-TCG-Pocket-Battle-Rules-FAQ)

