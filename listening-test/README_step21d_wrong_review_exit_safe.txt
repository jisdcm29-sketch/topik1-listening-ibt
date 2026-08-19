TOPIK I 듣기 Step21d 오답풀이 중간 종료 버튼 안전 패치
======================================================

목적
----
- Step21c에서 오답풀이 중간 종료 버튼을 켜면 인증 화면에서 페이지가 응답하지 않는 문제를 줄입니다.
- 오답 다시 풀기 화면에서만 "진단으로 돌아가기" 버튼을 표시합니다.
- 버튼 클릭 시 현재 오답풀이 답안을 제출·저장하지 않고 진단 보고서로 이동합니다.

수정 파일
---------
listening-test/index.html
listening-test/step21c-wrong-review-exit.js
listening-test/style-step21c-wrong-review-exit.css
listening-test/step21d_verify_wrong_review_exit_safe.ps1

중요
----
이전에 테스트 때문에 아래처럼 파일명을 바꿨다면:

step21c-wrong-review-exit.js.off

이번 ZIP을 C:\topik1-listening-ibt 에 병합/덮어쓰기하면
새 step21c-wrong-review-exit.js 파일이 다시 생성됩니다.
.off 파일은 남아 있어도 실행되지 않습니다.

백업 권장
---------
cd C:\topik1-listening-ibt\listening-test

Copy-Item .\index.html .\index_before_step21d-wrong-exit-safe.html
if (Test-Path .\step21c-wrong-review-exit.js) {
  Copy-Item .\step21c-wrong-review-exit.js .\step21c-wrong-review-exit_before_step21d-safe.js
}
Copy-Item .\style-step21c-wrong-review-exit.css .\style-step21c-wrong-review-exit_before_step21d-safe.css

적용 위치
---------
압축을 풀어서 나온 listening-test 폴더를 아래 위치에 병합/덮어쓰기 하세요.

C:\topik1-listening-ibt

확인 명령
---------
cd C:\topik1-listening-ibt\listening-test
powershell -ExecutionPolicy Bypass -File .\step21d_verify_wrong_review_exit_safe.ps1

로컬 서버
---------
cd C:\topik1-listening-ibt
python -m http.server 5500

확인 주소
---------
인증 화면부터:
http://localhost:5500/listening-test/index.html?v=step21d-wrong-exit-safe

오답풀이 직접 진입:
http://localhost:5500/listening-test/index.html?review=wrong&v=step21d-wrong-exit-safe

검수 포인트
----------
1. 인증 화면에서 "페이지가 응답하지 않습니다"가 뜨지 않는지 확인합니다.
2. 일반 시험 화면에는 "진단으로 돌아가기" 버튼이 없어야 합니다.
3. 오답 다시 풀기 화면에는 하단 바에 "진단으로 돌아가기" 버튼이 보여야 합니다.
4. 버튼을 누르면 확인창이 뜨고, 확인하면 진단 보고서로 이동해야 합니다.
5. 오답풀이를 끝까지 제출하는 기존 동작은 그대로 유지되어야 합니다.
