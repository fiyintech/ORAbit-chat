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

function generateOrabitId(): string {
  const uuid = crypto.randomUUID();

  return (
    "ORA-" +
    uuid.replace(/-/g, "").slice(0, 8).toUpperCase()
  );
}

export default function PersonalMessages() {
  const [profile, setProfile] = useState<Profile | null>(null);

  const [messages, setMessages] = useState<PersonalMessage[]>([]);

  const [opening, setOpening] = useState<string | null>(null);

  const [openedMessage, setOpenedMessage] =
    useState<PersonalMessage | null>(null);

  const [timeLeft, setTimeLeft] = useState(0);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [recipientId, setRecipientId] = useState("");

  const [recipient, setRecipient] = useState<Profile | null>(null);

  const [searching, setSearching] = useState(false);

  const [searchMessage, setSearchMessage] = useState("");

  const [messageText, setMessageText] = useState("");

  const [sending, setSending] = useState(false);

  const [sendSuccess, setSendSuccess] = useState("");

  /*
   * Load this browser's permanent
   * anonymous ORAbit profile.
   */
  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoading(true);
        setError("");

        let profileId = localStorage.getItem(
          "orabit-profile-id"
        );

        let currentProfile: Profile | null = null;

        /*
         * If this browser already has
         * an ORAbit profile, load it.
         */
        if (profileId) {
          const { data, error: profileError } =
            await supabase
              .from("profiles")
              .select("id, orabit_id")
              .eq("id", profileId)
              .maybeSingle();

          if (profileError) {
            console.error(
              "Profile lookup error:",
              profileError
            );
          } else if (data) {
            currentProfile = data;
          }
        }

        /*
         * Create a permanent profile
         * only if this browser does
         * not already have one.
         */
        if (!currentProfile) {
          const orabitId = generateOrabitId();

          const { data, error: createError } =
            await supabase
              .from("profiles")
              .insert({
                orabit_id: orabitId,
              })
              .select("id, orabit_id")
              .single();

          if (createError || !data) {
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

          currentProfile = data;

          localStorage.setItem(
            "orabit-profile-id",
            data.id
          );
        }

        setProfile(currentProfile);

        /*
         * Load unopened messages.
         */
        const {
          data: inbox,
          error: inboxError,
        } = await supabase
          .from("personal_messages")
          .select("*")
          .eq(
            "receiver_id",
            currentProfile.id
          )
          .is("opened_at", null)
          .order("created_at", {
            ascending: false,
          });

        if (inboxError) {
          console.error(
            "Inbox error:",
            inboxError
          );

          setError(
            "Could not load your messages."
          );
        } else {
          setMessages(inbox || []);
        }

        setLoading(false);
      } catch (loadError) {
        console.error(loadError);

        setError(
          "Something went wrong."
        );

        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  /*
   * Search for another user
   * using their public ORAbit ID.
   */
  const searchRecipient = async () => {
    const normalizedId =
      recipientId
        .trim()
        .toUpperCase();

    setRecipient(null);
    setSearchMessage("");
    setSendSuccess("");

    if (!normalizedId) {
      setSearchMessage(
        "ENTER AN ORABIT ID."
      );
      return;
    }

    if (!/^ORA-[A-Z0-9]{8}$/.test(normalizedId)) {
      setSearchMessage(
        "INVALID ORABIT ID FORMAT."
      );
      return;
    }

    if (
      profile &&
      normalizedId ===
        profile.orabit_id.toUpperCase()
    ) {
      setSearchMessage(
        "YOU CANNOT MESSAGE YOURSELF."
      );
      return;
    }

    setSearching(true);

    try {
      const { data, error: searchError } =
        await supabase
          .from("profiles")
          .select("id, orabit_id")
          .eq(
            "orabit_id",
            normalizedId
          )
          .maybeSingle();

      if (searchError) {
        console.error(
          "Recipient search error:",
          searchError
        );

        setSearchMessage(
          "COULD NOT SEARCH FOR THIS ID."
        );

        return;
      }

      if (!data) {
        setSearchMessage(
          "NO ORABIT USER FOUND WITH THAT ID."
        );

        return;
      }

      setRecipient(data);
    } catch (searchError) {
      console.error(searchError);

      setSearchMessage(
        "SOMETHING WENT WRONG."
      );
    } finally {
      setSearching(false);
    }
  };

  /*
   * Send a temporary personal message.
   *
   * IMPORTANT:
   * The message does NOT receive
   * an expiry time here.
   *
   * Its timer begins only when
   * the receiver opens it.
   */
  const sendMessage = async () => {
    if (!profile || !recipient) {
      return;
    }

    const trimmedMessage =
      messageText.trim();

    if (!trimmedMessage) {
      setSearchMessage(
        "WRITE A MESSAGE FIRST."
      );
      return;
    }

    if (trimmedMessage.length > 1000) {
      setSearchMessage(
        "MESSAGE IS TOO LONG. MAXIMUM 1000 CHARACTERS."
      );
      return;
    }

    setSending(true);
    setSearchMessage("");
    setSendSuccess("");

    try {
      const { error: sendError } =
        await supabase
          .from("personal_messages")
          .insert({
            sender_id:
              profile.id,
            receiver_id:
              recipient.id,
            message:
              trimmedMessage,
            opened_at: null,
            expires_at: null,
          });

      if (sendError) {
        console.error(
          "Send message error:",
          sendError
        );

        setSearchMessage(
          "COULD NOT SEND MESSAGE."
        );

        return;
      }

      setMessageText("");

      setSendSuccess(
        "MESSAGE SENT. IT WILL DISAPPEAR AFTER THE RECIPIENT OPENS IT."
      );
    } catch (sendError) {
      console.error(sendError);

      setSearchMessage(
        "SOMETHING WENT WRONG WHILE SENDING."
      );
    } finally {
      setSending(false);
    }
  };

  /*
   * Open a received message.
   *
   * The countdown starts HERE.
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

    setOpening(message.id);
    setError("");

    /*
     * Reading time is based on
     * message length.
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

    const now = new Date();

    const expires = new Date(
      now.getTime() +
        seconds * 1000
    );

    /*
     * Set opened_at and expires_at
     * only when the receiver opens
     * the message.
     */
    const { error: openError } =
      await supabase
        .from("personal_messages")
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

    const updatedMessage: PersonalMessage =
      {
        ...message,
        opened_at:
          now.toISOString(),
        expires_at:
          expires.toISOString(),
      };

    /*
     * Remove it from the inbox
     * as soon as it is opened.
     */
    setMessages((current) =>
      current.filter(
        (item) =>
          item.id !==
          message.id
      )
    );

    setOpenedMessage(
      updatedMessage
    );

    setTimeLeft(seconds);

    setOpening(null);
  };

  /*
   * Countdown for opened message.
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
      window.setInterval(() => {
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
      }, 250);

    return () => {
      window.clearInterval(
        interval
      );
    };
  }, [openedMessage]);

  /*
   * Real-time inbox.
   *
   * A newly sent message appears
   * automatically without refresh.
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
          <>
            <div className="personal-send-panel">
              <div className="inbox-header">
                <span>
                  SEND PERSONAL
                  MESSAGE
                </span>

                <span>
                  ANONYMOUS
                </span>
              </div>

              <label
                htmlFor="recipient-id"
              >
                RECIPIENT ORABIT ID
              </label>

              <div className="recipient-search">
                <input
                  id="recipient-id"
                  type="text"
                  value={
                    recipientId
                  }
                  onChange={(event) => {
                    setRecipientId(
                      event.target.value.toUpperCase()
                    );

                    setRecipient(
                      null
                    );

                    setSearchMessage(
                      ""
                    );

                    setSendSuccess(
                      ""
                    );
                  }}
                  onKeyDown={(
                    event
                  ) => {
                    if (
                      event.key ===
                      "Enter"
                    ) {
                      searchRecipient();
                    }
                  }}
                  placeholder="ORA-XXXXXXXX"
                  maxLength={12}
                  autoComplete="off"
                  spellCheck={false}
                />

                <button
                  type="button"
                  onClick={
                    searchRecipient
                  }
                  disabled={
                    searching
                  }
                >
                  {searching
                    ? "SEARCHING..."
                    : "SEARCH"}
                </button>
              </div>

              {recipient && (
                <div className="recipient-found">
                  <span>
                    RECIPIENT FOUND
                  </span>

                  <strong>
                    {recipient.orabit_id}
                  </strong>
                </div>
              )}

              {searchMessage && (
                <p className="error-message">
                  {searchMessage}
                </p>
              )}

              {recipient && (
                <div className="send-message-form">
                  <label
                    htmlFor="personal-message"
                  >
                    YOUR MESSAGE
                  </label>

                  <textarea
                    id="personal-message"
                    value={
                      messageText
                    }
                    onChange={(
                      event
                    ) =>
                      setMessageText(
                        event.target.value
                      )
                    }
                    placeholder="WRITE A TEMPORARY MESSAGE..."
                    maxLength={1000}
                    rows={6}
                  />

                  <div className="message-compose-footer">
                    <small>
                      {messageText.length}
                      /1000
                    </small>

                    <button
                      type="button"
                      className="send-personal-button"
                      onClick={
                        sendMessage
                      }
                      disabled={
                        sending ||
                        !messageText.trim()
                      }
                    >
                      {sending
                        ? "SENDING..."
                        : "SEND MESSAGE →"}
                    </button>
                  </div>
                </div>
              )}

              {sendSuccess && (
                <p className="success-message">
                  {sendSuccess}
                </p>
              )}
            </div>

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
                    Messages sent
                    to your
                    ORAbit ID will
                    appear here.
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
          </>
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
              {
                openedMessage.message
              }
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
