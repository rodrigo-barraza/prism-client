"use client";

import AgentChatComponent from "../../components/AgentChatComponent";
import styles from "./page.module.css";

export default function CodingAgentPage() {
  return (
    <main className={styles['container']}>
      <AgentChatComponent />
    </main>
  );
}
