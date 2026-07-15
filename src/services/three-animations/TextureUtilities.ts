/**
 * TextureUtilities — CanvasTexture source builders shared by animation
 * presets.
 *
 * Everything here is plain 2D-canvas work (no Three.js dependency):
 * presets wrap the returned canvases in THREE.CanvasTexture themselves.
 */

/** How an extracted image should be composited onto a face texture. */
export type FaceSourceMode = "cover" | "contain" | "icon";

export interface FaceSource {
  source: CanvasImageSource;
  mode: FaceSourceMode;
}

export interface AverageColor {
  r: number;
  g: number;
  b: number;
}

/**
 * Render a coin face into `canvas`: diagonal brand gradient, optional
 * image/icon overlay, then a convex "lacquer" sheen so the face reads
 * as a curved, glossy surface instead of a flat sticker.
 */
export function renderCoinFace(
  canvas: HTMLCanvasElement,
  gradient: [string, string],
  overlay?: FaceSource | null,
): void {
  const size = canvas.width;
  const context = canvas.getContext("2d");
  if (!context) return;

  context.clearRect(0, 0, size, size);

  // 1. Brand gradient base
  const baseGradient = context.createLinearGradient(0, 0, size, size);
  baseGradient.addColorStop(0, gradient[0]);
  baseGradient.addColorStop(1, gradient[1]);
  context.fillStyle = baseGradient;
  context.fillRect(0, 0, size, size);

  // 2. Overlay (agent avatar, logo, or rasterized icon)
  if (overlay) {
    drawFaceOverlay(context, size, overlay);
  }

  // 3. Convex sheen — off-center highlight + edge vignette
  const highlight = context.createRadialGradient(
    size * 0.34,
    size * 0.3,
    size * 0.05,
    size * 0.34,
    size * 0.3,
    size * 0.85,
  );
  highlight.addColorStop(0, "rgba(255, 255, 255, 0.20)");
  highlight.addColorStop(0.45, "rgba(255, 255, 255, 0.05)");
  highlight.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = highlight;
  context.fillRect(0, 0, size, size);

  const vignette = context.createRadialGradient(
    size * 0.5,
    size * 0.5,
    size * 0.36,
    size * 0.5,
    size * 0.5,
    size * 0.52,
  );
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.28)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, size, size);
}

