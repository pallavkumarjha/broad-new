// Small content libraries — keep the editorial feel without hardcoding a single line.

export const FIELD_NOTES: Array<{ text: string; by: string }> = [
  { text: '"Distance is measured in hours.\nMemory is measured in miles."', by: '— RIDER\'S ALMANAC' },
  { text: '"Some roads are short. Some, you ride for years."', by: '— LEH LOGBOOK, 1997' },
  { text: '"The bike doesn\'t know the difference between commute and pilgrimage. You do."', by: '— KANCHAN K., KARNATAKA' },
  { text: '"A good map is a beginning. A bad one is an adventure."', by: '— FIELD MANUAL, EDITION III' },
  { text: '"Ride slow enough to see the road. Fast enough to forget the city."', by: '— ANON, GOA COAST' },
  { text: '"The horizon is the only honest deadline."', by: '— SPITI NOTEBOOK' },
];

export const COMPLETE_NOTES: Array<{ text: string; by: string }> = [
  { text: 'Another road remembered. The bike rests. So do you.', by: '— SAFELY HOME' },
  { text: 'You arrived. That is the entire achievement.', by: '— SAFELY HOME' },
  { text: 'Helmet off. Engine off. The story keeps running.', by: '— SAFELY HOME' },
  { text: 'Some kilometres go straight into memory.', by: '— SAFELY HOME' },
  { text: 'A quiet bow to the bike, the road, and the day.', by: '— SAFELY HOME' },
];

export function pickFromSeed<T>(arr: Array<T>, seed: string | number): T {
  const s = String(seed);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return arr[h % arr.length];
}
