# CampusDoc

CampusDoc은 대학생의 문서 작업 흐름을 단일 경험으로 통합하기 위한 프로젝트입니다.  
자주 다루는 문서 형식(`txt`, `md`, `hwp`, `docx`, `pptx`, `pdf`)을 한곳에서 열고, 읽고, 편집하는 경험을 목표로 합니다.

## 배경

실제 대학 생활에서는 문서가 포맷별로 분산되어 작업 맥락이 자주 끊깁니다.  
CampusDoc은 이 문제를 해결하기 위해 포맷 간 전환 비용을 줄이고, 읽기/탐색/편집 흐름을 통합하려는 시도입니다.

- 수업 자료는 `pdf`, 과제 메모는 `md`/`txt`, 문서는 `docx`/`hwp`, 발표 자료는 `pptx`로 분산되는 문제를 해결
- 단순 뷰어를 넘어 "통합 문서 작업 환경" 구축

## 프로젝트 목표

1. 다양한 문서 형식 통합 보기
2. 문서 형식별 차이를 최소화한 일관된 편집 경험
3. 빠른 탐색, 재검색, 문맥 유지가 가능한 읽기 인터페이스

## 지원 대상 문서 형식

- `txt`, `md`, `docx`, `pptx`, `pdf`, `hwp`

## 현재 상태 (2026-04)

- 이 저장소는 `hci-reading-interface-study`를 기반으로 시작했습니다.
- 현재 코드는 **Electron 전용** `txt` 작업 환경(v1)으로 운영됩니다.
- CampusDoc 목표에 맞춰 멀티 포맷 파서, 통합 렌더러, 편집 기능으로 확장할 예정입니다.

## Electron v1 구현 (TXT 내부 작업본)

현재 저장소는 Electron v1 구조를 포함합니다.

- 런타임 분리: `electron/main.js`(메인), `electron/preload.js`(IPC 브리지), `index.html + renderer/*`(렌더러)
- IPC 채널 상수: `electron/shared/ipc-channels.source.json`를 기준으로 `npm run generate:ipc` 시
  - `electron/shared/ipc-channels.js`(main용)
  - `electron/preload.js` 내 생성 블록( preload용, sandbox 안전)
    으로 동기화됩니다.
- 보안 기본값: `contextIsolation=true`, `sandbox=true`, `nodeIntegration=false`
- 작업공간: `app.getPath("userData")/workspace`
  - 문서 파일: `workspace/docs/{docId}.txt`
  - 메타데이터: `workspace/index.json`
- 파일 모델: 로컬 TXT를 가져오면 작업공간으로 복사하여 편집하고, `Export TXT`로 외부 파일 생성
- 인코딩 정책(v1): UTF-8 TXT만 지원

### 설정 팝업 (Theme + Reading Mode)

- 상단 `설정` 버튼에서 다음 항목을 앱 전역으로 설정할 수 있습니다.
  - `Theme`: `Dark` / `Light`
  - `Reading Mode`: `A` / `B` / `C` / `D`
- Reading Mode 동작
  - `A`: 보조 효과 없음
  - `B`: 활성 줄 밑줄 강조
  - `C`: 활성 줄 배경 강조
  - `D`: `ArrowUp/ArrowDown` 키보드 활성 줄 배경 강조 + 필요 시 최소 자동 스크롤  
    (휠/스페이스/PageUp/PageDown 기본 스크롤 동작은 유지)

### 공개 API (Renderer에서 사용)

`window.campusDoc.files`

- `listDocs()`
- `importTxt()`
- `createDoc(title)`
- `readDoc(docId)`
- `saveDoc(docId, content)`
- `exportTxt(docId)`

## 개발 실행

```bash
nvm use
npm install
npm run dev
```

- `npm run dev`: Electron 실행 + 렌더러 파일(`index.html`, `styles/*`, `renderer/*`) 변경 시 자동 reload
- Node.js `24.x` 기준 (`.nvmrc` 포함)

## 테스트

```bash
npm test
```

- 단위 테스트는 `electron/backend/doc-repository.test.js`에 포함되어 있습니다.
- 렌더러 테스트는 `tests/renderer/*.test.js`에 포함되어 있습니다. (`Vitest + jsdom`)

## 패키징

```bash
npm run dist:win  # Windows portable .exe
npm run dist:mac  # macOS .dmg
```

- 전체 빌드: `npm run dist`

## 로드맵

1. 입력/파싱 레이어 구축: 각 포맷 로딩 및 내부 공통 문서 모델 정의
2. 통합 뷰어: 포맷별 차이를 줄인 단일 읽기 인터페이스 구현
3. 통합 편집: 기본 편집(텍스트/구조), 포맷별 저장 전략 정리
4. 생산성 기능: 검색, 하이라이트, 주석, 버전 비교, 내보내기 강화

## 원본 저장소

- [hci-reading-interface-study](https://github.com/philosophy-engineer/hci-reading-interface-study)
