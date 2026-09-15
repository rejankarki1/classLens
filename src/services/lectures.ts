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
  // owner_id is what makes a lecture yours, and what Catch Up shares by.
  const { data: auth } = await supabase.auth.getSession();
  const ownerId = auth.session?.user.id;
  if (!ownerId) throw new Error('You are signed out. Sign in and try again.');
  const { data, error } = await supabase.from('lectures').insert({
    id, course_id: input.courseId, title: input.title, summary: input.summary,
    key_concepts: input.keyConcepts, important_points: input.importantPoints,
    assignments: input.assignments, exam_mentions: input.examMentions,
    owner_id: ownerId,
  }).select(lectureColumns).returns<LectureRow[]>().single();
  if (error) throw new Error(`Could not create lecture (attempted ID ${id}): ${error.message}`);
  if (!data) throw new Error(`No saved lecture was returned (attempted ID ${id}).`);
  return fromRow(data);
}

/** Catch Up: lectures shared by the given classmates, newest first. */
export async function getLecturesByOwners(ownerIds: string[]): Promise<Lecture[]> {
  if (getDataMode() !== 'supabase' || !ownerIds.length) return [];
  const { supabase } = await import('@/lib/supabase');
  const { data, error } = await supabase
    .from('lectures')
    .select(lectureColumns)
    .in('owner_id', ownerIds)
    .order('created_at', { ascending: false })
    .order('id')
    .returns<LectureRow[]>();
  if (error) throw new Error(`Could not load shared lectures: ${error.message}`);
  return data.map(fromRow);
}

/**
 * Catch Up: copy a classmate's shared lecture into your own notebook. The
 * original is never modified; this inserts a new lecture owned by you.
 * Materials are not copied: the original capture stays with its owner.
 */
export async function copyLectureToMyNotes(lectureId: string): Promise<Lecture> {
  if (getDataMode() !== 'supabase') throw new Error('Catch Up requires EXPO_PUBLIC_DATA_MODE=supabase.');
  const source = await getLecture(lectureId);
  if (!source) throw new Error('That shared lecture is no longer available.');
  return createLecture({
    courseId: source.courseId,
    title: source.title,
    summary: source.summary,
    keyConcepts: source.keyConcepts,
    importantPoints: source.importantPoints,
    assignments: source.assignments,
    examMentions: source.examMentions,
  });
}
