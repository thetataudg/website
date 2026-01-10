"use client";

import React, { useEffect, useState, useRef } from "react";
import { RedirectToSignIn, useAuth, useUser } from "@clerk/nextjs";
import axios from "axios";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faTimes,
  faHourglass,
  faPlay,
  faStop,
  faTriangleExclamation,
  faMinus,
  faPause,
  faPlus,
  faClock,
  faUser,
  faUnlock,
  faLock,
  faArrowsRotate,
} from "@fortawesome/free-solid-svg-icons";
import Button from "react-bootstrap/Button";
import LoadingState, { LoadingSpinner } from "../../components/LoadingState";

type VoteInfo = {
  _id?: string;
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
  startedAt?: string | null;
  endTime?: string | null;
  voterListVerified?: boolean;
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
  boardResults?: Record<string, { continue: number; board: number; invalidBoard?: boolean }>;
  blackballResults?: Record<string, { continue: number; blackball: number; invalidBlackball?: boolean }>;
  totalVotes: number;
  startedAt?: string | null;
  endTime?: string | null;
  showBoardOnly?: boolean;
  voterListVerified?: boolean;
};

type VoterInfo = {
  clerkId: string;
  name: string;
  rollNo: string;
  status: 'voted' | 'no-ballot' | 'proxy';
  isInvalidated: boolean;
  isProxy?: boolean;
};

