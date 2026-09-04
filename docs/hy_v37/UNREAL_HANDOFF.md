# 흥양기 v37 Unreal 3D 전환 인계서

## 0. 목표

HTML 버티컬 슬라이스의 규칙과 감정 흐름을 그대로 유지하면서, 다음 요소를 Unreal Engine 실시간 3D로 교체합니다.

- 실제 탑승감을 주는 고흥 농촌 버스
- 논·수로·전봇대·낮은 산이 이어지는 이동 필드
- 신목·금줄·지전·촛불로 구성된 굿청
- Control Rig 기반 무당의 장단과 신칼춤
- 보스 접근과 얼굴 금기 응시 판정
- Chaos Cloth 기반 얼굴 천·의복·지전
- 카드 프레임이 공간문으로 변하고 최종 캐릭터가 돌출·현신하는 연출

## 1. 프로젝트 구조

```text
Content/HY/
  Core/
    Blueprints/
    Data/
    Interfaces/
    Tags/
  Journey/
    Bus/
    Fields/
    Encounters/
    Audio/
  Ritual/
    SacredTree/
    Knots/
    Shaman/
    Bosses/B001_Natgeumi/
    Taboo/
  Cards/
    Frames/
    C075_HaesinDanggol/
    FX/
    UI/
  Bestiary/
  Cinematics/
  UI/
  Maps/
    L_BusJourney
    L_RiceFieldEncounter
    L_RitualGrove
```

## 2. 핵심 C++/Blueprint 클래스

### `UHYJourneySubsystem`

- 여행 장면 상태
- 버스 이상 징후 단계
- 조사 단서
- 굿청 진입 조건
- 세이브 데이터 연결

### `AHYBusJourneyDirector`

- 도로 모듈과 창밖 풍경 반복
- 정류장 안내, 라디오, 승객 반사 제어
- 하늘과 조명 변화
- Sequencer 큐 호출

### `UHYEncounterDirectorComponent`

- 이상 징후 조건과 재생 순서
- 카메라가 단서를 놓쳤을 때 보조 연출
- 반복 허수아비 위치 재배치
- 플레이어 시선 기반 사건 시작

### `UHYRitualBattleSubsystem`

- 장단 시작·종료
- 유효 피해 목표
- 신력·영험·부정
- 보스 의도 큐
- 첫 사망 강제 학습 조건
- 봉면 의례 전환

### `UHYKnotComponent`

```cpp
USTRUCT(BlueprintType)
struct FHYKnotState
{
    int32 Index;
    float Integrity;
    bool bBroken;
};
```

- 장력 0에서 파열
- Chaos rope 또는 Skeletal rope 상태 전환
- 파열 시 지전·섬유 Niagara 방출
- 매듭 수에 따라 보스 목표 위치 갱신

### `UHYTabooComponent`

금기 유형을 데이터로 분리합니다.

```text
Gaze       보지 말 것
Hearing    듣지 말 것
Answer     대답하지 말 것
TurnBack   뒤돌지 말 것
Step       밟지 말 것
Count      세지 말 것
Flame      불을 끄지 말 것
```

B001은 `Gaze`를 사용합니다.

응시 판정:

- 플레이어 카메라 Forward와 얼굴 Socket 방향의 Dot Product
- Line Trace로 실제 가림 여부 검사
- 노출 시간 누적
- 명두 반사면을 통과한 시선은 직접 응시로 판정하지 않음
- 접근성 옵션에서 민감도와 화면 흔들림 분리

### `UHYCardRuntimeComponent`

- 카드 비용·태그·의도 대응
- 장단 정타 창
- 쿨다운
- 최종 현신 조건
- Gameplay Ability System 연동

### `UHYCardPortalComponent`

현신 단계:

```text
CardIdle
→ FrameUnlock
→ SurfaceDepth
→ LimbBreakout
→ FullManifest
→ RitualAction
→ ReturnOrRemain
```

## 3. 데이터 에셋

### `DA_HYBoss_B001_Natgeumi`

```text
EncounterName: 논둑에서 따라온 것
KnownName: 낯금이
TabooType: Gaze
KnotCount: 7
FirstDeathRequired: true
UnlockOnDeath: C094 명두 임시 신표
SealOrder: 금줄, 정화수, 명두, 신칼, 해신 당골
FaceRevealSeconds: 0.7
```

### `DA_HYLocation_GoheungRiceRoad`

- 시간대: 늦여름 오후 → 비정상 황혼 → 밤
- 식생: 벼, 수로 풀, 낮은 산림
- 생활 소리: 디젤 엔진, 정류장 안내, 라디오, 창문 떨림
- 이상 징후: 반복 허수아비, 역풍 벼, 반사 누락, 존재하지 않는 정류장

### 카드 데이터 필드

```text
CardId
DisplayName
Faction
RitualRole
BaseArt
FinalArt
BaseMeshOrPortraitRig
ManifestMesh
Cost
CounterTags
BeatWindow
ManifestCondition
ManifestSequence
```

## 4. 1성~6성·최종 카드 렌더링

### 1성~6성

동일한 기본 캐릭터 원화 또는 동일 3D 포즈를 사용합니다.

