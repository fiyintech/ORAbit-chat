"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Profile = {
  id: string;
  orabit_id: string;
};

type PersonalMessage = {
  id: string;
  sender_id: string;
  receiver_id: string;
  message: string;
  opened_at: string | null;
  expires_at: string | null;
  created_at: string;
};

function generateOrabitId() {
  const uuid = crypto.randomUUID();

  return (
    "ORA-" +
    uuid
      .replace(/-/g, "")
      .slice(0, 8)
      .toUpperCase()
  );
}

export default function PersonalMessages() {
  const [profile, setProfile] =
    useState<Profile | null>(null);

  const [messages, setMessages] =
    useState<PersonalMessage[]>([]);

  const [opening, setOpening] =
    useState<string | null>(null);

  const [openedMessage, setOpenedMessage] =
    useState<PersonalMessage | null>(null);

  const [timeLeft, setTimeLeft] =
    useState(0);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  /*
   * Load the anonymous profile
   * belonging to this browser.
   */
  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoading(true);
        setError("");

        let profileId =
          localStorage.getItem(
            "orabit-profile-id"
          );

        let currentProfile:
          | Profile
          | null = null;

        /*
         * First try the profile ID
         * already stored on this device.
         */
        if (profileId) {
          const {
            data,
            error: profileError,
          } = await supabase
            .from("profiles")
            .select(
              "id, orabit_id"
            )
            .eq(
              "id",
              profileId
            )
            .maybeSingle();

          if (profileError) {
            console.error(
              "Profile lookup error:",
              profileError
            );
          } else if (data) {
            currentProfile =
              data;
          }
        }

        /*
         * If this device has never
         * created a profile, create one.
         */
        if (!currentProfile) {
          const orabitId =
            generateOrabitId();

          const {
            data,
            error: createError,
          } = await supabase
            .from("profiles")
            .insert({
              orabit_id:
                orabitId,
            })
            .select(
              "id, orabit_id"
            )
            .single();

          if (
            createError ||
            !data
          ) {
            console.error(
              "Profile creation error:",
              createError
            );

            setError(
              "Could not create your ORAbit profile."
            );

            setLoading(false);
            return;
          }

          currentProfile =
            data;

          localStorage.setItem(
            "orabit-profile-id",
            data.id
          );
        }

        setProfile(
          currentProfile
        );

        /*
         * Load all unopened messages
         * waiting for this profile.
         */
        const {
          data: inbox,
          error: inboxError,
        } = await supabase
          .from(
            "personal_messages"
          )
          .select("*")
          .eq(
            "receiver_id",
            currentProfile.id
          )
          .is(
            "opened_at",
            null
          )
          .order(
            "created_at",
            {
              ascending: false,
            }
          );

        if (inboxError) {
          console.error(
            "Inbox error:",
            inboxError
          );

          setError(
            "Could not load your messages."
          );
        } else {
          setMessages(
            inbox || []
          );
        }

        setLoading(false);
      } catch (loadError) {
        console.error(
          loadError
        );

        setError(
          "Something went wrong."
        );

        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  /*
   * Open a message.
   *
   * The countdown starts ONLY
   * when the receiver opens it.
   */
  const openMessage = async (
    message: PersonalMessage
  ) => {
    if (
      opening !== null ||
      openedMessage !== null
    ) {
      return;
    }

    setOpening(
      message.id
    );

    setError("");

    /*
     * Calculate reading time
     * from message length.
     *
     * Minimum: 5 seconds
     * Maximum: 30 seconds
     */
    const seconds = Math.min(
      30,
      Math.max(
        5,
        Math.ceil(
          message.message.length /
            12
        )
      )
    );

    const now =
      new Date();

    const expires =
      new Date(
        now.getTime() +
          seconds * 1000
      );

    /*
     * Mark the message as opened.
     *
     * opened_at IS NULL makes sure
     * an unopened message can only
     * be started once.
     */
    const {
      error: openError,
    } = await supabase
      .from(
        "personal_messages"
      )
      .update({
        opened_at:
          now.toISOString(),
        expires_at:
          expires.toISOString(),
      })
      .eq(
        "id",
        message.id
      )
      .is(
        "opened_at",
        null
      );

    if (openError) {
      console.error(
        "Open message error:",
        openError
      );

      setError(
        "Could not open this message."
      );

      setOpening(null);
      return;
    }

    const updatedMessage:
      PersonalMessage = {
      ...message,
      opened_at:
        now.toISOString(),
      expires_at:
        expires.toISOString(),
    };

    /*
     * Remove it from the inbox
     * immediately after opening.
     */
    setMessages(
      (current) =>
        current.filter(
          (item) =>
            item.id !==
            message.id
        )
    );

    setOpenedMessage(
      updatedMessage
    );

    setTimeLeft(
      seconds
    );

    setOpening(null);
  };

  /*
   * Countdown while a message
   * is being displayed.
   */
  useEffect(() => {
    if (
      openedMessage === null ||
      openedMessage.expires_at ===
        null
    ) {
      return;
    }

    const interval =
      window.setInterval(
        () => {
          const expiresAt =
            new Date(
              openedMessage.expires_at as string
            ).getTime();

          const remaining =
            Math.max(
              0,
              Math.ceil(
                (expiresAt -
                  Date.now()) /
                  1000
              )
            );

          setTimeLeft(
            remaining
          );

          if (
            remaining <= 0
          ) {
            window.clearInterval(
              interval
            );

            setOpenedMessage(
              null
            );

            setTimeLeft(0);
          }
        },
        250
      );

    return () => {
      window.clearInterval(
        interval
      );
    };
  }, [openedMessage]);

  /*
   * Realtime listener.
   *
   * A new personal message
   * appears in the inbox without
   * requiring a page refresh.
   */
  useEffect(() => {
    if (!profile) {
      return;
    }

    const channel =
      supabase
        .channel(
          "personal-inbox-" +
            profile.id
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table:
              "personal_messages",
            filter:
              "receiver_id=eq." +
              profile.id,
          },
          (payload) => {
            const incoming =
              payload.new as PersonalMessage;

            /*
             * Ignore anything that
             * somehow already has an
             * opened timestamp.
             */
            if (
              incoming.opened_at !==
              null
            ) {
              return;
            }

            setMessages(
              (current) => {
                const exists =
                  current.some(
                    (item) =>
                      item.id ===
                      incoming.id
                  );

                if (exists) {
                  return current;
                }

                return [
                  incoming,
                  ...current,
                ];
              }
            );
          }
        )
        .subscribe();

    return () => {
      supabase.removeChannel(
        channel
      );
    };
  }, [profile]);

  if (loading) {
    return (
      <main className="personal-shell">
        <div className="scanlines" />

        <section className="personal-panel">
          <p className="eyebrow">
            ORABIT PERSONAL
            MESSAGES
          </p>

          <h1>
            LOADING...
          </h1>
        </section>
      </main>
    );
  }

  return (
    <main className="personal-shell">
      <div className="scanlines" />

      <section className="personal-panel">
        <p className="eyebrow">
          TEMPORARY PERSONAL
          COMMUNICATION
        </p>

        <h1>
          PERSONAL
          <br />
          MESSAGES
        </h1>

        {profile && (
          <div className="profile-id">
            <span>
              YOUR ORABIT ID
            </span>

            <strong>
              {profile.orabit_id}
            </strong>
          </div>
        )}

        {error && (
          <p className="error-message">
            {error}
          </p>
        )}

        {!openedMessage && (
          <div className="message-inbox">
            <div className="inbox-header">
              <span>
                INBOX
              </span>

              <span>
                {messages.length}{" "}
                WAITING
              </span>
            </div>

            {messages.length ===
            0 ? (
              <div className="empty-inbox">
                <p>
                  NO PERSONAL
                  MESSAGES
                </p>

                <span>
                  Messages sent to
                  your ORAbit ID
                  will appear here.
                </span>
              </div>
            ) : (
              <div className="message-list">
                {messages.map(
                  (message) => (
                    <button
                      key={
                        message.id
                      }
                      className="message-card"
                      onClick={() =>
                        openMessage(
                          message
                        )
                      }
                      disabled={
                        opening !==
                        null
                      }
                    >
                      <span>
                        INCOMING
                        PERSONAL
                        MESSAGE
                      </span>

                      <strong>
                        OPEN MESSAGE
                      </strong>

                      <small>
                        TIMER BEGINS
                        WHEN OPENED
                      </small>
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        )}

        {openedMessage && (
          <div className="open-message">
            <div className="message-timer">
              <span>
                MESSAGE
                DISAPPEARS IN
              </span>

              <strong>
                {timeLeft}s
              </strong>
            </div>

            <div className="message-content">
              {openedMessage.message}
            </div>

            <p className="message-warning">
              THIS MESSAGE WILL
              DISAPPEAR WHEN THE
              TIMER REACHES ZERO.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
