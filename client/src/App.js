import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import { ClerkProvider, useClerk, useUser } from "@clerk/clerk-react";
import Home from "./components/Home";
import Lobby from "./components/Lobby";
import AuctionBoard from "./components/AuctionBoard";
import Results from "./components/Results";
import ResultsWaiting from "./components/ResultsWaiting";
import { SOCKET_URL } from "./config";

const socket = io(SOCKET_URL);
const CLERK_PUBLISHABLE_KEY = process.env.REACT_APP_CLERK_PUBLISHABLE_KEY || "";
const AUCTION_END_TRANSITION_MS = 1800;
const CLERK_DARK_APPEARANCE = {
  variables: {
    colorBackground: "#0b1220",
    colorInputBackground: "#0f172a",
    colorInputText: "#e2e8f0",
    colorText: "#e2e8f0",
    colorTextSecondary: "#94a3b8",
    colorPrimary: "#2563eb",
    colorDanger: "#ef4444",
    borderRadius: "12px",
  },
  elements: {
    card: {
      backgroundColor: "#0b1220",
      border: "1px solid rgba(148, 163, 184, 0.22)",
      boxShadow: "0 18px 48px rgba(2, 6, 23, 0.6)",
    },
    formButtonPrimary: {
      backgroundColor: "#2563eb",
      color: "#f8fafc",
    },
    footerActionText: {
      color: "#94a3b8",
    },
  },
};

const getPathState = () => {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts.length === 0) return { room: null, screen: "home" };
  if (parts.length === 1)
    return { room: parts[0].toLowerCase(), screen: "lobby" };
  if (parts.length >= 2 && parts[1].toLowerCase() === "auctionroom") {
    return { room: parts[0].toLowerCase(), screen: "auction" };
  }
  if (parts.length >= 2 && parts[1].toLowerCase() === "results") {
    return { room: parts[0].toLowerCase(), screen: "results" };
  }
  if (parts.length >= 2 && parts[1].toLowerCase() === "results-waiting") {
    return { room: parts[0].toLowerCase(), screen: "resultsWaiting" };
  }
  return { room: null, screen: "home" };
};

