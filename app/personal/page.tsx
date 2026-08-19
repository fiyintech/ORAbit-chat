"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Profile = {
  id: string;
  orabit_id: string;
  user_id?: string | null;
  created_at?: string;
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
  const id = crypto
    .randomUUID()
    .replace(/-/g, "")
    .slice(0, 8)
    .toUpperCase();

  return "ORA-" + id;
}

function getStoredProfileId() {
  if (typeof window === "undefined") {
    return null;
  }

  return localStorage.getItem(
    "orabit-profile-id"
  );
}

async function loadInbox(
  receiverId: string
): Promise<{
  messages: PersonalMessage[];
  error: string | null;
}> {
  try {
    const {
      data,
      error,
    } = await supabase
      .from("personal_messages")
      .select(
        "id, sender_id, receiver_id, message, opened_at, expires_at, created_at"
      )
      .eq(
        "receiver_id",
        receiverId
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

    if (error) {
      console.error(
        "Inbox error:",
        error
      );

      return {
        messages: [],
        error:
          error.message ||
          "Could not load your inbox.",
      };
    }

    return {
      messages:
        (data || []) as PersonalMessage[],
      error: null,
    };
  } catch (error) {
    console.error(
      "Inbox exception:",
      error
    );

    return {
      messages: [],
      error:
        "Something went wrong while loading your inbox.",
    };
  }
}

export default function PersonalMessages() {
  const [profile, setProfile] =
    useState<Profile | null>(null);

  const [messages, setMessages] =
    useState<PersonalMessage[]>(
      []
    );

  const [searchId, setSearchId] =
    useState("");

  const [recipient, setRecipient] =
    useState<Profile | null>(null);

  const [messageText, setMessageText] =
    useState("");

  const [searching, setSearching] =
    useState(false);

  const [sending, setSending] =
    useState(false);

  const [opening, setOpening] =
    useState<string | null>(null);

  const [openedMessage, setOpenedMessage] =
    useState<PersonalMessage | null>(
      null
    );

  const [timeLeft, setTimeLeft] =
    useState(0);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  /*
   * =========================================================
   * LOAD OR CREATE PROFILE
   * =========================================================
   */

  useEffect(() => {
    let cancelled = false;

    const initializeProfile =
      async () => {
        try {
          setLoading(true);
          setError("");

          let profileId =
            getStoredProfileId();

          if (profileId) {
            const {
              data,
              error:
                profileError,
            } = await supabase
              .from("profiles")
              .select(
                "id, orabit_id, user_id, created_at"
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
            }

            if (data) {
              if (!cancelled) {
                setProfile(data);
              }

              const result =
                await loadInbox(
                  data.id
                );

              if (!cancelled) {
                setMessages(
                  result.messages
                );

                if (
                  result.error
                ) {
                  setError(
                    result.error
                  );
                }

                setLoading(false);
              }

              return;
            }

            localStorage.removeItem(
              "orabit-profile-id"
            );

            profileId = null;
          }

          if (!profileId) {
            const orabitId =
              generateOrabitId();

            const {
              data,
              error:
                createError,
            } = await supabase
              .from("profiles")
              .insert({
                orabit_id:
                  orabitId,
              })
              .select(
                "id, orabit_id, user_id, created_at"
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

              if (!cancelled) {
                setError(
                  createError?.message ||
                    "Could not create your ORAbit profile."
                );

                setLoading(false);
              }

              return;
            }

            localStorage.setItem(
              "orabit-profile-id",
              data.id
            );

            if (!cancelled) {
              setProfile(data);
              setMessages([]);
              setLoading(false);
            }
          }
        } catch (error) {
          console.error(
            "Profile initialization error:",
            error
          );

          if (!cancelled) {
            setError(
              "Something went wrong while loading your ORAbit profile."
            );

            setLoading(false);
          }
        }
      };

    initializeProfile();

    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * =========================================================
   * REALTIME INBOX
   * =========================================================
   */

  useEffect(() => {
    if (!profile) {
      return;
    }

    const refreshInitialInbox =
      async () => {
        const result =
          await loadInbox(
            profile.id
          );

        setMessages(
          result.messages
        );

        if (result.error) {
          setError(
            result.error
          );
        }
      };

    refreshInitialInbox();

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
              incoming.opened_at
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

                if (
                  exists
                ) {
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

  /*
   * =========================================================
   * SEARCH USER
   * =========================================================
   */

  const searchUser =
    async () => {
      if (
        searching ||
        !profile
      ) {
        return;
      }

      const cleanId =
        searchId
          .trim()
          .toUpperCase();

      setError("");
      setSuccess("");
      setRecipient(null);

      if (!cleanId) {
        setError(
          "ENTER AN ORABIT ID."
        );
        return;
      }

      if (
        !cleanId.startsWith(
          "ORA-"
        )
      ) {
        setError(
          "ORABIT IDS BEGIN WITH ORA-."
        );
        return;
      }

      if (
        cleanId ===
        profile.orabit_id
      ) {
        setError(
          "YOU CANNOT MESSAGE YOURSELF."
        );
        return;
      }

      setSearching(true);

      try {
        const {
          data,
          error:
            searchError,
        } = await supabase
          .from("profiles")
          .select(
            "id, orabit_id, user_id, created_at"
          )
          .eq(
            "orabit_id",
            cleanId
          )
          .maybeSingle();

        if (
          searchError
        ) {
          console.error(
            "Search error:",
            searchError
          );

          setError(
            searchError.message ||
              "COULD NOT SEARCH FOR THAT ORABIT ID."
          );

          return;
        }

        if (!data) {
          setError(
            "NO ORABIT USER WAS FOUND WITH THAT ID."
          );

          return;
        }

        setRecipient(data);
      } catch (error) {
        console.error(
          "Search exception:",
          error
        );

        setError(
          "SOMETHING WENT WRONG WHILE SEARCHING."
        );
      } finally {
        setSearching(false);
      }
    };

  /*
   * =========================================================
   * SEND MESSAGE
   * =========================================================
   */

  const sendMessage =
    async () => {
      if (
        sending ||
        !profile ||
        !recipient
      ) {
        return;
      }

      const cleanMessage =
        messageText.trim();

      if (!cleanMessage) {
        setError(
          "WRITE A MESSAGE FIRST."
        );
        return;
      }

      if (
        cleanMessage.length >
        1000
      ) {
        setError(
          "MESSAGES CAN CONTAIN UP TO 1000 CHARACTERS."
        );
        return;
      }

      if (
        recipient.id ===
        profile.id
      ) {
        setError(
          "YOU CANNOT MESSAGE YOURSELF."
        );
        return;
      }

      setSending(true);
      setError("");
      setSuccess("");

      try {
        const {
          data,
          error:
            rpcError,
        } = await supabase.rpc(
          "send_personal_message",
          {
            p_sender_id:
              profile.id,
            p_receiver_id:
              recipient.id,
            p_message:
              cleanMessage,
          }
        );

        if (
          rpcError
        ) {
          console.error(
            "Send message RPC error:",
            rpcError
          );

          setError(
            rpcError.message ||
              "COULD NOT SEND THE PERSONAL MESSAGE."
          );

          return;
        }

        if (!data) {
          setError(
            "THE MESSAGE COULD NOT BE CONFIRMED."
          );

          return;
        }

        setMessageText("");

        setSuccess(
          "MESSAGE SENT TO " +
            recipient.orabit_id
        );
      } catch (error) {
        console.error(
          "Send message exception:",
          error
        );

        setError(
          "SOMETHING WENT WRONG WHILE SENDING."
        );
      } finally {
        setSending(false);
      }
    };

  /*
   * =========================================================
   * REFRESH INBOX
   * =========================================================
   */

  const refreshInbox =
    async () => {
      if (
        !profile ||
        refreshing
      ) {
        return;
      }

      setRefreshing(true);
      setError("");

      const result =
        await loadInbox(
          profile.id
        );

      setMessages(
        result.messages
      );

      if (result.error) {
        setError(
          result.error
        );
      }

      setRefreshing(false);
    };

  /*
   * =========================================================
   * OPEN MESSAGE
   * =========================================================
   *
   * The timer starts only now.
   */

  const openMessage =
    async (
      message: PersonalMessage
    ) => {
      if (
        opening ||
        openedMessage ||
        !profile
      ) {
        return;
      }

      setOpening(
        message.id
      );

      setError("");
      setSuccess("");

      const seconds =
        Math.min(
          30,
          Math.max(
            5,
            Math.ceil(
              message.message
                .length /
                12
            )
          )
        );

      const now =
        new Date();

      const expires =
        new Date(
          now.getTime() +
            seconds *
              1000
        );

      try {
        const {
          data:
            updatedRows,
          error:
            openError,
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
          .eq(
            "receiver_id",
            profile.id
          )
          .is(
            "opened_at",
            null
          )
          .select("*");

        if (
          openError
        ) {
          console.error(
            "Open message error:",
            openError
          );

          setError(
            openError.message ||
              "COULD NOT OPEN THIS MESSAGE."
          );

          return;
        }

        if (
          !updatedRows ||
          updatedRows.length ===
            0
        ) {
          setError(
            "THIS MESSAGE HAS ALREADY BEEN OPENED OR IS NO LONGER AVAILABLE."
          );

          setMessages(
            (current) =>
              current.filter(
                (item) =>
                  item.id !==
                  message.id
              )
          );

          return;
        }

        const updatedMessage =
          updatedRows[0] as PersonalMessage;

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
      } catch (error) {
        console.error(
          "Open message exception:",
          error
        );

        setError(
          "SOMETHING WENT WRONG WHILE OPENING THE MESSAGE."
        );
      } finally {
        setOpening(null);
      }
    };

  /*
   * =========================================================
   * COUNTDOWN + DATABASE CLEANUP
   * =========================================================
   */

  useEffect(() => {
    if (
      !openedMessage ||
      !openedMessage.expires_at
    ) {
      return;
    }

    const interval =
      window.setInterval(
        async () => {
          const remaining =
            Math.max(
              0,
              Math.ceil(
                (
                  new Date(
                    openedMessage.expires_at!
                  ).getTime() -
                  Date.now()
                ) /
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

            const expiredId =
              openedMessage.id;

            /*
             * Remove it immediately
             * from the screen.
             */
            setOpenedMessage(
              null
            );

            setTimeLeft(0);

            /*
             * Ask Supabase to delete
             * expired personal messages.
             *
             * This uses the cleanup function
             * created in Supabase.
             */
            const {
              error:
                cleanupError,
            } = await supabase.rpc(
              "delete_expired_personal_messages"
            );

            if (cleanupError) {
              console.error(
                "Expired-message cleanup error:",
                cleanupError
              );
            }

            /*
             * Make sure this particular
             * expired message is no longer
             * visible in the local inbox.
             */
            setMessages(
              (current) =>
                current.filter(
                  (item) =>
                    item.id !==
                    expiredId
                )
            );

            /*
             * Reload waiting messages in case
             * another message arrived while
             * this one was open.
             */
            if (profile) {
              const result =
                await loadInbox(
                  profile.id
                );

              setMessages(
                result.messages
              );
            }
          }
        },
        250
      );

    return () => {
      window.clearInterval(
        interval
      );
    };
  }, [
    openedMessage,
    profile,
  ]);

  /*
   * =========================================================
   * LOADING SCREEN
   * =========================================================
   */

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

  /*
   * =========================================================
   * PAGE
   * =========================================================
   */

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

        {success && (
          <p className="success-message">
            {success}
          </p>
        )}

        {!openedMessage && (
          <>
            <div className="personal-send-panel">

              <div className="send-header">
                <span>
                  SEND PERSONAL
                  MESSAGE
                </span>

                <span>
                  FIND USER →
                </span>
              </div>

              <div className="search-row">

                <input
                  type="text"
                  value={searchId}
                  onChange={(
                    event
                  ) => {
                    setSearchId(
                      event.target
                        .value
                        .toUpperCase()
                    );

                    setRecipient(
                      null
                    );

                    setError("");
                    setSuccess("");
                  }}
                  onKeyDown={(
                    event
                  ) => {
                    if (
                      event.key ===
                      "Enter"
                    ) {
                      searchUser();
                    }
                  }}
                  placeholder="ENTER ORA-XXXXXXXX"
                  maxLength={12}
                  autoComplete="off"
                  spellCheck={false}
                />

                <button
                  type="button"
                  onClick={
                    searchUser
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
                <div className="recipient-panel">

                  <div className="recipient-info">
                    <span>
                      RECIPIENT
                    </span>

                    <strong>
                      {
                        recipient.orabit_id
                      }
                    </strong>
                  </div>

                  <textarea
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
                    placeholder="WRITE YOUR TEMPORARY MESSAGE..."
                    maxLength={1000}
                    rows={6}
                  />

                  <div className="message-compose-footer">

                    <span>
                      {
                        messageText.length
                      }
                      /1000
                    </span>

                    <button
                      type="button"
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

            </div>

            <div className="message-inbox">

              <div className="inbox-header">

                <span>
                  INBOX
                </span>

                <div
                  style={{
                    display:
                      "flex",
                    alignItems:
                      "center",
                    gap: "12px",
                  }}
                >

                  <span>
                    {
                      messages.length
                    }{" "}
                    WAITING
                  </span>

                  <button
                    type="button"
                    onClick={
                      refreshInbox
                    }
                    disabled={
                      refreshing ||
                      !profile
                    }
                    style={{
                      background:
                        "transparent",
                      border:
                        "1px solid rgba(255,255,255,0.16)",
                      color:
                        "inherit",
                      padding:
                        "6px 10px",
                      font:
                        "inherit",
                      fontSize:
                        "8px",
                      letterSpacing:
                        "1px",
                      cursor:
                        "pointer",
                    }}
                  >
                    {refreshing
                      ? "..."
                      : "REFRESH ↻"}
                  </button>

                </div>

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
