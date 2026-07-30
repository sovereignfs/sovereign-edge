// CI must never reach the network. Task 1.5 turns this into a real, audited
// runtime boundary; until then, failing loudly here keeps an accidental
// fetch() from a test — or from product code under test — silent.
// See docs/epics/core-inference-chat.md task 1.5.
global.fetch = jest.fn(() => {
  throw new Error(
    'Network access from a test. The chat/inference layer is offline by ' +
      'design; connector tests must mock their transport explicitly.',
  );
});