function AppShell() {
  const { user, isSignedIn, isLoaded } = useUser();
  const { signOut } = useClerk();
  const initialPath = getPathState();
  const [room, setRoom] = useState(initialPath.room);
  const [initialRoomState, setInitialRoomState] = useState(null);
  const [screen, setScreen] = useState(initialPath.screen);
  const screenRef = useRef(initialPath.screen);
  const roomRef = useRef(initialPath.room);
  const endTransitionTimeoutRef = useRef(null);
  const isEndTransitionScheduledRef = useRef(false);
  const [account, setAccount] = useState(() => {
    try {
      const raw = localStorage.getItem("auction_account");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const navigate = (nextScreen, roomId = null, replace = false) => {
    const path =
      nextScreen === "home"
        ? "/"
        : nextScreen === "resultsWaiting"
          ? `/${roomId}/results-waiting`
          : nextScreen === "results"
            ? `/${roomId}/results`
            : nextScreen === "auction"
              ? `/${roomId}/auctionroom`
              : `/${roomId}`;

    if (replace) {
      window.history.replaceState({}, "", path);
    } else {
      window.history.pushState({}, "", path);
    }

    setScreen(nextScreen);
    setRoom(roomId);
  };

  const navigateIfChanged = (nextScreen, roomId = null, replace = false) => {
    if (screenRef.current === nextScreen && roomRef.current === roomId) return;
    navigate(nextScreen, roomId, replace);
  };

  const clearEndTransitionTimeout = () => {
    if (endTransitionTimeoutRef.current) {
      clearTimeout(endTransitionTimeoutRef.current);
      endTransitionTimeoutRef.current = null;
    }
    isEndTransitionScheduledRef.current = false;
  };

  const scheduleEndTransition = (roomId) => {
    if (!roomId || isEndTransitionScheduledRef.current) return;
    isEndTransitionScheduledRef.current = true;

    endTransitionTimeoutRef.current = setTimeout(() => {
      navigateIfChanged("resultsWaiting", roomId, true);
      isEndTransitionScheduledRef.current = false;
      endTransitionTimeoutRef.current = null;
    }, AUCTION_END_TRANSITION_MS);
  };

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  const reconnectIfNeeded = (targetRoom) => {
    if (!targetRoom || !account?.playerId) return;
    socket.emit("reconnectRoom", {
      roomId: targetRoom,
      playerId: account.playerId,
    });
  };

  useEffect(() => {
    const isEndFlowScreen = (value) =>
      value === "resultsWaiting" || value === "results";

    const handlePopState = () => {
      const parsed = getPathState();
      setRoom(parsed.room);
      setScreen(parsed.screen);
      reconnectIfNeeded(parsed.room);
    };

    const handleRoomCreated = ({ roomId, roomState }) => {
      setInitialRoomState(roomState);
      navigateIfChanged("lobby", roomId);
    };

    const handleRoomJoined = ({ roomId, roomState }) => {
      setInitialRoomState(roomState);
      if (roomState?.phase === "ended") {
        const revealAt = Number(roomState?.resultsRevealAt);
        const target =
          Number.isFinite(revealAt) && Date.now() >= revealAt
            ? "results"
            : "resultsWaiting";
        navigateIfChanged(target, roomId, true);
      } else if (roomState?.phase === "running") {
        navigateIfChanged("auction", roomId, true);
      } else {
        navigateIfChanged("lobby", roomId, true);
      }
    };

    const handleAuctionStarted = () => {
      if (roomRef.current && !isEndFlowScreen(screenRef.current)) {
        navigateIfChanged("auction", roomRef.current, true);
      }
    };

    const handleRoomUpdate = (updatedRoom) => {
      setInitialRoomState(updatedRoom);
      const activeRoom = roomRef.current || updatedRoom?.id || null;
      if (!activeRoom) return;

      if (updatedRoom?.phase === "ended") {
        if (!isEndFlowScreen(screenRef.current)) {
          if (screenRef.current === "auction") {
            scheduleEndTransition(activeRoom);
          } else {
            navigateIfChanged("resultsWaiting", activeRoom, true);
          }
        }
        return;
      }

      clearEndTransitionTimeout();

      if (isEndFlowScreen(screenRef.current)) {
        return;
      }

      if (updatedRoom?.phase === "running") {
        navigateIfChanged("auction", activeRoom, true);
      } else {
        navigateIfChanged("lobby", activeRoom, true);
      }
    };

    const handleAuctionEnded = () => {
      if (roomRef.current && !isEndFlowScreen(screenRef.current)) {
        if (screenRef.current === "auction") {
          scheduleEndTransition(roomRef.current);
        } else {
          navigateIfChanged("resultsWaiting", roomRef.current, true);
        }
      }
    };

    const handleSocketError = (message) => {
      if (message) window.alert(message);
    };

    socket.on("roomCreated", handleRoomCreated);
    socket.on("roomJoined", handleRoomJoined);
    socket.on("auctionStarted", handleAuctionStarted);
    socket.on("auctionEnded", handleAuctionEnded);
    socket.on("updateRoom", handleRoomUpdate);
    socket.on("error", handleSocketError);
    window.addEventListener("popstate", handlePopState);

    reconnectIfNeeded(initialPath.room);

    return () => {
      clearEndTransitionTimeout();
      socket.off("roomCreated", handleRoomCreated);
      socket.off("roomJoined", handleRoomJoined);
      socket.off("auctionStarted", handleAuctionStarted);
      socket.off("auctionEnded", handleAuctionEnded);
      socket.off("updateRoom", handleRoomUpdate);
      socket.off("error", handleSocketError);
      window.removeEventListener("popstate", handlePopState);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.playerId]);

  useEffect(() => {
    if (screen !== "resultsWaiting" || !room) return undefined;

    const serverRevealAt = Number(initialRoomState?.resultsRevealAt);
    const delayMs = Number.isFinite(serverRevealAt)
      ? Math.max(0, serverRevealAt - Date.now())
      : 15000;

    const timeout = setTimeout(() => {
      navigateIfChanged("results", room, true);
    }, delayMs);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, room, initialRoomState?.resultsRevealAt]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || !user?.id || !user?.fullName) {
      if (account?.playerId) {
        setAccount(null);
        localStorage.removeItem("auction_account");
      }
      return;
    }

    socket.emit(
      "clerkAuth",
      {
        clerkId: user.id,
        username: user.fullName,
        email: user.primaryEmailAddress?.emailAddress || "",
      },
      (result) => {
        if (!result?.ok) {
          window.alert(result?.error || "Clerk authentication failed");
          return;
        }

        const next = {
          playerId: result.playerId,
          username: result.username,
          clerkId: user.id,
          email: user.primaryEmailAddress?.emailAddress || "",
        };

        setAccount((prev) => {
          if (
            prev?.playerId === next.playerId &&
            prev?.username === next.username &&
            prev?.clerkId === next.clerkId
          ) {
            return prev;
          }
          localStorage.setItem("auction_account", JSON.stringify(next));
          return next;
        });
      },
    );
  }, [isLoaded, isSignedIn, user?.id, user?.fullName]);

  const logoutAccount = () => {
    signOut();
    setAccount(null);
    localStorage.removeItem("auction_account");
    navigate("home", null, true);
  };

  const createRoom = (data) => {
    socket.emit("createRoom", data);
  };

  const joinRoom = (data) => {
    socket.emit("joinRoom", data);
  };

  const renderScreen = () => {
    switch (screen) {
      case "home":
        return (
          <Home
            createRoom={createRoom}
            joinRoom={joinRoom}
            account={account}
            clerkLoaded={isLoaded}
            clerkSignedIn={isSignedIn}
            logoutAccount={logoutAccount}
          />
        );
      case "lobby":
        return (
          <Lobby
            socket={socket}
            room={room}
            initialRoomState={initialRoomState}
          />
        );
      case "auction":
        return (
          <AuctionBoard
            socket={socket}
            room={room}
            initialRoomState={initialRoomState}
          />
        );
      case "results":
        return <Results room={room} initialRoomState={initialRoomState} />;
      case "resultsWaiting":
        return (
          <ResultsWaiting
            room={room}
            revealAt={initialRoomState?.resultsRevealAt}
            roomState={initialRoomState}
          />
        );
      default:
        return (
          <Home
            createRoom={createRoom}
            joinRoom={joinRoom}
            account={account}
            clerkLoaded={isLoaded}
            clerkSignedIn={isSignedIn}
            logoutAccount={logoutAccount}
          />
        );
    }
  };

  return <div className="min-h-screen text-slate-100">{renderScreen()}</div>;
}

function App() {
  if (!CLERK_PUBLISHABLE_KEY) {
    return (
      <div className="min-h-screen text-slate-100 p-6">
        Missing REACT_APP_CLERK_PUBLISHABLE_KEY in client/.env
      </div>
    );
  }

  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      appearance={CLERK_DARK_APPEARANCE}
    >
      <AppShell />
    </ClerkProvider>
  );
}

export default App;
