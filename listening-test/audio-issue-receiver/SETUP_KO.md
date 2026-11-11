# TOPIK I 듣기 음성 오류 자동 수집 — 중앙 수신 연결 절차

## 완료된 부분
- 별도 Google Sheets: https://docs.google.com/spreadsheets/d/1UBsMQFy_6ealdV0f7PFduTZIGjtTNtNK1S7s03rJGz0/edit
- 시트 탭: `오디오오류기록`
- 기존 학생 성적 기록용 Google Apps Script는 변경하지 않음
- 이 브랜치의 `audio-diagnostics.js`는 오류 감지, 브라우저 자동 보관, 전용 URL이 확인된 경우에만 별도 전송 대기열 운영
- `audio-issue-receiver/Code.gs`는 전용 Apps Script 수신기 코드이며 **아직 실제 배포하지 않음**

## 교사 계정에서 전용 Apps Script 웹앱 생성
1. https://script.google.com/ 에서 **새 프로젝트** 생성 (기존 성적 저장 프로젝트 수정 금지)
2. 프로젝트 이름: `TOPIK1_Audio_Error_Receiver`
3. `Code.gs`에 이 저장소의 `listening-test/audio-issue-receiver/Code.gs` 코드 전체 붙여넣기
4. 프로젝트 설정 > 스크립트 속성에 `SPREADSHEET_ID` = `1UBsMQFy_6ealdV0f7PFduTZIGjtTNtNK1S7s03rJGz0` 지정
5. **배포 > 새 배포 > 웹 앱**: 실행 사용자 = 나, 액세스 권한 = 모든 사용자. 별도 공개 수신기이므로 사용자 데이터 읽기/시트 공유 권한을 학생에게 부여하지 않음
6. 웹앱 `https://script.google.com/macros/s/.../exec` URL 확보. 누군가에게 스프레드시트 편집 권한을 주는 것은 불필요함
7. 테스트용으로 별도 시험 브랜치의 `index.html`에서 `audio-diagnostics.js` 로드 앞에 아래 한 줄 추가:

   `<script>window.TOPIK_AUDIO_DIAGNOSTICS_ENDPOINT = "https://script.google.com/macros/s/검증된_배포_ID/exec";</script>`

8. 실전 7개 회차와 문항 선택 연습, 랜덤/레벨테스트를 운영본과 분리된 테스트 환경에서 검증한 후에만 main 병합

## 시험 방법
- 브라우저 개발자 도구에서 Network=Offline으로 전환하거나 오디오 리소스 네트워크 차단으로 이상 재현
- Console에 `[TOPIKAudioDiagnostics] saved issue`가 찍히는지 확인
- `window.TOPIKAudioDiagnostics.recent()`는 진단만 반환하며 학생 개인정보가 없어야 함
- `window.TOPIKAudioDiagnostics.queuedForTransport()`는 전송 대기 이벤트 수
- `오디오오류기록` 시트에 사건ID(event_id)별 1행만 추가되는지 확인
- 동일 오류 전송을 2~3회 시도해도 서버 중복 차단으로 행이 중복되지 않아야 함
- JS `fetch(..., mode:"no-cors")`는 응답 확인이 불가능하므로 요청 성공=시트 기록 성공이라고 판단하지 말고 실제 시트에서 검증
- 운영 성적 시트의 행이 변하지 않아야 함

## 안전 정책
- 전송값: 시각, 이벤트 ID, 회차/표시 번호, 오디오 경로(상대경로), 재생 시간/길이, 상태 코드, 기기 브라우저 범주
- 전송 금지: 학생 이름/전화번호/답안/비밀번호/인증 정보/사용자 전체 주소
- 현재 자동 복구·재생 점프는 없음. 재생 중단을 감지해도 학생 답안과 시험 흐름에 손대지 않음.
- 공개 수신기에는 인증이 없으므로 예상치 못한 대량 스팸/남용이 있을 경우 배포를 중지하고 수신 정책을 검토

## 참고
브라우저 저장은 실제로 구현됨. **중앙 시트 자동 전송은 Apps Script 수신 URL 배포 및 테스트 완료 전에는 미활성 상태**.
