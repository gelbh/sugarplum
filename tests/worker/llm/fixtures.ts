export const sampleCardsJson = JSON.stringify({
  cards: [
    {
      type: "qa",
      front: "Q?",
      back: "A",
      provenance: { pages: [1], excerpt: "ex" },
    },
    {
      type: "qa",
      front: "Q2?",
      back: "A2",
      provenance: { pages: [1], excerpt: "ex" },
    },
    {
      type: "cloze",
      front: "The {{c1::term}} matters.",
      back: "term",
      provenance: { pages: [1], excerpt: "ex" },
    },
  ],
});
