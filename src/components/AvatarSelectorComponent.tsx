"use client";

import { useLocalStorage } from "@rodrigo-barraza/components-library";
import { Check } from "lucide-react";
import styles from "./AvatarSelectorComponent.module.css";

interface AvatarOption {
  id: string;
  name: string;
  path: string;
}

const AVATAR_OPTIONS: AvatarOption[] = [
  { id: "cat", name: "Cat (Default)", path: "/cat.gif" },
  { id: "rocky", name: "Peon", path: "/avatars/rocky.png" },
  { id: "taz", name: "Rocky", path: "/avatars/taz.jpg" },
  { id: "peon", name: "Taz", path: "/avatars/peon.png" },
  { id: "blademaster-classic", name: "Blademaster (Classic)", path: "/avatars/blademaster-classic.png" },
  { id: "blademaster-hidef", name: "Blademaster (Hi-Def)", path: "/avatars/blademaster-hidef.png" },
];

export default function AvatarSelectorComponent() {
  const [activeAvatar, setActiveAvatar] = useLocalStorage<string>("prism:avatar", "cat");

  const handleSelect = (avatarId: string) => {
    setActiveAvatar(avatarId);
    window.dispatchEvent(
      new CustomEvent("prism-avatar-changed", { detail: avatarId })
    );
  };

  return (
    <div className={styles["avatar-selector-grid"]}>
      {AVATAR_OPTIONS.map((option) => {
        const isSelected = activeAvatar === option.id;
        return (
          <button
            key={option.id}
            type="button"
            className={`${styles["avatar-option-card"]} ${
              isSelected ? styles["is-selected-state"] : ""
            }`}
            onClick={() => handleSelect(option.id)}
            aria-label={`Select avatar ${option.name}`}
          >
            <div className={styles["avatar-image-container"]}>
              <img
                src={option.path}
                alt={option.name}
                className={styles["avatar-image"]}
                style={option.id === "cat" ? { imageRendering: "pixelated" } : undefined}
              />
              {isSelected && (
                <div className={styles["selected-badge"]}>
                  <Check size={12} className={styles["check-icon"]} />
                </div>
              )}
            </div>
            <span className={styles["avatar-name"]}>{option.name}</span>
          </button>
        );
      })}
    </div>
  );
}
