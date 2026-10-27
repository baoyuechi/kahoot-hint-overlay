/*
 * 帧样本构造器。所有样本都模仿 Bayeux 包结构：顶层是数组，内含 channel + data.content（JSON 字符串）。
 */
(function (root) {
  "use strict";

  function packet(content, extra = {}) {
    return {
      channel: "/service/player",
      data: { content: JSON.stringify(content), ...extra }
    };
  }

  const QUIZ = [
    {
      question: "Which planet has the most moons?",
      choices: [{ answer: "Saturn" }, { answer: "Jupiter" }, { answer: "Mars" }, { answer: "Venus" }],
      questionIndex: 0
    },
    {
      question: "Which ocean is the deepest?",
      choices: [{ answer: "Pacific" }, { answer: "Atlantic" }, { answer: "Indian" }, { answer: "Arctic" }],
      questionIndex: 1
    },
    {
      question: "Which year did the Berlin Wall fall?",
      choices: [{ answer: "1989" }, { answer: "1991" }, { answer: "1979" }, { answer: "1995" }],
      questionIndex: 2
    }
  ];

  function questionFrame(index = 0) {
    return [packet(QUIZ[index])];
  }

  function revealFrame(index = 0) {
    const base = QUIZ[index];
    return [packet({ ...base, numberOfChoices: base.choices.length })];
  }

  function placeholderFrame(index = 0) {
    return [
      packet(
        {
          question: QUIZ[index].question,
          choices: [{ answer: "answer-0" }, { answer: "answer-1" }, { answer: "answer-2" }, { answer: "answer-3" }],
          questionIndex: QUIZ[index].questionIndex
        },
        { questionIndex: QUIZ[index].questionIndex }
      )
    ];
  }

  function badJson() {
    return "{ this is not json";
  }

  root.KCFixtures = { QUIZ, packet, questionFrame, revealFrame, placeholderFrame, badJson };
})(typeof window !== "undefined" ? window : globalThis);
