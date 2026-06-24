// TOPIK I 듣기 오답풀이 진행 반영 패치 - 비활성화 버전
// Step15: 진단 보고서는 최초 제출 결과만 기준으로 생성한다.
// 오답풀이 결과는 진단 보고서의 점수, 약점 분석, 오답 목록, 학습 처방에 반영하지 않는다. 버튼의 남은 문항 수는 listening-diagnosis.js가 별도로 계산한다.
// 이 파일은 이전 패치 파일을 안전하게 덮어쓰기 위한 no-op 파일이다.

(function () {
  "use strict";
  console.info("[wrong-review-progress-fix] disabled: diagnosis uses original submitted result only.");
})();
