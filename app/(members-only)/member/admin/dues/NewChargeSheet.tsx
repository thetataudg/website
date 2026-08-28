"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DatePicker, toYmd } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

type ChargeMember = {
  rollNo: string;
  fName: string;
  lName: string;
};

type ChargeCategory = "dues" | "fine" | "event" | "merch" | "other";

const CATEGORY_OPTIONS: Array<{
  value: ChargeCategory;
  label: string;
  defaultDescription: string;
}> = [
  { value: "dues", label: "Chapter dues", defaultDescription: "Chapter dues" },
  { value: "fine", label: "Fine", defaultDescription: "Fine" },
  { value: "event", label: "Event", defaultDescription: "Event charge" },
  { value: "merch", label: "Merchandise", defaultDescription: "Merchandise" },
  { value: "other", label: "Other", defaultDescription: "Other charge" },
];

function defaultDueDate() {
  const date = new Date();
  date.setDate(date.getDate() + 21);
  return toYmd(date);
}

function memberName(member: ChargeMember) {
  return `${member.fName} ${member.lName}`;
}

export default function NewChargeSheet({
  members,
  onClose,
  onCreated,
}: {
  members: ChargeMember[];
  onClose: () => void;
  onCreated: (message: string) => void | Promise<void>;
}) {
  const [allActive, setAllActive] = useState(false);
  const [rollNo, setRollNo] = useState("");
  const [recipientOpen, setRecipientOpen] = useState(false);
  const [category, setCategory] = useState<ChargeCategory>("dues");
  const [description, setDescription] = useState("Chapter dues");
  const [amount, setAmount] = useState("");
  const [term, setTerm] = useState("");
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [minDueDate] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  });

  const sortedMembers = useMemo(
    () =>
      [...members].sort((a, b) =>
        memberName(a).localeCompare(memberName(b))
      ),
    [members]
  );
  const selectedMember = members.find((member) => member.rollNo === rollNo);
  const numericAmount = Number(amount);
  const amountCents =
    Number.isFinite(numericAmount) && numericAmount > 0
      ? Math.round(numericAmount * 100)
      : null;
  const canSubmit = Boolean(
    description.trim() &&
      amountCents &&
      dueDate &&
      (allActive ? members.length > 0 : rollNo)
  );

  async function submit(allowDuplicates = false) {
    if (!canSubmit || amountCents === null) return;
    setSaving(true);
    setError(null);
    if (allowDuplicates) setDuplicateWarning(null);

    try {
      const response = await fetch("/api/dues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allActive,
          ...(allActive ? {} : { rollNo }),
          category,
          description: description.trim(),
          amountCents,
          term: term.trim() || undefined,
          dueDate,
          notes: notes.trim() || undefined,
          allowDuplicates,
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (response.status === 409) {
        setDuplicateWarning(
          payload?.error || "A matching open charge already exists."
        );
        return;
      }
      if (!response.ok) {
        throw new Error(payload?.error || "Couldn't create the charge");
      }

      const count = Array.isArray(payload?.charges) ? payload.charges.length : 1;
      const notified = Number(payload?.notified || 0);
      const notificationText = notified
        ? ` ${notified} member${notified === 1 ? " was" : "s were"} notified.`
        : "";
      await onCreated(
        `Created ${count} charge${count === 1 ? "" : "s"}.${notificationText}`
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Couldn't create the charge"
      );
    } finally {
      setSaving(false);
    }
  }

  function changeCategory(nextCategory: ChargeCategory) {
    const currentDefault = CATEGORY_OPTIONS.find(
      (option) => option.value === category
    )?.defaultDescription;
    const nextDefault = CATEGORY_OPTIONS.find(
      (option) => option.value === nextCategory
    )?.defaultDescription;
    setCategory(nextCategory);
    if (!description.trim() || description === currentDefault) {
      setDescription(nextDefault || "");
    }
  }

  return (
    <>
      <Sheet
        open
        onOpenChange={(open) => {
          if (!open && !saving) onClose();
        }}
      >
        <SheetContent className="grid w-full grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-xl">
          <SheetHeader className="border-b px-6 py-5 pr-12">
            <SheetTitle>New charge</SheetTitle>
            <SheetDescription>
              Assign a charge to one member or everyone currently active.
            </SheetDescription>
          </SheetHeader>

          <form
            id="new-charge-form"
            className="contents"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <div className="space-y-7 overflow-y-auto px-6 py-6">
              {error ? (
                <Alert variant="destructive" role="alert">
                  <AlertTitle>Charge wasn&apos;t created</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <section className="space-y-4" aria-labelledby="charge-who-heading">
                <div>
                  <h3 id="charge-who-heading" className="font-semibold">
                    Who
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Choose one member or charge the entire active roster.
                  </p>
                </div>

                <div className="flex items-start gap-3 rounded-lg border p-4">
                  <Checkbox
                    id="all-active"
                    checked={allActive}
                    onCheckedChange={(checked) => setAllActive(checked === true)}
                  />
                  <div className="min-w-0 flex-1">
                    <Label htmlFor="all-active" className="cursor-pointer">
                      Every active member
                    </Label>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Creates one charge for each person on the active roster.
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    <Users aria-hidden="true" className="size-3" />
                    {members.length}
                  </Badge>
                </div>

                {!allActive ? (
                  <div className="space-y-2">
                    <Label id="recipient-label">Member</Label>
                    <Popover
                      open={recipientOpen}
                      onOpenChange={setRecipientOpen}
                      modal
                    >
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          aria-labelledby="recipient-label"
                          aria-expanded={recipientOpen}
                          className="w-full justify-between font-normal"
                        >
                          {selectedMember ? (
                            <span className="truncate">
                              {memberName(selectedMember)} · #{selectedMember.rollNo}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              Search active members…
                            </span>
                          )}
                          <ChevronsUpDown
                            aria-hidden="true"
                            className="ml-2 size-4 shrink-0 opacity-50"
                          />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
                        <Command>
                          <CommandInput placeholder="Search by name or roll number…" />
                          <CommandList>
                            <CommandEmpty>No active member found.</CommandEmpty>
                            <CommandGroup>
                              {sortedMembers.map((member) => (
                                <CommandItem
                                  key={member.rollNo}
                                  value={`${memberName(member)} ${member.rollNo}`}
                                  onSelect={() => {
                                    setRollNo(member.rollNo);
                                    setRecipientOpen(false);
                                  }}
                                >
                                  <Check
                                    aria-hidden="true"
                                    className={cn(
                                      "mr-2 size-4",
                                      rollNo === member.rollNo
                                        ? "opacity-100"
                                        : "opacity-0"
                                    )}
                                  />
                                  <span className="min-w-0 flex-1 truncate">
                                    {memberName(member)}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    #{member.rollNo}
                                  </span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                ) : null}
              </section>

              <section className="space-y-4" aria-labelledby="charge-details-heading">
                <div>
                  <h3 id="charge-details-heading" className="font-semibold">
                    Charge details
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Describe what the member owes and when it is due.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="charge-category">Category</Label>
                    <Select
                      value={category}
                      onValueChange={(value) =>
                        changeCategory(value as ChargeCategory)
                      }
                    >
                      <SelectTrigger id="charge-category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORY_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="charge-amount">Amount</Label>
                    <CurrencyInput
                      id="charge-amount"
                      min="0.01"
                      step="0.01"
                      placeholder="0.00"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="charge-description">Description</Label>
                  <Input
                    id="charge-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="What is this charge for?"
                    required
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="charge-term">Term</Label>
                    <Input
                      id="charge-term"
                      value={term}
                      onChange={(event) => setTerm(event.target.value)}
                      placeholder="Current semester"
                    />
                    <p className="text-xs text-muted-foreground">
                      Leave blank to use the current term.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="charge-due-date">Due date</Label>
                    <DatePicker
                      id="charge-due-date"
                      value={dueDate}
                      onChange={setDueDate}
                      minDate={minDueDate}
                    />
                    <p className="text-xs text-muted-foreground">
                      Members may pay in full or propose a plan by this date.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="charge-notes">Internal notes</Label>
                  <Textarea
                    id="charge-notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Optional context for the finance record"
                    rows={3}
                  />
                </div>
              </section>
            </div>

            <SheetFooter className="border-t bg-background px-6 py-4">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit || saving}>
                {saving ? "Creating…" : "Create charge"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={Boolean(duplicateWarning)}
        onOpenChange={(open) => {
          if (!open && !saving) setDuplicateWarning(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create duplicate charge?</AlertDialogTitle>
            <AlertDialogDescription>
              {duplicateWarning} Continuing may charge the same member twice.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Go back</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={(event) => {
                event.preventDefault();
                void submit(true);
              }}
            >
              {saving ? "Creating…" : "Charge anyway"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
