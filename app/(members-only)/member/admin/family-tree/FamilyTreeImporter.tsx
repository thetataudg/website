// app/(members-only)/member/admin/family-tree/FamilyTreeImporter.tsx

"use client";

import { useRef, useState } from "react";
import {
  CheckCircle2,
  FileJson,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";

import { PageContainer, PageHeader } from "../../../components/shell/PageShell";
import { LoadingSpinner } from "../../../components/LoadingState";
import { cn } from "@/lib/utils";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Attachment,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

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
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Shared by the file input and the drop target; parsing/validation unchanged. */
  const handleFile = async (selected: File | undefined | null) => {
    if (!selected) return;

    setError(null);
    setLoading(true);
    setFile({ name: selected.name, size: selected.size });

    try {
      const text = await selected.text();
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
    setFile(null);
    setJsonData(null);
    setValidation(null);
    setCommitResult(null);
    setError(null);
    setStage("upload");
  };

  const stageLabel =
    stage === "upload"
      ? "Step 1 of 3: Upload"
      : stage === "review"
      ? "Step 2 of 3: Review"
      : "Step 3 of 3: Complete";

  return (
    <PageContainer className="max-w-7xl space-y-6">
      <PageHeader
        title="Family tree import"
        description="Upload a JSON file of family relationships. Changes are validated and previewed before anything is applied."
        actions={<Badge variant="muted">{stageLabel}</Badge>}
      />

      {error && (
        <Alert variant="destructive" role="alert">
          <X aria-hidden="true" />
          <AlertTitle>Import error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {stage === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle>Select a file</CardTitle>
            <CardDescription>
              An array of objects with <code className="font-mono">rollNo</code>,{" "}
              <code className="font-mono">fName</code>,{" "}
              <code className="font-mono">lName</code>,{" "}
              <code className="font-mono">big</code>, and{" "}
              <code className="font-mono">littles</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Drop target. The input stays in the accessibility tree (sr-only,
              * not hidden) so it remains focusable and the label keeps working;
              * the ring is driven by focus-within. */}
            <div
              onDragOver={(event) => {
                event.preventDefault();
                if (!loading) setDragging(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setDragging(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                if (loading) return;
                void handleFile(event.dataTransfer.files?.[0]);
              }}
              className={cn(
                "rounded-lg border-2 border-dashed transition-colors",
                "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
                dragging
                  ? "border-primary bg-accent/50"
                  : "border-border hover:border-primary/50",
                loading && "pointer-events-none opacity-60"
              )}
            >
              <label
                htmlFor="family-tree-file"
                className="flex cursor-pointer flex-col items-center gap-3 px-6 py-10 text-center"
              >
                <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Upload className="size-5" aria-hidden="true" />
                </span>
                <span className="space-y-1">
                  <span className="block text-sm font-medium text-foreground">
                    Drop a JSON file here, or click to browse
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    .json files only
                  </span>
                </span>
              </label>
              <input
                ref={inputRef}
                id="family-tree-file"
                type="file"
                accept=".json,application/json"
                className="sr-only"
                disabled={loading}
                onChange={(event) => void handleFile(event.target.files?.[0])}
              />
            </div>

            {file && (
              <Attachment>
                <AttachmentMedia>
                  <FileJson aria-hidden="true" />
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle>{file.name}</AttachmentTitle>
                  <AttachmentDescription>
                    {loading ? "Validating…" : formatBytes(file.size)}
                  </AttachmentDescription>
                </AttachmentContent>
                <AttachmentActions>
                  {loading ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${file.name}`}
                      onClick={() => {
                        setFile(null);
                        setError(null);
                        if (inputRef.current) inputRef.current.value = "";
                      }}
                    >
                      <X className="size-4" aria-hidden="true" />
                    </Button>
                  )}
                </AttachmentActions>
              </Attachment>
            )}
          </CardContent>
        </Card>
      )}

      {stage === "review" && validation && (
        <div className="space-y-6">
          {file && (
            <Attachment>
              <AttachmentMedia>
                <FileJson aria-hidden="true" />
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>{file.name}</AttachmentTitle>
                <AttachmentDescription>
                  {formatBytes(file.size)}
                </AttachmentDescription>
              </AttachmentContent>
            </Attachment>
          )}

          <dl className="grid gap-4 sm:grid-cols-3">
            <SummaryTile
              label="New profiles"
              value={validation.creates.length}
            />
            <SummaryTile
              label="Relationship updates"
              value={validation.updates.length}
            />
            <SummaryTile
              label="Warnings"
              value={validation.warnings.length}
              tone={validation.warnings.length ? "warning" : "default"}
            />
          </dl>

          {validation.errors.length > 0 && (
            <Alert variant="destructive" role="alert">
              <X aria-hidden="true" />
              <AlertTitle>
                {validation.errors.length === 1 ? "1 error" : `${validation.errors.length} errors`}{" "}
                must be fixed before importing
              </AlertTitle>
              <AlertDescription>
                <ul className="mt-1 list-inside list-disc space-y-1">
                  {validation.errors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {validation.warnings.length > 0 && (
            <Alert variant="warning">
              <TriangleAlert aria-hidden="true" />
              <AlertTitle>Warnings</AlertTitle>
              <AlertDescription>
                <ul className="mt-1 list-inside list-disc space-y-1">
                  {validation.warnings.map((warning, idx) => (
                    <li key={idx}>{warning}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {validation.creates.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader className="border-b">
                <CardTitle className="text-base">
                  New profiles to create
                </CardTitle>
                <CardDescription>
                  {validation.creates.length} profile
                  {validation.creates.length === 1 ? "" : "s"} will be added.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32 pl-6">Roll</TableHead>
                      <TableHead className="pr-6">Name</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validation.creates.map((action) => (
                      <TableRow key={action.rollNo}>
                        <TableCell className="pl-6 font-mono text-sm">
                          #{action.rollNo}
                        </TableCell>
                        <TableCell className="pr-6">
                          {action.fName} {action.lName}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {validation.updates.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader className="border-b">
                <CardTitle className="text-base">
                  Relationships to update
                </CardTitle>
                <CardDescription>
                  Names and other fields are preserved. Only big and little
                  relationships change.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32 pl-6">Roll</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="pr-6">Change</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validation.updates.map((action) => (
                      <TableRow key={action.rollNo}>
                        <TableCell className="pl-6 font-mono text-sm">
                          #{action.rollNo}
                        </TableCell>
                        <TableCell>
                          {action.fName} {action.lName}
                        </TableCell>
                        <TableCell className="pr-6">
                          <Badge variant="secondary">{action.reason}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={handleCancel} disabled={loading}>
              Cancel
            </Button>
            <Button
              onClick={handleCommit}
              disabled={loading || validation.errors.length > 0}
            >
              {loading ? (
                <LoadingSpinner size="sm" />
              ) : (
                <CheckCircle2 className="size-4" aria-hidden="true" />
              )}
              {loading ? "Importing…" : "Approve & import"}
            </Button>
          </div>
        </div>
      )}

      {stage === "result" && commitResult && (
        <div className="space-y-6">
          <Alert variant="success">
            <CheckCircle2 aria-hidden="true" />
            <AlertTitle>Import complete</AlertTitle>
            <AlertDescription>{commitResult.summary}</AlertDescription>
          </Alert>

          {commitResult.errors.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader className="border-b">
                <CardTitle className="text-base">
                  Records that could not be imported
                </CardTitle>
                <CardDescription>
                  Everything else was applied successfully.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32 pl-6">Roll</TableHead>
                      <TableHead className="pr-6">Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commitResult.errors.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="pl-6 font-mono text-sm">
                          #{item.rollNo}
                        </TableCell>
                        <TableCell className="pr-6">{item.error}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end">
            <Button onClick={handleCancel}>Done</Button>
          </div>
        </div>
      )}
    </PageContainer>
  );
}

/** One count in the review summary. Renders <dt>/<dd> — wrap in a <dl>. */
function SummaryTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "warning";
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "warning" && value > 0
            ? "text-amber-600 dark:text-amber-400"
            : "text-foreground"
        )}
      >
        {value}
      </dd>
    </div>
  );
}
