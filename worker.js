self.addEventListener('message', (event) => {
  const message = event.data || {};
  const { id, width, height, buffer, options = {} } = message;
  try {
    const pixels = new Uint8ClampedArray(buffer);
    const histogram = new Uint32Array(256);
    const contrast = Number(options.contrast ?? 50) - 50;
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    const count = Math.floor(pixels.length / 4);
    for (let index = 0; index < pixels.length; index += 4) {
      let gray = Math.round(pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114);
      if (options.grayscale) {
        gray = Math.max(0, Math.min(255, Math.round(factor * (gray - 128) + 128)));
        pixels[index] = gray;
        pixels[index + 1] = gray;
        pixels[index + 2] = gray;
      } else if (Math.abs(contrast) > 0) {
        pixels[index] = Math.max(0, Math.min(255, Math.round(factor * (pixels[index] - 128) + 128)));
        pixels[index + 1] = Math.max(0, Math.min(255, Math.round(factor * (pixels[index + 1] - 128) + 128)));
        pixels[index + 2] = Math.max(0, Math.min(255, Math.round(factor * (pixels[index + 2] - 128) + 128)));
        gray = Math.round(pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114);
      }
      if (options.invert) {
        pixels[index] = 255 - pixels[index];
        pixels[index + 1] = 255 - pixels[index + 1];
        pixels[index + 2] = 255 - pixels[index + 2];
        gray = 255 - gray;
      }
      histogram[Math.max(0, Math.min(255, gray))] += 1;
    }
    if (options.binarize) {
      let totalWeighted = 0;
      for (let i = 0; i < 256; i += 1) totalWeighted += i * histogram[i];
      let backgroundWeight = 0;
      let backgroundSum = 0;
      let bestVariance = -1;
      let threshold = 127;
      for (let i = 0; i < 256; i += 1) {
        backgroundWeight += histogram[i];
        if (!backgroundWeight) continue;
        const foregroundWeight = count - backgroundWeight;
        if (!foregroundWeight) break;
        backgroundSum += i * histogram[i];
        const meanBackground = backgroundSum / backgroundWeight;
        const meanForeground = (totalWeighted - backgroundSum) / foregroundWeight;
        const variance = backgroundWeight * foregroundWeight * (meanBackground - meanForeground) ** 2;
        if (variance > bestVariance) {
          bestVariance = variance;
          threshold = i;
        }
      }
      for (let index = 0; index < pixels.length; index += 4) {
        const gray = Math.round(pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114);
        const value = gray > threshold ? 255 : 0;
        pixels[index] = value;
        pixels[index + 1] = value;
        pixels[index + 2] = value;
      }
    }
    self.postMessage({ id, width, height, buffer: pixels.buffer }, [pixels.buffer]);
  } catch (error) {
    self.postMessage({ id, error: error && error.message ? error.message : 'Image processing failed' });
  }
});
