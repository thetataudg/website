type RecurrenceConfig = {
  frequency?: "daily" | "weekly" | "monthly";
  interval?: number;
  endDate?: Date | null;
};

export function addRecurrence(
  startTime: Date,
  endTime: Date,
  config: RecurrenceConfig
) {
  const frequency = config.frequency || "weekly";
  const interval = Number(config.interval) || 1;
  const nextStart = new Date(startTime);

  if (frequency === "daily") {
    nextStart.setDate(nextStart.getDate() + interval);
  } else if (frequency === "monthly") {
    nextStart.setMonth(nextStart.getMonth() + interval);
  } else {
    nextStart.setDate(nextStart.getDate() + interval * 7);
  }

  if (config.endDate && nextStart > config.endDate) {
    return null;
  }

  const duration = endTime.getTime() - startTime.getTime();
  const nextEnd = new Date(nextStart.getTime() + duration);

  return { startTime: nextStart, endTime: nextEnd };
}

export function applyTimeOfDay(targetDate: Date, baseTime: Date) {
  const adjusted = new Date(targetDate);
  adjusted.setHours(
    baseTime.getHours(),
    baseTime.getMinutes(),
    baseTime.getSeconds(),
    baseTime.getMilliseconds()
  );
  return adjusted;
}
