import React, { useState, useEffect } from "react";
import { SignInButton, SignUpButton, UserButton } from "@clerk/clerk-react";
import CreateRoomModal from "./CreateRoomModal";
import JoinRoomModal from "./JoinRoomModal";
import { API_BASE_URL, fileUrl } from "../config";
import "./Home.css";

const Home = ({
  createRoom,
  joinRoom,
  account,
  clerkLoaded,
  clerkSignedIn,
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [teams, setTeams] = useState([]);
  const [authMode, setAuthMode] = useState("login");

  useEffect(() => {
    fetch(`${API_BASE_URL}/teams`)
      .then((res) => res.json())
      .then((data) => setTeams(data));
  }, []);

  return (
    <div className="home-page">
      {account?.playerId && (
        <div className="profile-floating">
          <UserButton afterSignOutUrl="/" />
        </div>
      )}

      {showCreateModal && (
        <CreateRoomModal
          teams={teams}
          account={account}
          createRoom={(data) => createRoom(data)}
          closeModal={() => setShowCreateModal(false)}
        />
      )}
      {showJoinModal && (
        <JoinRoomModal
          account={account}
          joinRoom={(data) => joinRoom(data)}
          closeModal={() => setShowJoinModal(false)}
        />
      )}

      <main className="auction-card">
        <section className="info-section">
          <div className="logo">
            <img src={fileUrl("ipl.png")} alt="IPL" className="logo-image" />
            Auction Control Center
          </div>

          <h1 className="title">
            Build your dream <span className="highlight">IPL squad.</span>
          </h1>

          <p className="subtitle">
            Create a private room or join an existing room and compete in a live
            auction with your friends.
          </p>

          <div className="features">
            <span className="feature-tag">Live bidding</span>
            <span className="feature-tag">Team purses</span>
            <span className="feature-tag">Player stats</span>
            <span className="feature-tag">Room-based play</span>
            <span className="feature-tag">Point-based scoring</span>
          </div>
        </section>

        <section className="action-section">
          {!account?.playerId ? (
            <div className="auth-shell">
              <p className="auth-eyebrow">Account Access</p>
              <h3 className="auth-title">
                {authMode === "login"
                  ? "Log in to continue"
                  : "Create your account"}
              </h3>
              <p className="auth-subtitle">
                {authMode === "login"
                  ? "Use Clerk sign-in to re-enter your room safely."
                  : "Create a new player profile instantly using Clerk."}
              </p>

              <div className="auth-mode-toggle">
                <button
                  className={`auth-mode-btn ${
                    authMode === "login" ? "active" : ""
                  }`}
                  onClick={() => setAuthMode("login")}
                >
                  Login
                </button>
                <button
                  className={`auth-mode-btn ${
                    authMode === "register" ? "active" : ""
                  }`}
                  onClick={() => setAuthMode("register")}
                >
                  Create Account
                </button>
              </div>

              <div className="auth-google-wrap">
                {!clerkLoaded && (
                  <div className="feature-tag">Loading authentication...</div>
                )}
                {clerkLoaded &&
                  !clerkSignedIn &&
                  (authMode === "login" ? (
                    <SignInButton mode="modal">
                      <button className="btn btn-secondary">Sign In</button>
                    </SignInButton>
                  ) : (
                    <SignUpButton mode="modal">
                      <button className="btn btn-secondary">
                        Create Account
                      </button>
                    </SignUpButton>
                  ))}
              </div>
            </div>
          ) : (
            <>
              <div className="buttons">
                <button
                  className="btn btn-primary"
                  onClick={() => setShowCreateModal(true)}
                >
                  Create Room
                </button>

                <button
                  className="btn btn-secondary"
                  onClick={() => setShowJoinModal(true)}
                >
                  Join Room
                </button>
              </div>
            </>
          )}

          <div className="fun-fact">
            <strong>Fun Fact:</strong> Unki yaado me ro ro kar humne tub bhar
            diye
            <br />
            wo aaye, nahaye, aur chaldiye...
          </div>
        </section>
      </main>
    </div>
  );
};

export default Home;
