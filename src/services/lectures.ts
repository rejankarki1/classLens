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

/** A friend's lecture, carrying who shared it so the UI can credit them. */
export type SharedLecture = Lecture & { ownerId: string };

/** Catch Up: lectures shared by the given classmates, newest first. */
export async function getLecturesByOwners(ownerIds: string[]): Promise<SharedLecture[]> {
  if (getDataMode() !== 'supabase' || !ownerIds.length) return [];
  const { supabase } = await import('@/lib/supabase');
  const { data, error } = await supabase
    .from('lectures')
    .select(`${lectureColumns}, owner_id`)
    .in('owner_id', ownerIds)
    .order('created_at', { ascending: false })
    .order('id')
    .returns<(LectureRow & { owner_id: string })[]>();
  if (error) throw new Error(`Could not load shared lectures: ${error.message}`);
  return data.map((row) => ({ ...fromRow(row), ownerId: row.owner_id }));
}

/** Copy saved analysis and real captures; retries resume the same user's copy. */
export async function copyLectureToMyNotes(lectureId: string, courseId?: string): Promise<Lecture> {
  if (getDataMode() !== 'supabase') throw new Error('Catch Up requires EXPO_PUBLIC_DATA_MODE=supabase.');
  const { supabase } = await import('@/lib/supabase');
  const { copyLectureMaterials } = await import('./materials');
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error('Sign in to add these notes.');
  const source = await getLecture(lectureId);
  if (!source) throw new Error('That shared lecture is no longer available.');
  if (courseId && courseId !== source.courseId) throw new Error('Shared notes must stay in their matching course.');
  const id = `catchup:${auth.user.id}:${source.id}`;
  let saved = await getLecture(id);
  if (!saved) {
    const { data, error } = await supabase.from('lectures').insert({
      id, owner_id: auth.user.id, course_id: source.courseId,
      title: source.title, summary: source.summary,
      key_concepts: source.keyConcepts, important_points: source.importantPoints,
      assignments: source.assignments, exam_mentions: source.examMentions,
    }).select(lectureColumns).returns<LectureRow[]>().single();
    // Recover a concurrent insert or a committed insert with a lost response.
    saved = data ? fromRow(data) : await getLecture(id);
    if (!saved) throw new Error(`Could not copy lecture: ${error?.message ?? 'No saved lecture returned.'}`);
  }
  await copyLectureMaterials(source.id, saved.id);
  return saved;
}
