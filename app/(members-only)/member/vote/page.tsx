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
} from "@fortawesome/free-solid-svg-icons";
import Modal from "react-bootstrap/Modal";
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
  totalVotes?: number;
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

  // Modal state
  const [showModal, setShowModal] = useState(false);
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
  const [pledgeSelections, setPledgeSelections] = useState<Record<string, string>>({});
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

  // Modal handlers
  const handleOpenModal = () => setShowModal(true);
  const handleCloseModal = () => {
    setShowModal(false);
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
      handleCloseModal();
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

  // Vote for pledges (Pledge) - submit all at once, with abstentions as "Continue"
  const handlePledgeBallot = async () => {
    if (!voteInfo?.pledges) return;
    setSubmitting(true);
    try {
      await axios.post("/api/vote", {
        ballot: voteInfo.pledges.map((pledge) => ({
          pledge,
          // If no selection made, default to "Continue" (abstention)
          choice: pledgeSelections[pledge] || "Continue",
        })),
      });
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

  const handleNextRound = async () => {
    setSubmitting(true);
    try {
      await axios.patch("/api/vote/manage", { action: "nextRound" });
      fetchVoteInfo();
    } catch (err: any) {
      alert(err?.response?.data?.error || "Failed to move to next round.");
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

  // Helper for pledge status
  function getPledgeStatus(
    pledge: string,
    boardResults?: any,
    blackballResults?: any
  ) {
    // Blackball round: check blackball
    if (blackballResults && blackballResults[pledge]) {
      if (blackballResults[pledge].blackball > 0) {
        return { color: "bg-danger text-white", icon: faTimes, show: true };
      }
      if (blackballResults[pledge].continue > 0) {
        return { color: "bg-success text-white", icon: faCheck, show: true };
      }
      // If no continue and no blackball, treat as failed (X)
      return { color: "bg-danger text-white", icon: faTimes, show: true };
    }
    // Board round: check board
    if (boardResults && boardResults[pledge]) {
      if (boardResults[pledge].board > 0) {
        return { color: "bg-warning text-dark", icon: faExclamationTriangle, show: true };
      }
      if (boardResults[pledge].continue > 0) {
        return { color: "bg-success text-white", icon: faCheck, show: true };
      }
      // If no continue and no board, treat as warning
      return { color: "bg-warning text-dark", icon: faExclamationTriangle, show: true };
    }
    return { color: "", icon: null, show: false };
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
                ? handleOpenModal
                : undefined
            }
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
                      <Button size="sm" variant="danger" onClick={handleEndVote} disabled={submitting}>
                        <FontAwesomeIcon icon={faStop} className="me-1" /> End
                      </Button>
                    )}
                    {voteInfo.ended && (
                      <Button size="sm" variant="secondary" onClick={() => handleShowResults()} disabled={resultsLoading}>
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
                      <>
                        {/* Only show End button in blackball round, gray out in board round */}
                        <Button 
                          size="sm" 
                          variant={voteInfo.round === "board" ? "secondary" : "danger"}
                          onClick={handleEndVote} 
                          disabled={submitting || voteInfo.round === "board"}
                          title={voteInfo.round === "board" ? "Cannot end during board round - use Next Round instead" : "End vote"}
                        >
                          <FontAwesomeIcon icon={faStop} className="me-1" /> End
                        </Button>
                        {voteInfo.round === "board" && (
                          <Button size="sm" variant="warning" onClick={handleNextRound} disabled={submitting}>
                            <FontAwesomeIcon icon={faArrowRight} className="me-1" /> Next Round
                          </Button>
                        )}
                        {/* Show board results button during blackball round */}
                        {voteInfo.round === "blackball" && voteInfo.boardResults && (
                          <Button size="sm" variant="info" onClick={() => handleShowResults(true)} disabled={resultsLoading}>
                            <FontAwesomeIcon icon={faChartBar} className="me-1" /> Board Results
                          </Button>
                        )}
                      </>
                    )}
                    {voteInfo.ended && (
                      <Button size="sm" variant="secondary" onClick={() => handleShowResults()} disabled={resultsLoading}>
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
            <div className="alert alert-primary d-flex align-items-center" role="alert">
              <FontAwesomeIcon icon={faTriangleExclamation} className="me-2" />
              There are currently no votes running.
            </div>
          )}
        </div>

        {/* Between rounds notice for E-Council with Board Results button */}
        {userData.isECouncil && voteInfo && voteInfo.type === "Pledge" && !voteInfo.started && !voteInfo.ended && voteInfo.round === "blackball" && (
          <div className="alert alert-primary d-flex align-items-center justify-content-between mt-3" role="alert">
            <div>
              <FontAwesomeIcon icon={faHourglass} className="me-2" />
              <b>Pledge vote is paused between board and blackball rounds.</b>
            </div>
            <Button size="sm" variant="info" onClick={() => handleShowResults(true)} disabled={resultsLoading}>
              <FontAwesomeIcon icon={faChartBar} className="me-1" /> View Board Results
            </Button>
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
                type="submit"
                disabled={!selectedOption || voted || submitting}
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
            <div className="alert alert-info mb-3">
              <small>
                <strong>Note:</strong> You may leave pledges blank to abstain from voting on them. 
              </small>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handlePledgeBallot();
              }}
            >
              <div className="list-group mb-3">
                {voteInfo.pledges.map((pledge, index) => {
                  const votedForThis = voteInfo.votedPledges?.[pledge];
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
                        <span className="badge bg-success ms-2">
                          Voted
                        </span>
                      ) : (
                        <>
                          {options.map((opt) => (
                            <label key={opt} className="me-2 mb-0">
                              <input
                                type="radio"
                                name={`pledge-${pledge}`}
                                value={opt}
                                checked={pledgeSelections[pledge] === opt}
                                onChange={() =>
                                  setPledgeSelections((prev) => ({
                                    ...prev,
                                    [pledge]: opt,
                                  }))
                                }
                                disabled={submitting}
                                className="form-check-input me-1"
                              />
                              {opt}
                            </label>
                          ))}
                          <label className="me-2 mb-0 text-muted">
                            <input
                              type="radio"
                              name={`pledge-${pledge}`}
                              value=""
                              checked={!pledgeSelections[pledge]}
                              onChange={() =>
                                setPledgeSelections((prev) => {
                                  const updated = { ...prev };
                                  delete updated[pledge];
                                  return updated;
                                })
                              }
                              disabled={submitting}
                              className="form-check-input me-1"
                            />
                            Abstain
                          </label>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Show submit button if not all pledges have been voted for */}
              {voteInfo.pledges.some((pledge) => !voteInfo.votedPledges?.[pledge]) && (
                <Button
                  variant="success"
                  type="submit"
                  disabled={submitting}
                >
                  Submit Ballot
                </Button>
              )}
            </form>
            {/* Board round results (live, ECouncil only, during board round) */}
            {userData.isECouncil && voteInfo.round === "board" && voteInfo.boardResults && (
              <div className="mt-4">
                <h5>Board Round Results</h5>
                <ul className="list-group">
                  {voteInfo.pledges.map((pledge, index) => {
                    const res = voteInfo.boardResults?.[pledge] || { continue: 0, board: 0 };
                    const status = getPledgeStatus(pledge, voteInfo.boardResults, undefined);
                    return (
                      <li
                        key={pledge}
                        className={`list-group-item d-flex align-items-center ${status.color} ${index % 2 === 1 && !status.color ? 'bg-light' : ''}`}
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
                        {/* Only show icon if not a check for passed */}
                        {status.show && status.icon && (
                          <span className="ms-2">
                            <FontAwesomeIcon icon={status.icon} />
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
                    const status = getPledgeStatus(pledge, undefined, voteInfo.blackballResults);
                    return (
                      <li
                        key={pledge}
                        className={`list-group-item d-flex align-items-center ${status.color} ${index % 2 === 1 && !status.color ? 'bg-light' : ''}`}
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
                        {/* Only show icon if not a check for passed */}
                        {status.show && status.icon && (
                          <span className="ms-2">
                            <FontAwesomeIcon icon={status.icon} />
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

        {/* Results Modal */}
        <Modal show={showResults} onHide={handleCloseResults} centered>
          <Modal.Header closeButton>
            <Modal.Title>
              {voteResults?.showBoardOnly ? "Board Round Results" : 
               voteResults?.type === "Election" && voteResults?.title ? 
               `${voteResults.title} - Results` : "Vote Results"}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
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
                        const status = getPledgeStatus(pledge, voteResults.boardResults, undefined);
                        return (
                          <li
                            key={pledge}
                            className={`list-group-item d-flex align-items-center ${status.color} ${index % 2 === 1 && !status.color ? 'bg-light' : ''}`}
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
                            {status.show && status.icon && (
                              <span className="ms-2">
                                <FontAwesomeIcon icon={status.icon} />
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
                            const status = getPledgeStatus(pledge, undefined, voteResults.blackballResults);
                            return (
                              <li
                                key={pledge}
                                className={`list-group-item d-flex align-items-center ${status.color} ${index % 2 === 1 && !status.color ? 'bg-light' : ''}`}
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
                                {status.show && status.icon && (
                                  <span className="ms-2">
                                    <FontAwesomeIcon icon={status.icon} />
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
          </Modal.Body>
        </Modal>

        {/* Voting Modal (Create) */}
        <Modal show={showModal} onHide={handleCloseModal} centered>
          <Modal.Header closeButton>
            <Modal.Title>Start New Vote</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {!voteType && (
              <div>
                <Button
                  variant="primary"
                  className="w-100 mb-2"
                  onClick={() => handleVoteTypeSelect("Election")}
                >
                  Election
                </Button>
                <Button
                  variant="warning"
                  className="w-100 mb-2"
                  onClick={() => handleVoteTypeSelect("Pledge Vote")}
                >
                  Pledge Vote
                </Button>
              </div>
            )}

            {voteType === "Election" && (
              <form onSubmit={handleSubmit}>
                <h5>Enter Election Details</h5>
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
                <h6>Options</h6>
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
                      &times;
                    </button>
                  </div>
                ))}
                <Button
                  variant="primary"
                  type="button"
                  className="mb-3"
                  onClick={handleAddName}
                >
                  <FontAwesomeIcon icon={faPlus} className="me-1" />
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

            {voteType === "Pledge Vote" && (
              <form onSubmit={handleSubmit}>
                <h5>Enter Pledge Names</h5>
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
                      &times;
                    </button>
                  </div>
                ))}
                <Button
                  variant="primary"
                  type="button"
                  className="mb-3"
                  onClick={handleAddPledge}
                >
                  <FontAwesomeIcon icon={faPlus} className="me-1" />
                  Add Pledge
                </Button>
                <div className="d-flex justify-content-end">
                  <Button
                    variant="success"
                    type="submit"
                    disabled={submitting || pledgeNames.some((c) => !c.trim())}
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