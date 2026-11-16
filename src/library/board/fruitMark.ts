const FRUITS = [
  "plum",
  "apple",
  "cherry",
  "grape",
  "lemon",
  "orange",
  "pear",
  "pineapple",
  "strawberry",
  "kiwi",
  "coconut",
] as const;

export type FruitName = (typeof FRUITS)[number];

export function fruitMarkSrc(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  const name = FRUITS[hash % FRUITS.length]!;
  return `/achievements/fruits/${name}.svg`;
}

export function fruitMarkNames(): readonly FruitName[] {
  return FRUITS;
}
