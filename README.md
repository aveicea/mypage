# mypage — 자유 배치형 위젯 보드

Miro/Figma 처럼 무한 캔버스 위에 위젯을 자유롭게 배치하는 웹 앱입니다.
데이터는 **Notion Database** 가 단일 진실 소스(Single Source of Truth)이며,
백엔드는 Notion API 를 호출하는 얇은 프록시 역할만 합니다.

## 구조

```
mypage/
├── server/   # Express — Notion API 프록시 (CORS 우회 + 속성 자동 매핑)
└── client/   # React + Vite — 캔버스 / 위젯 / 설정 화면
```

## 빠른 시작

```bash
npm install            # 루트에서 워크스페이스 전체 설치
npm run dev            # server(8787) + client(5173) 동시 실행
```

브라우저에서 http://localhost:5173 접속 → 설정이 없으면 `/setup` 으로 이동.

## Notion DB 준비

아래 속성을 가진 Database 를 만들고, Integration 을 connect 하세요.
속성 **이름은 한글/영문 어느 쪽이든** 자동 매핑됩니다 (title 은 타입으로 감지).

| 논리 필드 | 권장 이름 | 타입 |
|---|---|---|
| 식별용 제목 | `이름` 또는 `Name` | Title |
| 위젯 종류 | `Type` / `타입` | Select (text/image/link/embed/github) |
| 좌표 | `X`, `Y` | Number |
| 크기 | `Width`/`너비`, `Height`/`높이` | Number |
| 순서 | `ZIndex` / `순서` | Number |
| 데이터 | `Content` / `내용` | Text (rich_text, JSON 문자열) |

매핑이 잘 됐는지 확인: 보드 실행 후 `/api/widgets/_schema` 응답을 확인하거나,
설정 헤더와 함께 해당 엔드포인트를 호출하면 `mapped` / `available` 을 볼 수 있습니다.

## 설정(config) 동작

- `/setup` 에서 API 키 + DB ID 입력 → URL-safe base64 로 인코딩
- `/?config=...` 로 이동 + localStorage 캐싱
- 그 링크를 북마크하면 다른 기기에서도 같은 DB 로 바로 연결
- **위젯 데이터 자체는 절대 로컬에 저장하지 않음** (항상 Notion 에서 로드)

## 배포 (Vercel)

이 저장소는 Vercel 배포 설정(`vercel.json` + `api/index.mjs`)을 포함합니다.

- 프론트엔드: `client/dist` 정적 빌드로 서빙
- 백엔드: `server/src/app.js` Express 앱이 `/api/*` 서버리스 함수로 동작
- SPA 라우팅(`/setup` 등)은 `index.html` 로 폴백

Vercel 에 레포를 import 하면 별도 설정 없이 빌드/배포됩니다. 환경변수는
필요 없습니다 (노션 키/DB ID 는 런타임에 `/setup` 에서 입력 → 요청 헤더로 전달).

## 사용

- 기본 **보기 모드**: 패닝(드래그)/줌(휠) + 위젯 내부 동작만 가능
- 우하단 **편집 모드** 토글 → 드래그 이동 / 리사이즈 / 추가 / 삭제
- 빈 공간 우클릭(편집 모드) 또는 좌상단 `+ 위젯 추가` 로 위젯 생성
