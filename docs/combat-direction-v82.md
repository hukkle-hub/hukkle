# 흥양기 v82 전투 디렉션 — 조사와 구현
검토일: 2026-09-11

## 선정 기준과 조사 한계
아래 20종은 실시간 매출/동접 순위 1~10위라는 뜻이 아니다. 흥양기의 수동 카드 전투, 캐릭터 연출, 보스전 가독성에 적합한 비교군으로 카드 중심 10종과 RPG 10종을 선정했다.
공식 제품 소개·개발자 설명·공식 영상 페이지 및 플레이 해설의 설명/챕터를 확인했다. 모든 영상을 직접 재생해 프레임 단위로 분석했다거나 작품 전체를 플레이했다는 뜻은 아니다.
기능에 관한 사실과 흥양기에 적용할 디자인 판단을 구분한다. 타 게임의 이미지·음원·모션 파일은 복제하지 않는다.

## 카드 중심 비교군 10종
| 작품 / 확인 자료 | 확인한 특징 | 흥양기 적용 판단 |
|---|---|---|
| [미드나이트 선즈 개발자 설명](https://blog.playstation.com/2022/10/26/marvels-midnight-suns-super-heroic-turn-based-combat-and-card-tactics-explained/) | 영웅 능력을 카드로 표현하는 전술 전투 | 카드는 명령이며, 화면에서는 인물이 행동해야 한다 |
| [Slay the Spire 제작사](https://www.megacrit.com/press-kits/slay-the-spire/) | 덱 구성과 서로 다른 적을 만나는 구조 | 장식보다 선택 결과를 명확히 보여준다 |
| [Hearthstone 공식](https://hearthstone.blizzard.com/en-us) | 디지털 전략 카드게임 | 손패 경계·선택 강조·결과 피드백을 분리한다 |
| [Marvel Snap 공식](https://marvelsnap.com/) | 빠른 카드 대전 | 반복 기술은 짧게, 긴 연출은 중요한 순간에 한정한다 |
| [Shadowverse Worlds Beyond 전투](https://shadowverse-wb.com/en/system/cardbattle/battle/) | 진화/초진화 자원과 카드 전투 | 현현 전후에 시각적 상태 변화가 남아야 한다 |
| [Master Duel 공식](https://www.konami.com/yugioh/masterduel/us/en/) | 디지털 카드 대전 | 고등급 등장 연출과 평상시 조작 가독성을 분리한다 |
| [Runeterra 챔피언의 길](https://playruneterra.com/en-us/news/game-updates/prepare-for-the-path-of-champions-2-0/) | 챔피언별 모험과 성장 | 현현을 일회성 섬광이 아니라 지속되는 성장 상태로 표현한다 |
| [Monster Train 공식](https://www.themonstertrain.com/) | 전략적 로그라이크 덱빌딩 | 전장·손패·진행 상태를 별도 시각 층으로 나눈다 |
| [Limbus 공식](https://limbuscompany.com/) / [합 설명 영상](https://www.youtube.com/watch?v=Jnn33aGz3UE) | 합에서 상대 행동을 취소하는 선택 | 양측 준비→접촉→승자 행동만 관통→회복의 순서를 보여준다 |
| [Library of Ruina 제작사 배포 페이지](https://store.steampowered.com/app/1256670/Library_Of_Ruina/) | 카드와 전투 연출을 결합한 전투 시뮬레이션 | 카드 그림을 흔드는 것과 캐릭터 포즈 변화는 별개로 구현한다 |

## RPG 비교군 10종
| 작품 / 확인 자료 | 확인한 특징 | 흥양기 적용 판단 |
|---|---|---|
| [Honkai Star Rail 공식 영상](https://www.youtube.com/watch?v=jCxq-jMMsAc) | 캐릭터 중심 RPG 소개 | 기술의 주체·기술명·타격 대상을 한 장면에서 구별한다 |
| [Reverse 1999 개발사 배포 페이지](https://play.google.com/store/apps/details?id=com.bluepoch.m.en.reverse1999) | 전략 RPG | 회화적 캐릭터와 전장을 동일한 조명 계열로 묶는다 |
| [Clair Obscur 제작사](https://www.expedition33.com/overview) / [전투 해설](https://news.xbox.com/en-us/2024/08/28/clair-obscur-expedition-33-combat-breakdown-preview/) | 턴제에 실시간 행동을 결합 | 예비동작에 긴장, 충돌에 무게를 준다. 흥양기를 강제 리듬게임으로 바꾸지는 않는다 |
| [FFVII Rebirth 공식 전투](https://www.square-enix.com/ffvii/en-us/games/rebirth/battle/) | 시너지와 다양한 전투 방식 | 아인과 현현 동행자의 행동 주체를 구별한다 |
| [Persona 3 Reload 공식](https://asia.sega.com/p3r/en/) / [전투 영상](https://www.youtube.com/watch?v=zgdXy_UMHMs) | 개선된 직접 명령 전투 | UI는 큰 기술 장면과 경쟁하지 않게 한다 |
| [Metaphor 공식](https://metaphor.atlus.com/index.html?lang=en) | 파티 기반 RPG | 짧은 기술명 강조와 상태 복귀를 일관되게 만든다 |
| [Baldur’s Gate 3 제작사 전투 설명](https://baldursgate3.game/news/a-little-about-combat-stealth_3) | 파티와 상황을 활용하는 전투 | 보스와 플레이어가 서 있는 장소가 읽히도록 접지 그림자와 공간을 확보한다 |
| [Zenless 공식 전투 영상](https://www.youtube.com/watch?v=yDZm1E1jYXw) | 캐릭터 액션 중심 소개 | 준비·발동·회복을 구별하고 끊김 없이 다음 판단으로 복귀한다 |
| [Wuthering Waves 공식 전투 쇼케이스](https://www.youtube.com/watch?v=aKWE-ON3XSM) | 캐릭터 전투 시연 | 몸의 방향·옷자락·손동작이 기술을 설명해야 한다 |
| [Granblue Relink 공식 전투](https://relink.granbluefantasy.jp/en/gameplay) | 스턴 뒤 링크 공격과 파티 연계 | 최고 기세에서 동행자가 합류하는 클라이맥스를 분명히 한다 |

### 플레이 해설 참조
[ESGOO의 Limbus 튜토리얼](https://www.youtube.com/watch?v=ujQgRJo9vHA): 설명에 기술/합/EGO 챕터가 구분되어 있다. 흥양기에서도 예고, 카드 역할, 매듭 변화가 서로 연결되어 이해되도록 구성한다.
[미드나이트 선즈 플레이 영상](https://www.youtube.com/watch?v=GSp7syw_gFg): 실전 플레이/전투/시네마틱을 포함하는 비교 자료. 광고성 유료 추천을 그대로 품질 기준으로 삼지 않는다.

## 흥양기에서 지키는 것
- 합, 일곱 매듭 승리, 최고 기세의 7성 현현.
- 보스 위치와 크기 고정. 공간감은 배경·공기·접지로 표현한다.
- 얼굴은 가린다. 공격 동작에서도 얼굴이 갑자기 드러나지 않는다.
- 아인은 기록자다. 활·검 액션을 추가하지 않는다.
- 스킬명은 하단 전장 위에 짧게 표시하고 보스 얼굴/몸통을 가리지 않는다.
- 전투 규칙·저장·반복 보상은 기존 파일에 남긴다. 새 엔진은 연출만 담당한다.

## 구현 방식
- Canvas 기반 독립 전투 무대, 배경/보스/아인/동행자/손패의 분리.
- 아인과 해신 당골의 6개 키포즈, 지역 보스의 3개 키포즈.
- 기록·수호·의례·해령·심판·넋 6루트의 준비/발동 궤적과 포즈 구분.
- 매 프레임 큰 번쩍임 대신 접촉 순간의 국소 피드백과 반응 포즈.
- 현현 후 프레임 없는 동행자가 전장에 남는다.
- 소리는 기본 꺼짐, 사용자 선택 시 작은 원본 합성 타격음만 사용한다. 상용 OST나 국악 녹음물을 확보했다고 주장하지 않는다.
- 동작 간소화, 이미지 로딩 시간 제한, 구형 렌더러 안전 복귀.
- PNG 원본은 보관하고 키 컬러 배경은 런타임 렌더링에서 투명 처리한다.

## 명확한 한계
키포즈와 보간을 이용한 2.5D 연출이다. 모션캡처된 3D 캐릭터나 60프레임 손그림 애니메이션과 같지 않다.
125종 전원의 고유 스켈레탈 모션/음성까지 완성한 것은 아니다. 신규 다중 포즈 동행자는 해신 당골이며 다른 동행자는 기존 최종 아트를 사용한다.
이미지의 고흥 분위기와 실제 지형의 측량 수준 정확도는 다르다. 새 녹동항 배경은 창작 재구성이다.

