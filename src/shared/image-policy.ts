/** App capacity policy; these are not claims about a provider's image limits. */
export const IMAGE_TRANSFER_LIMITS = Object.freeze({
  imageBytes: 10 * 1024 * 1024,
  totalImageBytes: 40 * 1024 * 1024,
  encodedBytes: 64 * 1024 * 1024,
});
export const IMAGE_COMPRESSION_DEFAULTS = Object.freeze({
  maxBytes: IMAGE_TRANSFER_LIMITS.imageBytes,
  maxSourceBytes: 25 * 1024 * 1024,
  maxPixels: 64 * 1024 * 1024,
  maxDimension: 2048,
  forceResize: false,
});
