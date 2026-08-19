"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

function generateRoomCode() {
  const characters =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let code = "";

  for (let i = 0; i < 6; i++) {
    code += characters.charAt(
      Math.floor(
        Math.random() *
          characters.length
      )
    );
  }

  return code;
}

function generateAdminKey() {
  return `admin_${crypto.randomUUID()}_${crypto.randomUUID()}`;
}

const durationOptions = [
  {
    value: 1,
    label: "1 MIN",
  },
  {
    value: 5,
    label: "5 MIN",
  },
  {
    value: 15,
    label: "15 MIN",
  },
  {
    value: 30,
    label: "30 MIN",
  },
  {
    value: 50,
    label: "50 MIN",
  },
  {
    value: 60,
    label: "1 HR",
  },
  {
    value: 120,
    label: "2 HR",
  },
];

export default function Home() {
  const router = useRouter();

  const [minutes, setMinutes] =
    useState(5);

  const [creating, setCreating] =
    useState(false);

  const [error, setError] =
    useState("");

  const createRoom = async () => {
    if (creating) {
      return;
    }

    setCreating(true);
    setError("");

    try {
      const code =
        generateRoomCode();

      const adminKey =
        generateAdminKey();

      const expiresAt =
        new Date(
          Date.now() +
            minutes *
              60 *
              1000
        ).toISOString();

      const { error } =
        await supabase
          .from("rooms")
          .insert({
            code,
            expires_at:
              expiresAt,
            creator_id:
              adminKey,
            password_enabled:
              false,
          });

      if (error) {
        console.error(error);

        setError(
          "Could not create ORAbit channel."
        );

        setCreating(false);
        return;
      }

      localStorage.setItem(
        `orabit-admin-${code}`,
        adminKey
      );

      localStorage.setItem(
        `orabit-creator-${code}`,
        adminKey
      );

      router.push(
        `/room/${code}`
      );
    } catch (error) {
      console.error(error);

      setError(
        "Something went wrong while creating the room."
      );

      setCreating(false);
    }
  };

  return (
    <main className="home-shell">
      <div className="scanlines" />

      <section className="hero">
        <p className="eyebrow">
          TEMPORARY COMMUNICATION
          SYSTEM
        </p>

        <h1>ORAbit</h1>

        <p className="tagline">
          Say what you want.
          <br />
          Leave no trace.
        </p>

        <div className="create-panel">
          <label>
            CHANNEL LIFETIME
          </label>

          <div className="duration-options">
            {durationOptions.map(
              (option) => (
                <button
                  key={option.value}
                  type="button"
                  className={
                    minutes ===
                    option.value
                      ? "selected"
                      : ""
                  }
                  onClick={() =>
                    setMinutes(
                      option.value
                    )
                  }
                >
                  {option.label}
                </button>
              )
            )}
          </div>

          <button
            className="create-button"
            onClick={
              createRoom
            }
            disabled={creating}
          >
            {creating
              ? "INITIALIZING..."
              : "INITIALIZE ORABIT CHANNEL"}
          </button>

          {error && (
            <p className="error-message">
              {error}
            </p>
          )}
        </div>

        <button
          className="personal-messages-button"
          onClick={() =>
            router.push("/personal")
          }
        >
          PERSONAL MESSAGES →
        </button>

        <div className="system-warning">
          <span>●</span>
          ALL CHANNELS ARE
          TEMPORARY
        </div>
      </section>
    </main>
  );
}

