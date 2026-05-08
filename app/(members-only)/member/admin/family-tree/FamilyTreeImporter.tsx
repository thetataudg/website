// app/(members-only)/member/admin/family-tree/FamilyTreeImporter.tsx

"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUpload, faCheck, faTimes, faExclamationTriangle, faSpinner } from "@fortawesome/free-solid-svg-icons";

interface FamilyTreeImportRecord {
  rollNo: string | number;
  fName: string;
  lName: string;
  big: number | null;
  littles: number[];
}

interface ImportAction {
  rollNo: string;
  fName: string;
  lName: string;
  action: "create" | "update";
  reason?: string;
}

interface ValidationResult {
  valid: boolean;
  creates: ImportAction[];
  updates: ImportAction[];
  errors: string[];
  warnings: string[];
}

interface CommitResult {
  created: number;
  updated: number;
  errors: Array<{ rollNo: string; error: string }>;
  summary: string;
}

export default function FamilyTreeImporter() {
  const [jsonData, setJsonData] = useState<FamilyTreeImportRecord[] | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const [stage, setStage] = useState<"upload" | "review" | "result">("upload");

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setLoading(true);

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!Array.isArray(data)) {
        throw new Error("JSON must be an array");
      }

      setJsonData(data);
      setStage("review");

      // Automatically validate
      await validateImport(data);
    } catch (err: any) {
      setError(err.message || "Failed to parse JSON file");
      setJsonData(null);
    } finally {
      setLoading(false);
    }
  };

  const validateImport = async (data: FamilyTreeImportRecord[]) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/members/family-tree/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonData: data, action: "validate" }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Validation failed");
      }

      const result: ValidationResult = await res.json();
      setValidation(result);
    } catch (err: any) {
      setError(err.message || "Validation failed");
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!jsonData) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/members/family-tree/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonData, action: "commit" }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Commit failed");
      }

      const result: CommitResult = await res.json();
      setCommitResult(result);
      setStage("result");
    } catch (err: any) {
      setError(err.message || "Commit failed");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setJsonData(null);
    setValidation(null);
    setCommitResult(null);
    setError(null);
    setStage("upload");
  };

  return (
    <div className="member-dashboard">
      {stage === "upload" && (
        <section className="bento-card">
          <div className="p-4">
            <h2 className="mb-4">Import Family Tree</h2>
            <p className="text-muted mb-4">
              Upload a JSON file with the family tree data. The system will validate,
              preview changes, and allow you to approve before applying.
            </p>

            <div className="form-group">
              <label className="form-label">
                <FontAwesomeIcon icon={faUpload} className="me-2" />
                Select JSON File
              </label>
              <input
                type="file"
                accept=".json"
                className="form-control"
                onChange={handleFileChange}
                disabled={loading}
              />
              <small className="form-text text-muted">
                Expected format: Array of objects with rollNo, fName, lName, big, littles
              </small>
            </div>

            {error && (
              <div className="alert alert-danger mt-3">
                <FontAwesomeIcon icon={faTimes} className="me-2" />
                {error}
              </div>
            )}

            {loading && (
              <div className="text-center mt-3">
                <FontAwesomeIcon icon={faSpinner} spin className="me-2" />
                Processing...
              </div>
            )}
          </div>
        </section>
      )}

      {stage === "review" && validation && (
        <section className="bento-card">
          <div className="p-4">
            <h2 className="mb-4">Review Import Preview</h2>

            {error && (
              <div className="alert alert-danger mb-3">
                <FontAwesomeIcon icon={faTimes} className="me-2" />
                {error}
              </div>
            )}

            <div className="row g-3 mb-4">
              <div className="col-md-4">
                <div className="card">
                  <div className="card-body">
                    <h5 className="card-title">New Profiles</h5>
                    <p className="card-text text-success fs-5 fw-bold">
                      {validation.creates.length}
                    </p>
                  </div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="card">
                  <div className="card-body">
                    <h5 className="card-title">Relationship Updates</h5>
                    <p className="card-text text-info fs-5 fw-bold">
                      {validation.updates.length}
                    </p>
                  </div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="card">
                  <div className="card-body">
                    <h5 className="card-title">Warnings</h5>
                    <p className="card-text text-warning fs-5 fw-bold">
                      {validation.warnings.length}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {validation.creates.length > 0 && (
              <div className="mb-4">
                <h5>New Profiles to Create</h5>
                <div className="table-responsive">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Roll No</th>
                        <th>Name</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validation.creates.map((action) => (
                        <tr key={action.rollNo}>
                          <td>#{action.rollNo}</td>
                          <td>
                            {action.fName} {action.lName}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {validation.updates.length > 0 && (
              <div className="mb-4">
                <h5>Relationships to Update</h5>
                <p className="text-muted small">
                  Names and other fields will be preserved; only big/little relationships will be updated.
                </p>
                <div className="table-responsive">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Roll No</th>
                        <th>Name</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validation.updates.map((action) => (
                        <tr key={action.rollNo}>
                          <td>#{action.rollNo}</td>
                          <td>
                            {action.fName} {action.lName}
                          </td>
                          <td>
                            <span className="badge bg-info">{action.reason}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {validation.warnings.length > 0 && (
              <div className="alert alert-warning mb-4">
                <h6>
                  <FontAwesomeIcon icon={faExclamationTriangle} className="me-2" />
                  Warnings
                </h6>
                <ul className="mb-0">
                  {validation.warnings.map((warning, idx) => (
                    <li key={idx}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            {validation.errors.length > 0 && (
              <div className="alert alert-danger mb-4">
                <h6>
                  <FontAwesomeIcon icon={faTimes} className="me-2" />
                  Errors
                </h6>
                <ul className="mb-0">
                  {validation.errors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="d-flex gap-2 justify-content-end">
              <button
                className="btn btn-secondary"
                onClick={handleCancel}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCommit}
                disabled={loading || validation.errors.length > 0}
              >
                {loading ? (
                  <>
                    <FontAwesomeIcon icon={faSpinner} spin className="me-2" />
                    Importing...
                  </>
                ) : (
                  <>
                    <FontAwesomeIcon icon={faCheck} className="me-2" />
                    Approve & Import
                  </>
                )}
              </button>
            </div>
          </div>
        </section>
      )}

      {stage === "result" && commitResult && (
        <section className="bento-card">
          <div className="p-4">
            <h2 className="mb-4">Import Complete</h2>

            <div className="alert alert-success mb-4">
              <FontAwesomeIcon icon={faCheck} className="me-2" />
              {commitResult.summary}
            </div>

            {commitResult.errors.length > 0 && (
              <div className="alert alert-warning mb-4">
                <h6>
                  <FontAwesomeIcon icon={faExclamationTriangle} className="me-2" />
                  Some records encountered errors:
                </h6>
                <div className="table-responsive">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Roll No</th>
                        <th>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commitResult.errors.map((item, idx) => (
                        <tr key={idx}>
                          <td>#{item.rollNo}</td>
                          <td>{item.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <button className="btn btn-primary" onClick={handleCancel}>
              Done
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
