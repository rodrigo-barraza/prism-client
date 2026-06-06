"use client";

import ChatSessionComponent from "../../components/ChatSessionComponent";
import styles from "./page.module.css";

export default function CodingAgentPage() {
  return (
    <main className={styles['container']}>
      <ChatSessionComponent />
    </main>
  );
}
