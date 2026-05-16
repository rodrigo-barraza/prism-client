"use client";

import { useState, useRef, useCallback } from "react";
import { Plus } from "lucide-react";
import { SelectComponent, TextAreaComponent, InputComponent, ModalComponent } from "@rodrigo-barraza/components-library";
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

// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
// @ts-ignore
export default function SystemPromptModal({ activePrompt: any, onApply: any, onClose: any }) {
  const [instructions, setInstructions] = useState<any>(() => loadInstructions());
  const [selectedId, setSelectedId] = useState<any>(() => {
    const list = loadInstructions();
    // @ts-ignore
    const match = list.find((i: any) => i.body === activePrompt);
    return match ? match.id : null;
  });
  const [title, setTitle] = useState<any>(() => {
    const list = loadInstructions();
    // @ts-ignore
    const match = list.find((i: any) => i.body === activePrompt);
    return match ? match.title : "";
  });
  // @ts-ignore
  const [body, setBody] = useState<any>(activePrompt || "");
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
        // @ts-ignore
        onApply(newBody);
      }, 400);
    },
    // @ts-ignore
    [onApply],
  );

  const handleSelectInstruction = (val: any) => {
    if (val === "__new__") {
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
      // @ts-ignore
      onApply("");
      return;
    }
    const found = instructions.find((i: any) => i.id === val);
    if (found) {
      setSelectedId(found.id);
      setTitle(found.title);
      setBody(found.body);
      // @ts-ignore
      onApply(found.body);
    }
  };

  const handleTitleChange = (e: any) => {
    const val = e.target.value;
    setTitle(val);
    if (selectedId) {
      persistInstruction(selectedId, val, body);
    } else {
      // Auto-create instruction
      const newId = Date.now().toString();
      const newInstruction = { id: newId, title: val, body };
      setInstructions((prev: any) => {
        const updated = [...prev, newInstruction];
        saveInstructions(updated);
        return updated;
      });
      setSelectedId(newId);
    }
  };

  const handleBodyChange = (e: any) => {
    const val = e.target.value;
    setBody(val);
    if (selectedId) {
      persistInstruction(selectedId, title, val);
    } else {
      // Auto-create instruction
      const newId = Date.now().toString();
      const newInstruction = { id: newId, title, body: val };
      setInstructions((prev: any) => {
        const updated = [...prev, newInstruction];
        saveInstructions(updated);
        return updated;
      });
      setSelectedId(newId);
      // @ts-ignore
      onApply(val);
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
    // @ts-ignore
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
    // @ts-ignore
    <ModalComponent title="System Instructions" onClose={onClose} size="md" className={styles.modal}>
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
