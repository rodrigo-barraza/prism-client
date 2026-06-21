"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { X, Undo2, Eraser, Send, Pen } from "lucide-react";
import styles from "./ImagePreviewComponent.module.css";

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  points: Point[];
  width: number;
  color: string;
  eraser?: boolean;
}

interface ImagePreviewProps {
  src: string;
  onClose: () => void;
  onUseAnnotated?: (dataUrl: string) => void;
  readOnly?: boolean;
}

const COLORS = [
  { value: "#000000", label: "Black" },
  { value: "#ef4444", label: "Red" },
  { value: "#facc15", label: "Yellow" },
  { value: "#22c55e", label: "Green" },
  { value: "#38bdf8", label: "Cyan" },
  { value: "#ffffff", label: "White" },
  { value: "#a855f7", label: "Purple" },
];

const SIZES = [
  { label: "S", width: 3, dot: 4 },
  { label: "M", width: 6, dot: 8 },
  { label: "L", width: 12, dot: 12 },
];

export default function ImagePreviewComponent({
  src,
  onClose,
  onUseAnnotated,
  readOnly = false,
}: ImagePreviewProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [color, setColor] = useState(COLORS[0].value);
  const [sizeIdx, setSizeIdx] = useState(1);
  const [isEraser, setIsEraser] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);

  // Resize canvas to match image display size
  const syncCanvas = useCallback(() => {
    const image = imgRef.current;
    const canvas = canvasRef.current;
    if (!image || !canvas) return;

    const rect = (image as HTMLImageElement).getBoundingClientRect();
    (canvas as HTMLCanvasElement).width = rect.width;
    (canvas as HTMLCanvasElement).height = rect.height;
    (canvas as HTMLCanvasElement).style.width = `${rect.width}px`;
    (canvas as HTMLCanvasElement).style.height = `${rect.height}px`;
    setCanvasReady(true);
  }, []);

  useEffect(() => {
    const image = imgRef.current;
    if (!image) return;

    if ((image as HTMLImageElement).complete) {
      syncCanvas();
    } else {
      (image as HTMLImageElement).addEventListener("load", syncCanvas);
      return () =>
        (image as HTMLImageElement).removeEventListener("load", syncCanvas);
    }
  }, [src, syncCanvas]);

  useEffect(() => {
    window.addEventListener("resize", syncCanvas);
    return () => window.removeEventListener("resize", syncCanvas);
  }, [syncCanvas]);

  const redrawAll = useCallback(
    (
      strokeList: Array<{
        points: Array<{ x: number; y: number }>;
        width: number;
        color: string;
        eraser?: boolean;
      }>,
    ) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = (canvas as HTMLCanvasElement).getContext("2d");
      if (!context) return;
      context.clearRect(
        0,
        0,
        (canvas as HTMLCanvasElement).width,
        (canvas as HTMLCanvasElement).height,
      );

      for (const stroke of strokeList) {
        drawStroke(context, stroke);
      }
    },
    [],
  );

  const drawStroke = (
    context: CanvasRenderingContext2D,
    stroke: {
      points: Array<{ x: number; y: number }>;
      width: number;
      color: string;
      eraser?: boolean;
    },
  ) => {
    if (stroke.points.length < 2) return;
    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = stroke.width;

    if (stroke.eraser) {
      context.globalCompositeOperation = "destination-out";
      context.strokeStyle = "rgba(0,0,0,1)";
    } else {
      context.globalCompositeOperation = "source-over";
      context.strokeStyle = stroke.color;
    }

    context.beginPath();
    context.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      context.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    context.stroke();
    context.restore();
  };

  // Redraw all strokes whenever strokes array or canvas changes
  useEffect(() => {
    if (!canvasReady) return;
    redrawAll(strokes);
  }, [strokes, canvasReady, redrawAll]);

  const getPos = (e: React.MouseEvent | React.TouchEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const pos = getPos(e);
    const stroke = {
      color,
      width: SIZES[sizeIdx].width,
      eraser: isEraser,
      points: [pos],
    };
    setCurrentStroke(stroke);
    setDrawing(true);
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing || !currentStroke) return;
    e.preventDefault();
    const pos = getPos(e);
    const updated: Stroke = {
      ...currentStroke,
      points: [...currentStroke.points, pos],
    };
    setCurrentStroke(updated);

    // Draw current stroke on top of committed strokes
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = (canvas as HTMLCanvasElement).getContext("2d");
    if (!context) return;
    redrawAll(strokes);
    drawStroke(context, updated);
  };

  const handlePointerUp = () => {
    if (!drawing || !currentStroke) return;
    if (currentStroke.points.length >= 2) {
      setStrokes((prev) => [...prev, currentStroke]);
    }
    setCurrentStroke(null);
    setDrawing(false);
  };

  const handleUndo = () => {
    setStrokes((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setStrokes([]);
  };

  const handleUse = () => {
    // Composite image + canvas into one data URL
    const image = imgRef.current;
    const canvas = canvasRef.current;
    if (!image || !canvas) return;

    const offscreen = document.createElement("canvas");
    offscreen.width = (image as HTMLImageElement).naturalWidth;
    offscreen.height = (image as HTMLImageElement).naturalHeight;
    const context = offscreen.getContext("2d");

    // Draw the original image at full resolution
    context!.drawImage(
      image,
      0,
      0,
      (image as HTMLImageElement).naturalWidth,
      (image as HTMLImageElement).naturalHeight,
    );

    // Scale annotations from display size to natural size
    const scaleX =
      (image as HTMLImageElement).naturalWidth /
      (canvas as HTMLCanvasElement).width;
    const scaleY =
      (image as HTMLImageElement).naturalHeight /
      (canvas as HTMLCanvasElement).height;

    for (const stroke of strokes) {
      context!.save();
      context!.lineCap = "round";
      context!.lineJoin = "round";
      context!.lineWidth = stroke.width * Math.max(scaleX, scaleY);

      if (stroke.eraser) {
        // For eraser in the composite, we just skip — strokes won't look right
        // Instead we re-draw the image underneath by not erasing it.
        // The composite approach: draw strokes only (non-eraser).
        context!.restore();
        continue;
      }

      context!.strokeStyle = stroke.color;
      context!.beginPath();
      context!.moveTo(stroke.points[0].x * scaleX, stroke.points[0].y * scaleY);
      for (let i = 1; i < stroke.points.length; i++) {
        context!.lineTo(
          stroke.points[i].x * scaleX,
          stroke.points[i].y * scaleY,
        );
      }
      context!.stroke();
      context!.restore();
    }

    const dataUrl = offscreen.toDataURL("image/png");
    onUseAnnotated?.(dataUrl);
  };

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className={`image-preview-component ${styles['overlay']}`} onClick={handleOverlayClick}>
      <button className={styles['close-button']} onClick={onClose}>
        <X size={24} />
      </button>

      {/* Toolbar */}
      {!readOnly && (
        <div className={styles['toolbar']}>
          {/* Mode toggle */}
          <div className={styles['tool-group']}>
            <button
              className={`${styles['action-button']} ${!isEraser ? styles['size-button-element-is-active-state'] : ""}`}
              onClick={() => setIsEraser(false)}
              title="Draw"
            >
              <Pen size={14} />
            </button>
            <button
              className={`${styles['action-button']} ${isEraser ? styles['size-button-element-is-active-state'] : ""}`}
              onClick={() => setIsEraser(true)}
              title="Eraser"
            >
              <Eraser size={14} />
            </button>
          </div>

          {/* Colors */}
          <div className={styles['tool-group']}>
            <span className={styles['tool-label']}>Color</span>
            {COLORS.map((config) => (
              <button
                key={config.value}
                className={`${styles['swatch']} ${color === config.value && !isEraser ? styles['swatch-is-active-state'] : ""}`}
                style={{ background: config.value }}
                onClick={() => {
                  setColor(config.value);
                  setIsEraser(false);
                }}
                title={config.label}
              />
            ))}
          </div>

          {/* Sizes */}
          <div className={styles['tool-group']}>
            <span className={styles['tool-label']}>Size</span>
            {SIZES.map((state, i) => (
              <button
                key={state.label}
                className={`${styles['size-button']} ${sizeIdx === i ? styles['size-button-element-is-active-state'] : ""}`}
                onClick={() => setSizeIdx(i)}
                title={state.label}
              >
                <span
                  className={styles['size-dot']}
                  style={{ width: state.dot, height: state.dot }}
                />
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className={styles['tool-group']}>
            <button
              className={styles['action-button']}
              onClick={handleUndo}
              disabled={strokes.length === 0}
              title="Undo last stroke"
            >
              <Undo2 size={14} /> Undo
            </button>
            <button
              className={styles['action-button']}
              onClick={handleClear}
              disabled={strokes.length === 0}
              title="Clear all annotations"
            >
              <Eraser size={14} /> Clear
            </button>
          </div>
        </div>
      )}

      {/* Canvas */}
      <div className={styles['canvas-area']}>
        <img ref={imgRef} src={src} alt="Annotate" crossOrigin="anonymous" />
        {!readOnly && (
          <canvas
            ref={canvasRef}
            className={`${styles['draw-canvas']} ${isEraser ? styles['eraser-cursor'] : ""}`}
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
          />
        )}
      </div>

      {/* Bottom bar */}
      {!readOnly && (
        <div className={styles['bottom-bar']}>
          <button className={styles['use-button']} onClick={handleUse}>
            <Send size={16} /> Use in chat
          </button>
        </div>
      )}
    </div>
  );
}
