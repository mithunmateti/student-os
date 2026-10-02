/**
 * Small fallbacks so Safari 16.4–17.3 (iPhones on iOS 16.4+) can read PDFs. pdf.js's legacy
 * build polyfills almost everything it needs, except Promise.withResolvers (Safari 17.4+).
 * The same code is prepended to the pdf.js worker, which runs in its own context.
 */
export const PDF_POLYFILLS = `if (typeof Promise.withResolvers !== "function") { Promise.withResolvers = function () { var resolve, reject; var promise = new this(function (res, rej) { resolve = res; reject = rej; }); return { promise: promise, resolve: resolve, reject: reject }; }; }\n`;

export function applyPdfPolyfills() {
  const P = Promise as unknown as { withResolvers?: unknown };
  if (typeof P.withResolvers !== "function") {
    P.withResolvers = function <T>(this: PromiseConstructor) {
      let resolve!: (v: T) => void;
      let reject!: (e: unknown) => void;
      const promise = new this<T>((res, rej) => { resolve = res; reject = rej; });
      return { promise, resolve, reject };
    };
  }
}
