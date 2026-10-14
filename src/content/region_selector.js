/**
 * Sidekick - Region Crop Selector (Slice 8)
 * Canvas-based fullscreen overlay allowing users to drag-and-drop a rectangular
 * crop box over any visual element on the active page.
 */

(function initSidekickRegionSelector() {
  if (window.__SIDEKICK_REGION_SELECTOR_INITIALIZED__) {
    return;
  }
  window.__SIDEKICK_REGION_SELECTOR_INITIALIZED__ = true;

  console.log("[Sidekick Region Selector] Initialized on:", window.location.href);

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) return false;

    if (message.type === "INIT_REGION_SELECTOR") {
      createCropOverlay(message.dataUrl);
      sendResponse({ success: true });
      return false;
    }

    return false;
  });

  /**
   * Create interactive crop overlay
   * @param {string} fullSnapshotDataUrl
   */
  function createCropOverlay(fullSnapshotDataUrl) {
    // Remove existing overlay if any
    const existing = document.getElementById("sidekick-crop-overlay-root");
    if (existing) existing.remove();

    const root = document.createElement("div");
    root.id = "sidekick-crop-overlay-root";
    root.style.cssText = `
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      z-index: 2147483647;
      cursor: crosshair;
      user-select: none;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

    // Banner instructions
    const banner = document.createElement("div");
    banner.style.cssText = `
      position: absolute;
      top: 18px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(15, 23, 42, 0.92);
      border: 1px solid rgba(99, 102, 241, 0.6);
      color: #ffffff;
      padding: 8px 18px;
      border-radius: 24px;
      font-size: 13px;
      font-weight: 600;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      gap: 12px;
      pointer-events: auto;
    `;
    banner.innerHTML = `
      <span>📷 <strong>Drag to crop region</strong></span>
      <span style="opacity: 0.5;">|</span>
      <span style="font-size: 12px; opacity: 0.85;">Click anywhere for Full Page</span>
      <span style="opacity: 0.5;">|</span>
      <button id="sidekick-btn-cancel-crop" style="
        background: rgba(244, 63, 94, 0.2);
        border: 1px solid rgba(244, 63, 94, 0.4);
        color: #fca5a5;
        font-size: 11px;
        font-weight: 700;
        padding: 3px 8px;
        border-radius: 12px;
        cursor: pointer;
      ">ESC Cancel</button>
    `;

    // Canvas overlay for dark tint and crop cutout
    const canvas = document.createElement("canvas");
    canvas.width = window.innerWidth * window.devicePixelRatio;
    canvas.height = window.innerHeight * window.devicePixelRatio;
    canvas.style.cssText = `
      width: 100%;
      height: 100%;
      display: block;
    `;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    ctx.scale(dpr, dpr);

    // Initial dark veil
    drawVeil(ctx, 0, 0, 0, 0);

    // Drag selection box state
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;

    function cleanup() {
      window.removeEventListener("keydown", onKeyDown);
      root.remove();
    }

    function onKeyDown(e) {
      if (e.key === "Escape") {
        cleanup();
        chrome.runtime.sendMessage({ type: "REGION_CANCELLED" }).catch(() => {});
      }
    }
    window.addEventListener("keydown", onKeyDown);

    banner.querySelector("#sidekick-btn-cancel-crop")?.addEventListener("click", () => {
      cleanup();
      chrome.runtime.sendMessage({ type: "REGION_CANCELLED" }).catch(() => {});
    });

    root.addEventListener("mousedown", (e) => {
      if (e.target.closest("#sidekick-btn-cancel-crop")) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      currentX = e.clientX;
      currentY = e.clientY;
    });

    root.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      currentX = e.clientX;
      currentY = e.clientY;

      const rect = getNormalizedRect(startX, startY, currentX, currentY);
      drawVeil(ctx, rect.x, rect.y, rect.w, rect.h);
    });

    root.addEventListener("mouseup", async (e) => {
      if (!isDragging) return;
      isDragging = false;

      const rect = getNormalizedRect(startX, startY, currentX, currentY);

      // If clicked without dragging (or tiny box < 15px), capture full viewport
      const isFullPage = rect.w < 15 || rect.h < 15;

      try {
        const finalDataUrl = isFullPage
          ? fullSnapshotDataUrl
          : await cropImage(fullSnapshotDataUrl, rect);

        cleanup();

        chrome.runtime.sendMessage({
          type: "REGION_CAPTURED",
          dataUrl: finalDataUrl,
          isFullPage,
          width: isFullPage ? window.innerWidth : rect.w,
          height: isFullPage ? window.innerHeight : rect.h
        }).catch(() => {});
      } catch (cropErr) {
        console.error("[Sidekick Region Selector] Crop error:", cropErr);
        cleanup();
        chrome.runtime.sendMessage({
          type: "REGION_CAPTURED",
          dataUrl: fullSnapshotDataUrl,
          isFullPage: true
        }).catch(() => {});
      }
    });

    root.appendChild(canvas);
    root.appendChild(banner);
    document.body.appendChild(root);
  }

  function getNormalizedRect(x1, y1, x2, y2) {
    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    const w = Math.abs(x2 - x1);
    const h = Math.abs(y2 - y1);
    return { x, y, w, h };
  }

  function drawVeil(ctx, cropX, cropY, cropW, cropH) {
    const w = window.innerWidth;
    const h = window.innerHeight;

    ctx.clearRect(0, 0, w, h);

    // Dark background mask
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, 0, w, h);

    if (cropW > 0 && cropH > 0) {
      // Clear cutout for selection
      ctx.clearRect(cropX, cropY, cropW, cropH);

      // High-contrast dashed border
      ctx.strokeStyle = "#818cf8";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(cropX, cropY, cropW, cropH);

      // Dimensions tag
      ctx.fillStyle = "#818cf8";
      ctx.fillRect(cropX, Math.max(0, cropY - 22), 85, 20);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 11px sans-serif";
      ctx.fillText(`${Math.round(cropW)} × ${Math.round(cropH)}`, cropX + 6, Math.max(14, cropY - 8));
    }
  }

  /**
   * Crop image using an offscreen canvas
   * @param {string} fullDataUrl
   * @param {{ x: number, y: number, w: number, h: number }} rect
   * @returns {Promise<string>} Cropped PNG base64 data URL
   */
  function cropImage(fullDataUrl, rect) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const scaleX = img.naturalWidth / window.innerWidth;
          const scaleY = img.naturalHeight / window.innerHeight;

          const cropCanvas = document.createElement("canvas");
          cropCanvas.width = Math.round(rect.w * scaleX);
          cropCanvas.height = Math.round(rect.h * scaleY);

          const cropCtx = cropCanvas.getContext("2d");
          cropCtx.drawImage(
            img,
            Math.round(rect.x * scaleX),
            Math.round(rect.y * scaleY),
            Math.round(rect.w * scaleX),
            Math.round(rect.h * scaleY),
            0,
            0,
            cropCanvas.width,
            cropCanvas.height
          );

          resolve(cropCanvas.toDataURL("image/png"));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = (e) => reject(new Error("Failed to load image for cropping"));
      img.src = fullDataUrl;
    });
  }
})();
