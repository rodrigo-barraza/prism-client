"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { X, Undo2, Eraser, Send, Pen } from "lucide-react";
import styles from "./ImagePreviewComponent.module.css";

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
}: unknown) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [color, setColor] = useState(COLORS[0].value);
  const [sizeIdx, setSizeIdx] = useState(1);
  const [isEraser, setIsEraser] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [strokes, setStrokes] = useState<unknown[]>([]);
  const [currentStroke, setCurrentStroke] = useState<unknown>(null);
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
      return () => (image as HTMLImageElement).removeEventListener("load", syncCanvas);
    }
  }, [src, syncCanvas]);

  useEffect(() => {
    window.addEventListener("resize", syncCanvas);
    return () => window.removeEventListener("resize", syncCanvas);
  }, [syncCanvas]);

  // Redraw all strokes whenever strokes array or canvas changes
  useEffect(() => {
    if (!canvasReady) return;
    redrawAll(strokes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, canvasReady]);

  const redrawAll = (strokeList: Array<{ points: Array<{x: number; y: number}>; width: number; color: string; eraser?: boolean }>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = (canvas as HTMLCanvasElement).getContext("2d");
    context.clearRect(0, 0, (canvas as HTMLCanvasElement).width, (canvas as HTMLCanvasElement).height);

    for (const stroke of strokeList) {
      drawStroke(context, stroke);
    }
  };

  const drawStroke = (context: CanvasRenderingContext2D, stroke: { points: Array<{x: number; y: number}>; width: number; color: string; eraser?: boolean }) => {
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

  const getPos = (e: React.PointerEvent | PointerEvent) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
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

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!drawing || !currentStroke) return;
    e.preventDefault();
    const pos = getPos(e);
    const updated = {
      ...currentStroke,
      points: [...(currentStroke as { points: Array<{x: number; y: number}>; width: number; color: string; eraser?: boolean }).points, pos],
    };
    setCurrentStroke(updated);

    // Draw current stroke on top of committed strokes
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = (canvas as HTMLCanvasElement).getContext("2d");
    redrawAll(strokes);
    drawStroke(context, updated);
  };

  const handlePointerUp = () => {
    if (!drawing || !currentStroke) return;
    if ((currentStroke as { points: Array<{x: number; y: number}>; width: number; color: string; eraser?: boolean }).points.length >= 2) {
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
    const scaleX = (image as HTMLImageElement).naturalWidth / (canvas as HTMLCanvasElement).width;
    const scaleY = (image as HTMLImageElement).naturalHeight / (canvas as HTMLCanvasElement).height;

    for (const stroke of strokes) {
      context!.save();
      context!.lineCap = "round";
      context!.lineJoin = "round";
      context!.lineWidth = (stroke as { points: Array<{x: number; y: number}>; width: number; color: string; eraser?: boolean }).width * Math.max(scaleX, scaleY);

      if ((stroke as { points: Array<{x: number; y: number}>; width: number; color: string; eraser?: boolean }).eraser) {
        // For eraser in the composite, we just skip — strokes won't look right
        // Instead we re-draw the image underneath by not erasing it.
        // The composite approach: draw strokes only (non-eraser).
        context!.restore();
        continue;
      }

      context!.strokeStyle = (stroke as { points: Array<{x: number; y: number}>; width: number; color: string; eraser?: boolean }).color;
      context!.beginPath();
      context!.moveTo(
        (stroke as { points: Array<{x: number; y: number}>; width: number; color: string; eraser?: boolean }).points[0].x * scaleX,
        (stroke as { points: Array<{x: number; y: number}>; width: number; color: string; eraser?: boolean }).points[0].y * scaleY,
      );
      for (let i = 1; i < (stroke as { points: Array<{x: number; y: number}>; width: number; color: string; eraser?: boolean }).points.length; i++) {
        context!.lineTo(
          (stroke as { points: Array<{x: number; y: number}>; width: number; color: string; eraser?: boolean }).points[i].x * scaleX,
          (stroke as { points: Array<{x: number; y: number}>; width: number; color: string; eraser?: boolean }).points[i].y * scaleY,
        );
      }
      context!.stroke();
      context!.restore();
    }

    const dataUrl = offscreen.toDataURL("image/png");
    onUseAnnotated(dataUrl);
  };

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className={styles.overlay}>
      <button className={styles.closeBtn} onClick={onClose}>
        <X size={24} />
      </button>

      {/* Toolbar */}
      {!readOnly && (
        <div className={styles.toolbar}>
          {/* Mode toggle */}
          <div className={styles.toolGroup}>
            <button
              className={`${styles.actionBtn} ${!isEraser ? styles.sizeBtnActive : ""}`}
              onClick={() => setIsEraser(false)}
              title="Draw"
            >
              <Pen size={14} />
            </button>
            <button
              className={`${styles.actionBtn} ${isEraser ? styles.sizeBtnActive : ""}`}
              onClick={() => setIsEraser(true)}
              title="Eraser"
            >
              <Eraser size={14} />
            </button>
          </div>

          {/* Colors */}
          <div className={styles.toolGroup}>
            <span className={styles.toolLabel}>Color</span>
            {COLORS.map((c) => (
              <button
                key={c.value}
                className={`${styles.swatch} ${color === c.value && !isEraser ? styles.swatchActive : ""}`}
                style={{ background: c.value }}
                onClick={() => {
                  setColor(c.value);
                  setIsEraser(false);
                }}
                title={c.label}
              />
            ))}
          </div>

          {/* Sizes */}
          <div className={styles.toolGroup}>
            <span className={styles.toolLabel}>Size</span>
            {SIZES.map((s, i) => (
              <button
                key={s.label}
                className={`${styles.sizeBtn} ${sizeIdx === i ? styles.sizeBtnActive : ""}`}
                onClick={() => setSizeIdx(i)}
                title={s.label}
              >
                <span
                  className={styles.sizeDot}
                  style={{ width: s.dot, height: s.dot }}
                />
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className={styles.toolGroup}>
            <button
              className={styles.actionBtn}
              onClick={handleUndo}
              disabled={strokes.length === 0}
              title="Undo last stroke"
            >
              <Undo2 size={14} /> Undo
            </button>
            <button
              className={styles.actionBtn}
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
      <div className={styles.canvasArea}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={imgRef} src={src} alt="Annotate" crossOrigin="anonymous" />
        {!readOnly && (
          <canvas
            ref={canvasRef}
            className={`${styles.drawCanvas} ${isEraser ? styles.eraserCursor : ""}`}
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
        <div className={styles.bottomBar}>
          <button className={styles.useBtn} onClick={handleUse}>
            <Send size={16} /> Use in chat
          </button>
        </div>
      )}
    </div>
  );
}
