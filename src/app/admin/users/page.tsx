"use client";

import { useState, useEffect } from "react";
import IrisService from "../../../services/IrisService";
import UsersTableComponent from "../../../components/UsersTableComponent";
import {
  LoadingMessage,
  ErrorMessage,
} from "../../../components/StateMessageComponent";
import { useAdminHeader } from "../../../components/AdminHeaderContextComponent";
import { getErrorMessage } from "../../../utils/errorMessage";
import type { IrisUserStat } from "../../../types/types";
import styles from "./page.module.css";

export default function AdminUsersPage() {
  const { setTitleBadge } = useAdminHeader();
  const [users, setUsers] = useState<IrisUserStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setUsers([]);

    async function loadUsers() {
      try {
        const userStats = await IrisService.getUserStats();
        setUsers(userStats || []);
      } catch (fetchError: unknown) {
        setError(getErrorMessage(fetchError));
      } finally {
        setLoading(false);
      }
    }

    loadUsers();
  }, []);

  useEffect(() => {
    if (!loading) {
      setTitleBadge(users.length);
    }
  }, [setTitleBadge, users.length, loading]);

  useEffect(() => {
    return () => {
      setTitleBadge(null);
    };
  }, [setTitleBadge]);

  return (
    <div className={styles.page}>
      {loading && <LoadingMessage message="Loading user data..." />}
      <ErrorMessage message={error} />
      {!loading && (
        <UsersTableComponent
          users={users}
          emptyText="No users found"
        />
      )}
    </div>
  );
}
