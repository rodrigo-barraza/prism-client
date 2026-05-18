"use client";

import { useState, useRef, useCallback } from "react";
import { Plus } from "lucide-react";
import {
  SelectComponent,
  TextAreaComponent,
  InputComponent,
  ModalComponent,
} from "@rodrigo-barraza/components-library";
import styles from "./SystemPromptModalComponent.module.css";
import { LS_SYSTEM_INSTRUCTIONS } from "../constants";

function loadInstructions() {
  try {
    const raw = localStorage.getItem(LS_SYSTEM_INSTRUCTIONS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveInstructions(list: any) {
  localStorage.setItem(LS_SYSTEM_INSTRUCTIONS, JSON.stringify(list));
}

export default function SystemPromptModal({
  activePrompt,
  onApply,
  onClose,
}: any) {
  const [instructions, setInstructions] = useState(() => loadInstructions());
  const [selectedId, setSelectedId] = useState(() => {
    const list = loadInstructions();
    const match = list.find((i: any) => i.body === activePrompt);
    return match ? match.id : null;
  });
  const [title, setTitle] = useState(() => {
    const list = loadInstructions();
    const match = list.find((i: any) => i.body === activePrompt);
    return match ? match.title : "";
  });
  const [body, setBody] = useState(activePrompt || "");
  const saveTimerRef = useRef<any>(null);

  // Debounced auto-save
  const persistInstruction = useCallback(
    (id: any, newTitle: any, newBody: any) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        setInstructions((prev: any) => {
          const updated = prev.map((i: any) =>
            i.id === id ? { ...i, title: newTitle, body: newBody } : i,
          );
          saveInstructions(updated);
          return updated;
        });
        onApply(newBody);
      }, 400);
    },
    [onApply],
  );

  const handleSelectInstruction = (value: any) => {
    if (value === "__new__") {
      // Create new
      const newId = Date.now().toString();
      const newInstruction = { id: newId, title: "", body: "" };
      setInstructions((prev: any) => {
        const updated = [...prev, newInstruction];
        saveInstructions(updated);
        return updated;
      });
      setSelectedId(newId);
      setTitle("");
      setBody("");
      onApply("");
      return;
    }
    const found = instructions.find((i: any) => i.id === value);
    if (found) {
      setSelectedId(found.id);
      setTitle(found.title);
      setBody(found.body);
      onApply(found.body);
    }
  };

  const handleTitleChange = (e: any) => {
    const value = e.target.value;
    setTitle(value);
    if (selectedId) {
      persistInstruction(selectedId, value, body);
    } else {
      // Auto-create instruction
      const newId = Date.now().toString();
      const newInstruction = { id: newId, title: value, body };
      setInstructions((prev: any) => {
        const updated = [...prev, newInstruction];
        saveInstructions(updated);
        return updated;
      });
      setSelectedId(newId);
    }
  };

  const handleBodyChange = (e: any) => {
    const value = e.target.value;
    setBody(value);
    if (selectedId) {
      persistInstruction(selectedId, title, value);
    } else {
      // Auto-create instruction
      const newId = Date.now().toString();
      const newInstruction = { id: newId, title, body: value };
      setInstructions((prev: any) => {
        const updated = [...prev, newInstruction];
        saveInstructions(updated);
        return updated;
      });
      setSelectedId(newId);
      onApply(value);
    }
  };

  const handleDelete = () => {
    if (!selectedId) return;
    setInstructions((prev: any) => {
      const updated = prev.filter((i: any) => i.id !== selectedId);
      saveInstructions(updated);
      return updated;
    });
    setSelectedId(null);
    setTitle("");
    setBody("");
    onApply("");
  };

  // Build dropdown options
  const dropdownOptions = [
    ...instructions.map((i: any) => ({
      value: i.id,
      label: i.title || "Untitled Instruction",
    })),
    {
      value: "__new__",
      label: "＋ Create new instruction",
      icon: <Plus size={14} />,
    },
  ];

  return (
    <ModalComponent
      title="System Instructions"
      onClose={onClose}
      size="md"
      className={styles.modal}
    >
      <div className={styles.body}>
        <div className={styles.field}>
          <label>Saved Instructions</label>
          <SelectComponent
            value={selectedId || ""}
            options={dropdownOptions}
            onChange={handleSelectInstruction}
            placeholder="Select or create an instruction..."
          />
        </div>

        <div className={styles.field}>
          <label>Title</label>
          <InputComponent
            placeholder="e.g. Code Review Assistant"
            value={title}
            onChange={handleTitleChange}
          />
        </div>

        <div className={styles.field}>
          <label>System Prompt</label>
          <TextAreaComponent
            className={styles.textarea}
            minRows={10}
            maxRows={20}
            placeholder="You are a helpful AI assistant..."
            value={body}
            onChange={handleBodyChange}
          />
        </div>

        {selectedId && (
          <button className={styles.deleteBtn} onClick={handleDelete}>
            Delete this instruction
          </button>
        )}
      </div>
    </ModalComponent>
  );
}
