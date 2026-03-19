const DIRECTION_0 = 0;
const DIRECTION_45 = 1;
const DIRECTION_90 = 2;
const DIRECTION_135 = 3;
const EDGE_NONE = 0;
const EDGE_WEAK = 1;
const EDGE_STRONG = 2;
const TAN_22_5 = 0.41421356237;
const TAN_67_5 = 2.41421356237;

const config = {
  processingScale: 0.35,
  thresholdMode: "manual",
  manualHighThreshold: 72,
  adaptiveThresholdScale: 1.33,
  lowThresholdRatio: 0.45,
};

const DEFAULT_VIDEO = {
  label: "HTML5 Doctor sample",
  path: "./assets/default-video.mp4",
  sourceUrl: "https://html5doctor.com/demos/video-canvas-magic/demo1.html",
};

const elements = {
  video: document.getElementById("sourceVideo"),
  canvas: document.getElementById("edgeCanvas"),
  fileInput: document.getElementById("videoFile"),
  loadDefaultButton: document.getElementById("loadDefaultButton"),
  playPauseButton: document.getElementById("playPauseButton"),
  thresholdMode: document.getElementById("thresholdMode"),
  thresholdSlider: document.getElementById("thresholdSlider"),
  thresholdLabel: document.getElementById("thresholdLabel"),
  thresholdSummary: document.getElementById("thresholdSummary"),
  statusMessage: document.getElementById("statusMessage"),
  videoSurface: document.getElementById("videoSurface"),
  canvasSurface: document.getElementById("canvasSurface"),
};

const displayContext = elements.canvas.getContext("2d", {
  alpha: false,
});
const processingCanvas = document.createElement("canvas");
const processingContext = processingCanvas.getContext("2d", {
  willReadFrequently: true,
});

const state = {
  animationFrameId: null,
  objectUrl: null,
  lastProcessedTime: -1,
  grayscaleBuffer: null,
  blurTempBuffer: null,
  blurBuffer: null,
  gradientMagnitudeBuffer: null,
  suppressedMagnitudeBuffer: null,
  directionBuffer: null,
  edgeClassBuffer: null,
  edgeOutputBuffer: null,
  hysteresisStack: null,
  edgeImageData: null,
  processingWidth: 0,
  processingHeight: 0,
  isProcessing: false,
};

displayContext.imageSmoothingEnabled = false;

elements.fileInput.addEventListener("change", handleFileSelection);
elements.loadDefaultButton.addEventListener("click", setupDefaultVideo);
elements.playPauseButton.addEventListener("click", handlePlayPause);
elements.thresholdMode.addEventListener("change", handleThresholdModeChange);
elements.thresholdSlider.addEventListener("input", handleThresholdSliderInput);
elements.video.addEventListener("loadedmetadata", resizeCanvases);
elements.video.addEventListener("play", startProcessing);
elements.video.addEventListener("pause", stopProcessing);
elements.video.addEventListener("ended", stopProcessing);
elements.video.addEventListener("emptied", resetDisplay);
elements.video.addEventListener("error", handleVideoError);
window.addEventListener("resize", resizeCanvases);

syncThresholdControls();
resetDisplay();

function setupVideo(file) {
  elements.video.pause();
  stopProcessing();
  resetDisplay();

  if (!file) {
    clearLoadedVideo();
    updateStatus("No file selected.");
    return;
  }

  if (!isSupportedVideoFile(file)) {
    clearLoadedVideo();
    updateStatus("Invalid file. Please choose a valid local video.");
    elements.fileInput.value = "";
    return;
  }

  if (state.objectUrl) {
    URL.revokeObjectURL(state.objectUrl);
  }

  state.objectUrl = URL.createObjectURL(file);
  elements.video.src = state.objectUrl;
  elements.video.load();
  elements.playPauseButton.disabled = true;
  updateStatus(`Loaded "${file.name}". Waiting for metadata...`);
}

function setupDefaultVideo() {
  elements.video.pause();
  stopProcessing();
  resetDisplay();
  releaseObjectUrl();

  elements.fileInput.value = "";
  elements.video.src = DEFAULT_VIDEO.path;
  elements.video.load();
  elements.playPauseButton.disabled = true;
  updateStatus(
    `Loaded default sample from ${DEFAULT_VIDEO.label}. Waiting for metadata...`
  );
}

