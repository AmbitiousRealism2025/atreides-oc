export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}

export async function fetchData(url: string): Promise<string> {
  return `Fetched data from ${url}`;
}
