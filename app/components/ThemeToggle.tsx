"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

const STORAGE_KEY =
  "orabit-theme";

export default function ThemeToggle() {
  const [theme, setTheme] =
    useState<Theme>("dark");

  const [ready, setReady] =
    useState(false);

  useEffect(() => {
    const saved =
      localStorage.getItem(
        STORAGE_KEY
      );

    const initialTheme =
      saved === "light"
        ? "light"
        : "dark";

    setTheme(
      initialTheme
    );

    document.documentElement.dataset.theme =
      initialTheme;

    setReady(true);
  }, []);

  const toggleTheme =
    () => {
      const nextTheme =
        theme === "dark"
          ? "light"
          : "dark";

      setTheme(
        nextTheme
      );

      localStorage.setItem(
        STORAGE_KEY,
        nextTheme
      );

      document.documentElement.dataset.theme =
        nextTheme;
    };

  if (!ready) {
    return null;
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={
        toggleTheme
      }
      aria-label={`Switch to ${
        theme === "dark"
          ? "light"
          : "dark"
      } theme`}
    >
      <span className="theme-toggle-icon">
        {theme === "dark"
          ? "☀"
          : "◐"}
      </span>

      <span>
        {theme === "dark"
          ? "LIGHT"
          : "DARK"}
      </span>
    </button>
  );
}

