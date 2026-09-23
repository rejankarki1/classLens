export type CourseSchedule = {
  id: string;
  courseId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  /** IANA zone (e.g. "America/Chicago"), captured from the device at save time. */
  timezone: string;
};

export type SaveCourseScheduleInput = {
  courseId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};
