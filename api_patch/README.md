# Supabase API 업데이트 패치

기존 `api/index.ts` 전체를 교체하지 않고 `tools/patch_api_update.py`가 다음만 삽입한다.

- CORS 허용 헤더에 `x-client-version`
- `GET /system/status`
- `GET /health`
- 최소 지원 클라이언트 검사와 HTTP 426
- 점검 모드와 HTTP 503
- 클라이언트/콘텐츠/API 버전, 릴리스 노트, 업데이트 URL 응답

상태 라우트는 `master()` 호출보다 앞에 있어 DB 마스터 데이터가 고장 나도 Edge Function 프로세스의 생존 여부를 확인할 수 있다.

수동 실행:

```bash
python tools/patch_api_update.py api/index.ts
```

이미 적용된 파일에는 다시 삽입하지 않는 멱등 패치다. 예상한 코드 앵커가 없으면 임의 수정하지 않고 실패한다.
