/** Diff comparison rules owned by d-pi, not Monaco defaults.
 * Monaco defaults `ignoreTrimWhitespace` to true, which hides
 * leading/trailing whitespace changes such as Python indentation.
 * A code-review surface must keep them visible, so the default stays off;
 * a future explicit "ignore whitespace" view mode can opt in instead. */
export const MONACO_DIFF_OPTIONS = {
  ignoreTrimWhitespace: false,
} as const;
