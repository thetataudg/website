"use client";

import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Check, ChevronsUpDown, FileText, Loader2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type EventOption = {
  _id: string;
  name: string;
  startTime: string;
  committeeName?: string;
};

export type MinuteFormValues = {
  startTime: string;
  endTime: string;
  activesPresent: string;
  quorumRequired: boolean;
  executiveSummary: string;
  eventId?: string;
  file?: File | null;
};

type MinuteFormModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: MinuteFormValues) => void | Promise<void>;
  title?: string;
  submitLabel?: string;
  disabled?: boolean;
  showFileInput?: boolean;
  initialValues?: MinuteFormValues;
  events?: EventOption[];
  error?: string | null;
};

const blankValues: MinuteFormValues = {
  startTime: "",
  endTime: "",
  activesPresent: "",
  quorumRequired: false,
  executiveSummary: "",
};

const RECENT_EVENT_COUNT = 5;
const UPCOMING_EVENT_COUNT = 10;

const eventDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Phoenix",
});

const splitDateTime = (value: string) => {
  const [date = "", time = ""] = value.split("T");
  return {
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "",
    time: /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : "",
  };
};

function DateTimeField({
  id,
  label,
  value,
  onChange,
  disabled,
  invalid,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  invalid: boolean;
}) {
  const parts = splitDateTime(value);
  const update = (date: string, time: string) =>
    onChange(date || time ? `${date}T${time}` : "");

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-foreground">{label}</legend>
      {/* One control rather than a date box beside a time box: they set one
        * value between them, and the picker already pairs them the way the
        * rest of the site does. */}
      <DateTimePicker
        id={`${id}-when`}
        value={parts.date || parts.time ? `${parts.date}T${parts.time}` : ""}
        onChange={(next) => {
          const [date = "", time = ""] = next.split("T");
          update(date, time);
        }}
        disabled={disabled}
        placeholder="Choose date"
        className={invalid ? "[&>button]:border-destructive" : undefined}
      />
    </fieldset>
  );
}

