# 한글 조합 중 Enter 가 마지막 글자를 먹는다

`:rename 안뇽` 을 치고 Enter 를 누르면 `안` 으로 이름이 바뀌고,
입력줄에 남은 `뇽` 이 다음 Enter 에 채팅으로 나간다.

`:rename` 만의 문제가 아니다. **한글로 끝나는 모든 입력**이 같은 길을 탄다 —
평범한 메시지도 마지막 글자가 잘려서 나가고 그 글자가 다음 줄에 남는다.

## 무슨 일이 벌어지나

한글은 IME 조합을 거친다. `뇽` 은 ㄴ→뇨→뇽 으로 조합되는 중이고,
**그 상태에서 누른 Enter 는 '보내기' 가 아니라 '조합을 확정' 하는 키다.**

```
사용자:  : r e n a m e   공백  안  ㄴ ㅛ ㅇ   [Enter]
                                  └ 조합 중 ┘
입력값:  ':rename 안'                          ← '뇽' 은 아직 안 들어왔다
```

우리 핸들러는 이 Enter 를 평범한 Enter 로 받아서

1. `':rename 안'` 으로 명령을 실행하고
2. `input.value = ''` 로 입력줄을 비우고
3. 그 뒤 IME 가 확정한 `뇽` 이 **빈 입력줄**에 떨어진다

## 실측 (2026-09-02)

라이브 페이지에서 shadow root 의 `.gt-input` 에 직접 이벤트를 쏴서 확인했다.

```js
const inp = document.getElementById('gpt-skin-host').shadowRoot.querySelector('.gt-input');
inp.value = ':health';
inp.dispatchEvent(new KeyboardEvent('keydown', {
  key: 'Enter', code: 'Enter', keyCode: 229, which: 229,
  isComposing: true, bubbles: true, cancelable: true, composed: true
}));
```

| | 시스템줄 | 입력줄 |
|---|--:|---|
| 조합 중 Enter (`isComposing: true`) | 1 → 7 | 비워짐 |
| 평범한 Enter | 7 → 13 | 비워짐 |

**둘이 완전히 같다.** 조합 중인지 아닌지를 아무 데서도 보지 않고 있었다
(`isComposing` 이 소스 전체에 없었다).

## 수정

입력줄과 전역 키 핸들러 맨 앞에서 조합 중이면 손을 뗀다.

```js
const composing = (e) => e.isComposing || e.keyCode === 229;
```

`e.isComposing` 이 정본이고 `keyCode === 229` 는 이를 안 채우는 브라우저용 보험이다.

조합 중 Enter 를 흘려보내면 브라우저가 조합을 확정하고, **다음 Enter** 에 전송된다.
한글 사용자에게 익숙한 동작이다 — 원본 ChatGPT 도, 슬랙도 같다.

조합이 끝난 값으로 자동완성 후보를 다시 계산하도록 `compositionend` 도 듣는다.

## 회귀 방지

`test/ime.test.mjs` — 판별식을 소스에서 꺼내 진리표를 돌리고,
두 핸들러 **맨 앞**에 걸렸는지 위치까지 확인한다.
