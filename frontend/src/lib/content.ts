// Small content libraries — keep the editorial feel without hardcoding a single line.

export const FIELD_NOTES = [
  '"Distance is measured in hours.\nMemory is measured in miles."',
  '"Some roads are short. Some, you ride for years."',
  '"The bike doesn\'t know the difference between commute and pilgrimage. You do."',
  '"A good map is a beginning. A bad one is an adventure."',
  '"Ride slow enough to see the road. Fast enough to forget the city."',
  '"The horizon is the only honest deadline."',
];

export const COMPLETE_NOTES = [
  'Another road remembered. The bike rests. So do you.',
  'You arrived. That is the entire achievement.',
  'Helmet off. Engine off. The story keeps running.',
  'Some kilometres go straight into memory.',
  'A quiet bow to the bike, the road, and the day.',
];

export function pickFromSeed<T>(arr: T[], seed: string | number): T {
  const s = String(seed);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return arr[h % arr.length];
}

// Per-trip image — keyword-based Unsplash source URL (deterministic by trip id).
const IMAGE_BUCKETS: Record<string, string[]> = {
  himalaya: [
    'https://images.unsplash.com/photo-1605649461784-edf01b1bbb8c?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1617704548623-340376564e68?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1583330357494-a47e9bd47e9b?w=800&auto=format&fit=crop',
  ],
  ghats: [
    'https://images.unsplash.com/photo-1597211833712-5e41faa202ea?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1613254261047-9af9b0aafb12?w=800&auto=format&fit=crop',
  ],
  coast: [
    'https://images.unsplash.com/photo-1502209524164-acea936639a2?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=800&auto=format&fit=crop',
  ],
  default: [
    'https://images.unsplash.com/photo-1517036379036-986fc83e3a8f?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=800&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800&auto=format&fit=crop',
  ],
};

export function tripImage(trip: any): string {
  const text = `${trip?.name || ''} ${trip?.start?.name || ''} ${trip?.end?.name || ''}`.toLowerCase();
  let bucket: keyof typeof IMAGE_BUCKETS = 'default';
  if (/leh|manali|spiti|himalay|ladakh|sarchu|kaza|pang|shimla/.test(text)) bucket = 'himalaya';
  else if (/coorg|mysuru|mysore|nilgiri|wayanad|chikmagalur/.test(text)) bucket = 'ghats';
  else if (/goa|pondi|kerala|coast|konkan|mangalore/.test(text)) bucket = 'coast';
  const pool = IMAGE_BUCKETS[bucket];
  return pickFromSeed(pool, trip?.id || trip?.name || 'x');
}