export default function MinuteFormModal({
  open,
  onClose,
  onSubmit,
  title = "Record new minutes",
  submitLabel = "Save minutes",
  disabled = false,
  showFileInput = false,
  initialValues,
  events,
  error,
}: MinuteFormModalProps) {
  const buildInitial = useCallback(
    () => ({
      startTime: initialValues?.startTime ?? "",
      endTime: initialValues?.endTime ?? "",
      activesPresent: initialValues?.activesPresent ?? "",
      quorumRequired: initialValues?.quorumRequired ?? false,
      executiveSummary: initialValues?.executiveSummary ?? "",
    }),
    [initialValues]
  );

  const [values, setValues] = useState<MinuteFormValues>(blankValues);
  const [file, setFile] = useState<File | null>(null);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [selectedEventId, setSelectedEventId] = useState(
    initialValues?.eventId ?? ""
  );
  const [eventPickerOpen, setEventPickerOpen] = useState(false);
  const [eventSearch, setEventSearch] = useState("");
  const [eventReferenceTime, setEventReferenceTime] = useState(Date.now());
  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    setValues(buildInitial());
    setFile(null);
    setSelectedFileName("");
    setSelectedEventId(initialValues?.eventId ?? "");
    setEventPickerOpen(false);
    setEventSearch("");
    if (open) setEventReferenceTime(Date.now());
    setValidationError("");
  }, [buildInitial, initialValues, open]);

  const sortedEvents = useMemo(
    () =>
      [...(events ?? [])].sort(
        (first, second) =>
          new Date(first.startTime).getTime() -
          new Date(second.startTime).getTime()
      ),
    [events]
  );
  const recentEvents = useMemo(
    () =>
      sortedEvents
        .filter(
          (event) => new Date(event.startTime).getTime() < eventReferenceTime
        )
        .slice(-RECENT_EVENT_COUNT)
        .reverse(),
    [eventReferenceTime, sortedEvents]
  );
  const upcomingEvents = useMemo(
    () =>
      sortedEvents
        .filter(
          (event) => new Date(event.startTime).getTime() >= eventReferenceTime
        )
        .slice(0, UPCOMING_EVENT_COUNT),
    [eventReferenceTime, sortedEvents]
  );
  const normalizedEventSearch = eventSearch.trim().toLowerCase();
  const searchedEvents = useMemo(() => {
    if (!normalizedEventSearch) return [];
    return sortedEvents.filter((event) =>
      `${event.name} ${event.committeeName ?? ""}`
        .toLowerCase()
        .includes(normalizedEventSearch)
    );
  }, [normalizedEventSearch, sortedEvents]);
  const selectedEvent = sortedEvents.find(
    (event) => event._id === selectedEventId
  );

  const chooseEvent = (eventId: string) => {
    setSelectedEventId(eventId);
    setEventPickerOpen(false);
    setEventSearch("");
  };

  const renderEventOption = (event: EventOption) => (
    <CommandItem
      key={event._id}
      value={`${event.name} ${event.committeeName ?? ""} ${event._id}`}
      onSelect={() => chooseEvent(event._id)}
      className="items-start"
    >
      <Check
        aria-hidden="true"
        className={cn(
          "mt-0.5",
          selectedEventId === event._id ? "opacity-100" : "opacity-0"
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{event.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {event.committeeName ? `${event.committeeName} · ` : ""}
          {eventDateFormatter.format(new Date(event.startTime))}
        </span>
      </span>
    </CommandItem>
  );

  const handleChange = (
    field: keyof MinuteFormValues,
    value: string | boolean
  ) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);
    setSelectedFileName(nextFile?.name ?? "");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;
    const start = splitDateTime(values.startTime);
    const end = splitDateTime(values.endTime);
    if (!start.date || !start.time || !end.date || !end.time) {
      setValidationError("Choose both a date and time for the meeting start and end.");
      return;
    }
    setValidationError("");
    await Promise.resolve(
      onSubmit({
        ...values,
        file,
        eventId: selectedEventId || undefined,
      })
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !disabled) onClose();
      }}
    >
      <DialogContent className="grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-5 pr-12">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Add meeting details, an executive summary, and the official PDF record.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 overflow-y-auto px-6 py-5">
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Minutes could not be saved</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <form id="minute-form" onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <DateTimeField
              id="minute-start"
              label="Meeting start"
              value={values.startTime}
              onChange={(value) => handleChange("startTime", value)}
              disabled={disabled}
              invalid={Boolean(validationError)}
            />
            <DateTimeField
              id="minute-end"
              label="Meeting end"
              value={values.endTime}
              onChange={(value) => handleChange("endTime", value)}
              disabled={disabled}
              invalid={Boolean(validationError)}
            />
          </div>
          {validationError ? (
            <p
              id="minute-time-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {validationError}
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="minute-actives">Actives present</Label>
              <Input
                id="minute-actives"
                type="number"
                min={0}
                value={values.activesPresent}
                onChange={(event) =>
                  handleChange("activesPresent", event.target.value)
                }
                disabled={disabled}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="minute-event">Linked event</Label>
              <Popover
                open={eventPickerOpen}
                onOpenChange={(nextOpen) => {
                  setEventPickerOpen(nextOpen);
                  if (!nextOpen) setEventSearch("");
                }}
                modal
              >
                <PopoverTrigger asChild>
                  <Button
                    id="minute-event"
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={eventPickerOpen}
                    disabled={disabled}
                    className="w-full justify-between font-normal"
                  >
                    <span
                      className={cn(
                        "truncate",
                        !selectedEvent && "text-muted-foreground"
                      )}
                    >
                      {selectedEvent
                        ? `${selectedEvent.name} · ${eventDateFormatter.format(
                            new Date(selectedEvent.startTime)
                          )}`
                        : "No linked event"}
                    </span>
                    <ChevronsUpDown
                      aria-hidden="true"
                      className="shrink-0 opacity-50"
                    />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-[var(--radix-popover-trigger-width)] p-0"
                >
                  <Command shouldFilter={false}>
                    <CommandInput
                      value={eventSearch}
                      onValueChange={setEventSearch}
                      placeholder="Search event or committee…"
                    />
                    <CommandList>
                      <CommandEmpty>No events found.</CommandEmpty>
                      {normalizedEventSearch ? (
                        <CommandGroup heading="Search results">
                          {searchedEvents.map(renderEventOption)}
                        </CommandGroup>
                      ) : (
                        <>
                          <CommandGroup>
                            <CommandItem
                              value="No linked event"
                              onSelect={() => chooseEvent("")}
                            >
                              <Check
                                aria-hidden="true"
                                className={cn(
                                  selectedEventId ? "opacity-0" : "opacity-100"
                                )}
                              />
                              No linked event
                            </CommandItem>
                          </CommandGroup>
                          {recentEvents.length ? (
                            <CommandGroup heading="Recent events">
                              {recentEvents.map(renderEventOption)}
                            </CommandGroup>
                          ) : null}
                          {upcomingEvents.length ? (
                            <CommandGroup heading="Upcoming events">
                              {upcomingEvents.map(renderEventOption)}
                            </CommandGroup>
                          ) : null}
                        </>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-border p-4">
            <Checkbox
              id="minute-quorum"
              checked={values.quorumRequired}
              onCheckedChange={(checked) =>
                handleChange("quorumRequired", checked === true)
              }
              disabled={disabled}
            />
            <div className="space-y-1">
              <Label htmlFor="minute-quorum">Quorum was required</Label>
              <p className="text-sm text-muted-foreground">
                Record whether this meeting required quorum for chapter business.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="minute-summary">Executive summary</Label>
            <Textarea
              id="minute-summary"
              rows={5}
              value={values.executiveSummary}
              onChange={(event) =>
                handleChange("executiveSummary", event.target.value)
              }
              disabled={disabled}
              required
              placeholder="Summarize decisions, votes, announcements, and follow-up items."
            />
          </div>

          {showFileInput ? (
            <div className="space-y-2">
              <Label htmlFor="minute-file">Minutes PDF</Label>
              <Input
                id="minute-file"
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                disabled={disabled}
              />
              <p className="text-sm text-muted-foreground">
                PDF only, up to 20 MB.
              </p>
              {selectedFileName ? (
                <div className="flex min-w-0 items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-foreground">
                  <FileText className="size-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{selectedFileName}</span>
                </div>
              ) : null}
            </div>
          ) : null}
          </form>
        </div>

        <DialogFooter className="border-t border-border bg-muted/30 px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={disabled}
          >
            Cancel
          </Button>
          <Button type="submit" form="minute-form" disabled={disabled}>
            {disabled ? <Loader2 className="size-4 animate-spin" /> : null}
            {disabled ? "Saving…" : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
