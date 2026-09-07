# 흥양기 Android APK

이 디렉터리는 GitHub Pages에 배포된 최신 흥양기를 표시하는 얇은 Android WebView 앱입니다.

## 자동 빌드

`codex/apk-pipeline` 또는 `main`의 Android 관련 파일이 바뀌면 GitHub Actions의
`Build Android APK` 워크플로가 디버그 APK를 빌드합니다. 완료된 실행의 Artifacts에서
`heungyanggi-debug-apk`를 내려받을 수 있습니다.

## 로컬 빌드

JDK 17과 Gradle 8.7, Android SDK 35가 설치된 환경에서 다음 명령을 실행합니다.

```bash
cd android
gradle assembleDebug
```

결과 파일은 `android/app/build/outputs/apk/debug/app-debug.apk`입니다.

## 앱 동작

- 패키지 ID: `com.hukkle.heungyanggi`
- 최소 Android: 7.0 (API 24)
- 화면 방향: 가로
- 콘텐츠 URL: `https://hukkle-hub.github.io/hukkle/`
