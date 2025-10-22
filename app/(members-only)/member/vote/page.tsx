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
  faArrowRight,
  faExclamationTriangle,
  faPause,
  faPlus,
  faClock,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
import Button from "react-bootstrap/Button";

type VoteInfo = {
  type: string;
  title?: string;
  options?: string[];
  pledges?: string[];
  started: boolean;
  ended: boolean;
  round?: "board" | "blackball";
  hasVoted?: boolean;
  votedPledges?: Record<string, boolean>;
  abstainedPledges?: Record<string, boolean>;
  totalVotes?: number;
  endTime?: string | null;
  boardResults?: Record<string, { continue: number; board: number }>;
  blackballResults?: Record<string, { continue: number; blackball: number }>;
};

type VoteResults = {
  type: string;
  title?: string;
  options?: string[];
  pledges?: string[];
  started: boolean;
  ended: boolean;
  round?: "board" | "blackball";
  results?: Record<string, number>;
  boardResults?: Record<string, { continue: number; board: number }>;
  blackballResults?: Record<string, { continue: number; blackball: number }>;
  totalVotes: number;
  showBoardOnly?: boolean;
};

export default function VotePage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const [userData, setUserData] = useState<any>(null);
  const [loadingUserData, setLoadingUserData] = useState(true);

  // Start vote state (replaced modal)
  const [showStartVote, setShowStartVote] = useState(false);
  const [voteType, setVoteType] = useState<null | "Election" | "Pledge Vote">(null);
  const [names, setNames] = useState<string[]>([""]);
  const [pledgeNames, setPledgeNames] = useState<string[]>([""]);
  const [electionTitle, setElectionTitle] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Voting state
  const [voteInfo, setVoteInfo] = useState<VoteInfo | null>(null);
  const [voteLoading, setVoteLoading] = useState(true);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<string>("");
  const [pledgeSelections, setPledgeSelections] = useState<Record<string, { board?: string; blackball?: string }>>({});
  const [voted, setVoted] = useState(false);

  // Results
  const [showResults, setShowResults] = useState(false);
  const [voteResults, setVoteResults] = useState<VoteResults | null>(null);
  const [resultsLoading, setResultsLoading] = useState(false);

  // Countdown state
  const [showCountdown, setShowCountdown] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(30);
  const [countdownAction, setCountdownAction] = useState<"end">("end");
  const [currentCountdown, setCurrentCountdown] = useState<number | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [countdownTarget, setCountdownTarget] = useState<string | null>(null);

  // Polling
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

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

  // Countdown timer effect
  useEffect(() => {
    if (voteInfo?.endTime && !voteInfo.ended) {
      const endTime = new Date(voteInfo.endTime).getTime();
      
      const updateCountdown = () => {
        const now = Date.now();
        const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));
        setCurrentCountdown(remaining);
        
        if (remaining === 0) {
          setCurrentCountdown(null);
          setCountdownTarget(null);
          fetchVoteInfo(); // Refresh to get updated state
        }
      };
      
      updateCountdown(); // Initial update
      countdownRef.current = setInterval(updateCountdown, 1000);
      
      // Set the countdown target message
      setCountdownTarget("Vote ending");
    } else {
      setCurrentCountdown(null);
      setCountdownTarget(null);
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    }
    
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [voteInfo?.endTime, voteInfo?.ended]);

  // Fetch vote info
  const fetchVoteInfo = async () => {
    setVoteError(null);
    try {
      const res = await axios.get("/api/vote");
      setVoteInfo(prev => {
        // Election: reset if options or status change
        if (
          res.data.type === "Election" &&
          (
            !prev ||
            prev.options?.join("|") !== res.data.options?.join("|") ||
            prev.started !== res.data.started ||
            prev.ended !== res.data.ended
          )
        ) {
          setSelectedOption("");
        }
        // Pledge: reset if pledges or round change
        if (
          res.data.type === "Pledge" &&
          (
            !prev ||
            prev.pledges?.join("|") !== res.data.pledges?.join("|") ||
            prev.round !== res.data.round ||
            prev.started !== res.data.started ||
            prev.ended !== res.data.ended
          )
        ) {
          setPledgeSelections({});
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

  // Live update: poll every 8 seconds when signed in
  useEffect(() => {
    if (!isSignedIn) return;
    fetchVoteInfo();
    pollingRef.current = setInterval(fetchVoteInfo, 8000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
    // eslint-disable-next-line
  }, [isSignedIn]);

  // Start vote handlers (replaced modal handlers)
  const handleOpenStartVote = () => setShowStartVote(true);
  const handleCloseStartVote = () => {
    setShowStartVote(false);
    setVoteType(null);
    setNames([""]);
    setPledgeNames([""]);
    setElectionTitle("");
  };

  const handleVoteTypeSelect = (type: "Election" | "Pledge Vote") => setVoteType(type);

  const handleNameChange = (idx: number, value: string) => {
    setNames((prev) => {
      const updated = [...prev];
      updated[idx] = value;
      return updated;
    });
  };

  const handlePledgeNameChange = (idx: number, value: string) => {
    setPledgeNames((prev) => {
      const updated = [...prev];
      updated[idx] = value;
      return updated;
    });
  };

  const handleAddName = () => setNames((prev) => [...prev, ""]);
  const handleRemoveName = (idx: number) => {
    setNames((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  };

  const handleAddPledge = () => setPledgeNames((prev) => [...prev, ""]);
  const handleRemovePledge = (idx: number) => {
    setPledgeNames((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  };

  // Create vote (Election or Pledge)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (voteType === "Election") {
        await axios.post("/api/vote/manage", {
          type: "Election",
          options: names.filter((n) => n.trim()),
          title: electionTitle.trim() || undefined,
        });
      } else if (voteType === "Pledge Vote") {
        await axios.post("/api/vote/manage", {
          type: "Pledge",
          pledges: pledgeNames.filter((n) => n.trim()),
        });
      }
      handleCloseStartVote();
      fetchVoteInfo();
    } catch (err: any) {
      alert(err?.response?.data?.error || "Failed to create vote.");
    } finally {
      setSubmitting(false);
    }
  };

  // Vote for an option (Election)
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

  // Vote for pledges (Pledge) - submit all at once with confirmation
  const handlePledgeBallot = async () => {
    if (!voteInfo?.pledges) return;
    
    setSubmitting(true);
    try {
      const ballot = voteInfo.pledges.map((pledge) => {
        const boardChoice = pledgeSelections[pledge]?.board;
        const blackballChoice = pledgeSelections[pledge]?.blackball;
        
        return {
          pledge,
          boardChoice: boardChoice || "Abstain",
          blackballChoice: blackballChoice || "Abstain",
        };
      });

      await axios.post("/api/vote", { ballot });
      fetchVoteInfo();
    } catch (err: any) {
      alert(err?.response?.data?.error || "Failed to submit ballot.");
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

  // Show countdown box for end vote
  const handleShowEndCountdown = () => {
    setCountdownAction("end");
    setShowCountdown(true);
  };

  // Close countdown box
  const handleCloseCountdown = () => {
    setShowCountdown(false);
    setCountdownSeconds(30);
  };

  // Execute end vote with countdown
  const handleExecuteEnd = async (immediate = false) => {
    setSubmitting(true);
    try {
      await axios.patch("/api/vote/manage", { 
        action: "end",
        countdown: immediate ? 0 : countdownSeconds
      });
      setShowCountdown(false);
      setCountdownSeconds(30);
      fetchVoteInfo();
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

  // Show results - modified to handle board-only results
  const handleShowResults = async (boardOnly = false) => {
    setResultsLoading(true);
    setShowResults(true);
    try {
      const res = await axios.get("/api/vote/manage");
      // If boardOnly is true, remove blackball results from the response
      if (boardOnly && res.data.blackballResults) {
        setVoteResults({
          ...res.data,
          blackballResults: undefined, // Hide blackball results
          showBoardOnly: true, // Flag to indicate board-only view
        });
      } else {
        setVoteResults({
          ...res.data,
          showBoardOnly: false,
        });
      }
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

  // Helper for pledge badge
  function getPledgeBadge(
    pledge: string,
    boardResults?: any,
    blackballResults?: any
  ) {
    // Blackball round: check blackball first, then board
    if (blackballResults && blackballResults[pledge]) {
      if (blackballResults[pledge].blackball > 0) {
        return { variant: "danger", icon: faTimes, text: "Blackball" };
      }
      if (blackballResults[pledge].continue > 0) {
        return { variant: "success", icon: faCheck, text: "Continue" };
      }
    }
    // Board round: check board
    if (boardResults && boardResults[pledge]) {
      if (boardResults[pledge].board > 0) {
        return { variant: "warning", icon: faExclamationTriangle, text: "Board" };
      }
      if (boardResults[pledge].continue > 0) {
        return { variant: "success", icon: faCheck, text: "Continue" };
      }
    }
    return null;
  }

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
              pointerEvents:
                userData.isECouncil && !(voteInfo && voteInfo.started && !voteInfo.ended)
                  ? "auto"
                  : "none",
              opacity:
                userData.isECouncil && !(voteInfo && voteInfo.started && !voteInfo.ended)
                  ? 1
                  : 0.5,
            }}
            disabled={
              !userData.isECouncil ||
              !!(voteInfo && voteInfo.started && !voteInfo.ended)
            }
            title={
              !userData.isECouncil
                ? "Only E-Council may start a vote"
                : voteInfo && voteInfo.started && !voteInfo.ended
                ? "A vote is already running"
                : "Start a new vote"
            }
            onClick={
              userData.isECouncil && !(voteInfo && voteInfo.started && !voteInfo.ended)
                ? handleOpenStartVote
                : undefined
            }
          >
            <FontAwesomeIcon icon={faPlay} className="me-2" />
            Start Vote
          </button>
        </div>

        {/* Countdown Alert */}
        {currentCountdown !== null && countdownTarget && (
          <div className="alert alert-danger d-flex align-items-center mt-3" role="alert">
            <FontAwesomeIcon icon={faClock} className="me-2" />
            <div className="flex-grow-1">
              <b>{countdownTarget} in {currentCountdown} second{currentCountdown !== 1 ? 's' : ''}...</b>
            </div>
          </div>
        )}

        {/* Vote status and options */}
        <div className="mt-3">
          {voteLoading ? (
            <div className="alert alert-info d-flex align-items-center" role="alert">
              <FontAwesomeIcon icon={faHourglass} className="me-2" />
              Loading vote info...
            </div>
          ) : voteInfo && voteInfo.type === "Election" ? (
            <div className={`alert ${voteInfo.started && !voteInfo.ended ? 'alert-success' : 'alert-warning'} d-flex align-items-center justify-content-between`} role="alert">
              <div className="d-flex align-items-center">
                <FontAwesomeIcon icon={voteInfo.started && !voteInfo.ended ? faCheck : faPause} className="me-2" />
                <div>
                  <b>
                    Election vote is{" "}
                    {voteInfo.started
                      ? voteInfo.ended
                        ? "completed"
                        : "running"
                      : "suspended"}
                    .
                  </b>
                  {voteLoading && (
                    <span className="ms-2 text-muted">
                      <FontAwesomeIcon icon={faHourglass} spin />
                    </span>
                  )}
                </div>
              </div>
              
              <div className="d-flex align-items-center gap-2">
                {typeof voteInfo.totalVotes === "number" && (
                  <span className="badge bg-info text-dark">
                    {voteInfo.totalVotes} ballot{voteInfo.totalVotes === 1 ? "" : "s"} received
                  </span>
                )}
                
                {userData.isECouncil && (
                  <div className="d-flex gap-2">
                    {!voteInfo.started && !voteInfo.ended && (
                      <Button size="sm" variant="primary" onClick={handleStartVote} disabled={submitting}>
                        <FontAwesomeIcon icon={faPlay} className="me-1" /> Start
                      </Button>
                    )}
                    {voteInfo.started && !voteInfo.ended && (
                      <Button size="sm" variant="danger" onClick={handleShowEndCountdown} disabled={submitting}>
                        <FontAwesomeIcon icon={faStop} className="me-1" /> End
                      </Button>
                    )}
                    {voteInfo.ended && (
                      <Button size="sm" variant="primary" onClick={() => handleShowResults()} disabled={resultsLoading}>
                        <FontAwesomeIcon icon={faChartBar} className="me-1" /> Results
                      </Button>
                    )}
                    <Button size="sm" variant="outline-danger" onClick={handleDeleteVote} disabled={submitting}>
                      <FontAwesomeIcon icon={faTimes} className="me-1" /> Delete
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ) : voteInfo && voteInfo.type === "Pledge" ? (
            <div className={`alert ${voteInfo.started && !voteInfo.ended ? 'alert-success' : 'alert-warning'} d-flex align-items-center justify-content-between`} role="alert">
              <div className="d-flex align-items-center">
                <FontAwesomeIcon icon={voteInfo.started && !voteInfo.ended ? faCheck : faPause} className="me-2" />
                <div>
                  <b>
                    Pledge vote is{" "}
                    {voteInfo.started
                      ? voteInfo.ended
                        ? "completed"
                        : voteInfo.round === "blackball"
                        ? "on blackball round"
                        : "on board round"
                      : "suspended"}
                    .
                  </b>
                  {voteLoading && (
                    <span className="ms-2 text-muted">
                      <FontAwesomeIcon icon={faHourglass} spin />
                    </span>
                  )}
                </div>
              </div>
              
              <div className="d-flex align-items-center gap-2">
                {typeof voteInfo.totalVotes === "number" && voteInfo.pledges?.length && (
                  <span className="badge bg-info text-dark">
                    {Math.floor(voteInfo.totalVotes / voteInfo.pledges.length)} active{Math.floor(voteInfo.totalVotes / voteInfo.pledges.length) === 1 ? "" : "s"} voted
                  </span>
                )}
                
                {userData.isECouncil && (
                  <div className="d-flex gap-2">
                    {!voteInfo.started && !voteInfo.ended && (
                      <Button size="sm" variant="primary" onClick={handleStartVote} disabled={submitting}>
                        <FontAwesomeIcon icon={faPlay} className="me-1" /> Start
                      </Button>
                    )}
                    {voteInfo.started && !voteInfo.ended && (
                      <Button 
                        size="sm" 
                        variant="danger"
                        onClick={handleShowEndCountdown} 
                        disabled={submitting}
                      >
                        <FontAwesomeIcon icon={faStop} className="me-1" /> End
                      </Button>
                    )}
                    {voteInfo.ended && (
                      <Button size="sm" variant="primary" onClick={() => handleShowResults()} disabled={resultsLoading}>
                        <FontAwesomeIcon icon={faChartBar} className="me-1" /> Results
                      </Button>
                    )}
                    <Button size="sm" variant="outline-danger" onClick={handleDeleteVote} disabled={submitting}>
                      <FontAwesomeIcon icon={faTimes} className="me-1" /> Delete
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="alert alert-dark d-flex align-items-center" role="alert">
              No votes are running.
            </div>
          )}
        </div>

        {/* Start Vote Container (replaced modal) */}
        {showStartVote && (
          <div className="mt-4 border rounded p-4" style={{ backgroundColor: "#e7f3ff" }}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h4 className="mb-0">
                <FontAwesomeIcon icon={faPlay} className="me-2" />
                Start New Vote
              </h4>
              <Button size="sm" variant="outline-secondary" onClick={handleCloseStartVote}>
                <FontAwesomeIcon icon={faTimes} className="me-1" />
                Cancel
              </Button>
            </div>

            {!voteType && (
              <div className="d-flex gap-3">
                <Button
                  variant="primary"
                  className="flex-fill"
                  onClick={() => handleVoteTypeSelect("Election")}
                >
                  <FontAwesomeIcon icon={faCheck} className="me-2" />
                  Election
                </Button>
                <Button
                  variant="warning"
                  className="flex-fill"
                  onClick={() => handleVoteTypeSelect("Pledge Vote")}
                >
                  <FontAwesomeIcon icon={faUser} className="me-2" />
                  Pledge Vote
                </Button>
              </div>
            )}

            {voteType === "Election" && (
              <form onSubmit={handleSubmit}>
                <h5 className="mb-3">Enter Election Details</h5>
                <div className="mb-3">
                  <label htmlFor="electionTitle" className="form-label">Title (optional)</label>
                  <input
                    type="text"
                    className="form-control"
                    id="electionTitle"
                    value={electionTitle}
                    onChange={(e) => setElectionTitle(e.target.value)}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Options</label>
                  {names.map((name, idx) => (
                    <div className="input-group mb-2" key={idx}>
                      <input
                        type="text"
                        className="form-control"
                        placeholder={`Option ${idx + 1}`}
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
                        <FontAwesomeIcon icon={faTimes} />
                      </button>
                    </div>
                  ))}
                  <Button
                    variant="outline-primary"
                    type="button"
                    size="sm"
                    onClick={handleAddName}
                  >
                    <FontAwesomeIcon icon={faPlus} className="me-1" />
                    Add Candidate
                  </Button>
                </div>
                <div className="d-flex gap-2 justify-content-end">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => setVoteType(null)}
                  >
                    Back
                  </Button>
                  <Button
                    variant="success"
                    type="submit"
                    disabled={submitting || names.some((c) => !c.trim())}
                  >
                    {submitting ? "Creating..." : "Create Election"}
                  </Button>
                </div>
              </form>
            )}

            {voteType === "Pledge Vote" && (
              <form onSubmit={handleSubmit}>
                <h5 className="mb-3">Enter Pledge Names</h5>
                <div className="mb-3">
                  <label className="form-label">Pledges</label>
                  {pledgeNames.map((name, idx) => (
                    <div className="input-group mb-2" key={idx}>
                      <input
                        type="text"
                        className="form-control"
                        placeholder={`Pledge ${idx + 1}`}
                        value={name}
                        onChange={(e) => handlePledgeNameChange(idx, e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        className="btn btn-outline-danger"
                        onClick={() => handleRemovePledge(idx)}
                        disabled={pledgeNames.length === 1}
                      >
                        <FontAwesomeIcon icon={faTimes} />
                      </button>
                    </div>
                  ))}
                  <Button
                    variant="outline-primary"
                    type="button"
                    size="sm"
                    onClick={handleAddPledge}
                  >
                    <FontAwesomeIcon icon={faPlus} className="me-1" />
                    Add Pledge
                  </Button>
                </div>
                <div className="d-flex gap-2 justify-content-end">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => setVoteType(null)}
                  >
                    Back
                  </Button>
                  <Button
                    variant="success"
                    type="submit"
                    disabled={submitting || pledgeNames.some((c) => !c.trim())}
                  >
                    {submitting ? "Creating..." : "Create Pledge Vote"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Countdown Control Container */}
        {showCountdown && (
          <div className="mt-4 border rounded p-4" style={{ backgroundColor: "#e7f3ff" }}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h4 className="mb-0">
                <FontAwesomeIcon icon={faClock} className="me-2" />
                End Vote
              </h4>
              <Button size="sm" variant="outline-secondary" onClick={handleCloseCountdown}>
                <FontAwesomeIcon icon={faTimes} className="me-1" />
                Cancel
              </Button>
            </div>
            
            <div className="mb-3">
              <label htmlFor="countdownInput" className="form-label">
                Countdown time (seconds):
              </label>
              <input
                type="number"
                className="form-control"
                id="countdownInput"
                value={countdownSeconds}
                onChange={(e) => setCountdownSeconds(Math.max(0, parseInt(e.target.value) || 0))}
                min="0"
                max="300"
              />
              <small className="form-text text-muted">
                Set to 0 for immediate action. Maximum 300 seconds (5 minutes).
              </small>
            </div>
            
            <div className="d-flex gap-2">
              <Button
                variant="danger"
                onClick={() => handleExecuteEnd(true)}
                disabled={submitting}
              >
                <FontAwesomeIcon icon={faStop} className="me-1" />
                End Immediately
              </Button>
              <Button
                variant="warning"
                onClick={() => handleExecuteEnd(false)}
                disabled={submitting || countdownSeconds === 0}
              >
                <FontAwesomeIcon icon={faClock} className="me-1" />
                End in {countdownSeconds}s
              </Button>
            </div>
          </div>
        )}

        {/* Voted alert */}
        {voteInfo && voteInfo.type === "Election" && voteInfo.started && !voteInfo.ended && voted && (
          <div className="alert alert-info d-flex align-items-center mt-3" role="alert">
            <FontAwesomeIcon icon={faCheck} className="me-2" />
            Your vote has been counted.
          </div>
        )}

        {/* Voting options: Election */}
        {voteInfo && voteInfo.type === "Election" && voteInfo.started && !voteInfo.ended && !voted && (
          <div className="mt-4">
            <h4>{voteInfo.title ? `${voteInfo.title}` : "Vote for an option"}</h4>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleVote();
              }}
            >
              <div className="list-group mb-3">
                {voteInfo.options?.map((option, index) => (
                  <label 
                    key={option} 
                    className={`list-group-item d-flex align-items-center ${index % 2 === 1 ? 'bg-light' : ''}`} 
                    style={{ cursor: "pointer" }}
                  >
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
                {/* Add Abstain option */}
                <label 
                  className={`list-group-item d-flex align-items-center text-muted ${(voteInfo.options?.length || 0) % 2 === 1 ? 'bg-light' : ''}`}
                  style={{ cursor: "pointer" }}
                >
                  <input
                    type="radio"
                    name="voteOption"
                    value="Abstain"
                    checked={selectedOption === "Abstain"}
                    onChange={() => setSelectedOption("Abstain")}
                    disabled={voted || submitting}
                    className="form-check-input me-2"
                  />
                  Abstain
                </label>
              </div>
              <Button
                variant="success"
                type="button"
                disabled={!selectedOption || voted || submitting}
                onClick={() => setShowConfirmDialog(true)}
              >
                {voted ? "Voted" : "Submit Vote"}
              </Button>
            </form>
          </div>
        )}

        {/* Voting options: Pledge */}
        {voteInfo && voteInfo.type === "Pledge" && voteInfo.started && !voteInfo.ended && voteInfo.pledges && (
          <div className="mt-4">
            <h4>
              {voteInfo.round === "board"
                ? "Board Round: Vote for Each Pledge"
                : "Blackball Round: Vote for Each Pledge"}
            </h4>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handlePledgeBallot();
              }}
            >
              <div className="list-group mb-3">
                {voteInfo.pledges.map((pledge, index) => {
                  const votedForThis = voteInfo.votedPledges?.[pledge];
                  const abstainedForThis = voteInfo.abstainedPledges?.[pledge];
                  const options =
                    voteInfo.round === "board"
                      ? ["Continue", "Board"]
                      : ["Continue", "Blackball"];
                  return (
                    <div
                      key={pledge}
                      className={`list-group-item d-flex align-items-center ${index % 2 === 1 ? 'bg-light' : ''}`}
                    >
                      <div className="flex-grow-1">
                        <b>{pledge}</b>
                      </div>
                      {votedForThis ? (
                        abstainedForThis ? (
                          <span className="badge text-dark bg-warning ms-2">
                            Abstained
                          </span>
                        ) : (
                          <span className="badge bg-success ms-2">
                            Voted
                          </span>
                        )
                      ) : (
                        <div className="row g-4">
                          {/* Board Vote Column */}
                          <div className="col-md-6">
                            <h6 className="text-primary mb-3 text-center fw-bold">Board</h6>
                            <div className="d-grid gap-2">
                              {['Continue', 'Board', 'Abstain'].map((opt) => (
                                <button
                                  key={`board-${opt}`}
                                  type="button"
                                  className={`btn btn-sm ${
                                    pledgeSelections[pledge]?.board === opt
                                      ? opt === 'Board' 
                                        ? 'btn-warning text-dark fw-bold' 
                                        : opt === 'Continue'
                                        ? 'btn-success fw-bold'
                                        : 'btn-secondary fw-bold'
                                      : 'btn-outline-secondary'
                                  }`}
                                  onClick={() =>
                                    setPledgeSelections((prev) => ({
                                      ...prev,
                                      [pledge]: {
                                        ...prev[pledge],
                                        board: prev[pledge]?.board === opt ? undefined : opt,
                                      },
                                    }))
                                  }
                                  disabled={submitting}
                                >
                                  {opt === 'Continue' && <span className="me-1">✓</span>}
                                  {opt === 'Board' && <span className="me-1">⚠</span>}
                                  {opt === 'Abstain' && <span className="me-1">—</span>}
                                  {opt}
                                </button>
                              ))}
                            </div>
                          </div>
                          
                          {/* Blackball Vote Column */}
                          <div className="col-md-6">
                            <h6 className="text-danger mb-3 text-center fw-bold">Blackball</h6>
                            <div className="d-grid gap-2">
                              {['Continue', 'Blackball', 'Abstain'].map((opt) => (
                                <button
                                  key={`blackball-${opt}`}
                                  type="button"
                                  className={`btn btn-sm ${
                                    pledgeSelections[pledge]?.blackball === opt
                                      ? opt === 'Blackball' 
                                        ? 'btn-danger fw-bold' 
                                        : opt === 'Continue'
                                        ? 'btn-success fw-bold'
                                        : 'btn-secondary fw-bold'
                                      : 'btn-outline-secondary'
                                  }`}
                                  onClick={() =>
                                    setPledgeSelections((prev) => ({
                                      ...prev,
                                      [pledge]: {
                                        ...prev[pledge],
                                        blackball: prev[pledge]?.blackball === opt ? undefined : opt,
                                      },
                                    }))
                                  }
                                  disabled={submitting}
                                >
                                  {opt === 'Continue' && <span className="me-1">✓</span>}
                                  {opt === 'Blackball' && <span className="me-1">✕</span>}
                                  {opt === 'Abstain' && <span className="me-1">—</span>}
                                  {opt}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Show submit button if not all pledges have been voted for */}
              {voteInfo.pledges.some((pledge) => !voteInfo.votedPledges?.[pledge]) && (
                <Button
                  variant="success"
                  type="button"
                  disabled={
                    submitting || 
                    !voteInfo.pledges.every((pledge) => 
                      !voteInfo.votedPledges?.[pledge] ? 
                        pledgeSelections[pledge]?.board && pledgeSelections[pledge]?.blackball 
                        : true
                    )
                  }
                  onClick={() => setShowConfirmDialog(true)}
                >
                  Submit Ballot
                </Button>
              )}
            </form>
            <br />
            {/* Board round results (live, ECouncil only, during board round) */}
            {userData.isECouncil && voteInfo.round === "board" && voteInfo.boardResults && (
              <div className="mt-4">
                <h5>Board Round Results</h5>
                <ul className="list-group">
                  {voteInfo.pledges.map((pledge, index) => {
                    const res = voteInfo.boardResults?.[pledge] || { continue: 0, board: 0 };
                    const badge = getPledgeBadge(pledge, voteInfo.boardResults, undefined);
                    return (
                      <li
                        key={pledge}
                        className={`list-group-item d-flex align-items-center ${index % 2 === 1 ? 'bg-light' : ''}`}
                      >
                        <b className="flex-grow-1">{pledge}</b>
                        <span className="me-3">
                          <FontAwesomeIcon icon={faCheck} className="text-success me-1" />
                          {res.continue}
                        </span>
                        <span className="me-3">
                          <FontAwesomeIcon icon={faExclamationTriangle} className="text-warning me-1" />
                          {res.board}
                        </span>
                        {badge && (
                          <span className={`badge bg-${badge.variant} ms-2`}>
                            <FontAwesomeIcon icon={badge.icon} className="me-1" />
                            {badge.text}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {/* Blackball round results (live, ECouncil only, during blackball round) */}
            {userData.isECouncil && voteInfo.round === "blackball" && voteInfo.blackballResults && (
              <div className="mt-4">
                <h5>Blackball Round Results</h5>
                <ul className="list-group">
                  {voteInfo.pledges.map((pledge, index) => {
                    const res = voteInfo.blackballResults?.[pledge] || { continue: 0, blackball: 0 };
                    const badge = getPledgeBadge(pledge, voteInfo.boardResults, voteInfo.blackballResults);
                    return (
                      <li
                        key={pledge}
                        className={`list-group-item d-flex align-items-center ${index % 2 === 1 ? 'bg-light' : ''}`}
                      >
                        <b className="flex-grow-1">{pledge}</b>
                        <span className="me-3">
                          <FontAwesomeIcon icon={faCheck} className="text-success me-1" />
                          {res.continue}
                        </span>
                        <span className="me-3">
                          <FontAwesomeIcon icon={faTimes} className="text-danger me-1" />
                          {res.blackball}
                        </span>
                        {badge && (
                          <span className={`badge bg-${badge.variant} ms-2`}>
                            <FontAwesomeIcon icon={badge.icon} className="me-1" />
                            {badge.text}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Results Container */}
        {showResults && (
          <div className="mt-4 border rounded p-4" style={{ backgroundColor: "#f8f9fa" }}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h4 className="mb-0">
                {voteResults?.showBoardOnly ? "Board Round Results" : 
                 voteResults?.type === "Election" && voteResults?.title ? 
                 `${voteResults.title} - Results` : "Vote Results"}
              </h4>
              <Button size="sm" variant="outline-secondary" onClick={handleCloseResults}>
                <FontAwesomeIcon icon={faTimes} className="me-1" />
                Close
              </Button>
            </div>
            
            {resultsLoading ? (
              <div className="text-center">
                <FontAwesomeIcon icon={faHourglass} className="me-2" />
                Loading results...
              </div>
            ) : voteResults ? (
              <div>
                {voteResults.type === "Election" && (
                  <>
                    <h5>Results</h5>
                    <ul className="list-group mb-3">
                      {voteResults.options?.map((opt, index) => (
                        <li 
                          className={`list-group-item d-flex justify-content-between align-items-center ${index % 2 === 1 ? 'bg-light' : ''}`} 
                          key={opt}
                        >
                          {opt}
                          <span className="badge bg-primary rounded-pill">{voteResults.results?.[opt] || 0}</span>
                        </li>
                      ))}
                    </ul>
                    <div>
                      <b>Total Actives Voted:</b> {voteResults.totalVotes}
                    </div>
                  </>
                )}
                {voteResults.type === "Pledge" && (
                  <>
                    <h5>Board Round Results</h5>
                    <ul className="list-group mb-3">
                      {voteResults.pledges?.map((pledge, index) => {
                        const res = voteResults.boardResults?.[pledge] || { continue: 0, board: 0 };
                        const badge = getPledgeBadge(pledge, voteResults.boardResults, undefined);
                        return (
                          <li
                            key={pledge}
                            className={`list-group-item d-flex align-items-center ${index % 2 === 1 ? 'bg-light' : ''}`}
                          >
                            <b className="flex-grow-1">{pledge}</b>
                            <span className="me-3">
                              <FontAwesomeIcon icon={faCheck} className="me-1" />
                              {res.continue}
                            </span>
                            <span className="me-3">
                              <FontAwesomeIcon icon={faExclamationTriangle} className="me-1" />
                              {res.board}
                            </span>
                            {badge && (
                              <span className={`badge bg-${badge.variant} ms-2`}>
                                <FontAwesomeIcon icon={badge.icon} className="me-1" />
                                {badge.text}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {/* Only show blackball results if not board-only view */}
                    {!voteResults.showBoardOnly && voteResults.blackballResults && (
                      <>
                        <h5>Blackball Round Results</h5>
                        <ul className="list-group mb-3">
                          {voteResults.pledges?.map((pledge, index) => {
                            const res = voteResults.blackballResults?.[pledge] || { continue: 0, blackball: 0 };
                            const badge = getPledgeBadge(pledge, voteResults.boardResults, voteResults.blackballResults);
                            return (
                              <li
                                key={pledge}
                                className={`list-group-item d-flex align-items-center ${index % 2 === 1 ? 'bg-light' : ''}`}
                              >
                                <b className="flex-grow-1">{pledge}</b>
                                <span className="me-3">
                                  <FontAwesomeIcon icon={faCheck} className="me-1" />
                                  {res.continue}
                                </span>
                                <span className="me-3">
                                  <FontAwesomeIcon icon={faTimes} className="me-1" />
                                  {res.blackball}
                                </span>
                                {badge && (
                                  <span className={`badge bg-${badge.variant} ms-2`}>
                                    <FontAwesomeIcon icon={badge.icon} className="me-1" />
                                    {badge.text}
                                  </span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </>
                    )}
                    <div>
                      <b>Total Actives Voted:</b> {voteResults.totalVotes && voteResults.pledges?.length ? Math.floor(voteResults.totalVotes / voteResults.pledges.length) : 0}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="text-danger">No results available.</div>
            )}
          </div>
        )}

        {/* Confirmation Dialog */}
        {showConfirmDialog && (
          <div className="modal d-block" tabIndex={-1} style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">
                    <FontAwesomeIcon icon={faCheck} className="me-2" />
                    Confirm Ballot Submission
                  </h5>
                </div>
                <div className="modal-body">
                  {voteInfo?.type === "Election" ? (
                    <p>
                      Are you sure you want to submit your vote for <strong>{selectedOption}</strong>?
                    </p>
                  ) : (
                    <div>
                      {(() => {
                        const significantVotes = voteInfo?.pledges?.filter((pledge) => {
                          const selection = pledgeSelections[pledge];
                          return (selection?.board && selection.board !== "Continue" && selection.board !== "Abstain") ||
                                 (selection?.blackball && selection.blackball !== "Continue" && selection.blackball !== "Abstain");
                        }) || [];

                        if (significantVotes.length > 0) {
                          return (
                            <>
                              <p>Are you sure you want to submit your pledge ballot with the following votes?</p>
                              <div className="mt-3">
                                {significantVotes.map((pledge) => {
                                  const selection = pledgeSelections[pledge];
                                  const boardVote = selection?.board;
                                  const blackballVote = selection?.blackball;
                                  const showBoard = boardVote && boardVote !== "Continue" && boardVote !== "Abstain";
                                  const showBlackball = blackballVote && blackballVote !== "Continue" && blackballVote !== "Abstain";
                                  
                                  return (
                                    <div key={pledge} className="mb-2">
                                      <strong>{pledge}:</strong>
                                      <div className="ms-3">
                                        {showBoard && (
                                          <span className="badge bg-warning text-dark me-2">{boardVote}</span>
                                        )}
                                        {showBlackball && (
                                          <span className="badge bg-danger">{blackballVote}</span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </>
                          );
                        } else {
                          return <p>Are you sure you want to submit your pledge ballot? All pledges will receive Continue/Abstain votes.</p>;
                        }
                      })()}
                    </div>
                  )}
                  <p className="text-warning mt-3">
                    <FontAwesomeIcon icon={faExclamationTriangle} className="me-1" />
                    This action cannot be undone.
                  </p>
                </div>
                <div className="modal-footer">
                  <Button
                    variant="secondary"
                    onClick={() => setShowConfirmDialog(false)}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="success"
                    onClick={() => {
                      setShowConfirmDialog(false);
                      if (voteInfo?.type === "Election") {
                        handleVote();
                      } else {
                        handlePledgeBallot();
                      }
                    }}
                    disabled={
                      submitting || 
                      (voteInfo?.type === "Pledge" && 
                        !voteInfo.pledges?.every((pledge) => 
                          voteInfo.votedPledges?.[pledge] || 
                          (pledgeSelections[pledge]?.board && pledgeSelections[pledge]?.blackball)
                        )
                      )
                    }
                  >
                    <FontAwesomeIcon icon={faCheck} className="me-1" />
                    {submitting ? "Submitting..." : "Confirm & Submit"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}