function startProcessing() {
  if (state.isProcessing || elements.video.paused || elements.video.ended) {
    return;
  }

  if (!state.edgeImageData || !state.grayscaleBuffer) {
    resizeCanvases();
  }

  if (!state.edgeImageData || !state.grayscaleBuffer) {
    return;
  }

  state.isProcessing = true;
  state.animationFrameId = requestAnimationFrame(processFrame);
  syncPlayPauseButton();
  updateStatus("Processing realtime edges...");
}

function stopProcessing() {
  state.isProcessing = false;

  if (state.animationFrameId !== null) {
    cancelAnimationFrame(state.animationFrameId);
    state.animationFrameId = null;
  }

  state.lastProcessedTime = -1;
  syncPlayPauseButton();

  if (elements.video.currentSrc) {
    updateStatus(elements.video.ended ? "Playback finished." : "Processing stopped.");
  }
}

function processFrame() {
  state.animationFrameId = null;

  if (
    !state.isProcessing ||
    elements.video.paused ||
    elements.video.ended ||
    elements.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
  ) {
    stopProcessing();
    return;
  }

  const currentTime = elements.video.currentTime;
  if (Math.abs(currentTime - state.lastProcessedTime) < 1 / 120) {
    state.animationFrameId = requestAnimationFrame(processFrame);
    return;
  }

  state.lastProcessedTime = currentTime;

  processingContext.drawImage(
    elements.video,
    0,
    0,
    state.processingWidth,
    state.processingHeight
  );

  const frameImageData = processingContext.getImageData(
    0,
    0,
    state.processingWidth,
    state.processingHeight
  );

  detectEdges(
    frameImageData.data,
    state.processingWidth,
    state.processingHeight
  );

  processingContext.putImageData(state.edgeImageData, 0, 0);
  displayContext.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
  displayContext.drawImage(
    processingCanvas,
    0,
    0,
    elements.canvas.width,
    elements.canvas.height
  );

  state.animationFrameId = requestAnimationFrame(processFrame);
}

function detectEdges(sourceData, width, height) {
  convertFrameToGrayscale(sourceData, state.grayscaleBuffer);
  applySeparableGaussianBlur(
    state.grayscaleBuffer,
    state.blurTempBuffer,
    state.blurBuffer,
    width,
    height
  );

  const meanMagnitude = computeSobelGradients(
    state.blurBuffer,
    state.gradientMagnitudeBuffer,
    state.directionBuffer,
    width,
    height
  );

  applyNonMaximumSuppression(
    state.gradientMagnitudeBuffer,
    state.directionBuffer,
    state.suppressedMagnitudeBuffer,
    width,
    height
  );

  const thresholds = resolveThresholds(meanMagnitude);
  applyHysteresisThresholding(
    state.suppressedMagnitudeBuffer,
    state.edgeClassBuffer,
    state.edgeOutputBuffer,
    state.hysteresisStack,
    width,
    height,
    thresholds.high,
    thresholds.low
  );

  writeEdgeOutputToImageData(state.edgeOutputBuffer, state.edgeImageData.data);
}

function convertFrameToGrayscale(sourceData, grayscaleBuffer) {
  for (
    let sourceIndex = 0, grayIndex = 0;
    sourceIndex < sourceData.length;
    sourceIndex += 4, grayIndex += 1
  ) {
    grayscaleBuffer[grayIndex] =
      (sourceData[sourceIndex] * 77 +
        sourceData[sourceIndex + 1] * 150 +
        sourceData[sourceIndex + 2] * 29) >>
      8;
  }
}