function drawFaceOverlay(
  context: CanvasRenderingContext2D,
  size: number,
  overlay: FaceSource,
): void {
  const { source, mode } = overlay;
  const sourceWidth =
    (source as HTMLImageElement).naturalWidth ||
    (source as HTMLCanvasElement).width ||
    size;
  const sourceHeight =
    (source as HTMLImageElement).naturalHeight ||
    (source as HTMLCanvasElement).height ||
    size;

  if (mode === "cover") {
    // Aspect-crop to fill the full face
    const scale = Math.max(size / sourceWidth, size / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    context.drawImage(
      source,
      (size - drawWidth) / 2,
      (size - drawHeight) / 2,
      drawWidth,
      drawHeight,
    );
    return;
  }

  // "contain" (logos) and "icon" (rasterized SVG glyphs) draw centered,
  // aspect-fit, over the gradient. Icons sit a little smaller so the
  // brand gradient frames them like a minted emblem.
  const inset = mode === "icon" ? 0.55 : 0.78;
  const target = size * inset;
  const scale = Math.min(target / sourceWidth, target / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.drawImage(
    source,
    (size - drawWidth) / 2,
    (size - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

/**
 * Render the coin's edge strip into `rimCanvas` by sampling the face
 * texture's border colors — this is what makes the artwork visually
 * "wrap around" the side of the coin. Adds curvature shading and a
 * milled reeding pattern, and returns the average edge color (useful
 * for tinting rim hardware to match the artwork).
 *
 * Column `u` of the strip corresponds to the face border at screen
 * angle `φ = u·2π` for geometry oriented via rotateX(π/2)+rotateZ(π/2)
 * (see CoinAnimation) — sampled at `(0.5 + 0.47·cosφ, 0.5 − 0.47·sinφ)`
 * in texture space so rim and face colors stay continuous.
 */
export function renderCoinRimStrip(
  rimCanvas: HTMLCanvasElement,
  faceCanvas: HTMLCanvasElement,
): AverageColor {
  const width = rimCanvas.width;
  const height = rimCanvas.height;
  const context = rimCanvas.getContext("2d");
  const faceContext = faceCanvas.getContext("2d");
  const fallback: AverageColor = { r: 128, g: 128, b: 140 };
  if (!context || !faceContext) return fallback;

  const faceSize = faceCanvas.width;
  const facePixels = faceContext.getImageData(0, 0, faceSize, faceSize).data;
  const sampleRadius = 0.47;

  let totalRed = 0;
  let totalGreen = 0;
  let totalBlue = 0;

  // 1. Border color columns
  for (let column = 0; column < width; column++) {
    const angle = (column / width) * Math.PI * 2;
    const sampleX = Math.min(
      faceSize - 1,
      Math.max(0, Math.round((0.5 + sampleRadius * Math.cos(angle)) * faceSize)),
    );
    const sampleY = Math.min(
      faceSize - 1,
      Math.max(0, Math.round((0.5 - sampleRadius * Math.sin(angle)) * faceSize)),
    );
    const offset = (sampleY * faceSize + sampleX) * 4;
    const red = facePixels[offset];
    const green = facePixels[offset + 1];
    const blue = facePixels[offset + 2];

    totalRed += red;
    totalGreen += green;
    totalBlue += blue;

    context.fillStyle = `rgb(${red}, ${green}, ${blue})`;
    context.fillRect(column, 0, 1, height);
  }

  // 2. Curvature shading — edge rows darken toward the faces
  const shading = context.createLinearGradient(0, 0, 0, height);
  shading.addColorStop(0, "rgba(0, 0, 0, 0.38)");
  shading.addColorStop(0.28, "rgba(0, 0, 0, 0)");
  shading.addColorStop(0.5, "rgba(255, 255, 255, 0.10)");
  shading.addColorStop(0.72, "rgba(0, 0, 0, 0)");
  shading.addColorStop(1, "rgba(0, 0, 0, 0.38)");
  context.fillStyle = shading;
  context.fillRect(0, 0, width, height);

  // 3. Reeding — milled vertical grooves like a real coin edge
  const grooveCount = 96;
  const grooveSpacing = width / grooveCount;
  for (let groove = 0; groove < grooveCount; groove++) {
    const grooveX = Math.round(groove * grooveSpacing);
    context.fillStyle = "rgba(0, 0, 0, 0.22)";
    context.fillRect(grooveX, 0, Math.max(1, Math.round(grooveSpacing * 0.22)), height);
    context.fillStyle = "rgba(255, 255, 255, 0.10)";
    context.fillRect(
      grooveX + Math.max(1, Math.round(grooveSpacing * 0.22)),
      0,
      1,
      height,
    );
  }

  return {
    r: Math.round(totalRed / width),
    g: Math.round(totalGreen / width),
    b: Math.round(totalBlue / width),
  };
}

/**
 * Extract a drawable image source from a hidden DOM container holding an
 * agent icon — either an <img> (avatar/logo) or an inline Lucide <svg>
 * (rasterized to an Image via a Blob URL, currentColor mapped to white).
 *
 * Resolves null when the container holds nothing renderable.
 */
export function extractRenderableFromContainer(
  container: HTMLElement | null,
): Promise<FaceSource | null> {
  if (!container) return Promise.resolve(null);

  const imageElement = container.querySelector("img");
  if (imageElement) {
    // Logos declare object-fit: contain inline; avatars use cover.
    const mode: FaceSourceMode =
      imageElement.style.objectFit === "contain" ? "contain" : "cover";
    if (imageElement.complete && imageElement.naturalWidth > 0) {
      return Promise.resolve({ source: imageElement, mode });
    }
    return new Promise((resolve) => {
      imageElement.addEventListener(
        "load",
        () => resolve({ source: imageElement, mode }),
        { once: true },
      );
      imageElement.addEventListener("error", () => resolve(null), { once: true });
    });
  }

  const svgElement = container.querySelector("svg");
  if (!svgElement) return Promise.resolve(null);

  svgElement.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const markup = svgElement.outerHTML.replace(/currentColor/g, "#ffffff");
  const blob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ source: image, mode: "icon" });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    image.src = objectUrl;
  });
}
