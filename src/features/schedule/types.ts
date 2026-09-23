export type CourseSchedule = {
  id: string;
  courseId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

export type SaveCourseScheduleInput = {
  courseId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};
