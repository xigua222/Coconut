/** 通用防抖。返回带 cancel 的包装函数。 */
export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  cancel(): void;
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, wait: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wrapped = ((...args: A) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  }) as Debounced<A>;
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}
