import { mockLectures } from '@/features/lectures/mockData';
import { getDataMode } from '@/lib/dataMode';
import type { CreateLectureInput, Lecture } from '@/types';
import { getCourse } from './courses';

type LectureRow = {
  id: string;
  course_id: string;
  title: string;
  summary: string;
  key_concepts: string[];
  important_points: string[];
  assignments: string[];
  exam_mentions: string[];
  created_at: string;
};

// lecture_date is intentionally omitted: Lecture has no lectureDate field yet.
const lectureColumns = 'id, course_id, title, summary, key_concepts, important_points, assignments, exam_mentions, created_at';

function fromRow(row: LectureRow): Lecture {
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    summary: row.summary,
    keyConcepts: row.key_concepts,
    importantPoints: row.important_points,
    assignments: row.assignments,
    examMentions: row.exam_mentions,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function copy(lecture: Lecture): Lecture {
  return { ...lecture, keyConcepts: [...lecture.keyConcepts], importantPoints: [...lecture.importantPoints], assignments: [...lecture.assignments], examMentions: [...lecture.examMentions] };
}

const lectures = mockLectures.map(copy);
let nextId = 1;

export async function getLectures(courseId: string): Promise<Lecture[]> {
  if (getDataMode() === 'mock') {
    return lectures.filter((lecture) => lecture.courseId === courseId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
      .map(copy);
  }

  const { supabase } = await import('@/lib/supabase');
  const { data, error } = await supabase
    .from('lectures')
    .select(lectureColumns)
    .eq('course_id', courseId)
    .order('created_at', { ascending: false })
    .order('id')
    .returns<LectureRow[]>();

  if (error) throw new Error(`Could not load lectures: ${error.message}`);
  return data.map(fromRow);
}

export async function getLecture(id: string): Promise<Lecture | null> {
  if (getDataMode() === 'mock') {
    const lecture = lectures.find((item) => item.id === id);
    return lecture ? copy(lecture) : null;
  }

  const { supabase } = await import('@/lib/supabase');
  const { data, error } = await supabase
    .from('lectures')
    .select(lectureColumns)
    .eq('id', id)
    .returns<LectureRow[]>()
    .maybeSingle();

  if (error) throw new Error(`Could not load lecture: ${error.message}`);
  return data ? fromRow(data) : null;
}

/** Persist in Supabase mode; keep the local demo independent in mock mode. */
export async function createLecture(input: CreateLectureInput): Promise<Lecture> {
  if (!(await getCourse(input.courseId))) throw new Error('Course not found.');
  if (getDataMode() === 'mock') {
    const lecture = copy({ ...input, id: `local-lecture-${nextId++}`, createdAt: new Date().toISOString() });
    lectures.unshift(lecture);
    return copy(lecture);
  }
  const { randomUUID } = await import('expo-crypto');
  const { supabase } = await import('@/lib/supabase');
  const id = randomUUID();
  const { data, error } = await supabase.from('lectures').insert({
    id, course_id: input.courseId, title: input.title, summary: input.summary,
    key_concepts: input.keyConcepts, important_points: input.importantPoints,
    assignments: input.assignments, exam_mentions: input.examMentions,
  }).select(lectureColumns).returns<LectureRow[]>().single();
  if (error) throw new Error(`Could not create lecture (attempted ID ${id}): ${error.message}`);
  if (!data) throw new Error(`No saved lecture was returned (attempted ID ${id}).`);
  return fromRow(data);
}
