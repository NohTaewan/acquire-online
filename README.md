# ACQUIRE Online v32

v29를 기반으로 모바일 화면을 다시 단순화한 버전입니다.

## v32 주요 변경
- 모바일 게임 화면을 원스크린/Bottom Sheet 중심에서 **자연스러운 세로 스크롤 방식**으로 변경
- 모바일에서 보드 → 내 타일 → 플레이어 현황 → 주식 매수 → 게임 로그 순으로 전체 정보를 스크롤해 확인 가능
- 플레이어 현황에서 축약 아이콘 대신 **7개 호텔의 실제 이름과 보유 주식 수량**을 표시
- 내 정보 영역은 현금/주식 중복을 제거하고 **내 타일 정보만** 표시
- 일반 타일은 보드 좌표를 눌러 배치하고, 영구 배치 불가 타일만 폐기 버튼 제공
- 모바일 주식 `− / 수량 / +` 영역을 크게 확대하여 숫자 겹침 및 오터치 개선
- 주식 매수 단계 진입 시 모바일에서 주식 영역으로 자동 안내 스크롤
- 주식 선택 중간값은 로컬에서만 유지하고 구매 확정/구매 없이 진행 시에만 서버 동기화
- 모바일에서도 게임 로그를 주식 영역 아래에 그대로 표시
- PC 레이아웃은 기존 구조 유지

## 배포
기존 GitHub 저장소에 v32 내부 파일 전체를 덮어쓰고 Commit하면 Render가 자동 배포합니다.


## v32 모바일 가독성/조작성 개선
- 모바일에서 억지 축소 대신 보드·플레이어 주식·주식 매수 영역에 읽기 쉬운 최소 너비를 유지합니다.
- 폭이 부족한 영역은 해당 영역 안에서 가로 스크롤할 수 있습니다.
- 플레이어 카드에서 7개 호텔의 실제 이름과 보유 주식 수를 한 줄로 비교할 수 있습니다.
- 주식 매수의 − / 수량 / + 버튼을 크게 벌려 터치와 숫자 겹침을 개선했습니다.
- 모바일의 중복 손패 선택 카드를 제거하고, 타일 정보/영구불가 폐기는 간단한 타일 정보 행에서 처리합니다.


## v32 mobile layout fix
- The page itself stays within the phone viewport.
- Only the city board intentionally scrolls horizontally.
- Player stock holdings are shown in a two-column full-name grid.
- Stock buy controls use a separate full-width row so minus / quantity / plus never overlap.
- The hand, player cards, market and game log use normal vertical page scrolling.
