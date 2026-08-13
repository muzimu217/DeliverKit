import JSON5 from 'json5';

export function parseJson5(text: string | null): unknown {
  if (!text) {return null;}
  try {
    return JSON5.parse(text);
  } catch {
    return null;
  }
}
