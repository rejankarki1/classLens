export interface Course {
  id: string;
  code: string;
  name: string;
  professor: string;
}

/** The ID is derived from the code, so callers never supply one. */
export type CreateCourseInput = Omit<Course, 'id'>;
