"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Message = {
  id: string;
  room_id?: string;
  username: string;
  content: string;
  created_at: string;
};

type Room = {
  id: string;
  code: string;
  expires_at: string;
  creator_id: string | null;
  password_enabled: boolean;
  terminated: boolean;
};

type Member = {
  id: string;
  room_id: string;
  visitor_id: string;
  nickname: string | null;
  is_kicked: boolean;
  joined_at: string;
  last_seen: string;
};

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const code = params.code;

  const [visitorId, setVisitorId] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [nicknameLocked, setNicknameLocked] = useState(false);

  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  const [loading, setLoading] = useState(true);
  const [terminated, setTerminated] = useState(false);
  const [kicked, setKicked] = useState(false);

  const [secondsLeft, setSecondsLeft] = useState(0);
  const [onlineCount, setOnlineCount] = useState(0);

  const [message, setMessage] = useState("");

  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  const [copied, setCopied] = useState(false);
  const [kicking, setKicking] = useState<string | null>(null);

  const [passwordInput, setPasswordInput] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [adminMessage, setAdminMessage] = useState("");

  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordVerified, setPasswordVerified] = useState(false);
  const [roomPassword, setRoomPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [checkingPassword, setCheckingPassword] = useState(false);

  /* ========================================
     VISITOR ID
  ======================================== */

  useEffect(() => {
    if (!code) return;

    const storageKey = `orabit-visitor-${code}`;

    let id = localStorage.getItem(storageKey);

    if (!id) {
      id = `visitor_${crypto.randomUUID()}`;
      localStorage.setItem(storageKey, id);
    }

    setVisitorId(id);
  }, [code]);

  /* ========================================
     SAVED NICKNAME
  ======================================== */

  useEffect(() => {
    if (!code) return;

    const savedNickname = localStorage.getItem(
      `orabit-nickname-${code}`
    );

    if (savedNickname) {
      setUsername(savedNickname);
      setNicknameLocked(true);
    }
  }, [code]);

  /* ========================================
     LOAD ROOM
  ======================================== */

  useEffect(() => {
    if (!code || !visitorId) return;

    const loadRoom = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("rooms")
        .select(
          "id, code, expires_at, creator_id, password_enabled, terminated"
        )
        .eq("code", code)
        .maybeSingle();

      if (error || !data) {
        console.error("Could not load room:", error);
        setTerminated(true);
        setLoading(false);
        return;
      }

      const loadedRoom = data as Room;

      if (loadedRoom.terminated) {
        setTerminated(true);
        setLoading(false);
        return;
      }

      const remaining = Math.max(
        0,
        Math.floor(
          (new Date(loadedRoom.expires_at).getTime() -
            Date.now()) /
            1000
        )
      );

      if (remaining <= 0) {
        setTerminated(true);
        setLoading(false);
        return;
      }

      setRoom(loadedRoom);
      setSecondsLeft(remaining);

      /* ADMIN CHECK */

      const savedAdminKey = localStorage.getItem(
        `orabit-admin-${code}`
      );

      const savedCreatorKey = localStorage.getItem(
        `orabit-creator-${code}`
      );

      const admin =
        (!!savedAdminKey &&
          savedAdminKey === loadedRoom.creator_id) ||
        (!!savedCreatorKey &&
          savedCreatorKey === loadedRoom.creator_id);

      setIsAdmin(admin);

      /* CHECK EXISTING MEMBERSHIP */

      const {
        data: existingMember,
        error: memberLookupError,
      } = await supabase
        .from("room_members")
        .select("*")
        .eq("room_id", loadedRoom.id)
        .eq("visitor_id", visitorId)
        .maybeSingle();

      if (memberLookupError) {
        console.error(
          "Could not check room membership:",
          memberLookupError
        );
      }

      if (existingMember?.is_kicked) {
        setKicked(true);
        setLoading(false);
        return;
      }

      /* REGISTER NEW VISITOR */

      if (!existingMember) {
        const savedNickname = localStorage.getItem(
          `orabit-nickname-${code}`
        );

        const { error: memberError } = await supabase
          .from("room_members")
          .insert({
            room_id: loadedRoom.id,
            visitor_id: visitorId,
            nickname: savedNickname || null,
            is_kicked: false,
            last_seen: new Date().toISOString(),
          });

        if (memberError) {
          console.error(
            "Could not register visitor:",
            memberError
          );
        }
      } else {
        await supabase
          .from("room_members")
          .update({
            last_seen: new Date().toISOString(),
          })
          .eq("room_id", loadedRoom.id)
          .eq("visitor_id", visitorId);
      }

      /* PASSWORD CHECK */

      const savedPasswordAccess = localStorage.getItem(
        `orabit-password-${code}`
      );

      if (admin) {
        setPasswordRequired(false);
        setPasswordVerified(true);
      } else if (loadedRoom.password_enabled) {
        if (savedPasswordAccess === "verified") {
          setPasswordRequired(false);
          setPasswordVerified(true);
        } else {
          setPasswordRequired(true);
          setPasswordVerified(false);
        }
      } else {
        setPasswordRequired(false);
        setPasswordVerified(true);
      }

      /* LOAD MESSAGES */

      const {
        data: oldMessages,
        error: messagesError,
      } = await supabase
        .from("messages")
        .select("*")
        .eq("room_id", loadedRoom.id)
        .order("created_at", {
          ascending: true,
        });

      if (messagesError) {
        console.error(
          "Could not load messages:",
          messagesError
        );
      }

      setMessages(oldMessages || []);

      /* LOAD MEMBERS */

      const {
        data: roomMembers,
        error: membersError,
      } = await supabase
        .from("room_members")
        .select("*")
        .eq("room_id", loadedRoom.id)
        .eq("is_kicked", false)
        .order("joined_at", {
          ascending: true,
        });

      if (!membersError) {
        setMembers((roomMembers || []) as Member[]);
      }

      setLoading(false);
    };

    loadRoom();
  }, [code, visitorId]);

  /* ========================================
     PASSWORD VERIFICATION
  ======================================== */

  const verifyRoomPassword = async () => {
    if (!roomPassword.trim()) {
      setPasswordError("ENTER THE ROOM PASSWORD.");
      return;
    }

    setCheckingPassword(true);
    setPasswordError("");

    const { data, error } = await supabase.rpc(
      "verify_room_password",
      {
        p_room_code: code,
        p_password: roomPassword,
      }
    );

    setCheckingPassword(false);

    if (error) {
      console.error(error);
      setPasswordError("COULD NOT VERIFY PASSWORD.");
      return;
    }

    if (
      data?.success === true &&
      data?.verified === true
    ) {
      localStorage.setItem(
        `orabit-password-${code}`,
        "verified"
      );

      setPasswordVerified(true);
      setPasswordRequired(false);
      setRoomPassword("");
      setPasswordError("");

      return;
    }

    setPasswordError("INCORRECT PASSWORD.");
  };

  /* ========================================
     PRESENCE
  ======================================== */

  useEffect(() => {
    if (
      !room ||
      !visitorId ||
      terminated ||
      kicked ||
      !passwordVerified
    ) {
      return;
    }

    const presenceChannel = supabase.channel(
      `presence-${room.id}`,
      {
        config: {
          presence: {
            key: visitorId,
          },
        },
      }
    );

    const updatePresence = () => {
      const state = presenceChannel.presenceState();

      setOnlineCount(Object.keys(state).length);
    };

    presenceChannel
      .on(
        "presence",
        {
          event: "sync",
        },
        updatePresence
      )
      .on(
        "presence",
        {
          event: "join",
        },
        updatePresence
      )
      .on(
        "presence",
        {
          event: "leave",
        },
        updatePresence
      )
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({
            visitor_id: visitorId,
            nickname: username || null,
          });

          updatePresence();
        }
      });

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [
    room,
    visitorId,
    terminated,
    kicked,
    passwordVerified,
    username,
  ]);

  /* ========================================
     MEMBERS REALTIME
  ======================================== */

  useEffect(() => {
    if (
      !room ||
      terminated ||
      kicked ||
      !passwordVerified
    ) {
      return;
    }

    const loadMembers = async () => {
      const { data, error } = await supabase
        .from("room_members")
        .select("*")
        .eq("room_id", room.id)
        .eq("is_kicked", false)
        .order("joined_at", {
          ascending: true,
        });

      if (!error) {
        setMembers((data || []) as Member[]);
      }
    };

    const channel = supabase
      .channel(`members-${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_members",
          filter: `room_id=eq.${room.id}`,
        },
        async (payload) => {
          if (payload.eventType === "UPDATE") {
            const updated = payload.new as Member;

            if (
              updated.visitor_id === visitorId &&
              updated.is_kicked
            ) {
              setKicked(true);
              setPasswordVerified(false);
              return;
            }
          }

          await loadMembers();
        }
      )
      .subscribe();

    loadMembers();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    room,
    visitorId,
    terminated,
    kicked,
    passwordVerified,
  ]);

  /* ========================================
     MESSAGE REALTIME
  ======================================== */

  useEffect(() => {
    if (
      !room ||
      terminated ||
      kicked ||
      !passwordVerified
    ) {
      return;
    }

    const channel = supabase
      .channel(`orabit-room-${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `room_id=eq.${room.id}`,
        },
        (payload) => {
          setMessages((current) => [
            ...current,
            payload.new as Message,
          ]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    room,
    terminated,
    kicked,
    passwordVerified,
  ]);

  /* ========================================
     COUNTDOWN
  ======================================== */

  useEffect(() => {
    if (
      terminated ||
      kicked ||
      secondsLeft <= 0
    ) {
      return;
    }

    const timer = setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          clearInterval(timer);
          setTerminated(true);
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [
    secondsLeft,
    terminated,
    kicked,
  ]);

  /* ========================================
     ROOM STATUS CHECK
  ======================================== */

  useEffect(() => {
    if (
      !room ||
      terminated ||
      kicked
    ) {
      return;
    }

    const checkRoom = async () => {
      const { data } = await supabase
        .from("rooms")
        .select(
          "expires_at, terminated, password_enabled"
        )
        .eq("id", room.id)
        .maybeSingle();

      if (!data) {
        setTerminated(true);
        return;
      }

      if (data.terminated) {
        setTerminated(true);
        return;
      }

      setRoom((current) =>
        current
          ? {
              ...current,
              expires_at: data.expires_at,
              terminated: data.terminated,
              password_enabled:
                data.password_enabled,
            }
          : current
      );

      const remaining = Math.max(
        0,
        Math.floor(
          (new Date(data.expires_at).getTime() -
            Date.now()) /
            1000
        )
      );

      if (remaining <= 0) {
        setTerminated(true);
      } else {
        setSecondsLeft(remaining);
      }

      if (!data.password_enabled) {
        setPasswordRequired(false);
        setPasswordVerified(true);

        localStorage.removeItem(
          `orabit-password-${code}`
        );
      }
    };

    const interval = setInterval(
      checkRoom,
      5000
    );

    return () => clearInterval(interval);
  }, [
    room,
    terminated,
    kicked,
    code,
  ]);

  /* ========================================
     COPY ROOM LINK
  ======================================== */

  const copyRoomLink = async () => {
    try {
      await navigator.clipboard.writeText(
        window.location.href
      );

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error(error);
    }
  };

  /* ========================================
     LOCK NICKNAME
  ======================================== */

  const lockNickname = async () => {
    const cleanNickname = username
      .trim()
      .slice(0, 30);

    if (
      !cleanNickname ||
      !room ||
      !visitorId
    ) {
      return;
    }

    setUsername(cleanNickname);
    setNicknameLocked(true);

    localStorage.setItem(
      `orabit-nickname-${code}`,
      cleanNickname
    );

    await supabase
      .from("room_members")
      .update({
        nickname: cleanNickname,
        last_seen:
          new Date().toISOString(),
      })
      .eq("room_id", room.id)
      .eq("visitor_id", visitorId)
      .eq("is_kicked", false);
  };

  /* ========================================
     KICK MEMBER
  ======================================== */

  const kickMember = async (
    member: Member
  ) => {
    if (
      !isAdmin ||
      !room ||
      !visitorId ||
      kicking
    ) {
      return;
    }

    if (
      member.visitor_id === visitorId
    ) {
      return;
    }

    const confirmed = window.confirm(
      `Remove ${
        member.nickname ||
        "Anonymous visitor"
      } from this ORAbit room?`
    );

    if (!confirmed) {
      return;
    }

    setKicking(member.visitor_id);

    const { error } = await supabase
      .from("room_members")
      .update({
        is_kicked: true,
      })
      .eq("room_id", room.id)
      .eq(
        "visitor_id",
        member.visitor_id
      );

    if (error) {
      console.error(error);
      setKicking(null);
      return;
    }

    setMembers((current) =>
      current.filter(
        (item) =>
          item.visitor_id !==
          member.visitor_id
      )
    );

    setKicking(null);
  };

  /* ========================================
     SAVE ROOM PASSWORD
  ======================================== */

  const saveRoomPassword = async () => {
    if (!isAdmin || !room) {
      return;
    }

    const adminKey =
      localStorage.getItem(
        `orabit-admin-${code}`
      ) ||
      localStorage.getItem(
        `orabit-creator-${code}`
      );

    if (!adminKey) {
      setAdminMessage(
        "ADMIN KEY NOT FOUND."
      );
      return;
    }

    const password =
      passwordInput.trim();

    if (!password) {
      setAdminMessage(
        "ENTER A PASSWORD."
      );
      return;
    }

    setPasswordSaving(true);
    setAdminMessage("");

    const { data, error } =
      await supabase.rpc(
        "set_room_password",
        {
          p_room_code: code,
          p_admin_key: adminKey,
          p_password: password,
        }
      );

    setPasswordSaving(false);

    if (
      error ||
      !data?.success
    ) {
      console.error(
        error || data
      );

      setAdminMessage(
        "COULD NOT SET PASSWORD."
      );

      return;
    }

    setRoom((current) =>
      current
        ? {
            ...current,
            password_enabled: true,
          }
        : current
    );

    setPasswordInput("");

    setAdminMessage(
      "PASSWORD ENABLED."
    );
  };

  /* ========================================
     REMOVE ROOM PASSWORD
  ======================================== */

  const removeRoomPassword =
    async () => {
      if (!isAdmin || !room) {
        return;
      }

      const adminKey =
        localStorage.getItem(
          `orabit-admin-${code}`
        ) ||
        localStorage.getItem(
          `orabit-creator-${code}`
        );

      if (!adminKey) {
        setAdminMessage(
          "ADMIN KEY NOT FOUND."
        );
        return;
      }

      setPasswordSaving(true);
      setAdminMessage("");

      const { data, error } =
        await supabase.rpc(
          "remove_room_password",
          {
            p_room_code: code,
            p_admin_key: adminKey,
          }
        );

      setPasswordSaving(false);

      if (
        error ||
        !data?.success
      ) {
        console.error(
          error || data
        );

        setAdminMessage(
          "COULD NOT REMOVE PASSWORD."
        );

        return;
      }

      setRoom((current) =>
        current
          ? {
              ...current,
              password_enabled: false,
            }
          : current
      );

      localStorage.removeItem(
        `orabit-password-${code}`
      );

      setPasswordRequired(false);
      setPasswordVerified(true);

      setAdminMessage(
        "PASSWORD REMOVED."
      );
    };

  /* ========================================
     TERMINATE ROOM
  ======================================== */

  const terminateRoom =
    async () => {
      if (!isAdmin || !room) {
        return;
      }

      const confirmed =
        window.confirm(
          "TERMINATE THIS ORABIT CHANNEL?\n\nEveryone will be disconnected."
        );

      if (!confirmed) return;

      const adminKey =
        localStorage.getItem(
          `orabit-admin-${code}`
        ) ||
        localStorage.getItem(
          `orabit-creator-${code}`
        );

      if (!adminKey) {
        setAdminMessage(
          "ADMIN KEY NOT FOUND."
        );
        return;
      }

      const { data, error } =
        await supabase.rpc(
          "terminate_room",
          {
            p_room_code: code,
            p_admin_key: adminKey,
          }
        );

      if (
        error ||
        !data?.success
      ) {
        console.error(
          error || data
        );

        setAdminMessage(
          "COULD NOT TERMINATE ROOM."
        );

        return;
      }

      setTerminated(true);
    };

  /* ========================================
     SEND MESSAGE
  ======================================== */

  const sendMessage = async () => {
    if (
      !room ||
      terminated ||
      kicked ||
      !passwordVerified ||
      !nicknameLocked ||
      !message.trim()
    ) {
      return;
    }

    const { error } =
      await supabase
        .from("messages")
        .insert({
          room_id: room.id,
          username,
          content: message
            .trim()
            .slice(0, 1000),
        });

    if (error) {
      console.error(error);
      return;
    }

    setMessage("");
  };

  /* ========================================
     TIMER
  ======================================== */

  const timerHours = Math.floor(
    secondsLeft / 3600
  );

  const timerMinutes = Math.floor(
    (secondsLeft % 3600) / 60
  )
    .toString()
    .padStart(2, "0");

  const timerSeconds = (
    secondsLeft % 60
  )
    .toString()
    .padStart(2, "0");

  const formattedTime =
    timerHours > 0
      ? `${timerHours
          .toString()
          .padStart(2, "0")}:${timerMinutes}:${timerSeconds}`
      : `${timerMinutes}:${timerSeconds}`;

  /* ========================================
     LOADING
  ======================================== */

  if (loading) {
    return (
      <main className="room-shell">
        <div className="scanlines" />
        <div className="noise" />

        <div
          style={{
            position: "fixed",
            inset: 0,
            pointerEvents: "none",
            background:
              "radial-gradient(circle, rgba(176,38,255,.08), transparent 50%)",
          }}
        />

        <div className="empty-chat">
          <span
            className="cursor"
            style={{
              fontSize: "30px",
              textShadow:
                "0 0 20px #b026ff",
            }}
          >
            _
          </span>

          <p
            style={{
              animation:
                "flicker 2s infinite",
            }}
          >
            ESTABLISHING ORABIT
            CONNECTION...
          </p>

          <p
            style={{
              color: "#24202a",
              fontSize: "7px",
              letterSpacing: "3px",
              marginTop: "15px",
            }}
          >
            SIGNAL ACQUISITION // 0x7F
          </p>
        </div>
      </main>
    );
  }

  /* ========================================
     KICKED
  ======================================== */

  if (kicked) {
    return (
      <main className="room-shell">
        <div className="scanlines" />
        <div className="noise" />

        <div className="empty-chat">
          <span
            style={{
              color: "#ff1744",
              fontSize: "12px",
              letterSpacing: "5px",
              textShadow:
                "0 0 20px rgba(255,23,68,.7)",
              animation:
                "dangerFlash .6s infinite",
            }}
          >
            ACCESS REVOKED
          </span>

          <h1
            style={{
              fontSize:
                "clamp(45px, 10vw, 100px)",
              letterSpacing: "-4px",
              textShadow:
                "0 0 30px rgba(255,23,68,.5)",
              animation:
                "titleGlitch 2s infinite",
            }}
          >
            KICKED
          </h1>

          <p>
            You have been removed
            from this ORAbit
            channel.
          </p>

          <p
            style={{
              color: "#39413f",
              fontSize: "10px",
              marginTop: "20px",
              letterSpacing: "2px",
            }}
          >
            THIS ACCESS HAS BEEN
            PERMANENTLY REVOKED
          </p>
        </div>
      </main>
    );
  }

  /* ========================================
     TERMINATED
  ======================================== */

  if (terminated) {
    return (
      <main className="room-shell">
        <div className="scanlines" />
        <div className="noise" />

        <div
          style={{
            position: "fixed",
            inset: 0,
            background:
              "radial-gradient(circle, rgba(255,23,68,.08), transparent 45%)",
            pointerEvents: "none",
          }}
        />

        <div className="empty-chat">
          <span
            style={{
              color: "#ff1744",
              fontSize: "12px",
              letterSpacing: "6px",
              textShadow:
                "0 0 20px rgba(255,23,68,.8)",
              animation:
                "dangerFlash .5s infinite",
            }}
          >
            SIGNAL LOST
          </span>

          <h1
            style={{
              fontSize:
                "clamp(45px, 10vw, 100px)",
              letterSpacing: "-4px",
              textShadow:
                "0 0 30px rgba(255,23,68,.35)",
              animation:
                "titleGlitch 1.5s infinite",
            }}
          >
            TERMINATED
          </h1>

          <p>
            This ORAbit channel
            no longer exists.
          </p>

          <p
            style={{
              color: "#39413f",
              fontSize: "10px",
              marginTop: "20px",
              letterSpacing: "2px",
            }}
          >
            ALL TEMPORARY DATA
            HAS EXPIRED
          </p>

          <div
            style={{
              marginTop: "30px",
              color: "#241f28",
              fontSize: "7px",
              letterSpacing: "3px",
            }}
          >
            CONNECTION ID: {code}
          </div>
        </div>
      </main>
    );
  }

  /* ========================================
     PASSWORD GATE
  ======================================== */

  if (
    passwordRequired &&
    !passwordVerified
  ) {
    return (
      <main className="room-shell">
        <div className="scanlines" />
        <div className="noise" />

        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "30px",
          }}
        >
          <div
            className="create-panel"
            style={{
              width: "100%",
              maxWidth: "430px",
            }}
          >
            <p
              className="eyebrow"
              style={{
                marginBottom: "18px",
              }}
            >
              ORABIT // RESTRICTED
              CHANNEL
            </p>

            <h1
              style={{
                fontSize: "32px",
                letterSpacing: "-1px",
                marginBottom: "10px",
              }}
            >
              ACCESS DENIED
            </h1>

            <p
              style={{
                color: "#59605d",
                fontSize: "10px",
                lineHeight: "1.7",
                marginBottom: "25px",
              }}
            >
              This temporary
              channel is password
              protected.
            </p>

            <input
              type="password"
              value={roomPassword}
              onChange={(e) => {
                setRoomPassword(
                  e.target.value
                );
                setPasswordError("");
              }}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter"
                ) {
                  verifyRoomPassword();
                }
              }}
              placeholder="ENTER ACCESS CODE..."
              autoFocus
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "#080909",
                border:
                  "1px solid #302034",
                color: "#c8d2cf",
                padding: "13px",
                outline: "none",
                fontSize: "10px",
                marginBottom: "10px",
                fontFamily:
                  "inherit",
              }}
            />

            <button
              onClick={
                verifyRoomPassword
              }
              disabled={
                checkingPassword
              }
              className="create-button"
            >
              {checkingPassword
                ? "VERIFYING..."
                : "ENTER CHANNEL"}
            </button>

            {passwordError && (
              <p
                style={{
                  color: "#ff1744",
                  fontSize: "8px",
                  letterSpacing: "1px",
                  marginTop: "15px",
                  animation:
                    "flicker 1s infinite",
                }}
              >
                ⚠ {passwordError}
              </p>
            )}

            <p
              style={{
                color: "#242c28",
                fontSize: "8px",
                marginTop: "25px",
                letterSpacing: "2px",
              }}
            >
              CHANNEL: {code}
            </p>
          </div>
        </div>
      </main>
    );
  }

  /* ========================================
     ACTIVE ROOM
  ======================================== */

  return (
    <main className="room-shell">
      <div className="scanlines" />
      <div className="noise" />

      {/* ATMOSPHERIC PURPLE CORE */}

      <div
        style={{
          position: "fixed",
          width: "500px",
          height: "500px",
          left: "50%",
          top: "20%",
          transform:
            "translate(-50%, -50%)",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(176,38,255,.07), transparent 70%)",
          pointerEvents: "none",
          animation:
            "panelFloat 7s ease-in-out infinite",
        }}
      />

      {/* ROOM HEADER */}

      <header className="room-header">
        <div>
          <p className="eyebrow">
            ORABIT TEMPORARY
            CHANNEL
          </p>

          <div className="room-title-row">
            <h1>
              ROOM: {code}
            </h1>

            <button
              className="share-button"
              onClick={
                copyRoomLink
              }
            >
              {copied
                ? "✓ COPIED"
                : "↗ SHARE ROOM"}
            </button>
          </div>
        </div>

        <div className="room-status">
          <div className="online-users">
            <span className="online-dot" />
            {onlineCount} CONNECTED
          </div>

          <div
            className={`timer ${
              secondsLeft <= 10
                ? "danger"
                : ""
            }`}
          >
            <span>
              TIME REMAINING
            </span>

            <strong>
              {formattedTime}
            </strong>
          </div>
        </div>
      </header>

      {/* ADMIN BAR */}

      {isAdmin && (
        <div
          style={{
            position: "relative",
            zIndex: 3,
            padding: "10px 30px",
            borderBottom:
              "1px solid #3a1450",
            background:
              "rgba(176, 38, 255, 0.035)",
            color: "#b026ff",
            fontSize: "8px",
            letterSpacing: "2px",
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "center",
          }}
        >
          <span>
            ◆ TEMPORARY ROOM ADMIN
          </span>

          <button
            onClick={() =>
              setShowAdmin(
                !showAdmin
              )
            }
            style={{
              background:
                "transparent",
              border:
                "1px solid #b026ff",
              color: "#b026ff",
              padding:
                "6px 12px",
              cursor: "pointer",
              fontSize: "8px",
              letterSpacing:
                "1px",
              fontFamily:
                "inherit",
            }}
          >
            {showAdmin
              ? "CLOSE ADMIN"
              : "ADMIN PANEL"}
          </button>
        </div>
      )}

      {/* ADMIN PANEL */}

      {isAdmin &&
        showAdmin && (
          <section
            style={{
              position: "relative",
              zIndex: 2,
              margin:
                "20px 30px 0",
              padding: "18px",
              border:
                "1px solid #3a1450",
              background:
                "rgba(176, 38, 255, 0.025)",
              boxShadow:
                "0 0 30px rgba(176, 38, 255, 0.05)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent:
                  "space-between",
                alignItems:
                  "center",
                marginBottom:
                  "15px",
              }}
            >
              <span
                style={{
                  color: "#b026ff",
                  fontSize:
                    "10px",
                  letterSpacing:
                    "3px",
                }}
              >
                ◆ ADMIN CONTROL
              </span>

              <span
                style={{
                  color:
                    "#59605d",
                  fontSize:
                    "9px",
                }}
              >
                {members.length} MEMBER
                {members.length === 1
                  ? ""
                  : "S"}
              </span>
            </div>

            {members.map(
              (member) => (
                <div
                  key={
                    member.visitor_id
                  }
                  style={{
                    display: "flex",
                    justifyContent:
                      "space-between",
                    alignItems:
                      "center",
                    padding:
                      "10px 0",
                    borderTop:
                      "1px solid #191d1c",
                  }}
                >
                  <div>
                    <span
                      style={{
                        color:
                          "#b026ff",
                        marginRight:
                          "10px",
                      }}
                    >
                      ●
                    </span>

                    <span
                      style={{
                        color:
                          "#c8d2cf",
                        fontSize:
                          "11px",
                      }}
                    >
                      {member.nickname ||
                        "Anonymous"}
                    </span>

                    {member.visitor_id ===
                      visitorId && (
                      <span
                        style={{
                          color:
                            "#b026ff",
                          fontSize:
                            "7px",
                          marginLeft:
                            "8px",
                          letterSpacing:
                            "1px",
                        }}
                      >
                        ADMIN / YOU
                      </span>
                    )}
                  </div>

                  {member.visitor_id !==
                    visitorId && (
                    <button
                      onClick={() =>
                        kickMember(
                          member
                        )
                      }
                      disabled={
                        kicking ===
                        member.visitor_id
                      }
                      style={{
                        background:
                          "transparent",
                        border:
                          "1px solid #ff1744",
                        color:
                          "#ff1744",
                        padding:
                          "5px 9px",
                        cursor:
                          "pointer",
                        fontSize:
                          "8px",
                        letterSpacing:
                          "1px",
                        fontFamily:
                          "inherit",
                      }}
                    >
                      {kicking ===
                      member.visitor_id
                        ? "REMOVING..."
                        : "KICK"}
                    </button>
                  )}
                </div>
              )
            )}

            {/* SECURITY */}

            <div
              style={{
                marginTop:
                  "25px",
                paddingTop:
                  "20px",
                borderTop:
                  "1px solid #24152d",
              }}
            >
              <div
                style={{
                  color:
                    "#b026ff",
                  fontSize:
                    "9px",
                  letterSpacing:
                    "3px",
                  marginBottom:
                    "12px",
                }}
              >
                ◆ ROOM SECURITY
              </div>

              <div
                style={{
                  display:
                    "flex",
                  gap: "8px",
                  flexWrap:
                    "wrap",
                }}
              >
                <input
                  type="password"
                  value={
                    passwordInput
                  }
                  onChange={(e) =>
                    setPasswordInput(
                      e.target
                        .value
                    )
                  }
                  placeholder={
                    room?.password_enabled
                      ? "CHANGE PASSWORD..."
                      : "NEW ROOM PASSWORD..."
                  }
                  maxLength={100}
                  style={{
                    flex:
                      "1 1 220px",
                    background:
                      "#080909",
                    border:
                      "1px solid #302034",
                    color:
                      "#c8d2cf",
                    padding:
                      "10px",
                    outline:
                      "none",
                    fontSize:
                      "10px",
                    fontFamily:
                      "inherit",
                  }}
                />

                <button
                  onClick={
                    saveRoomPassword
                  }
                  disabled={
                    passwordSaving
                  }
                  style={{
                    background:
                      "transparent",
                    border:
                      "1px solid #b026ff",
                    color:
                      "#b026ff",
                    padding:
                      "10px 14px",
                    cursor:
                      "pointer",
                    fontSize:
                      "8px",
                    letterSpacing:
                      "1px",
                    fontFamily:
                      "inherit",
                  }}
                >
                  {passwordSaving
                    ? "SAVING..."
                    : room?.password_enabled
                    ? "CHANGE PASSWORD"
                    : "ENABLE PASSWORD"}
                </button>

                {room?.password_enabled && (
                  <button
                    onClick={
                      removeRoomPassword
                    }
                    disabled={
                      passwordSaving
                    }
                    style={{
                      background:
                        "transparent",
                      border:
                        "1px solid #555",
                      color:
                        "#999",
                      padding:
                        "10px 14px",
                      cursor:
                        "pointer",
                      fontSize:
                        "8px",
                      letterSpacing:
                        "1px",
                      fontFamily:
                        "inherit",
                    }}
                  >
                    REMOVE PASSWORD
                  </button>
                )}
              </div>

              <p
                style={{
                  color:
                    "#555d59",
                  fontSize:
                    "8px",
                  marginTop:
                    "10px",
                }}
              >
                {room?.password_enabled
                  ? "🔒 PASSWORD PROTECTION IS ACTIVE."
                  : "THIS ROOM IS CURRENTLY OPEN TO ANYONE WITH THE LINK."}
              </p>

              {adminMessage && (
                <p
                  style={{
                    color:
                      "#b026ff",
                    fontSize:
                      "8px",
                    marginTop:
                      "8px",
                    animation:
                      "flicker 2s infinite",
                  }}
                >
                  {adminMessage}
                </p>
              )}
            </div>

            {/* TERMINATE */}

            <div
              style={{
                marginTop:
                  "25px",
                paddingTop:
                  "20px",
                borderTop:
                  "1px solid #24152d",
              }}
            >
              <button
                onClick={
                  terminateRoom
                }
                style={{
                  background:
                    "transparent",
                  border:
                    "1px solid #ff1744",
                  color:
                    "#ff1744",
                  padding:
                    "10px 14px",
                  cursor:
                    "pointer",
                  fontSize:
                    "8px",
                  letterSpacing:
                    "2px",
                  fontFamily:
                    "inherit",
                  transition:
                    ".2s",
                }}
              >
                💀 TERMINATE
                CHANNEL
              </button>
            </div>
          </section>
        )}

      {/* CHAT */}

      <section className="chat-area">
        {messages.length === 0 ? (
          <div className="empty-chat">
            <span className="cursor">
              _
            </span>

            <p>
              The channel is
              silent.
            </p>

            <p
              style={{
                color:
                  "#242c28",
                fontSize:
                  "8px",
                marginTop:
                  "10px",
                letterSpacing:
                  "2px",
              }}
            >
              {onlineCount} VISITOR
              {onlineCount === 1
                ? ""
                : "S"} CONNECTED
            </p>

            <p
              style={{
                color:
                  "#211b25",
                fontSize:
                  "7px",
                marginTop:
                  "25px",
                letterSpacing:
                  "3px",
              }}
            >
              AWAITING TRANSMISSION...
            </p>
          </div>
        ) : (
          messages.map(
            (msg) => (
              <div
                className="message"
                key={msg.id}
              >
                <span className="username">
                  {msg.username}
                </span>

                <span className="message-content">
                  {msg.content}
                </span>
              </div>
            )
          )
        )}
      </section>

      {/* COMPOSER */}

      <div className="composer">
        {!nicknameLocked ? (
          <>
            <input
              value={username}
              onChange={(e) =>
                setUsername(
                  e.target.value
                )
              }
              onKeyDown={(e) => {
                if (
                  e.key === "Enter"
                ) {
                  lockNickname();
                }
              }}
              placeholder="Choose your nickname..."
              maxLength={30}
              autoFocus
            />

            <button
              onClick={
                lockNickname
              }
            >
              ENTER CHAT
            </button>
          </>
        ) : (
          <>
            <div className="nickname-display">
              <span>YOU</span>
              {username}
            </div>

            <input
              value={message}
              onChange={(e) =>
                setMessage(
                  e.target.value
                )
              }
              onKeyDown={(e) => {
                if (
                  e.key === "Enter"
                ) {
                  sendMessage();
                }
              }}
              placeholder="Transmit a message..."
              maxLength={1000}
              autoFocus
            />

            <button
              onClick={
                sendMessage
              }
            >
              SEND
            </button>
          </>
        )}
      </div>
    </main>
  );
}