export default function VotePage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const [userData, setUserData] = useState<any>(null);
  const [loadingUserData, setLoadingUserData] = useState(true);

  // Vote list state
  const [votesList, setVotesList] = useState<any[]>([]);
  const [votesLoading, setVotesLoading] = useState(true);
  const [selectedVoteId, setSelectedVoteId] = useState<string | null>(null);

  // Create vote state (replaced modal)
  const [showCreateVote, setShowCreateVote] = useState(false);
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

  // Candidate management state
  const [showCandidateManager, setShowCandidateManager] = useState(false);
  const [newCandidate, setNewCandidate] = useState<string>("");

  // Results
  const [showResults, setShowResults] = useState(false);
  const [voteResults, setVoteResults] = useState<VoteResults | null>(null);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [showWinnerPopup, setShowWinnerPopup] = useState(false);
  const [winnerPopupText, setWinnerPopupText] = useState<string | null>(null);
  const [winnerCountdown, setWinnerCountdown] = useState(10);

  // Countdown state
  const [showCountdown, setShowCountdown] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(30);
  const [countdownAction, setCountdownAction] = useState<"end">("end");
  const [currentCountdown, setCurrentCountdown] = useState<number | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [countdownTarget, setCountdownTarget] = useState<string | null>(null);

  // Modal state for alerts and confirmations
  const [alertModal, setAlertModal] = useState<{ show: boolean; title: string; message: string; variant: 'danger' | 'success' | 'warning' }>({
    show: false,
    title: '',
    message: '',
    variant: 'danger'
  });
  const [confirmModal, setConfirmModal] = useState<{ show: boolean; title: string; message: string; onConfirm: () => void }>({
    show: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  // Voter list and ballot management state
  const [showVoterList, setShowVoterList] = useState(false);
  const [voterList, setVoterList] = useState<VoterInfo[]>([]);
  const [voterListLoading, setVoterListLoading] = useState(false);
  const [voterListVerified, setVoterListVerified] = useState(false);
  // Proxy vote mode (unlocks ballot before vote starts)
  const [proxyMode, setProxyMode] = useState(false);
  const [showProxyConfirm, setShowProxyConfirm] = useState(false);

  // Pledge cons management state
  const [showPledgeCons, setShowPledgeCons] = useState(false);
  const [pledgeCons, setPledgeCons] = useState<Record<string, boolean>>({});
  const [pledgeConsLoading, setPledgeConsLoading] = useState(false);

  // Polling
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const elapsedTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasShownVoterListRef = useRef<boolean>(false);
  const winnerPopupTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const winnerPopupIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastWinnerKeyRef = useRef<string | null>(null);

  // Elapsed time state
  const [elapsedTime, setElapsedTime] = useState<number>(0);

  // Helper function to check if user can access E-Council controls
  const canAccessECouncilControls = () => {
    if (!userData?.ecouncilPosition) return false;
    const position = userData.ecouncilPosition.toLowerCase();
    return position.includes('regent') || position.includes('scribe');
  };

  useEffect(() => {
    async function fetchUserData() {
      try {
        const response = await axios.get("/api/members/me");
        const data = response.data;
        setUserData({
          type: data.status,
          isECouncil: data.isECouncil,
          ecouncilPosition: data.ecouncilPosition,
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
          if (canAccessECouncilControls()) {
            fetchVotesList(false); // Also refresh votes list (no loading indicator)
          }
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

  // Elapsed time effect
  useEffect(() => {
    if (voteInfo?.startedAt && voteInfo.started) {
      const startTime = new Date(voteInfo.startedAt).getTime();
      console.log('Starting timer - startedAt:', voteInfo.startedAt, 'startTime:', startTime);
      
      const updateElapsed = () => {
        const now = Date.now();
        const elapsed = Math.floor((now - startTime) / 1000);
        console.log('Elapsed time:', elapsed);
        setElapsedTime(elapsed);
      };
      
      updateElapsed(); // Initial update
      
      // Only run interval if vote is still active
      if (!voteInfo.ended) {
        elapsedTimerRef.current = setInterval(updateElapsed, 1000);
      } else {
        // For ended votes, just show the final elapsed time
        if (elapsedTimerRef.current) {
          clearInterval(elapsedTimerRef.current);
          elapsedTimerRef.current = null;
        }
      }
    } else {
      console.log('Timer not started - startedAt:', voteInfo?.startedAt, 'started:', voteInfo?.started, 'ended:', voteInfo?.ended);
      setElapsedTime(0);
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
    }
    
    return () => {
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
    };
  }, [voteInfo?.startedAt, voteInfo?.started, voteInfo?.ended]);

  // Fetch vote info
  const fetchVoteInfo = async () => {
    setVoteError(null);
    try {
      const url = selectedVoteId ? `/api/vote?voteId=${selectedVoteId}` : "/api/vote";
      const res = await axios.get(url);
      setVoteInfo(prev => {
        // Detect if vote just ended or started - refresh votes list for all users
        const statusChanged = prev && (
          (prev.started !== res.data.started) ||
          (prev.ended !== res.data.ended)
        );
        
        if (statusChanged) {
          // Refresh votes list (without loading indicator) to update badge status
          fetchVotesList(false);
        }
        
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
      setVoterListVerified(res.data.voterListVerified || false);
      
      // If current vote is ended, check votes list for new running votes
      // This helps non-E-Council users detect when a new vote starts
      if (res.data.ended) {
        fetchVotesList(false);
      }
    } catch (err: any) {
      if (err.response && err.response.data && err.response.data.error) {
        setVoteError(err.response.data.error);
      } else {
        setVoteError("Failed to fetch vote info.");
      }
      
      // If 404 (vote not found/deleted), clear vote info and refresh votes list
      if (err.response?.status === 404) {
        setVoteInfo(null);
        setVoted(false);
        setSelectedVoteId(null);
        setProxyMode(false);
        setSelectedOption("");
        setPledgeSelections({});
        // Refresh votes list to ensure it's in sync
        fetchVotesList(false);
      }
      // For other errors, keep showing the last known state
    } finally {
      setVoteLoading(false);
    }
  };

  // Fetch votes list for all members
  useEffect(() => {
    if (userData) {
      fetchVotesList(true); // Show loading on initial fetch
    }
    // eslint-disable-next-line
  }, [userData]);

  // ====== POLLING OPTIMIZATION FOR NETLIFY =======
  // Strategy to reduce API requests from ~43M/month to manageable levels:
  // 1. Longer intervals: Active vote 10s (was 5s), Scheduled end 5s (was 3s)
  // 2. Visibility-aware: Stop polling when tab is hidden/inactive
  // 3. E-Council only: Votes list polling restricted to E-Council members
  // 4. Immediate refresh: User actions trigger instant fetchVoteInfo/fetchVotesList
  // 5. Smart polling: No polling for ended+verified votes
  // Result: ~80-85% reduction in API calls while maintaining responsive UX
  
  // Adaptive polling: only poll when necessary to reduce API calls
  // Now respects document visibility to avoid polling when tab is not active
  useEffect(() => {
    if (!isSignedIn) return;
    fetchVoteInfo();
    
    // Determine polling interval based on vote state
    let pollInterval = null;
    
    if (voteInfo?.started && !voteInfo?.ended) {
      // Vote is actively running: poll every 10 seconds (reduced from 5s)
      pollInterval = 10000;
    } else if (voteInfo?.endTime && !voteInfo?.ended) {
      // Vote has scheduled end time: poll every 5 seconds to catch the end (reduced from 3s)
      pollInterval = 5000;
    } else if (!voteInfo || (!voteInfo?.started && !voteInfo?.ended)) {
      // Suspended vote or no vote: poll every 15 seconds (low priority)
      pollInterval = 15000;
    } else if (voteInfo?.ended && !voteInfo?.voterListVerified) {
      // Vote ended, awaiting verification: poll every 10 seconds
      pollInterval = 10000;
    } else if (voteInfo?.ended && voteInfo?.voterListVerified) {
      // Vote ended and verified: poll every 15 seconds to detect new votes starting
      pollInterval = 15000;
    }
    
    const startPolling = () => {
      if (pollInterval && document.visibilityState === 'visible') {
        pollingRef.current = setInterval(() => {
          if (document.visibilityState === 'visible') {
            fetchVoteInfo();
          }
        }, pollInterval);
      }
    };
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Tab became visible - fetch immediately and restart polling
        fetchVoteInfo();
        if (pollingRef.current) clearInterval(pollingRef.current);
        startPolling();
      } else {
        // Tab hidden - stop polling
        if (pollingRef.current) clearInterval(pollingRef.current);
      }
    };
    
    startPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line
  }, [isSignedIn, selectedVoteId, voteInfo?.started, voteInfo?.ended, voteInfo?.endTime, voteInfo?.voterListVerified]);

  // Poll votes list to check for new votes or changes - E-Council only
  useEffect(() => {
    if (!isSignedIn || !userData || !canAccessECouncilControls()) return;
    
    const startVotesPolling = () => {
      if (document.visibilityState === 'visible') {
        return setInterval(() => {
          if (document.visibilityState === 'visible') {
            fetchVotesList(false);
          }
        }, 10000);
      }
      return null;
    };
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Tab became visible - fetch immediately
        fetchVotesList(false);
      }
    };
    
    const votesPolling = startVotesPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      if (votesPolling) clearInterval(votesPolling);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line
  }, [isSignedIn, userData]);

  // Auto-show voter list when vote ends for E-Council (before verification)
  useEffect(() => {
    if (voteInfo && voteInfo._id && voteInfo.ended && !voteInfo.voterListVerified && canAccessECouncilControls() && !hasShownVoterListRef.current) {
      // Set show to true and fetch voter list
      setShowVoterList(true);
      setVoterListLoading(true);
      axios.get(`/api/vote/ballots?voteId=${voteInfo._id}`)
        .then(res => {
          setVoterList(res.data.voterList || []);
          setVoterListVerified(res.data.voterListVerified || false);
        })
        .catch(err => {
          setAlertModal({
            show: true,
            title: 'Failed to Fetch Voter List',
            message: err?.response?.data?.error || "Failed to fetch voter list.",
            variant: 'danger'
          });
          setShowVoterList(false);
        })
        .finally(() => {
          setVoterListLoading(false);
        });
      hasShownVoterListRef.current = true;
    }
    // Mark as shown if already verified (so it doesn't try to show on page load)
    if (voteInfo?.voterListVerified) {
      hasShownVoterListRef.current = true;
    }
    // Reset ref when vote is no longer ended or when it's a new vote
    if (!voteInfo?.ended) {
      hasShownVoterListRef.current = false;
    }
    // eslint-disable-next-line
  }, [voteInfo?.ended, voteInfo?.voterListVerified, userData?.ecouncilPosition]);

  // Auto-show results when an ended vote is selected and voter list is verified
  useEffect(() => {
    if (voteInfo && voteInfo._id && voteInfo.ended && voteInfo.voterListVerified && canAccessECouncilControls()) {
      // Show results for this specific ended vote only after voter list is verified
      handleShowResults();
    } else {
      // Hide results if vote is not ended, not verified, or no vote selected
      setShowResults(false);
      setVoteResults(null);
    }
    // eslint-disable-next-line
  }, [voteInfo?._id, voteInfo?.ended, voteInfo?.voterListVerified, userData?.ecouncilPosition]);

  useEffect(() => {
    if (
      !showResults ||
      resultsLoading ||
      !voteResults ||
      voteResults.type !== "Election" ||
      !voteResults.options?.length
    ) {
      return;
    }

    const results = voteResults.results || {};
    let maxVotes = -Infinity;
    let winners: string[] = [];

    voteResults.options.forEach((opt) => {
      const count = results[opt] ?? 0;
      if (count > maxVotes) {
        maxVotes = count;
        winners = [opt];
      } else if (count === maxVotes) {
        winners.push(opt);
      }
    });

    if (maxVotes < 0 || winners.length === 0) {
      return;
    }

    const resultKey = `${selectedVoteId || "vote"}:${voteResults.options
      .map((opt) => results[opt] ?? 0)
      .join(",")}`;

    if (lastWinnerKeyRef.current === resultKey) {
      return;
    }

    lastWinnerKeyRef.current = resultKey;
    setWinnerPopupText(winners.length > 1 ? `Tie: ${winners.join(", ")}` : winners[0]);
    setShowWinnerPopup(true);
  }, [showResults, resultsLoading, voteResults, selectedVoteId]);

  useEffect(() => {
    if (!showWinnerPopup) {
      return;
    }

    setWinnerCountdown(10);

    if (winnerPopupTimeoutRef.current) {
      clearTimeout(winnerPopupTimeoutRef.current);
    }

    if (winnerPopupIntervalRef.current) {
      clearInterval(winnerPopupIntervalRef.current);
    }

    winnerPopupIntervalRef.current = setInterval(() => {
      setWinnerCountdown((prev) => (prev > 1 ? prev - 1 : 1));
    }, 1000);

    winnerPopupTimeoutRef.current = setTimeout(() => {
      setShowWinnerPopup(false);
    }, 10000);

    return () => {
      if (winnerPopupTimeoutRef.current) {
        clearTimeout(winnerPopupTimeoutRef.current);
        winnerPopupTimeoutRef.current = null;
      }
      if (winnerPopupIntervalRef.current) {
        clearInterval(winnerPopupIntervalRef.current);
        winnerPopupIntervalRef.current = null;
      }
    };
  }, [showWinnerPopup]);

  // Fetch votes list
  const fetchVotesList = async (showLoading = false) => {
    if (showLoading) setVotesLoading(true);
    try {
      const res = await axios.get("/api/vote/manage");
      const newVotesList = res.data.votes || [];
      
      // Detect if a new vote just started running
      const newRunningVote = newVotesList.find((v: any) => v.started && !v.ended);
      const wasRunningBefore = votesList.find((v: any) => v._id === newRunningVote?._id);
      const justStarted = newRunningVote && (!wasRunningBefore || (!wasRunningBefore.started));
      
      // If currently selected vote ended and a new one just started, auto-switch
      if (justStarted && voteInfo?.ended) {
        setSelectedVoteId(newRunningVote._id);
      }
      
      setVotesList(newVotesList);
      
      // Check if the currently selected vote still exists
      if (selectedVoteId) {
        const stillExists = newVotesList.find((v: any) => v._id === selectedVoteId);
        if (!stillExists) {
          // Vote was deleted, clear selection and state
          setSelectedVoteId(null);
          setVoteInfo(null);
          setVoted(false);
          setProxyMode(false);
          setSelectedOption("");
          setPledgeSelections({});
        }
      }
      
      // Select the running vote if there is one and no vote is currently selected
      if (newRunningVote && !selectedVoteId) {
        setSelectedVoteId(newRunningVote._id);
      }
      
      // Auto-select if there's only one vote and user is not E-Council
      if (!selectedVoteId && !canAccessECouncilControls() && newVotesList.length === 1) {
        setSelectedVoteId(newVotesList[0]._id);
      }
    } catch (err: any) {
      console.error("Failed to fetch votes list", err);
    } finally {
      if (showLoading) setVotesLoading(false);
    }
  };

  // Create vote handlers
  const handleOpenCreateVote = () => setShowCreateVote(true);
  const handleCloseCreateVote = () => {
    setShowCreateVote(false);
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
      handleCloseCreateVote();
      fetchVotesList();
      fetchVoteInfo();
    } catch (err: any) {
      setAlertModal({
        show: true,
        title: 'Failed to Create Vote',
        message: err?.response?.data?.error || "Failed to create vote.",
        variant: 'danger'
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Vote for an option (Election)
  const handleVote = async () => {
    if (!selectedOption || !voteInfo) return;
    setSubmitting(true);
    try {
      await axios.post("/api/vote", { voteId: voteInfo._id, choice: selectedOption, proxy: proxyMode });
      setVoted(true);
      setProxyMode(false);
      // Immediately update the voted badge in votes list
      setVotesList(prev => prev.map(v => 
        v._id === voteInfo._id ? { ...v, hasVoted: true } : v
      ));
      fetchVoteInfo();
    } catch (err: any) {
      setAlertModal({
        show: true,
        title: 'Failed to Submit Vote',
        message: err?.response?.data?.error || "Failed to submit vote.",
        variant: 'danger'
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Vote for pledges (Pledge) - submit all at once with confirmation
  const handlePledgeBallot = async () => {
    if (!voteInfo?.pledges || !voteInfo._id) return;
    
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

      await axios.post("/api/vote", { voteId: voteInfo._id, ballot, proxy: proxyMode });
      // Immediately update the voted badge in votes list
      setVotesList(prev => prev.map(v => 
        v._id === voteInfo._id ? { ...v, hasVoted: true } : v
      ));
      fetchVoteInfo();
      setProxyMode(false);
    } catch (err: any) {
      setAlertModal({
        show: true,
        title: 'Failed to Submit Ballot',
        message: err?.response?.data?.error || "Failed to submit ballot.",
        variant: 'danger'
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Management actions (E-Council)
  const handleStartVote = async () => {
    if (!voteInfo?._id) return;
    setSubmitting(true);
    try {
      await axios.patch("/api/vote/manage", { action: "start", voteId: voteInfo._id });
      fetchVoteInfo();
      fetchVotesList();
    } catch (err: any) {
      setAlertModal({
        show: true,
        title: 'Failed to Start Vote',
        message: err?.response?.data?.error || "Failed to start vote.",
        variant: 'danger'
      });
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
    if (!voteInfo?._id) return;
    setSubmitting(true);
    try {
      await axios.patch("/api/vote/manage", { 
        action: "end",
        voteId: voteInfo._id,
        countdown: immediate ? 0 : countdownSeconds
      });
      setShowCountdown(false);
      setCountdownSeconds(30);
      fetchVoteInfo();
    } catch (err: any) {
      setAlertModal({
        show: true,
        title: 'Failed to End Vote',
        message: err?.response?.data?.error || "Failed to end vote.",
        variant: 'danger'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteVote = async () => {
    if (!voteInfo || !voteInfo._id) return;
    if (!voteInfo.ended) {
      setConfirmModal({
        show: true,
        title: 'Vote Still Running',
        message: 'The vote is still running. End it before deleting?',
        onConfirm: async () => {
          setConfirmModal({ show: false, title: '', message: '', onConfirm: () => {} });
          setSubmitting(true);
          try {
            await axios.patch("/api/vote/manage", { action: "end", voteId: voteInfo._id });
            await fetchVoteInfo();
            await fetchVotesList();
            // After ending, prompt to delete
            setConfirmModal({
              show: true,
              title: 'Delete Vote',
              message: 'Are you sure you want to delete the ended vote? This cannot be undone.',
              onConfirm: async () => {
                setConfirmModal({ show: false, title: '', message: '', onConfirm: () => {} });
                setSubmitting(true);
                try {
                  await axios.delete(`/api/vote/manage?voteId=${voteInfo._id}`);
                  await fetchVoteInfo();
                  await fetchVotesList();
                  setSelectedVoteId(null);
                  setShowResults(false);
                  setVoteResults(null);
                } catch (err: any) {
                  setAlertModal({
                    show: true,
                    title: 'Failed to Delete Vote',
                    message: err?.response?.data?.error || "Failed to delete vote.",
                    variant: 'danger'
                  });
                } finally {
                  setSubmitting(false);
                }
              }
            });
          } catch (err: any) {
            setAlertModal({
              show: true,
              title: 'Failed to End Vote',
              message: err?.response?.data?.error || "Failed to end vote.",
              variant: 'danger'
            });
            setSubmitting(false);
          }
        }
      });
      return;
    }
    setConfirmModal({
      show: true,
      title: 'Delete Vote',
      message: 'Are you sure you want to delete the ended vote? This cannot be undone.',
      onConfirm: async () => {
        setConfirmModal({ show: false, title: '', message: '', onConfirm: () => {} });
        setSubmitting(true);
        try {
          await axios.delete(`/api/vote/manage?voteId=${voteInfo._id}`);
          await fetchVotesList();
          setSelectedVoteId(null);
          setVoteInfo(null);
          setShowResults(false);
          setVoteResults(null);
        } catch (err: any) {
          setAlertModal({
            show: true,
            title: 'Failed to Delete Vote',
            message: err?.response?.data?.error || "Failed to delete vote.",
            variant: 'danger'
          });
        } finally {
          setSubmitting(false);
        }
      }
    });
  };

  // Show results - modified to handle board-only results
  const handleShowResults = async (boardOnly = false) => {
    if (!voteInfo?._id) return;
    setResultsLoading(true);
    setShowResults(true);
    try {
      const res = await axios.get(`/api/vote/manage?voteId=${voteInfo._id}`);
      setVoterListVerified(res.data.voterListVerified || false);
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
      setAlertModal({
        show: true,
        title: 'Failed to Fetch Results',
        message: err?.response?.data?.error || "Failed to fetch results.",
        variant: 'danger'
      });
    } finally {
      setResultsLoading(false);
    }
  };

  const handleCloseResults = () => {
    setShowResults(false);
    setVoteResults(null);
  };

  // Voter list management
  const handleShowVoterList = async () => {
    if (!voteInfo?._id) return;
    // Prevent opening if already verified
    if (voteInfo?.voterListVerified) {
      setAlertModal({
        show: true,
        title: 'Already Verified',
        message: 'The voter list has already been verified and cannot be modified.',
        variant: 'warning'
      });
      return;
    }
    
    setVoterListLoading(true);
    setShowVoterList(true);
    try {
      const res = await axios.get(`/api/vote/ballots?voteId=${voteInfo._id}`);
      setVoterList(res.data.voterList || []);
      setVoterListVerified(res.data.voterListVerified || false);
    } catch (err: any) {
      setAlertModal({
        show: true,
        title: 'Failed to Fetch Voter List',
        message: err?.response?.data?.error || "Failed to fetch voter list.",
        variant: 'danger'
      });
      setShowVoterList(false);
    } finally {
      setVoterListLoading(false);
    }
  };

  const handleInvalidateBallot = async (clerkId: string) => {
    if (!voteInfo?._id) return;
    try {
      await axios.post("/api/vote/ballots", { clerkId, voteId: voteInfo._id });
      // Refresh voter list and results
      await handleShowVoterList();
      if (showResults) {
        await handleShowResults();
      }
    } catch (err: any) {
      setAlertModal({
        show: true,
        title: 'Failed to Invalidate Ballot',
        message: err?.response?.data?.error || "Failed to invalidate ballot.",
        variant: 'danger'
      });
    }
  };

  const handleRestoreBallot = async (clerkId: string) => {
    if (!voteInfo?._id) return;
    try {
      await axios.delete(`/api/vote/ballots?clerkId=${clerkId}&voteId=${voteInfo._id}`);
      // Refresh voter list and results
      await handleShowVoterList();
      if (showResults) {
        await handleShowResults();
      }
    } catch (err: any) {
      setAlertModal({
        show: true,
        title: 'Failed to Restore Ballot',
        message: err?.response?.data?.error || "Failed to restore ballot.",
        variant: 'danger'
      });
    }
  };

  const handleCloseVoterList = () => {
    setShowVoterList(false);
    setVoterList([]);
  };

  const handleVerifyVoterList = async () => {
    if (!voteInfo?._id) return;
    try {
      await axios.put("/api/vote/ballots", { voteId: voteInfo._id });
      setVoterListVerified(true);
      setShowVoterList(false);
      // Automatically show results after verification
      await handleShowResults();
      fetchVoteInfo(); // Refresh to get updated verification status
    } catch (err: any) {
      setAlertModal({
        show: true,
        title: 'Failed to Verify Voter List',
        message: err?.response?.data?.error || "Failed to verify voter list.",
        variant: 'danger'
      });
    }
  };

  // Pledge cons management
  const handleShowPledgeCons = async () => {
    setPledgeConsLoading(true);
    setShowPledgeCons(true);
    try {
      const res = await axios.get("/api/vote/pledge-cons");
      setPledgeCons(res.data.pledgeValidCons || {});
    } catch (err: any) {
      setAlertModal({
        show: true,
        title: 'Failed to Fetch Pledge Cons',
        message: err?.response?.data?.error || "Failed to fetch pledge cons.",
        variant: 'danger'
      });
      setShowPledgeCons(false);
    } finally {
      setPledgeConsLoading(false);
    }
  };

  const handleTogglePledgeCon = (pledge: string) => {
    setPledgeCons(prev => ({
      ...prev,
      [pledge]: !prev[pledge]
    }));
  };

  const handleSavePledgeCons = async () => {
    setPledgeConsLoading(true);
    try {
      await axios.post("/api/vote/pledge-cons", { pledgeValidCons: pledgeCons });
      setAlertModal({
        show: true,
        title: 'Success',
        message: 'Pledge cons saved successfully.',
        variant: 'success'
      });
      setShowPledgeCons(false);
      // Refresh results if showing
      if (showResults) {
        await handleShowResults();
      }
    } catch (err: any) {
      setAlertModal({
        show: true,
        title: 'Failed to Save Pledge Cons',
        message: err?.response?.data?.error || "Failed to save pledge cons.",
        variant: 'danger'
      });
    } finally {
      setPledgeConsLoading(false);
    }
  };

  const handleClosePledgeCons = () => {
    setShowPledgeCons(false);
  };

  // Candidate management handlers
  const handleOpenCandidateManager = () => {
    setShowCandidateManager(true);
    setNewCandidate("");
  };

  const handleCloseCandidateManager = () => {
    setShowCandidateManager(false);
    setNewCandidate("");
  };

  const handleAddCandidate = async () => {
    if (!newCandidate.trim() || !voteInfo?._id) return;
    setSubmitting(true);
    try {
      await axios.post("/api/vote/options", { voteId: voteInfo._id, option: newCandidate.trim() });
      setNewCandidate("");
      await fetchVoteInfo();
    } catch (err: any) {
      setAlertModal({
        show: true,
        title: 'Failed to Add Candidate',
        message: err?.response?.data?.error || "Failed to add candidate.",
        variant: 'danger'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveCandidate = async (option: string) => {
    if (!voteInfo?._id) return;
    setSubmitting(true);
    try {
      await axios.delete(`/api/vote/options?voteId=${voteInfo._id}&option=${encodeURIComponent(option)}`);
      await fetchVoteInfo();
    } catch (err: any) {
      setAlertModal({
        show: true,
        title: 'Failed to Remove Candidate',
        message: err?.response?.data?.error || "Failed to remove candidate.",
        variant: 'danger'
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Helper to format elapsed time
  const formatElapsedTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  // Helper to format time of day
  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
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
        if (blackballResults[pledge].invalidBlackball) {
          return { variant: "primary", icon: faTriangleExclamation, text: "Invalid Blackball" };
        }
        return { variant: "danger", icon: faTimes, text: "Blackball" };
      }
      if (blackballResults[pledge].continue > 0) {
        return { variant: "success", icon: faCheck, text: "Continue" };
      }
    }
    // Board round: check board
    if (boardResults && boardResults[pledge]) {
      if (boardResults[pledge].board > 0) {
        if (boardResults[pledge].invalidBoard) {
          return { variant: "primary", icon: faTriangleExclamation, text: "Invalid Board" };
        }
        return { variant: "warning", icon: faTriangleExclamation, text: "Board" };
      }
      if (boardResults[pledge].continue > 0) {
        return { variant: "success", icon: faCheck, text: "Continue" };
      }
    }
    return null;
  }

  if (!isLoaded || loadingUserData) {
    return <LoadingState message="Loading voting tools..." />;
  }

  if (!isSignedIn) {
    return (
      <div className="member-dashboard">
        <div className="bento-card">
          <div className="alert alert-danger d-flex align-items-center" role="alert">
            <FontAwesomeIcon icon={faTimes} className="h2" />
            <h3>You must be logged in to use this function.</h3>
            <RedirectToSignIn />
          </div>
        </div>
      </div>
    );
  }

  // Only allow "Active" members
  if (!userData || userData.type !== "Active") {
    return (
      <div className="member-dashboard">
        <div className="bento-card">
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
    <div className="member-dashboard vote-page">
      <section className="bento-card vote-hero">
        <div>
          <h1>Chapter Voting</h1>
        </div>
        <div className="vote-hero__actions">
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={() => {
              fetchVoteInfo();
              fetchVotesList(false);
            }}
            title="Refresh vote data"
          >
            <FontAwesomeIcon icon={faArrowsRotate} /> Refresh
          </button>
          {canAccessECouncilControls() && (
            <button className="btn btn-primary" onClick={handleOpenCreateVote}>
              <FontAwesomeIcon icon={faPlus} className="me-2" />
              Create Vote
            </button>
          )}
        </div>
      </section>

      <section className="bento-card vote-body">
        {/* Countdown Alert */}
        {currentCountdown !== null && countdownTarget && (
          <div className="alert alert-primary d-flex align-items-center" role="alert">
            <FontAwesomeIcon icon={faHourglass} className="me-2" />
            <div className="flex-grow-1">
              <b>{countdownTarget} in {currentCountdown} second{currentCountdown !== 1 ? 's' : ''}...</b>
            </div>
          </div>
        )}

        {/* Vote status and options */}
        <div className="vote-section">
          {voteLoading ? (
            <div className="alert alert-info d-flex align-items-center" role="alert">
              <LoadingSpinner size="sm" className="me-2" />
              Loading vote info...
            </div>
          ) : voteInfo && voteInfo.type === "Election" && selectedVoteId ? (
            <>
              <div className={`alert ${voteInfo.ended ? 'alert-primary' : voteInfo.started && !voteInfo.ended ? 'alert-success' : 'alert-warning'} d-flex align-items-center justify-content-between`} role="alert">
                <div className="d-flex align-items-center">
                  <FontAwesomeIcon icon={voteInfo.ended ? faCheck : voteInfo.started && !voteInfo.ended ? faCheck : faPause} className="me-2" />
                  <div>
                    <b>
                      Voting{" "}
                      {voteInfo.started
                        ? voteInfo.ended
                          ? "has completed"
                          : "is running"
                        : "has not yet started"}
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
                </div>
              </div>
              
              {/* E-Council Control Panel */}
              {canAccessECouncilControls() && (
                <div className="vote-panel vote-controls">
                  <div className="d-flex align-items-center justify-content-between mb-3">
                    <h6 className="mb-0">
                      <FontAwesomeIcon icon={faUser} className="me-2" />
                      E-Council Controls
                    </h6>
                    <div className="d-flex gap-2">
                      {!voteInfo.started && !voteInfo.ended && (
                        <>
                          <Button size="sm" variant="primary" onClick={handleStartVote} disabled={submitting}>
                            <FontAwesomeIcon icon={faPlay} className="me-1" /> Start Voting
                          </Button>
                          {voteInfo.type === "Election" && (
                            <Button 
                              size="sm" 
                              variant="secondary" 
                              onClick={handleOpenCandidateManager} 
                              disabled={submitting || !selectedVoteId}
                              title={!selectedVoteId ? "Please select a vote to manage candidates" : ""}
                            >
                              <FontAwesomeIcon icon={faUser} className="me-1" /> Manage Candidates
                            </Button>
                          )}
                        </>
                      )}
                      {voteInfo.started && !voteInfo.ended && (
                        <Button size="sm" variant="danger" onClick={handleShowEndCountdown} disabled={submitting}>
                          <FontAwesomeIcon icon={faStop} className="me-1" /> End
                        </Button>
                      )}
                      {voteInfo.ended && (
                        <>
                          {!voteInfo.voterListVerified && (
                            <Button 
                              size="sm" 
                              variant="info" 
                              onClick={() => {
                                if (!voteInfo._id) return;
                                setShowVoterList(true);
                                if (voterList.length === 0) {
                                  setVoterListLoading(true);
                                  axios.get(`/api/vote/ballots?voteId=${voteInfo._id}`)
                                    .then(res => {
                                      setVoterList(res.data.voterList || []);
                                      setVoterListVerified(res.data.voterListVerified || false);
                                    })
                                    .catch(err => {
                                      setAlertModal({
                                        show: true,
                                        title: 'Failed to Fetch Voter List',
                                        message: err?.response?.data?.error || "Failed to fetch voter list.",
                                        variant: 'danger'
                                      });
                                      setShowVoterList(false);
                                    })
                                    .finally(() => {
                                      setVoterListLoading(false);
                                    });
                                }
                              }}
                              disabled={voterListLoading}
                            >
                              <FontAwesomeIcon icon={faUser} className="me-1" /> Voter List
                            </Button>
                          )}
                        </>
                      )}
                      <Button size="sm" variant="outline-danger" onClick={handleDeleteVote} disabled={submitting}>
                        <FontAwesomeIcon icon={faTimes} className="me-1" /> Delete
                      </Button>
                    </div>
                  </div>
                  
                  {/* Time Information */}
                  {voteInfo.started && (
                    <div>
                      <small className="d-block mb-1">
                        Time Running: <strong>{formatElapsedTime(elapsedTime)}</strong>
                        {' • '}
                        Scheduled End: <strong>{voteInfo.endTime ? formatTime(voteInfo.endTime) : 'N/A'}</strong>
                      </small>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : voteInfo && voteInfo.type === "Pledge" && selectedVoteId ? (
            <>
              <div className={`alert ${voteInfo.ended ? 'alert-primary' : voteInfo.started && !voteInfo.ended ? 'alert-success' : 'alert-warning'} d-flex align-items-center justify-content-between`} role="alert">
                <div className="d-flex align-items-center">
                  <FontAwesomeIcon icon={voteInfo.ended ? faCheck : voteInfo.started && !voteInfo.ended ? faCheck : faPause} className="me-2" />
                  <div>
                    <b>
                      Vote is{" "}
                      {voteInfo.started
                        ? voteInfo.ended
                          ? "completed"
                          : voteInfo.round === "blackball"
                          ? "active"
                          : "active"
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
                </div>
              </div>
              
              {/* E-Council Control Panel */}
              {canAccessECouncilControls() && (
                <div className="vote-panel vote-controls">
                  <div className="d-flex align-items-center justify-content-between mb-3">
                    <h6 className="mb-0">
                      <FontAwesomeIcon icon={faUser} className="me-2" />
                      E-Council Controls
                    </h6>
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
                        <>
                          {!voteInfo.voterListVerified && (
                            <Button 
                              size="sm" 
                              variant="info" 
                              onClick={() => {
                                if (!voteInfo._id) return;
                                setShowVoterList(true);
                                if (voterList.length === 0) {
                                  setVoterListLoading(true);
                                  axios.get(`/api/vote/ballots?voteId=${voteInfo._id}`)
                                    .then(res => {
                                      setVoterList(res.data.voterList || []);
                                      setVoterListVerified(res.data.voterListVerified || false);
                                    })
                                    .catch(err => {
                                      setAlertModal({
                                        show: true,
                                        title: 'Failed to Fetch Voter List',
                                        message: err?.response?.data?.error || "Failed to fetch voter list.",
                                        variant: 'danger'
                                      });
                                      setShowVoterList(false);
                                    })
                                    .finally(() => {
                                      setVoterListLoading(false);
                                    });
                                }
                              }}
                              disabled={voterListLoading}
                            >
                              <FontAwesomeIcon icon={faUser} className="me-1" /> Voter List
                            </Button>
                          )}
                        </>
                      )}
                      <Button size="sm" variant="secondary" onClick={handleShowPledgeCons} disabled={pledgeConsLoading}>
                        <FontAwesomeIcon icon={faTriangleExclamation} className="me-1" /> Cons
                      </Button>
                      <Button size="sm" variant="outline-danger" onClick={handleDeleteVote} disabled={submitting}>
                        <FontAwesomeIcon icon={faTimes} className="me-1" /> Delete
                      </Button>
                    </div>
                  </div>
                  
                  {/* Time Information */}
                  {voteInfo.started && (
                    <div>
                      <small className="d-block mb-1">
                        Time Running: <strong>{formatElapsedTime(elapsedTime)}</strong>
                        {' • '}
                        Scheduled End: <strong>{voteInfo.endTime ? formatTime(voteInfo.endTime) : 'N/A'}</strong>
                      </small>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (!voteInfo || !voteInfo.started) && !selectedVoteId && !voteLoading && votesList.length === 0 ? (
            <div className="alert alert-dark d-flex align-items-center" role="alert">
              No active votes. {canAccessECouncilControls() && 'Click "Create Vote" to start a new one.'}
            </div>
          ) : null}
        </div>

        {/* Votes List */}
        {votesList.length > 0 && (
          <div className="vote-panel vote-list mt-4">
            <h5 className="mb-3">{canAccessECouncilControls() ? 'Votes' : 'Available Votes'}</h5>
            {votesLoading ? (
              <div className="text-center py-3">
                <LoadingSpinner size="sm" className="me-2" />
                Loading votes...
              </div>
            ) : votesList.length === 0 ? (
              <div className="text-muted text-center py-3">
                No votes created yet. Click "Create Vote" to get started.
              </div>
            ) : (
              <div className="list-group">
                {votesList.map((vote) => (
                  <div
                    key={vote._id}
                    className={`list-group-item vote-list-item d-flex justify-content-between align-items-center${selectedVoteId === vote._id ? " is-active" : ""}`}
                    onClick={() => {
                      if (selectedVoteId === vote._id) {
                        // Unselect if clicking on already selected vote
                        setSelectedVoteId(null);
                        setVoteInfo(null);
                        setVoted(false);
                        setProxyMode(false);
                        setSelectedOption("");
                        setPledgeSelections({});
                      } else {
                        // Select the vote
                        setSelectedVoteId(vote._id);
                      }
                    }}
                  >
                    <div>
                      <strong>{vote.type === "Election" && vote.title ? vote.title : vote.type}</strong>
                      {vote.hasVoted && (
                        <span className="ms-2 badge bg-success">
                          <FontAwesomeIcon icon={faCheck} className="me-1" />
                          Voted
                        </span>
                      )}
                      {vote.started && !vote.ended && (
                        <span className="ms-2 badge bg-success">
                          <FontAwesomeIcon icon={faCheck} className="me-1" />
                          Running
                        </span>
                      )}
                      {vote.ended && (
                        <span className="ms-2 badge bg-dark">
                          <FontAwesomeIcon icon={faLock} className="me-1" />
                          Complete
                        </span>
                      )}
                      {!vote.started && !vote.ended && (
                        <span className="ms-2 badge bg-warning text-dark">
                          <FontAwesomeIcon icon={faLock} className="me-1" />
                          Locked
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Create Vote Container (replaced modal) */}
        {showCreateVote && (
          <div className="vote-panel vote-create mt-4">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h4 className="mb-0">
                <FontAwesomeIcon icon={faPlus} className="me-2" />
                Create New Vote
              </h4>
              <Button size="sm" variant="outline-secondary" onClick={handleCloseCreateVote}>
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
          <div className="vote-panel vote-countdown mt-4">
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

        {/* Voter List Verification Panel */}
        {showVoterList && voteInfo && voteInfo.ended && (
          <div className="vote-panel vote-voterlist mt-4">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h4 className="mb-0">
                <FontAwesomeIcon icon={faUser} className="me-2" />
                Voter List & Ballot Management
              </h4>
              <Button size="sm" variant="outline-secondary" onClick={handleCloseVoterList}>
                <FontAwesomeIcon icon={faTimes} className="me-1" />
                Close
              </Button>
            </div>

            {voterListLoading ? (
              <div className="text-center py-4">
                <LoadingSpinner size="sm" />
              </div>
            ) : (
              <>
                {!voterListVerified && (
                  <div className="alert alert-warning mb-3">
                    <FontAwesomeIcon icon={faTriangleExclamation} className="me-2" />
                    Review the voter list and invalidate any ballots from members who were not present. 
                    Click "Verify Voter List" when complete to enable viewing results.
                  </div>
                )}
                <div className="list-group mb-3" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {voterList.map((voter) => (
                    <div
                      key={voter.clerkId}
                      className="list-group-item d-flex justify-content-between align-items-center"
                    >
                      <div>
                        <strong>{voter.name}</strong>
                        <span className="text-muted ms-2">({voter.rollNo})</span>
                      </div>
                      <div className="d-flex align-items-center gap-2">
                        <span
                          className={`badge bg-${
                            voter.status === 'proxy'
                              ? 'primary'
                              : voter.status === 'voted'
                              ? 'success'
                              : voter.isInvalidated
                              ? 'danger'
                              : 'dark'
                          }`}
                        >
                          {voter.status === 'proxy'
                            ? 'Proxy Ballot'
                            : voter.status === 'voted'
                            ? 'Voted'
                            : voter.isInvalidated
                            ? 'Ballot Excluded'
                            : 'No Ballot'}
                        </span>
                        {voter.status !== 'no-ballot' && !voter.isInvalidated && !voterListVerified && (
                          <button
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => handleInvalidateBallot(voter.clerkId)}
                            title="Invalidate ballot"
                          >
                            <FontAwesomeIcon icon={faTimes} />
                          </button>
                        )}
                        {voter.isInvalidated && !voterListVerified && (
                          <button
                            className="btn btn-sm btn-outline-success"
                            onClick={() => handleRestoreBallot(voter.clerkId)}
                            title="Restore ballot"
                          >
                            <FontAwesomeIcon icon={faCheck} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {!voterListVerified && (
                  <Button variant="success" onClick={handleVerifyVoterList} className="w-100">
                    <FontAwesomeIcon icon={faCheck} className="me-1" />
                    Verify Voter List
                  </Button>
                )}
              </>
            )}
          </div>
        )}

        {/* Voted alert - for running votes and proxy votes when selected */}
        {voteInfo && voteInfo.type === "Election" && voted && !voteInfo.ended && selectedVoteId && (
          <div className="alert alert-info d-flex align-items-center mt-3" role="alert">
            <FontAwesomeIcon icon={faCheck} className="me-2" />
            Your vote has been counted.
          </div>
        )}

        {/* Proxy unlock button when vote is suspended */}
        {voteInfo && voteInfo.type === "Election" && !voteInfo.started && !voteInfo.ended && !voted && !proxyMode && selectedVoteId && (
          <div className="mt-3">
            <Button 
              variant="danger" 
              onClick={() => setShowProxyConfirm(true)} 
              disabled={voted || submitting}
            >
              <FontAwesomeIcon icon={faUnlock} className="me-1" /> Proxy Vote
            </Button>
          </div>
        )}

        {/* Voting options: Election */}
        {voteInfo && voteInfo.type === "Election" && ((voteInfo.started && !voteInfo.ended) || (proxyMode && !voteInfo.ended && !voteInfo.started)) && !voted && (
          <div className="mt-4">
            <h4>{voteInfo.title ? `${voteInfo.title}` : "Vote for an option"}{proxyMode && <span className="ms-3 badge bg-primary text-white">Proxy</span>}</h4>
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

        {/* Proxy unlock button when pledge vote is suspended */}
        {voteInfo && voteInfo.type === "Pledge" && !voteInfo.started && !voteInfo.ended && !voted && !proxyMode && selectedVoteId && (
          <div className="mt-3">
            <Button 
              variant="danger" 
              onClick={() => setShowProxyConfirm(true)} 
              disabled={voted || submitting}
            >
              <FontAwesomeIcon icon={faUnlock} className="me-1" /> Proxy Vote
            </Button>
          </div>
        )}

        {/* Voting options: Pledge */}
        {voteInfo && voteInfo.type === "Pledge" && ((voteInfo.started && !voteInfo.ended) || (proxyMode && !voteInfo.ended && !voteInfo.started)) && voteInfo.pledges && (
          <div className="vote-panel mt-4">
            <h4>
              {voteInfo.round === "board"
                ? "Pledge Vote: Vote for Each Pledge"
                : "Pledge Vote: Vote for Each Pledge"}
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
                                  {opt === 'Continue' && (
                                    <FontAwesomeIcon icon={faCheck} className="me-1" />
                                  )}
                                  {opt === 'Board' && (
                                    <FontAwesomeIcon icon={faTriangleExclamation} className="me-1" />
                                  )}
                                  {opt === 'Abstain' && (
                                    <FontAwesomeIcon icon={faMinus} className="me-1" />
                                  )}
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
                                  {opt === 'Continue' && (
                                    <FontAwesomeIcon icon={faCheck} className="me-1" />
                                  )}
                                  {opt === 'Blackball' && (
                                    <FontAwesomeIcon icon={faTimes} className="me-1" />
                                  )}
                                  {opt === 'Abstain' && (
                                    <FontAwesomeIcon icon={faMinus} className="me-1" />
                                  )}
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
            {canAccessECouncilControls() && voteInfo.round === "board" && voteInfo.boardResults && (
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
                          <FontAwesomeIcon icon={faTriangleExclamation} className="text-warning me-1" />
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
            {canAccessECouncilControls() && voteInfo.round === "blackball" && voteInfo.blackballResults && (
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
        {showResults && selectedVoteId && (
          <div className="vote-panel vote-results mt-4">
            <div className="mb-3">
              <h4 className="mb-0">
                {voteResults?.showBoardOnly ? "Board Round Results" : 
                 voteResults?.type === "Election" && voteResults?.title ? 
                 `${voteResults.title} - Results` : "Vote Results"}
              </h4>
            </div>
            
            {resultsLoading ? (
              <div className="text-center">
                <LoadingSpinner size="sm" className="me-2" />
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
                              <FontAwesomeIcon icon={faTriangleExclamation} className="me-1" />
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

        {showWinnerPopup && winnerPopupText && (
          <div className="vote-winner-popup" role="status" aria-live="polite">
            <div className="vote-winner-popup__card">
              <div className="vote-winner-popup__label">Top Result</div>
              <div className="vote-winner-popup__winner">{winnerPopupText}</div>
              <div className="vote-winner-popup__timer">
                Dismissing in {winnerCountdown} seconds
              </div>
            </div>
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
                    <FontAwesomeIcon icon={faTriangleExclamation} className="me-1" />
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

        {/* Alert Modal */}
        {alertModal.show && (
          <div className="modal d-block" tabIndex={-1} style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className={`modal-header bg-${alertModal.variant} text-white`}>
                  <h5 className="modal-title">
                    <FontAwesomeIcon 
                      icon={alertModal.variant === 'danger' ? faTimes : alertModal.variant === 'warning' ? faTriangleExclamation : faCheck} 
                      className="me-2" 
                    />
                    {alertModal.title}
                  </h5>
                </div>
                <div className="modal-body">
                  <p>{alertModal.message}</p>
                </div>
                <div className="modal-footer">
                  <Button
                    variant="secondary"
                    onClick={() => setAlertModal({ show: false, title: '', message: '', variant: 'danger' })}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Confirm Modal */}
        {confirmModal.show && (
          <div className="modal d-block" tabIndex={-1} style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content vote-modal">
                <div className="modal-header vote-modal__header vote-modal__header--warning">
                  <h5 className="modal-title">
                    <FontAwesomeIcon icon={faTriangleExclamation} className="me-2" />
                    {confirmModal.title}
                  </h5>
                </div>
                <div className="modal-body">
                  <p>{confirmModal.message}</p>
                </div>
                <div className="modal-footer">
                  <Button
                    variant="secondary"
                    onClick={() => setConfirmModal({ show: false, title: '', message: '', onConfirm: () => {} })}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    onClick={confirmModal.onConfirm}
                    disabled={submitting}
                  >
                    <FontAwesomeIcon icon={faCheck} className="me-1" />
                    {submitting ? 'Processing...' : 'Confirm'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Proxy Confirm Modal */}
        {showProxyConfirm && (
          <div className="modal d-block" tabIndex={-1} style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content vote-modal">
                <div className="modal-header vote-modal__header vote-modal__header--danger">
                  <h5 className="modal-title">
                    <FontAwesomeIcon icon={faUnlock} className="me-2" />
                    Unlock Ballot (Proxy)
                  </h5>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setShowProxyConfirm(false)}
                  ></button>
                </div>
                <div className="modal-body">
                  <p>
                    Are you sure you want to unlock the ballot and submit a proxy vote? This action cannot be undone, and you must make the Scribe aware of your intention to proxy vote for your vote to be tallied.
                  </p>
                </div>
                <div className="modal-footer">
                  <Button variant="secondary" onClick={() => setShowProxyConfirm(false)} disabled={submitting}>
                    Cancel
                  </Button>
                  <Button variant="danger" onClick={() => { setProxyMode(true); setShowProxyConfirm(false); }} disabled={submitting}>
                    <FontAwesomeIcon icon={faUnlock} className="me-1" /> Confirm Proxy Vote
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Candidate Management Modal */}
        {showCandidateManager && voteInfo && voteInfo.type === "Election" && (
          <div className="modal d-block" tabIndex={-1} style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content vote-modal">
                <div className="modal-header vote-modal__header">
                  <h5 className="modal-title">
                    <FontAwesomeIcon icon={faUser} className="me-2" />
                    Manage Candidates
                  </h5>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={handleCloseCandidateManager}
                  ></button>
                </div>
                <div className="modal-body">
                  <div className="mb-3">
                    <label htmlFor="newCandidate" className="form-label">Add New Candidate</label>
                    <div className="input-group">
                      <input
                        type="text"
                        className="form-control"
                        id="newCandidate"
                        value={newCandidate}
                        onChange={(e) => setNewCandidate(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCandidate();
                          }
                        }}
                        placeholder="Candidate name"
                      />
                      <Button variant="primary" onClick={handleAddCandidate} disabled={!newCandidate.trim() || submitting}>
                        <FontAwesomeIcon icon={faPlus} className="me-1" />
                        Add
                      </Button>
                    </div>
                  </div>
                  <h6>Current Candidates:</h6>
                  <ul className="list-group">
                    {voteInfo.options?.map((option) => (
                      <li key={option} className="list-group-item d-flex justify-content-between align-items-center">
                        {option}
                        <Button
                          size="sm"
                          variant="outline-danger"
                          onClick={() => handleRemoveCandidate(option)}
                          disabled={submitting}
                        >
                          <FontAwesomeIcon icon={faTimes} />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="modal-footer">
                  <Button variant="secondary" onClick={handleCloseCandidateManager} disabled={submitting}>
                    Done
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pledge Cons Management Modal */}
        {showPledgeCons && (
          <div className="modal d-block" tabIndex={-1} style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content vote-modal">
                <div className="modal-header vote-modal__header">
                  <h5 className="modal-title">
                    <FontAwesomeIcon icon={faTriangleExclamation} className="me-2" />
                    Manage Pledge Cons
                  </h5>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={handleClosePledgeCons}
                  ></button>
                </div>
                <div className="modal-body">
                  {pledgeConsLoading ? (
                    <div className="text-center py-4">
                      <LoadingSpinner size="sm" />
                    </div>
                  ) : (
                    <div>
                      <p className="text-muted mb-3">
                        Mark which pledges have a valid con on the floor. Pledges without valid cons will have their board/blackball votes marked as invalid.
                      </p>
                      <table className="table table-sm">
                        <thead>
                          <tr>
                            <th>Pledge Name</th>
                            <th className="text-center">Con?</th>
                          </tr>
                        </thead>
                        <tbody>
                          {voteInfo?.pledges?.map((pledge) => (
                            <tr key={pledge}>
                              <td>{pledge}</td>
                              <td className="text-center">
                                <input
                                  type="checkbox"
                                  className="form-check-input"
                                  checked={pledgeCons[pledge] || false}
                                  onChange={() => handleTogglePledgeCon(pledge)}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <Button variant="secondary" onClick={handleClosePledgeCons} disabled={pledgeConsLoading}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={handleSavePledgeCons} disabled={pledgeConsLoading}>
                    <FontAwesomeIcon icon={faCheck} className="me-1" />
                    {pledgeConsLoading ? (
                      <>
                        <LoadingSpinner size="sm" className="me-2" />
                        Saving...
                      </>
                    ) : (
                      "Save"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
