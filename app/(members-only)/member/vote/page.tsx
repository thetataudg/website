"use client";

import React, { useEffect, useState, useRef } from "react";
import { RedirectToSignIn, useAuth, useUser } from "@clerk/nextjs";
import axios from "axios";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faTimes,
  faTriangleExclamation,
  faHourglass,
  faPlay,
  faStop,
  faChartBar,
} from "@fortawesome/free-solid-svg-icons";
import Modal from "react-bootstrap/Modal";
import Button from "react-bootstrap/Button";

type VoteInfo = {
  type: string;
  options: string[];
  started: boolean;
  ended: boolean;
  hasVoted?: boolean;
};

type VoteResults = {
  type: string;
  options: string[];
  started: boolean;
  ended: boolean;
  results: Record<string, number>;
  totalVotes: number;
};

export default function VotePage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const [userData, setUserData] = useState<any>(null);
  const [loadingUserData, setLoadingUserData] = useState(true);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [voteType, setVoteType] = useState<null | "Election" | "Pledge Vote">(null);
  const [names, setNames] = useState<string[]>([""]);
  const [submitting, setSubmitting] = useState(false);

  // Voting state
  const [voteInfo, setVoteInfo] = useState<VoteInfo | null>(null);
  const [voteLoading, setVoteLoading] = useState(true);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<string>("");
  const [voted, setVoted] = useState(false);

  // Results
  const [showResults, setShowResults] = useState(false);
  const [voteResults, setVoteResults] = useState<VoteResults | null>(null);
  const [resultsLoading, setResultsLoading] = useState(false);

  // Polling
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    async function fetchUserData() {
      try {
        const response = await axios.get("/api/members/me");
        const data = response.data;
        setUserData({
          type: data.status,
          isECouncil: data.isECouncil,
        });
      } catch (error) {
        setUserData(null);
      } finally {
        setLoadingUserData(false);
      }
    }
    if (isSignedIn) fetchUserData();
  }, [isSignedIn]);

  // Fetch vote info
  const fetchVoteInfo = async () => {
    setVoteError(null);
    try {
      const res = await axios.get("/api/vote");
      setVoteInfo(prev => {
        // If options changed (e.g. new vote), reset selection
        if (
          !prev ||
          prev.options.join("|") !== res.data.options.join("|") ||
          prev.started !== res.data.started ||
          prev.ended !== res.data.ended
        ) {
          setSelectedOption("");
        }
        return res.data;
      });
      setVoted(res.data.hasVoted || false);
    } catch (err: any) {
      if (err.response && err.response.data && err.response.data.error) {
        setVoteError(err.response.data.error);
      } else {
        setVoteError("Failed to fetch vote info.");
      }
      // Don't clear voteInfo here; keep showing the last known state
    } finally {
      setVoteLoading(false);
    }
  };

  // Live update: poll every 3 seconds when signed in
  useEffect(() => {
    if (!isSignedIn) return;
    fetchVoteInfo();
    pollingRef.current = setInterval(fetchVoteInfo, 3000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
    // eslint-disable-next-line
  }, [isSignedIn]);

  // Modal handlers
  const handleOpenModal = () => setShowModal(true);
  const handleCloseModal = () => {
    setShowModal(false);
    setVoteType(null);
    setNames([""]);
  };

  const handleVoteTypeSelect = (type: "Election" | "Pledge Vote") => setVoteType(type);

  const handleNameChange = (idx: number, value: string) => {
    setNames((prev) => {
      const updated = [...prev];
      updated[idx] = value;
      return updated;
    });
  };

  const handleAddName = () => setNames((prev) => [...prev, ""]);
  const handleRemoveName = (idx: number) => {
    setNames((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  };

  // Create vote (Election only)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await axios.post("/api/vote/manage", {
        type: "Election",
        options: names.filter((n) => n.trim()),
      });
      handleCloseModal();
      fetchVoteInfo();
    } catch (err: any) {
      alert(err?.response?.data?.error || "Failed to create vote.");
    } finally {
      setSubmitting(false);
    }
  };

  // Vote for an option
  const handleVote = async () => {
    if (!selectedOption) return;
    setSubmitting(true);
    try {
      await axios.post("/api/vote", { choice: selectedOption });
      setVoted(true);
      fetchVoteInfo();
    } catch (err: any) {
      alert(err?.response?.data?.error || "Failed to submit vote.");
    } finally {
      setSubmitting(false);
    }
  };

  // Management actions (E-Council)
  const handleStartVote = async () => {
    setSubmitting(true);
    try {
      await axios.patch("/api/vote/manage", { action: "start" });
      fetchVoteInfo();
    } catch (err: any) {
      alert(err?.response?.data?.error || "Failed to start vote.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEndVote = async () => {
    setSubmitting(true);
    try {
      await axios.patch("/api/vote/manage", { action: "end" });
      fetchVoteInfo();
      handleShowResults(); // Show results after ending
    } catch (err: any) {
      alert(err?.response?.data?.error || "Failed to end vote.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteVote = async () => {
    if (!voteInfo) return;
    if (!voteInfo.ended) {
      if (!window.confirm("The vote is still running. End it before deleting?")) return;
      setSubmitting(true);
      try {
        await axios.patch("/api/vote/manage", { action: "end" });
        await fetchVoteInfo();
      } catch (err: any) {
        alert(err?.response?.data?.error || "Failed to end vote.");
        setSubmitting(false);
        return;
      }
      setSubmitting(false);
    }
    if (window.confirm("Are you sure you want to delete the ended vote? This cannot be undone.")) {
      setSubmitting(true);
      try {
        await axios.delete("/api/vote/manage");
        await fetchVoteInfo();
        window.location.reload(); // Refresh to clear state
      } catch (err: any) {
        alert(err?.response?.data?.error || "Failed to delete vote.");
      } finally {
        setSubmitting(false);
      }
    }
  };

  // Show results
  const handleShowResults = async () => {
    if (!voteInfo?.ended) return; // Only fetch results if vote is ended
    setResultsLoading(true);
    setShowResults(true);
    try {
      const res = await axios.get("/api/vote/manage");
      setVoteResults(res.data);
    } catch (err: any) {
      setVoteResults(null);
      alert(err?.response?.data?.error || "Failed to fetch results.");
    } finally {
      setResultsLoading(false);
    }
  };

  const handleCloseResults = () => {
    setShowResults(false);
    setVoteResults(null);
  };

  if (!isLoaded || loadingUserData) {
    return (
      <div className="container">
        <div className="alert alert-info d-flex align-items-center mt-5" role="alert">
          <FontAwesomeIcon icon={faHourglass} className="h2" />
          <h2>Loading...</h2>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="container">
        <div className="alert alert-danger d-flex align-items-center mt-5" role="alert">
          <FontAwesomeIcon icon={faTimes} className="h2" />
          <h3>You must be logged in to use this function.</h3>
          <RedirectToSignIn />
        </div>
      </div>
    );
  }

  // Only allow "Active" members
  if (!userData || userData.type !== "Active") {
    return (
      <div className="container-xxl mt-4">
        <div>
          <h1>Chapter Voting</h1>
          <div className="alert alert-danger d-flex align-items-center" role="alert">
            <FontAwesomeIcon icon={faTimes} className="me-2" />
            You do not have access to voting. Only active members may vote.
          </div>
        </div>
      </div>
    );
  }

  // Main voting UI
  return (
    <div className="container-xxl mt-4">
      <div>
        <div className="d-flex justify-content-between align-items-center">
          <h1>Chapter Voting</h1>
          <button
            className="btn"
            style={{
              backgroundColor: "#AD2831",
              color: "#fff",
              pointerEvents: userData.isECouncil ? "auto" : "none",
              opacity: userData.isECouncil ? 1 : 0.5,
            }}
            disabled={!userData.isECouncil}
            title={userData.isECouncil ? "Start a new vote" : "Only E-Council may start a vote"}
            onClick={userData.isECouncil ? handleOpenModal : undefined}
          >
            <FontAwesomeIcon icon={faPlay} className="me-2" />
            Start Vote
          </button>
        </div>

        {/* Vote status and options */}
        <div className="mt-3">
          {voteLoading ? (
            <div className="alert alert-info d-flex align-items-center" role="alert">
              <FontAwesomeIcon icon={faHourglass} className="me-2" />
              Loading vote info...
            </div>
          ) : voteInfo && voteInfo.type === "Election" ? (
            <div className="alert alert-success d-flex align-items-center justify-content-between" role="alert">
              <div>
                <FontAwesomeIcon icon={faCheck} className="me-2" />
                <b>
                  Election vote is{" "}
                  {voteInfo.started
                    ? voteInfo.ended
                      ? "ended"
                      : "running"
                    : "created, not started"}
                  .
                </b>
              </div>
              {userData.isECouncil && (
                <div className="ms-3 d-flex gap-2">
                  {!voteInfo.started && !voteInfo.ended && (
                    <Button size="sm" variant="primary" onClick={handleStartVote} disabled={submitting}>
                      <FontAwesomeIcon icon={faPlay} className="me-1" /> Start
                    </Button>
                  )}
                  {voteInfo.started && !voteInfo.ended && (
                    <Button size="sm" variant="danger" onClick={handleEndVote} disabled={submitting}>
                      <FontAwesomeIcon icon={faStop} className="me-1" /> End
                    </Button>
                  )}
                  {/* Only show Results button if vote is ended */}
                  {voteInfo.ended && (
                    <Button size="sm" variant="secondary" onClick={handleShowResults} disabled={resultsLoading}>
                      <FontAwesomeIcon icon={faChartBar} className="me-1" /> Results
                    </Button>
                  )}
                  <Button size="sm" variant="outline-danger" onClick={handleDeleteVote} disabled={submitting}>
                    <FontAwesomeIcon icon={faTimes} className="me-1" /> Delete
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="alert alert-primary d-flex align-items-center" role="alert">
              <FontAwesomeIcon icon={faTriangleExclamation} className="me-2" />
              There are currently no votes running.
            </div>
          )}
        </div>

        {/* Voted alert */}
        {voteInfo && voteInfo.type === "Election" && voteInfo.started && !voteInfo.ended && voted && (
          <div className="alert alert-info d-flex align-items-center mt-3" role="alert">
            <FontAwesomeIcon icon={faCheck} className="me-2" />
            You have voted.
          </div>
        )}

        {/* Voting options */}
        {voteInfo && voteInfo.type === "Election" && voteInfo.started && !voteInfo.ended && !voted && (
          <div className="mt-4">
            <h4>Vote for a Candidate</h4>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleVote();
              }}
            >
              <div className="list-group mb-3">
                {voteInfo.options.map((option) => (
                  <label key={option} className="list-group-item d-flex align-items-center" style={{ cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="voteOption"
                      value={option}
                      checked={selectedOption === option}
                      onChange={() => setSelectedOption(option)}
                      disabled={voted || submitting}
                      className="form-check-input me-2"
                    />
                    {option}
                  </label>
                ))}
              </div>
              <Button
                variant="success"
                type="submit"
                disabled={!selectedOption || voted || submitting}
              >
                {voted ? "Voted" : "Submit Vote"}
              </Button>
            </form>
          </div>
        )}

        {/* Results after vote ended */}
        {userData.isECouncil && voteInfo && voteInfo.type === "Election" && voteInfo.ended && (
          <div className="mt-4">
            <h4>Election Results</h4>
            <Button variant="secondary" onClick={handleShowResults} disabled={resultsLoading}>
              <FontAwesomeIcon icon={faChartBar} className="me-1" /> Show Results
            </Button>
          </div>
        )}

        {/* Results Modal */}
        <Modal show={showResults} onHide={handleCloseResults} centered>
          <Modal.Header closeButton>
            <Modal.Title>Vote Results</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {resultsLoading ? (
              <div className="text-center">
                <FontAwesomeIcon icon={faHourglass} className="me-2" />
                Loading results...
              </div>
            ) : voteResults ? (
              <div>
                <h5>Results</h5>
                <ul className="list-group mb-3">
                  {voteResults.options.map((opt) => (
                    <li className="list-group-item d-flex justify-content-between align-items-center" key={opt}>
                      {opt}
                      <span className="badge bg-primary rounded-pill">{voteResults.results[opt] || 0}</span>
                    </li>
                  ))}
                </ul>
                <div>
                  <b>Total Votes:</b> {voteResults.totalVotes}
                </div>
              </div>
            ) : (
              <div className="text-danger">No results available.</div>
            )}
          </Modal.Body>
        </Modal>

        {/* Voting Modal (Create) */}
        <Modal show={showModal} onHide={handleCloseModal} centered>
          <Modal.Header closeButton>
            <Modal.Title>Start a New Vote</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {!voteType && (
              <div>
                <Button
                  variant="outline-primary"
                  className="w-100 mb-2"
                  onClick={() => handleVoteTypeSelect("Election")}
                >
                  Election
                </Button>
                <Button
                  variant="outline-info"
                  className="w-100 mb-2"
                  disabled
                  // onClick={() => handleVoteTypeSelect("Pledge Vote")}
                >
                  Pledge Vote (coming soon)
                </Button>
              </div>
            )}

            {voteType === "Election" && (
              <form onSubmit={handleSubmit}>
                <h5>Enter Candidate Names</h5>
                {names.map((name, idx) => (
                  <div className="input-group mb-2" key={idx}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder={`Candidate ${idx + 1}`}
                      value={name}
                      onChange={(e) => handleNameChange(idx, e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="btn btn-outline-danger"
                      onClick={() => handleRemoveName(idx)}
                      disabled={names.length === 1}
                    >
                      &times;
                    </button>
                  </div>
                ))}
                <Button
                  variant="secondary"
                  type="button"
                  className="mb-3"
                  onClick={handleAddName}
                >
                  Add Candidate
                </Button>
                <div className="d-flex justify-content-end">
                  <Button
                    variant="success"
                    type="submit"
                    disabled={submitting || names.some((c) => !c.trim())}
                  >
                    {submitting ? "Submitting..." : "Submit"}
                  </Button>
                </div>
              </form>
            )}
          </Modal.Body>
        </Modal>
      </div>
    </div>
  );
}