function applySeparableGaussianBlur(sourceBuffer, tempBuffer, targetBuffer, width, height) {
  const lastColumn = width - 1;
  const lastRow = height - 1;

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;

    for (let x = 0; x < width; x += 1) {
      const currentIndex = rowOffset + x;
      const xm1 = rowOffset + Math.max(0, x - 1);
      const xm2 = rowOffset + Math.max(0, x - 2);
      const xp1 = rowOffset + Math.min(lastColumn, x + 1);
      const xp2 = rowOffset + Math.min(lastColumn, x + 2);

      tempBuffer[currentIndex] =
        (sourceBuffer[xm2] +
          4 * sourceBuffer[xm1] +
          6 * sourceBuffer[currentIndex] +
          4 * sourceBuffer[xp1] +
          sourceBuffer[xp2]) /
        16;
    }
  }

  for (let y = 0; y < height; y += 1) {
    const ym2 = Math.max(0, y - 2) * width;
    const ym1 = Math.max(0, y - 1) * width;
    const rowOffset = y * width;
    const yp1 = Math.min(lastRow, y + 1) * width;
    const yp2 = Math.min(lastRow, y + 2) * width;

    for (let x = 0; x < width; x += 1) {
      targetBuffer[rowOffset + x] =
        (tempBuffer[ym2 + x] +
          4 * tempBuffer[ym1 + x] +
          6 * tempBuffer[rowOffset + x] +
          4 * tempBuffer[yp1 + x] +
          tempBuffer[yp2 + x]) /
        16;
    }
  }
}

function computeSobelGradients(blurBuffer, magnitudeBuffer, directionBuffer, width, height) {
  magnitudeBuffer.fill(0);
  directionBuffer.fill(DIRECTION_0);

  let magnitudeSum = 0;

  for (let y = 1; y < height - 1; y += 1) {
    const rowOffset = y * width;
    const previousRow = rowOffset - width;
    const nextRow = rowOffset + width;

    for (let x = 1; x < width - 1; x += 1) {
      const index = rowOffset + x;

      const topLeft = blurBuffer[previousRow + x - 1];
      const topCenter = blurBuffer[previousRow + x];
      const topRight = blurBuffer[previousRow + x + 1];
      const middleLeft = blurBuffer[rowOffset + x - 1];
      const middleRight = blurBuffer[rowOffset + x + 1];
      const bottomLeft = blurBuffer[nextRow + x - 1];
      const bottomCenter = blurBuffer[nextRow + x];
      const bottomRight = blurBuffer[nextRow + x + 1];

      const gradientX =
        -topLeft - 2 * middleLeft - bottomLeft + topRight + 2 * middleRight + bottomRight;
      const gradientY =
        topLeft + 2 * topCenter + topRight - bottomLeft - 2 * bottomCenter - bottomRight;
      const magnitude = Math.hypot(gradientX, gradientY);

      magnitudeBuffer[index] = magnitude;
      directionBuffer[index] = quantizeDirection(gradientX, gradientY);
      magnitudeSum += magnitude;
    }
  }

  const interiorPixelCount = Math.max((width - 2) * (height - 2), 1);
  return magnitudeSum / interiorPixelCount;
}

function quantizeDirection(gradientX, gradientY) {
  const absGradientX = Math.abs(gradientX);
  const absGradientY = Math.abs(gradientY);

  if (absGradientY <= absGradientX * TAN_22_5) {
    return DIRECTION_0;
  }

  if (absGradientY >= absGradientX * TAN_67_5) {
    return DIRECTION_90;
  }

  return gradientX * gradientY >= 0 ? DIRECTION_45 : DIRECTION_135;
}

function applyNonMaximumSuppression(
  magnitudeBuffer,
  directionBuffer,
  suppressedBuffer,
  width,
  height
) {
  suppressedBuffer.fill(0);

  for (let y = 1; y < height - 1; y += 1) {
    const rowOffset = y * width;

    for (let x = 1; x < width - 1; x += 1) {
      const index = rowOffset + x;
      const magnitude = magnitudeBuffer[index];

      if (magnitude === 0) {
        continue;
      }

      let neighborA = 0;
      let neighborB = 0;

      switch (directionBuffer[index]) {
        case DIRECTION_0:
          neighborA = magnitudeBuffer[index - 1];
          neighborB = magnitudeBuffer[index + 1];
          break;
        case DIRECTION_45:
          neighborA = magnitudeBuffer[index - width + 1];
          neighborB = magnitudeBuffer[index + width - 1];
          break;
        case DIRECTION_90:
          neighborA = magnitudeBuffer[index - width];
          neighborB = magnitudeBuffer[index + width];
          break;
        default:
          neighborA = magnitudeBuffer[index - width - 1];
          neighborB = magnitudeBuffer[index + width + 1];
          break;
      }

      suppressedBuffer[index] =
        magnitude >= neighborA && magnitude >= neighborB ? magnitude : 0;
    }
  }
}

