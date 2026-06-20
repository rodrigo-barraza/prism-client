"use client";

import ChatConversationComponent from "../../components/ChatConversationComponent";
import styles from "./page.module.css";

export default function CodingAgentPage() {
  return (
    <main className={styles['container']}>
      <ChatConversationComponent />
    </main>
  );
}
