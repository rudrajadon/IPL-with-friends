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

  // State for facts and animation
  const [factIndex, setFactIndex] = useState(0);
  const [isFading, setIsFading] = useState(false);

  // The fully updated facts array
  const iplFacts = [
    "Piyush Chawla bowled an astonishing 386 overs in his IPL career before bowling his very first no-ball.",
    "Pravin Tambe made his IPL debut at the age of 41 for Rajasthan Royals, despite never having played a single first-class match before.",
    "Only three players have ever taken a hat-trick and scored a century in the IPL: Rohit Sharma, Shane Watson, and Sunil Narine.",
    "Yashasvi Jaiswal holds the record for the fastest IPL fifty, smashing it in an unbelievable 13 balls against KKR in 2023.",
    "In the inaugural 2008 IPL Auction, MS Dhoni was the most expensive player at $1.5 million. Rishabh Pant holds the current all-time record, bought by LSG for a staggering ₹27 crore.",
    "The record for the most expensive uncapped player in IPL history belongs to Prashant Veer and Kartik Sharma, both bought by CSK for ₹14.20 crore ahead of the 2026 season.",
    "Sam Curran, Pat Cummins, and Mitchell Starc all broke the 'most expensive player' record within a single 12-month span between December 2022 and December 2023.",
    "Royal Challengers Bengaluru holds the record for the lowest team total in IPL history (49 all out) and held the highest (263) for 11 years until SRH broke it multiple times in 2024.",
    "Virat Kohli is the only player in IPL history to play for a single franchise from the very first season in 2008 to today.",
    "Chennai Super Kings didn't play for two years (2016-2017) and still hold the record for the most playoff appearances in history.",
    "The 18-year drought finally ended in 2025 when Royal Challengers Bengaluru won their first-ever IPL title, beating PBKS by just 6 runs in the final."
  ];

  // Rotate facts smoothly every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      // 1. Trigger the fade-out animation
      setIsFading(true);
      
      // 2. Wait 500ms (matching our CSS), swap the text, and fade back in
      setTimeout(() => {
        setFactIndex((prevIndex) => (prevIndex + 1) % iplFacts.length);
        setIsFading(false);
      }, 500); 
      
    }, 5000); 
    
    return () => clearInterval(interval);
  }, [iplFacts.length]);

  return (
    <div className="home-page">
      {/* --- MOBILE ONLY: COMING SOON OVERLAY --- */}
      <div className="mobile-only-overlay">
        <div className="mobile-content">
          <img src={fileUrl("ipl.png")} alt="IPL" className="mobile-logo" />
          <h2 className="mobile-status-eyebrow">Auction Control Center</h2>
          <h1 className="mobile-title">
            Best experienced on <span className="highlight">Desktop.</span>
          </h1>
          <p className="mobile-subtitle">
            To ensure the best bidding experience and real-time synchronization,
            our Auction Center is currently optimized for larger screens.
          </p>
          <div className="mobile-badge">
            🚀 Launching Mobile Version Soon
          </div>
          {/* Static container, dynamic content */}
          <div className="mobile-fun-fact">
            <strong>Did you know?</strong>
            {/* The fade is now isolated to just the text below */}
            <div className={`fact-text ${isFading ? "fade-out" : "fade-in"}`}>
              {iplFacts[factIndex]}
            </div>
          </div>
        </div>
      </div>

      {/* --- DESKTOP VIEW: ORIGINAL APP --- */}
      <div className="desktop-content-wrapper">
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

            {/* Desktop Fun Fact - Fixed container with fading text */}
            <div className="fun-fact">
              <strong>Did you know?</strong>
              <div className={`fact-text-desktop ${isFading ? "fade-out" : "fade-in"}`}>
                {iplFacts[factIndex]}
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default Home;