function resolveThresholds(meanMagnitude) {
  if (config.thresholdMode === "adaptive") {
    const high = clamp(meanMagnitude * config.adaptiveThresholdScale, 12, 255);
    return {
      high,
      low: Math.max(1, high * config.lowThresholdRatio),
    };
  }

  return {
    high: config.manualHighThreshold,
    low: Math.max(1, config.manualHighThreshold * config.lowThresholdRatio),
  };
}

function applyHysteresisThresholding(
  suppressedBuffer,
  edgeClassBuffer,
  edgeOutputBuffer,
  stackBuffer,
  width,
  height,
  highThreshold,
  lowThreshold
) {
  edgeClassBuffer.fill(EDGE_NONE);
  edgeOutputBuffer.fill(0);

  let stackSize = 0;

  for (let y = 1; y < height - 1; y += 1) {
    const rowOffset = y * width;

    for (let x = 1; x < width - 1; x += 1) {
      const index = rowOffset + x;
      const magnitude = suppressedBuffer[index];

      if (magnitude >= highThreshold) {
        edgeClassBuffer[index] = EDGE_STRONG;
        stackBuffer[stackSize] = index;
        stackSize += 1;
      } else if (magnitude >= lowThreshold) {
        edgeClassBuffer[index] = EDGE_WEAK;
      }
    }
  }

  while (stackSize > 0) {
    stackSize -= 1;
    const index = stackBuffer[stackSize];

    if (edgeOutputBuffer[index] === 255) {
      continue;
    }

    edgeOutputBuffer[index] = 255;

    const x = index % width;
    const y = (index / width) | 0;

    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (offsetX === 0 && offsetY === 0) {
          continue;
        }

        const neighborX = x + offsetX;
        const neighborY = y + offsetY;

        if (
          neighborX <= 0 ||
          neighborX >= width - 1 ||
          neighborY <= 0 ||
          neighborY >= height - 1
        ) {
          continue;
        }

        const neighborIndex = neighborY * width + neighborX;

        if (edgeClassBuffer[neighborIndex] === EDGE_WEAK) {
          edgeClassBuffer[neighborIndex] = EDGE_STRONG;
          stackBuffer[stackSize] = neighborIndex;
          stackSize += 1;
        }
      }
    }
  }
}

