"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, ZoomIn, ZoomOut, Upload } from "lucide-react";
import { ButtonComponent } from "@rodrigo-barraza/components-library";
import styles from "./ImageCropperComponent.module.css";

interface ImageCropperComponentProps {
  imageFile: File | null;
  onCrop: (croppedDataUrl: string) => void;
  onCancel: () => void;
}

const CROP_CONTAINER_SIZE = 240;

export default function ImageCropperComponent({
  imageFile,
  onCrop,
  onCancel,
}: ImageCropperComponentProps) {
  const [imageSource, setImageSource] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [translateX, setTranslateX] = useState<number>(0);
  const [translateY, setTranslateY] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const imageReference = useRef<HTMLImageElement | null>(null);
  const dragStartPoint = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const translationStartPoint = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Read the image file into a base64 string
  useEffect(() => {
    if (!imageFile) {
      setImageSource(null);
      return;
    }
    const fileReader = new FileReader();
    fileReader.onload = () => {
      if (typeof fileReader.result === "string") {
        setImageSource(fileReader.result);
      }
    };
    fileReader.readAsDataURL(imageFile);
  }, [imageFile]);

  // Nudge the image back within boundaries whenever zoom changes
  useEffect(() => {
    const imageElement = imageReference.current;
    if (!imageElement) return;

    const baseScale = Math.max(
      CROP_CONTAINER_SIZE / imageElement.naturalWidth,
      CROP_CONTAINER_SIZE / imageElement.naturalHeight,
    );
    const currentScale = baseScale * zoom;

    const displayedWidth = imageElement.naturalWidth * currentScale;
    const displayedHeight = imageElement.naturalHeight * currentScale;

    const defaultX = (CROP_CONTAINER_SIZE - displayedWidth) / 2;
    const defaultY = (CROP_CONTAINER_SIZE - displayedHeight) / 2;

    const minimumTranslateX = CROP_CONTAINER_SIZE - displayedWidth - defaultX;
    const maximumTranslateX = -defaultX;
    const clampedTranslateX = Math.max(
      minimumTranslateX,
      Math.min(maximumTranslateX, translateX),
    );

    const minimumTranslateY = CROP_CONTAINER_SIZE - displayedHeight - defaultY;
    const maximumTranslateY = -defaultY;
    const clampedTranslateY = Math.max(
      minimumTranslateY,
      Math.min(maximumTranslateY, translateY),
    );

    setTranslateX(clampedTranslateX);
    setTranslateY(clampedTranslateY);
  }, [zoom]);

  // Dragging event handlers for desktop mouse
  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
    dragStartPoint.current = { x: event.clientX, y: event.clientY };
    translationStartPoint.current = { x: translateX, y: translateY };
  };

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!isDragging || !imageReference.current) return;
      const deltaX = event.clientX - dragStartPoint.current.x;
      const deltaY = event.clientY - dragStartPoint.current.y;

      const proposedTranslateX = translationStartPoint.current.x + deltaX;
      const proposedTranslateY = translationStartPoint.current.y + deltaY;

      const imageElement = imageReference.current;
      const baseScale = Math.max(
        CROP_CONTAINER_SIZE / imageElement.naturalWidth,
        CROP_CONTAINER_SIZE / imageElement.naturalHeight,
      );
      const currentScale = baseScale * zoom;

      const displayedWidth = imageElement.naturalWidth * currentScale;
      const displayedHeight = imageElement.naturalHeight * currentScale;

      const defaultX = (CROP_CONTAINER_SIZE - displayedWidth) / 2;
      const defaultY = (CROP_CONTAINER_SIZE - displayedHeight) / 2;

      const minimumTranslateX = CROP_CONTAINER_SIZE - displayedWidth - defaultX;
      const maximumTranslateX = -defaultX;
      const clampedTranslateX = Math.max(
        minimumTranslateX,
        Math.min(maximumTranslateX, proposedTranslateX),
      );

      const minimumTranslateY = CROP_CONTAINER_SIZE - displayedHeight - defaultY;
      const maximumTranslateY = -defaultY;
      const clampedTranslateY = Math.max(
        minimumTranslateY,
        Math.min(maximumTranslateY, proposedTranslateY),
      );

      setTranslateX(clampedTranslateX);
      setTranslateY(clampedTranslateY);
    },
    [isDragging, zoom],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Dragging event handlers for touchscreens
  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) return;
    setIsDragging(true);
    dragStartPoint.current = {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY,
    };
    translationStartPoint.current = { x: translateX, y: translateY };
  };

  const handleTouchMove = useCallback(
    (event: TouchEvent) => {
      if (!isDragging || !imageReference.current || event.touches.length !== 1)
        return;
      const deltaX = event.touches[0].clientX - dragStartPoint.current.x;
      const deltaY = event.touches[0].clientY - dragStartPoint.current.y;

      const imageElement = imageReference.current;
      const baseScale = Math.max(
        CROP_CONTAINER_SIZE / imageElement.naturalWidth,
        CROP_CONTAINER_SIZE / imageElement.naturalHeight,
      );
      const currentScale = baseScale * zoom;

      const displayedWidth = imageElement.naturalWidth * currentScale;
      const displayedHeight = imageElement.naturalHeight * currentScale;

      const defaultX = (CROP_CONTAINER_SIZE - displayedWidth) / 2;
      const defaultY = (CROP_CONTAINER_SIZE - displayedHeight) / 2;

      const minimumTranslateX = CROP_CONTAINER_SIZE - displayedWidth - defaultX;
      const maximumTranslateX = -defaultX;
      const clampedTranslateX = Math.max(
        minimumTranslateX,
        Math.min(maximumTranslateX, translationStartPoint.current.x + deltaX),
      );

      const minimumTranslateY = CROP_CONTAINER_SIZE - displayedHeight - defaultY;
      const maximumTranslateY = -defaultY;
      const clampedTranslateY = Math.max(
        minimumTranslateY,
        Math.min(maximumTranslateY, translationStartPoint.current.y + deltaY),
      );

      setTranslateX(clampedTranslateX);
      setTranslateY(clampedTranslateY);
    },
    [isDragging, zoom],
  );

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Register window event listeners for active dragging states
  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      window.addEventListener("touchmove", handleTouchMove, { passive: false });
      window.addEventListener("touchend", handleTouchEnd);
    } else {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

  const handleCrop = () => {
    const imageElement = imageReference.current;
    if (!imageElement) return;

    const canvasElement = document.createElement("canvas");
    const outputSize = 256;
    canvasElement.width = outputSize;
    canvasElement.height = outputSize;
    const canvasContext = canvasElement.getContext("2d");
    if (!canvasContext) return;

    const baseScale = Math.max(
      CROP_CONTAINER_SIZE / imageElement.naturalWidth,
      CROP_CONTAINER_SIZE / imageElement.naturalHeight,
    );
    const currentScale = baseScale * zoom;

    const displayedWidth = imageElement.naturalWidth * currentScale;
    const displayedHeight = imageElement.naturalHeight * currentScale;

    const defaultX = (CROP_CONTAINER_SIZE - displayedWidth) / 2;
    const defaultY = (CROP_CONTAINER_SIZE - displayedHeight) / 2;

    const x = defaultX + translateX;
    const y = defaultY + translateY;

    const sourceX = -x / currentScale;
    const sourceY = -y / currentScale;
    const sourceWidth = CROP_CONTAINER_SIZE / currentScale;
    const sourceHeight = CROP_CONTAINER_SIZE / currentScale;

    canvasContext.drawImage(
      imageElement,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      outputSize,
      outputSize,
    );

    const croppedDataUrl = canvasElement.toDataURL("image/png");
    onCrop(croppedDataUrl);
  };

  if (!imageSource) {
    return null;
  }

  return (
    <div className={`image-cropper-component ${styles["crop-modal-overlay"]}`}>
      <div className={styles["crop-modal-content"]}>
        <div className={styles["crop-modal-header"]}>
          <h3>Crop Icon Image</h3>
          <button className={styles["close-button"]} onClick={onCancel} type="button">
            <X size={16} />
          </button>
        </div>

        <div className={styles["crop-modal-body"]}>
          <div
            className={styles["crop-workspace"]}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            style={{
              width: CROP_CONTAINER_SIZE,
              height: CROP_CONTAINER_SIZE,
            }}
          >
            {/* The base image under the crop frame */}
            <img
              ref={imageReference}
              src={imageSource}
              alt="Source avatar upload"
              className={styles["crop-image"]}
              style={{
                transform: `translate(${translateX}px, ${translateY}px) scale(${zoom})`,
                transformOrigin: "center center",
              }}
              draggable={false}
            />

            {/* Transparent overlay with a clear 1:1 center cutout square */}
            <div className={styles["crop-mask-overlay"]} />
            <div className={styles["crop-boundary-border"]} />
          </div>

          <div className={styles["crop-controls"]}>
            <div className={styles["zoom-slider-container"]}>
              <ZoomOut size={14} className={styles["control-icon"]} />
              <input
                type="range"
                min="1"
                max="3"
                step="0.01"
                value={zoom}
                onChange={(event) => setZoom(parseFloat(event.target.value))}
                className={styles["zoom-slider-input"]}
              />
              <ZoomIn size={14} className={styles["control-icon"]} />
            </div>
            <span className={styles["crop-helper-text"]}>
              Drag to position, slide to zoom
            </span>
          </div>
        </div>

        <div className={styles["crop-modal-footer"]}>
          <ButtonComponent variant="disabled" onClick={onCancel}>
            Cancel
          </ButtonComponent>
          <ButtonComponent variant="primary" onClick={handleCrop}>
            Crop & Apply
          </ButtonComponent>
        </div>
      </div>
    </div>
  );
}
