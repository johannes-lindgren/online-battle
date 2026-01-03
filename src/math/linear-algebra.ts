export const zeros = (n: number): 0[] => {
  const arr = new Array(n)
  for (let i = 0; i < arr.length; i++) {
    arr[i] = 0
  }
  return arr
}

export const ones = (n: number): 1[] => {
  const arr = new Array(n)
  for (let i = 0; i < arr.length; i++) {
    arr[i] = 1
  }
  return arr
}

export const linspace = (x1: number, x2: number, n: number): number[] => {
  if (n === 0) {
    return []
  }
  if (n === 1) {
    return [x1]
  }
  return zeros(n).map((_, index) => x1 + (index * (x2 - x1)) / (n - 1))
}