function writeEdgeOutputToImageData(edgeOutputBuffer, outputData) {
  for (
    let pixelIndex = 0, outputIndex = 0;
    pixelIndex < edgeOutputBuffer.length;
    pixelIndex += 1, outputIndex += 4
  ) {
    const edgeValue = edgeOutputBuffer[pixelIndex];

    outputData[outputIndex] = edgeValue;
    outputData[outputIndex + 1] = edgeValue;
    outputData[outputIndex + 2] = edgeValue;
    outputData[outputIndex + 3] = 255;
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function resizeCanvases() {
  const videoWidth = elements.video.videoWidth || 1280;
  const videoHeight = elements.video.videoHeight || 720;
  const safeHeight = Math.max(videoHeight, 1);

  elements.videoSurface.style.setProperty(
    "--media-aspect",
    `${videoWidth} / ${safeHeight}`
  );
  elements.canvasSurface.style.setProperty(
    "--media-aspect",
    `${videoWidth} / ${safeHeight}`
  );

  elements.canvas.width = videoWidth;
  elements.canvas.height = safeHeight;

  state.processingWidth = Math.max(
    2,
    Math.round(videoWidth * config.processingScale)
  );
  state.processingHeight = Math.max(
    2,
    Math.round((safeHeight / videoWidth) * state.processingWidth)
  );

  processingCanvas.width = state.processingWidth;
  processingCanvas.height = state.processingHeight;
  const pixelCount = state.processingWidth * state.processingHeight;

  state.grayscaleBuffer = new Float32Array(pixelCount);
  state.blurTempBuffer = new Float32Array(pixelCount);
  state.blurBuffer = new Float32Array(pixelCount);
  state.gradientMagnitudeBuffer = new Float32Array(pixelCount);
  state.suppressedMagnitudeBuffer = new Float32Array(pixelCount);
  state.directionBuffer = new Uint8ClampedArray(pixelCount);
  state.edgeClassBuffer = new Uint8ClampedArray(pixelCount);
  state.edgeOutputBuffer = new Uint8ClampedArray(pixelCount);
  state.hysteresisStack = new Int32Array(pixelCount);
  state.edgeImageData = processingContext.createImageData(
    state.processingWidth,
    state.processingHeight
  );

  clearCanvas();
  elements.playPauseButton.disabled = !elements.video.currentSrc;
  syncPlayPauseButton();

  if (elements.video.currentSrc) {
    updateStatus("Video ready. Press play to start processing.");
  }
}

function handleFileSelection(event) {
  const [file] = event.target.files || [];
  setupVideo(file);
}

function handlePlayPause() {
  if (!elements.video.currentSrc) {
    return;
  }

  if (elements.video.paused || elements.video.ended) {
    elements.video.play().catch(() => {
      updateStatus("Unable to start playback for this video.");
    });
    return;
  }

  elements.video.pause();
}

function handleThresholdModeChange(event) {
  config.thresholdMode = event.target.value;
  syncThresholdControls();
}

function handleThresholdSliderInput(event) {
  const sliderValue = Number(event.target.value);

  if (config.thresholdMode === "adaptive") {
    config.adaptiveThresholdScale = sliderValue / 100;
  } else {
    config.manualHighThreshold = sliderValue;
  }

  syncThresholdControls();
}

function handleVideoError() {
  stopProcessing();
  clearLoadedVideo();
  updateStatus(
    "Cannot decode this video source. Please choose another local file or reload the default sample."
  );
}

function resetDisplay() {
  clearCanvas();
  state.grayscaleBuffer = null;
  state.blurTempBuffer = null;
  state.blurBuffer = null;
  state.gradientMagnitudeBuffer = null;
  state.suppressedMagnitudeBuffer = null;
  state.directionBuffer = null;
  state.edgeClassBuffer = null;
  state.edgeOutputBuffer = null;
  state.hysteresisStack = null;
  state.edgeImageData = null;
  state.processingWidth = 0;
  state.processingHeight = 0;
  elements.playPauseButton.disabled = !elements.video.currentSrc;
  syncPlayPauseButton();
}

function clearCanvas() {
  displayContext.fillStyle = "#000000";
  displayContext.fillRect(0, 0, elements.canvas.width || 1280, elements.canvas.height || 720);
}

function clearLoadedVideo() {
  releaseObjectUrl();

  elements.video.removeAttribute("src");
  elements.video.load();
  elements.playPauseButton.disabled = true;
  syncPlayPauseButton();
}

function releaseObjectUrl() {
  if (state.objectUrl) {
    URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = null;
  }
}

function isSupportedVideoFile(file) {
  if (file.type.startsWith("video/")) {
    return true;
  }

  return /\.(mp4|webm|ogg|mov|m4v|avi)$/i.test(file.name);
}

function syncPlayPauseButton() {
  elements.playPauseButton.textContent =
    elements.video.paused || elements.video.ended ? "Play" : "Pause";
}

function syncThresholdControls() {
  if (config.thresholdMode === "adaptive") {
    const sliderValue = Math.round(config.adaptiveThresholdScale * 100);
    elements.thresholdLabel.textContent = "Adaptive factor";
    elements.thresholdSlider.min = "80";
    elements.thresholdSlider.max = "220";
    elements.thresholdSlider.value = String(sliderValue);
    elements.thresholdSummary.textContent =
      `Adaptive: high = mean magnitude x ${(sliderValue / 100).toFixed(2)}, low = high x ${config.lowThresholdRatio.toFixed(2)}.`;
    return;
  }

  elements.thresholdLabel.textContent = "High threshold";
  elements.thresholdSlider.min = "20";
  elements.thresholdSlider.max = "180";
  elements.thresholdSlider.value = String(Math.round(config.manualHighThreshold));
  elements.thresholdSummary.textContent =
    `Manual: high = ${Math.round(config.manualHighThreshold)}, low = ${Math.round(
      config.manualHighThreshold * config.lowThresholdRatio
    )}.`;
}

function updateStatus(message) {
  elements.statusMessage.textContent = message;
}
