import { mockLectures } from '@/features/lectures/mockData';
import type { CreateLectureInput, Lecture } from '@/types';
import { getCourse } from './courses';

function copy(lecture: Lecture): Lecture {
  return { ...lecture, keyConcepts: [...lecture.keyConcepts], importantPoints: [...lecture.importantPoints], assignments: [...lecture.assignments], examMentions: [...lecture.examMentions] };
}

const lectures = mockLectures.map(copy);
let nextId = 1;

export async function getLectures(courseId: string): Promise<Lecture[]> {
  return lectures.filter((lecture) => lecture.courseId === courseId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(copy);
}

export async function getLecture(id: string): Promise<Lecture | null> {
  const lecture = lectures.find((item) => item.id === id);
  return lecture ? copy(lecture) : null;
}

/** In-memory only; created lectures disappear when the app reloads. */
export async function createLecture(input: CreateLectureInput): Promise<Lecture> {
  if (!(await getCourse(input.courseId))) throw new Error('Course not found.');
  const lecture = copy({ ...input, id: `local-lecture-${nextId++}`, createdAt: new Date().toISOString() });
  lectures.unshift(lecture);
  return copy(lecture);
}