| 단계 | 추가 요소 |
|---|---|
| 1성 | 무광 목재·한지 프레임 |
| 2성 | 세력색 가장자리와 약한 깊이 |
| 3성 | 고유 문양 발광 |
| 4성 | 카드 주변 환경 입자 |
| 5성 | 눈·머리카락·천·무구 미세 현동 |
| 6성 | 깊은 패럴랙스와 현신 전조 |

얼굴, 포즈, 배경을 단계마다 재생성하지 않습니다.

### 최종 진화

- 별도 서사 장면
- 별도 카메라 구도
- 별도 현신 애니메이션
- 카드 표면을 SceneCapture 또는 RenderTarget 포털로 전환
- 캐릭터 손/무구가 먼저 경계 밖으로 나옴
- 카드 프레임과 실세계 바닥에 일치하는 접촉 그림자 생성

## 5. B001 굿판 상태 머신

```text
Intro
→ MeasureStart
→ IntentTelegraph
→ PlayerResponse
→ Resolve
→ KnotHold / KnotBreak
→ BossAdvance
→ NextMeasure
→ FleshBroken
→ FirstDeath or SealRitual
→ ManifestCard
→ FaceSealed
→ Victory
```

매듭 수와 보스 위치:

| 매듭 | 보스 표시 |
|---:|---|
| 7 | 원경 실루엣 |
| 6 | 발소리와 팔 윤곽 |
| 5 | 몸 윤곽·분신 |
| 4 | 촛불 절반 소등 |
| 3 | 화면 가장자리 가짜 얼굴 |
| 2 | 의도 외 시간에도 접근 |
| 1 | 북 저음만 남음, 최종 현신 가능 |
| 0 | 입력 잠금과 전멸 Sequencer |

## 6. Sequencer 목록

- `LS_Bus_ImpossibleStop`
- `LS_Field_FirstReflection`
- `LS_Ritual_Intro`
- `LS_Knot_Break_01` 공통 + 파라미터
- `LS_Boss_Advance`
- `LS_FirstDeath_Face`
- `LS_Bestiary_InkReveal`
- `LS_SealRitual_Success`
- `LS_C075_FinalManifest`
- `LS_B001_FaceSealed`

첫 얼굴 전멸은 점프 스케어보다 8~15초의 느린 접근을 우선합니다. 얼굴 노출은 약 0.7초로 제한하고 도감에서도 전체 얼굴을 그대로 공개하지 않습니다.

## 7. 애니메이션·물리

### 무당

- 장구/북 장단별 기본 루프
- 실패 시 박자 흔들림
- 신칼춤 전환
- 마지막 매듭에서 북채를 놓치는 모션
- 손과 무구 접촉은 Control Rig IK로 보정

### 보스

- 먼 거리 저프레임 움직임
- 매듭 파열마다 보폭과 상체 흔들림 변화
- 얼굴 천을 손으로 직접 벗기지 않고 매듭이 아래에서 풀리는 움직임
- 천 아래 실제 얼굴 메시를 평시 렌더링하지 않아 우발 노출 방지

### 천·지전

- 가까운 거리: Chaos Cloth
- 중거리: 본 기반 간이 물리
- 원거리: 머티리얼 WPO
- 파열 시 지전은 Niagara GPU 입자와 일부 실제 메시 혼합

## 8. 오디오

- 메트로놈이 아니라 실제 장단처럼 들리는 강약 구조
- 보스 발소리가 북 저음과 겹쳐 처음에는 구분되지 않게 믹싱
- 매듭 수가 줄수록 고역·환경음을 제거하고 숨소리·볏짚 섬유음을 전면 배치
- 마지막 매듭 파열 후 완전 무음 구간
- 얼굴 노출 순간 과도한 폭발음 금지

## 9. 모바일 성능 예산

- 목표: 60fps, 저사양 30fps 고정 옵션
- 화면 동시 고품질 캐릭터: 무당, 보스, 현신 카드 최대 3체
- 현신 시작 시 배경 LOD와 Niagara 단계 한 단계 하향
- 버스 창밖은 도로·논·전봇대 모듈 스트리밍
- 2K 카드 텍스처 기본, 최종 현신만 선택적 4K
- 천 시뮬레이션 Vertex 수와 Solver iteration을 거리별 축소
- 응시 판정 Line Trace는 매 프레임이 아니라 10~15Hz 수행

## 10. 첫 제작 스프린트 완료 기준

1. 버스 탑승부터 논길 하차까지 끊김 없는 플레이
2. 이상 징후 4종 이상이 카메라와 오디오로 인지됨
3. 7개 매듭이 실제 파열하고 보스 위치가 변함
4. 명두 없이 첫 사망, 도감 해금 후 명두로 응시 반사
5. 봉면 순서 판정
6. C075 카드가 RenderTarget 포털로 열리고 실시간 리그가 프레임 밖으로 나옴
7. Android 개발 빌드에서 30fps 이상 유지
8. 사망·승리·설정이 SaveGame에 복구됨

## 11. 금지 사항

- 실제 굿을 사망 주술로 설명하지 않음
- 고흥 주민·무당·특정 공동체를 괴이한 존재로 대상화하지 않음
- 소록도의 역사적 고통을 보스·파밍 소재로 사용하지 않음
- 얼굴을 매 단계 값싼 점프 스케어로 반복 노출하지 않음
- 최종 현신을 단순 확대 PNG로 끝내지 않음
- 1성~6성에서 얼굴과 포즈를 제각각 재생성하지 않음
