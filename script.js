(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const elements = {
    fileInput: $('#file-input'), cameraInput: $('#camera-input'), chooseFile: $('#choose-file'), cameraButton: $('#camera-file-button'), dropZone: $('#drop-zone'), uploadFeedback: $('#upload-feedback'),
    previewEmpty: $('#preview-empty'), previewWrap: $('#preview-wrap'), preview: $('#image-preview'), previewFilename: $('#preview-filename'), imageDimensions: $('#image-dimensions'),
    grayscale: $('#opt-grayscale'), binarize: $('#opt-binarize'), deskew: $('#opt-deskew'), invert: $('#opt-invert'), contrast: $('#opt-contrast'), contrastValue: $('#contrast-value'),
    queueCount: $('#queue-count'), queueEmpty: $('#queue-empty'), queueList: $('#queue-list'), clearQueue: $('#clear-queue'), language: $('#language-select'), recognizeCurrent: $('#recognize-current'), recognizeAll: $('#recognize-all'), batchButtonCount: $('#batch-button-count'),
    progressCard: $('#progress-card'), progressStatus: $('#progress-status'), progressPercent: $('#progress-percent'), progressBar: $('#progress-bar'), progressFill: $('#progress-fill'), progressDetail: $('#progress-detail'), ocrFeedback: $('#ocr-feedback'),
    output: $('#output-text'), outputStatus: $('#output-status'), charCount: $('#char-count'), wordCount: $('#word-count'), lineCount: $('#line-count'), fixText: $('#fix-text'), copyText: $('#copy-text'), downloadTxt: $('#download-txt'), downloadDocx: $('#download-docx'), outputFeedback: $('#output-feedback'),
    historyEmpty: $('#history-empty'), historyList: $('#history-list'), clearHistory: $('#clear-history'), themeToggle: $('#theme-toggle'), themeIcon: $('#theme-icon'), contrastLabel: $('#contrast-value')
  };

  const HISTORY_KEY = 'bangla-ocr-history-v1';
  const THEME_KEY = 'bangla-ocr-theme';
  const MAX_FILE_BYTES = 20 * 1024 * 1024;
  const MAX_QUEUE = 30;
  const MAX_IMAGE_SIDE = 2600;
  const queue = [];
  let currentId = null;
  let idCounter = 0;
  let busy = false;
  let ocrWorker = null;
  let activeLanguage = '';
  let imageWorker = null;
  let historyItems = readHistory();

  const bnDigits = (value) => String(value).replace(/\d/g, (digit) => '০১২৩৪৫৬৭৮৯'[Number(digit)]);
  const formatBytes = (bytes) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  const setFeedback = (element, message = '', type = '') => {
    element.textContent = message;
    element.classList.toggle('is-error', type === 'error');
    element.classList.toggle('is-success', type === 'success');
  };
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const selectedItem = () => queue.find((item) => item.id === currentId) || null;
  const fileTypeOkay = (file) => file && (file.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif|tiff?)$/i.test(file.name));

  function readHistory() {
    try {
      const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
    } catch (error) {
      return [];
    }
  }

  function saveHistory(name, text) {
    const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, text, createdAt: new Date().toISOString() };
    historyItems = [entry, ...historyItems.filter((item) => !(item.name === name && item.text === text))].slice(0, 20);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(historyItems));
    } catch (error) {
      setFeedback(elements.outputFeedback, 'ব্রাউজারের স্টোরেজ পূর্ণ; এই ফলাফলটি ইতিহাসে রাখা যায়নি।', 'error');
    }
    renderHistory();
  }

  function renderHistory() {
    elements.historyList.innerHTML = '';
    elements.historyEmpty.hidden = historyItems.length > 0;
    historyItems.forEach((item) => {
      const date = new Date(item.createdAt);
      const dateLabel = Number.isNaN(date.getTime()) ? '' : date.toLocaleString('bn-BD', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const li = document.createElement('li');
      li.className = 'history-item';
      li.innerHTML = `<span class="history-file-icon" aria-hidden="true">▤</span><span class="item-copy"><strong title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</strong><small>${escapeHtml(dateLabel)} · ${bnDigits(item.text.length)} অক্ষর</small></span><span class="item-actions"><button class="small-action" type="button" data-history-open="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.name)} ফলাফল খুলুন" title="ফলাফল খুলুন">↗</button><button class="small-action" type="button" data-history-delete="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.name)} ইতিহাস থেকে মুছুন" title="মুছুন">×</button></span>`;
      elements.historyList.appendChild(li);
    });
  }

  function renderQueue() {
    elements.queueList.innerHTML = '';
    elements.queueEmpty.hidden = queue.length > 0;
    elements.queueCount.textContent = bnDigits(queue.length);
    elements.batchButtonCount.textContent = `(${bnDigits(queue.length)})`;
    elements.recognizeCurrent.disabled = busy || !selectedItem();
    elements.recognizeAll.disabled = busy || queue.length === 0;
    elements.clearQueue.disabled = busy || queue.length === 0;
    queue.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'queue-item';
      li.dataset.queueId = item.id;
      const stateLabel = item.status === 'done' ? 'সম্পন্ন' : item.status === 'running' ? 'চলছে…' : item.status === 'error' ? 'সমস্যা' : 'অপেক্ষায়';
      const preview = item.url ? `<span class="queue-thumb"><img src="${escapeHtml(item.url)}" alt=""></span>` : '<span class="queue-thumb" aria-hidden="true">▧</span>';
      li.innerHTML = `${preview}<span class="item-copy"><strong title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</strong><small>${escapeHtml(formatBytes(item.file.size))}</small></span><span class="queue-status ${item.status === 'done' ? 'done' : item.status === 'running' ? 'running' : ''}">${stateLabel}</span><span class="item-actions"><button class="small-action" type="button" data-queue-open="${item.id}" aria-label="${escapeHtml(item.file.name)} প্রিভিউ করুন" title="প্রিভিউ">↗</button><button class="small-action" type="button" data-queue-delete="${item.id}" aria-label="${escapeHtml(item.file.name)} তালিকা থেকে বাদ দিন" title="বাদ দিন" ${busy ? 'disabled' : ''}>×</button></span>`;
      if (item.id === currentId) li.style.borderColor = 'var(--primary)';
      elements.queueList.appendChild(li);
    });
  }

  function updateCounts() {
    const text = elements.output.value;
    const words = text.trim() ? text.trim().split(/\s+/u).length : 0;
    const lines = text.length ? text.split(/\r\n|\r|\n/u).length : 0;
    elements.charCount.textContent = `${bnDigits(text.length)} অক্ষর`;
    elements.wordCount.textContent = `${bnDigits(words)} শব্দ`;
    elements.lineCount.textContent = `${bnDigits(lines)} লাইন`;
    const hasText = text.length > 0;
    elements.fixText.disabled = !hasText || busy;
    elements.copyText.disabled = !hasText;
    elements.downloadTxt.disabled = !hasText;
    elements.downloadDocx.disabled = !hasText;
  }

  function setOutput(text, status = 'প্রস্তুত') {
    elements.output.value = text || '';
    elements.outputStatus.textContent = status;
    elements.outputStatus.className = 'status-chip';
    updateCounts();
  }

  function setCurrent(item) {
    if (!item) return;
    currentId = item.id;
    elements.previewEmpty.hidden = true;
    elements.previewWrap.hidden = false;
    elements.preview.src = item.url;
    elements.preview.alt = `নির্বাচিত ছবি ${item.file.name}`;
    elements.previewFilename.textContent = item.file.name;
    elements.imageDimensions.textContent = item.dimensions || formatBytes(item.file.size);
    setOutput(item.text || '', item.status === 'done' ? 'OCR সম্পন্ন' : 'প্রস্তুত');
    setFeedback(elements.outputFeedback, '');
    renderQueue();
  }

  function addFiles(fileList) {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;
    let added = 0;
    const errors = [];
    incoming.forEach((file) => {
      if (!fileTypeOkay(file)) {
        errors.push(`${file.name}: এটি ছবি নয়`);
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        errors.push(`${file.name}: ২০ MB-এর চেয়ে বড়`);
        return;
      }
      if (queue.length >= MAX_QUEUE) {
        errors.push(`সর্বোচ্চ ${bnDigits(MAX_QUEUE)}টি ছবি যোগ করা যাবে`);
        return;
      }
      const url = URL.createObjectURL(file);
      const item = { id: ++idCounter, file, url, status: 'pending', text: '', confidence: 0, dimensions: '' };
      queue.push(item);
      added += 1;
      const image = new Image();
      image.onload = () => {
        item.dimensions = `${bnDigits(image.naturalWidth)} × ${bnDigits(image.naturalHeight)}`;
        if (currentId === item.id) elements.imageDimensions.textContent = item.dimensions;
      };
      image.src = url;
      if (currentId === null) setCurrent(item);
    });
    renderQueue();
    elements.fileInput.value = '';
    elements.cameraInput.value = '';
    if (added) setFeedback(elements.uploadFeedback, `${bnDigits(added)}টি ছবি যোগ হয়েছে।`, 'success');
    else setFeedback(elements.uploadFeedback, 'কোনো ছবি যোগ করা যায়নি।', 'error');
    if (errors.length) setFeedback(elements.uploadFeedback, `${added ? `${bnDigits(added)}টি যোগ হয়েছে। ` : ''}${errors.slice(0, 3).join(' · ')}`, errors.length && !added ? 'error' : '');
  }

  function getImageWorker() {
    if (imageWorker) return imageWorker;
    if (typeof Worker !== 'function') return null;
    try {
      imageWorker = new Worker(new URL('worker.js', window.location.href));
      imageWorker.addEventListener('error', () => {
        imageWorker?.terminate();
        imageWorker = null;
      });
      return imageWorker;
    } catch (error) {
      imageWorker = null;
      return null;
    }
  }

  function applyPixelsFallback(imageData, options) {
    const data = imageData.data;
    const histogram = new Uint32Array(256);
    const contrast = Number(options.contrast) - 50;
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    let total = 0;
    for (let index = 0; index < data.length; index += 4) {
      let gray = Math.round(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114);
      if (options.grayscale) {
        const value = Math.max(0, Math.min(255, Math.round(factor * (gray - 128) + 128)));
        data[index] = value;
        data[index + 1] = value;
        data[index + 2] = value;
        gray = value;
      } else if (Math.abs(contrast) > 0) {
        data[index] = Math.max(0, Math.min(255, Math.round(factor * (data[index] - 128) + 128)));
        data[index + 1] = Math.max(0, Math.min(255, Math.round(factor * (data[index + 1] - 128) + 128)));
        data[index + 2] = Math.max(0, Math.min(255, Math.round(factor * (data[index + 2] - 128) + 128)));
        gray = Math.round(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114);
      }
      if (options.invert) {
        data[index] = 255 - data[index];
        data[index + 1] = 255 - data[index + 1];
        data[index + 2] = 255 - data[index + 2];
        gray = 255 - gray;
      }
      histogram[Math.max(0, Math.min(255, gray))] += 1;
      total += 1;
    }
    if (options.binarize) {
      let sum = 0;
      for (let i = 0; i < 256; i += 1) sum += i * histogram[i];
      let sumBackground = 0;
      let weightBackground = 0;
      let maxVariance = -1;
      let threshold = 127;
      for (let i = 0; i < 256; i += 1) {
        weightBackground += histogram[i];
        if (!weightBackground) continue;
        const weightForeground = total - weightBackground;
        if (!weightForeground) break;
        sumBackground += i * histogram[i];
        const meanBackground = sumBackground / weightBackground;
        const meanForeground = (sum - sumBackground) / weightForeground;
        const variance = weightBackground * weightForeground * Math.pow(meanBackground - meanForeground, 2);
        if (variance > maxVariance) {
          maxVariance = variance;
          threshold = i;
        }
      }
      for (let index = 0; index < data.length; index += 4) {
        const gray = Math.round(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114);
        const value = gray > threshold ? 255 : 0;
        data[index] = value;
        data[index + 1] = value;
        data[index + 2] = value;
      }
    }
    return imageData;
  }

  function processImageData(imageData, options) {
    const worker = getImageWorker();
    if (!worker) return Promise.resolve(applyPixelsFallback(imageData, options));
    return new Promise((resolve) => {
      const fallbackImageData = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
      const id = `${Date.now()}-${Math.random()}`;
      const timeout = window.setTimeout(() => {
        worker.removeEventListener('message', listener);
        resolve(applyPixelsFallback(fallbackImageData, options));
      }, 15000);
      const listener = (event) => {
        if (event.data.id !== id) return;
        window.clearTimeout(timeout);
        worker.removeEventListener('message', listener);
        if (event.data.error || !event.data.buffer) {
          resolve(applyPixelsFallback(fallbackImageData, options));
          return;
        }
        resolve(new ImageData(new Uint8ClampedArray(event.data.buffer), event.data.width, event.data.height));
      };
      worker.addEventListener('message', listener);
      const data = imageData.data;
      worker.postMessage({ id, width: imageData.width, height: imageData.height, buffer: data.buffer, options }, [data.buffer]);
    });
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('ছবিটি খোলা যায়নি। অন্য ছবি দিয়ে চেষ্টা করুন।'));
      image.src = URL.createObjectURL(file);
      image.addEventListener('load', () => URL.revokeObjectURL(image.src), { once: true });
    });
  }

  function deskewCanvas(sourceCanvas) {
    const scale = Math.min(1, 620 / Math.max(sourceCanvas.width, sourceCanvas.height));
    const testWidth = Math.max(1, Math.round(sourceCanvas.width * scale));
    const testHeight = Math.max(1, Math.round(sourceCanvas.height * scale));
    const sample = document.createElement('canvas');
    sample.width = testWidth;
    sample.height = testHeight;
    const sampleContext = sample.getContext('2d', { willReadFrequently: true });
    sampleContext.fillStyle = '#fff';
    sampleContext.fillRect(0, 0, testWidth, testHeight);
    sampleContext.drawImage(sourceCanvas, 0, 0, testWidth, testHeight);
    const original = sampleContext.getImageData(0, 0, testWidth, testHeight);
    const pixels = original.data;
    const scoreAngle = (angle) => {
      const rotated = document.createElement('canvas');
      rotated.width = testWidth;
      rotated.height = testHeight;
      const ctx = rotated.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, testWidth, testHeight);
      ctx.translate(testWidth / 2, testHeight / 2);
      ctx.rotate(angle * Math.PI / 180);
      ctx.drawImage(sample, -testWidth / 2, -testHeight / 2);
      const values = ctx.getImageData(0, 0, testWidth, testHeight).data;
      const rows = new Float64Array(testHeight);
      for (let y = 0; y < testHeight; y += 1) {
        let count = 0;
        for (let x = 0; x < testWidth; x += 2) {
          const offset = (y * testWidth + x) * 4;
          if ((values[offset] * 0.299 + values[offset + 1] * 0.587 + values[offset + 2] * 0.114) < 155) count += 1;
        }
        rows[y] = count;
      }
      let mean = 0;
      for (const row of rows) mean += row;
      mean /= rows.length || 1;
      let variance = 0;
      for (const row of rows) variance += (row - mean) ** 2;
      return variance / (rows.length || 1);
    };
    let bestAngle = 0;
    let bestScore = -Infinity;
    for (let angle = -4; angle <= 4.001; angle += 0.5) {
      const score = scoreAngle(angle);
      if (score > bestScore) {
        bestScore = score;
        bestAngle = angle;
      }
    }
    if (Math.abs(bestAngle) < 0.4) return sourceCanvas;
    const output = document.createElement('canvas');
    output.width = sourceCanvas.width;
    output.height = sourceCanvas.height;
    const context = output.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, output.width, output.height);
    context.translate(output.width / 2, output.height / 2);
    context.rotate(bestAngle * Math.PI / 180);
    context.drawImage(sourceCanvas, -sourceCanvas.width / 2, -sourceCanvas.height / 2);
    return output;
  }

  async function prepareCanvas(file, options) {
    const image = await loadImage(file);
    const ratio = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    let canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    if (options.deskew) {
      setProgress(9, 'ছবি সোজা করা হচ্ছে…', 'কাত হওয়া লেখার লাইন শনাক্ত করা হচ্ছে');
      canvas = deskewCanvas(canvas);
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const processed = await processImageData(imageData, options);
    ctx.putImageData(processed, 0, 0);
    return canvas;
  }

  function currentOptions() {
    return { grayscale: elements.grayscale.checked, binarize: elements.binarize.checked, deskew: elements.deskew.checked, invert: elements.invert.checked, contrast: Number(elements.contrast.value) };
  }

  function setProgress(value, status, detail = '') {
    const progress = Math.max(0, Math.min(100, Math.round(value)));
    elements.progressCard.hidden = false;
    elements.progressStatus.textContent = status;
    elements.progressPercent.textContent = `${bnDigits(progress)}%`;
    elements.progressFill.style.width = `${progress}%`;
    elements.progressBar.setAttribute('aria-valuenow', String(progress));
    elements.progressDetail.textContent = detail;
  }

  async function ensureOcrWorker(language) {
    if (ocrWorker && activeLanguage === language) return ocrWorker;
    if (!window.Tesseract || typeof window.Tesseract.createWorker !== 'function') throw new Error('Tesseract.js লোড হয়নি। ইন্টারনেট সংযোগ পরীক্ষা করে পেজটি রিফ্রেশ করুন।');
    if (ocrWorker) {
      await ocrWorker.terminate();
      ocrWorker = null;
    }
    activeLanguage = language;
    const languageNames = { ben: 'বাংলা', eng: 'English', 'ben+eng': 'বাংলা + English' };
    const config = {
      workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
      langPath: 'https://tessdata.projectnaptha.com/4.0.0',
      corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.0.0',
      logger: (message) => {
        const stage = message.status || 'প্রসেসিং';
        const percentage = typeof message.progress === 'number' ? 13 + message.progress * 81 : 12;
        setProgress(percentage, stage, `ভাষা: ${languageNames[language] || language}`);
      }
    };
    setProgress(3, 'OCR ইঞ্জিন চালু হচ্ছে…', `ভাষার ডেটা লোড হতে পারে: ${languageNames[language] || language}`);
    ocrWorker = await window.Tesseract.createWorker(language, 1, config);
    return ocrWorker;
  }

  async function runRecognition(items) {
    if (busy || !items.length) return;
    busy = true;
    const language = elements.language.value;
    const options = currentOptions();
    let completed = 0;
    let failed = 0;
    renderQueue();
    setFeedback(elements.ocrFeedback, '');
    elements.outputStatus.textContent = 'চলছে…';
    elements.outputStatus.className = 'status-chip is-running';
    elements.recognizeCurrent.disabled = true;
    elements.recognizeAll.disabled = true;
    try {
      for (const item of items) {
        if (!queue.some((entry) => entry.id === item.id)) continue;
        item.status = 'running';
        renderQueue();
        try {
          setProgress(1, 'প্রস্তুত হচ্ছে…', item.file.name);
          const canvas = await prepareCanvas(item.file, options);
          const worker = await ensureOcrWorker(language);
          setProgress(14, 'টেক্সট শনাক্ত করা হচ্ছে…', item.file.name);
          const result = await worker.recognize(canvas);
          item.text = String(result.data.text || '').trim();
          item.confidence = Number(result.data.confidence || 0);
          item.status = 'done';
          item.language = language;
          item.processedAt = new Date().toISOString();
          saveHistory(item.file.name, item.text);
          completed += 1;
          if (item.id === currentId) {
            setOutput(item.text, 'OCR সম্পন্ন');
            elements.outputStatus.textContent = 'OCR সম্পন্ন';
            elements.outputStatus.className = 'status-chip';
            setFeedback(elements.outputFeedback, item.text ? `শনাক্তকরণ সম্পন্ন · আনুমানিক confidence ${bnDigits(Math.round(item.confidence))}%` : 'কোনো লেখা শনাক্ত হয়নি। পরিষ্কার বা উচ্চ রেজোলিউশনের ছবি দিয়ে চেষ্টা করুন।', item.text ? 'success' : '');
          }
          setProgress(100, 'সম্পন্ন', `${item.file.name} · ${bnDigits(Math.round(item.confidence))}% confidence`);
        } catch (error) {
          item.status = 'error';
          item.error = error && error.message ? error.message : 'OCR চালানো যায়নি';
          failed += 1;
          if (item.id === currentId) setFeedback(elements.outputFeedback, item.error, 'error');
        }
        renderQueue();
      }
      const message = failed ? `${bnDigits(completed)}টি সম্পন্ন, ${bnDigits(failed)}টিতে সমস্যা হয়েছে।` : `${bnDigits(completed)}টি ছবির OCR সম্পন্ন হয়েছে।`;
      setFeedback(elements.ocrFeedback, message, failed ? '' : 'success');
      elements.outputStatus.textContent = failed ? 'কিছু সমস্যা' : 'সম্পন্ন';
      elements.outputStatus.className = failed ? 'status-chip is-error' : 'status-chip';
    } catch (error) {
      setFeedback(elements.ocrFeedback, error && error.message ? error.message : 'OCR চালানো যায়নি।', 'error');
      elements.outputStatus.textContent = 'সমস্যা হয়েছে';
      elements.outputStatus.className = 'status-chip is-error';
    } finally {
      busy = false;
      renderQueue();
      updateCounts();
    }
  }

  function fixCommonMistakes() {
    const before = elements.output.value;
    const after = before.normalize('NFC')
      .replace(/[৷]/g, '।')
      .replace(/[¦|]/g, '।')
      .replace(/।{2,}/g, '।')
      .replace(/[ \t]+([।,;:!?])/g, '$1')
      .replace(/([।,;:!?])(?=\S)/g, '$1 ')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    setOutput(after, 'সম্পাদিত');
    setFeedback(elements.outputFeedback, before === after ? 'সাধারণ OCR ফরম্যাটিং ভুল পাওয়া যায়নি।' : 'নিরাপদ ফরম্যাটিং সংশোধন করা হয়েছে; প্রয়োজনে নিজে যাচাই করুন।', 'success');
    const item = selectedItem();
    if (item) item.text = after;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function safeFilename() {
    const current = selectedItem();
    const source = current ? current.file.name.replace(/\.[^.]+$/, '') : 'bangla-ocr';
    return source.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').slice(0, 80) || 'bangla-ocr';
  }

  async function copyText() {
    const text = elements.output.value;
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
      else {
        elements.output.focus();
        elements.output.select();
        const copied = document.execCommand('copy');
        if (!copied) throw new Error('copy failed');
      }
      setFeedback(elements.outputFeedback, 'টেক্সট ক্লিপবোর্ডে কপি হয়েছে।', 'success');
    } catch (error) {
      setFeedback(elements.outputFeedback, 'কপি করা যায়নি। টেক্সট নির্বাচন করে কপি করুন।', 'error');
    }
  }

  async function downloadDocx() {
    const text = elements.output.value;
    if (!window.docx || !window.docx.Document || !window.docx.Packer) {
      setFeedback(elements.outputFeedback, 'DOCX লাইব্রেরি লোড হয়নি। ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।', 'error');
      return;
    }
    elements.downloadDocx.disabled = true;
    setFeedback(elements.outputFeedback, 'DOCX ফাইল তৈরি হচ্ছে…');
    try {
      const { Document, Paragraph, TextRun, Packer } = window.docx;
      const lines = text.split(/\r\n|\r|\n/u);
      const paragraphs = lines.map((line) => new Paragraph({ children: [new TextRun({ text: line || ' ', font: 'Nirmala UI', size: 24 })], spacing: { after: 100 } }));
      const documentFile = new Document({ sections: [{ properties: {}, children: paragraphs }] });
      const blob = await Packer.toBlob(documentFile);
      downloadBlob(blob, `${safeFilename()}.docx`);
      setFeedback(elements.outputFeedback, 'DOCX ডাউনলোড শুরু হয়েছে।', 'success');
    } catch (error) {
      setFeedback(elements.outputFeedback, 'DOCX তৈরি করা যায়নি। আবার চেষ্টা করুন।', 'error');
    } finally {
      updateCounts();
    }
  }

  function updateTheme(theme) {
    const nextTheme = theme === 'dark' ? 'dark' : 'light';
    document.body.dataset.theme = nextTheme;
    elements.themeIcon.textContent = nextTheme === 'dark' ? '☀' : '☾';
    elements.themeToggle.setAttribute('aria-label', nextTheme === 'dark' ? 'লাইট মোড চালু করুন' : 'ডার্ক মোড চালু করুন');
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.content = nextTheme === 'dark' ? '#101523' : '#f5f7fb';
  }

  elements.chooseFile.addEventListener('click', (event) => {
    event.stopPropagation();
    elements.fileInput.click();
  });
  elements.cameraButton.addEventListener('click', (event) => {
    event.stopPropagation();
    elements.cameraInput.click();
  });
  elements.dropZone.addEventListener('click', (event) => {
    if (event.target.closest('button')) return;
    elements.fileInput.click();
  });
  elements.dropZone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      elements.fileInput.click();
    }
  });
  elements.fileInput.addEventListener('change', (event) => addFiles(event.target.files));
  elements.cameraInput.addEventListener('change', (event) => addFiles(event.target.files));
  ['dragenter', 'dragover'].forEach((name) => elements.dropZone.addEventListener(name, (event) => {
    event.preventDefault();
    elements.dropZone.classList.add('is-dragging');
  }));
  ['dragleave', 'drop'].forEach((name) => elements.dropZone.addEventListener(name, (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove('is-dragging');
  }));
  elements.dropZone.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));
  document.addEventListener('paste', (event) => {
    const imageFiles = [];
    for (const item of Array.from(event.clipboardData?.items || [])) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length) {
      event.preventDefault();
      addFiles(imageFiles.map((file, index) => file.name ? file : new File([file], `clipboard-image-${Date.now()}-${index + 1}.png`, { type: file.type || 'image/png' })));
    }
  });
  elements.contrast.addEventListener('input', () => { elements.contrastValue.textContent = `${bnDigits(elements.contrast.value)}%`; });
  elements.recognizeCurrent.addEventListener('click', () => {
    const item = selectedItem();
    if (item) runRecognition([item]);
  });
  elements.recognizeAll.addEventListener('click', () => runRecognition(queue.filter((item) => item.status !== 'done')));
  elements.output.addEventListener('input', () => {
    updateCounts();
    const item = selectedItem();
    if (item) item.text = elements.output.value;
    if (elements.output.value) {
      elements.outputStatus.textContent = 'সম্পাদনা হচ্ছে';
      elements.outputStatus.className = 'status-chip';
    }
  });
  elements.fixText.addEventListener('click', fixCommonMistakes);
  elements.copyText.addEventListener('click', copyText);
  elements.downloadTxt.addEventListener('click', () => {
    downloadBlob(new Blob([elements.output.value], { type: 'text/plain;charset=utf-8' }), `${safeFilename()}.txt`);
    setFeedback(elements.outputFeedback, 'TXT ফাইল ডাউনলোড শুরু হয়েছে।', 'success');
  });
  elements.downloadDocx.addEventListener('click', downloadDocx);
  elements.clearQueue.addEventListener('click', () => {
    if (busy) return;
    queue.forEach((item) => URL.revokeObjectURL(item.url));
    queue.splice(0, queue.length);
    currentId = null;
    elements.previewWrap.hidden = true;
    elements.previewEmpty.hidden = false;
    elements.imageDimensions.textContent = 'কোনো ছবি নেই';
    setOutput('');
    renderQueue();
    setFeedback(elements.uploadFeedback, 'ছবির তালিকা খালি করা হয়েছে।', 'success');
  });
  elements.queueList.addEventListener('click', (event) => {
    const openButton = event.target.closest('[data-queue-open]');
    const deleteButton = event.target.closest('[data-queue-delete]');
    if (openButton) {
      const item = queue.find((entry) => entry.id === Number(openButton.dataset.queueOpen));
      if (item) setCurrent(item);
    }
    if (deleteButton && !busy) {
      const index = queue.findIndex((entry) => entry.id === Number(deleteButton.dataset.queueDelete));
      if (index < 0) return;
      const [removed] = queue.splice(index, 1);
      URL.revokeObjectURL(removed.url);
      if (currentId === removed.id) {
        const next = queue[0];
        currentId = null;
        if (next) setCurrent(next);
        else {
          elements.previewWrap.hidden = true;
          elements.previewEmpty.hidden = false;
          elements.imageDimensions.textContent = 'কোনো ছবি নেই';
          setOutput('');
        }
      }
      renderQueue();
    }
  });
  elements.historyList.addEventListener('click', (event) => {
    const openButton = event.target.closest('[data-history-open]');
    const deleteButton = event.target.closest('[data-history-delete]');
    if (openButton) {
      const item = historyItems.find((entry) => entry.id === openButton.dataset.historyOpen);
      if (!item) return;
      setOutput(item.text, 'ইতিহাস থেকে');
      elements.output.focus();
      setFeedback(elements.outputFeedback, `${item.name} থেকে সংরক্ষিত টেক্সট খোলা হয়েছে।`, 'success');
    }
    if (deleteButton) {
      historyItems = historyItems.filter((entry) => entry.id !== deleteButton.dataset.historyDelete);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(historyItems));
      renderHistory();
    }
  });
  elements.clearHistory.addEventListener('click', () => {
    historyItems = [];
    try { localStorage.removeItem(HISTORY_KEY); } catch (error) { }
    renderHistory();
  });
  elements.themeToggle.addEventListener('click', () => {
    const next = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
    updateTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (error) { }
  });
  window.addEventListener('beforeunload', () => {
    queue.forEach((item) => URL.revokeObjectURL(item.url));
    if (ocrWorker) ocrWorker.terminate();
    if (imageWorker) imageWorker.terminate();
  });

  let preferredTheme = 'light';
  try {
    preferredTheme = localStorage.getItem(THEME_KEY) || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  } catch (error) { }
  updateTheme(preferredTheme);
  renderHistory();
  renderQueue();
  updateCounts();
})();
