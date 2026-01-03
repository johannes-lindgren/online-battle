/**
 * Fix to the JavaScript modulo bug
 * @param n
 * @param m
 */
export const mod = (n: number, m: number): number => ((n % m) + m) % m
