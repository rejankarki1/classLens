begin;

-- Storage cleanup and JWT verification live in the delete-account Edge
-- Function. Once Storage succeeds, this service-role-only function removes the
-- relational half atomically. The auth.users row is deleted last by the Edge
-- Function so a failed attempt remains retryable by the same signed-in user.
create or replace function public.delete_user_owned_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'User id is required.' using errcode = '22023';
  end if;

  -- A lecture can be referenced by rows owned by a different user. Delete by
  -- lecture relationship first, regardless of row owner, so another account's
  -- data can never prevent deletion. Copied CatchUp lectures are independent
  -- rows with no source foreign key and therefore remain with their owner.
  delete from public.quiz_missed_questions as missed
  using public.quiz_attempts as attempt, public.lectures as lecture
  where missed.quiz_attempt_id = attempt.id
    and attempt.lecture_id = lecture.id
    and lecture.owner_id = p_user_id;

  delete from public.notebook_corrections as correction
  using public.lectures as lecture
  where correction.lecture_id = lecture.id
    and lecture.owner_id = p_user_id;

  delete from public.quiz_attempts as attempt
  using public.lectures as lecture
  where attempt.lecture_id = lecture.id
    and lecture.owner_id = p_user_id;

  delete from public.materials as material
  using public.lectures as lecture
  where material.lecture_id = lecture.id
    and lecture.owner_id = p_user_id;

  delete from public.captures as capture
  using public.lectures as lecture
  where capture.lecture_id = lecture.id
    and lecture.owner_id = p_user_id;

  delete from public.processing_jobs as job
  using public.lectures as lecture
  where job.lecture_id = lecture.id
    and lecture.owner_id = p_user_id;

  -- Then remove rows directly owned by the departing user, including rows that
  -- are not attached to one of their lectures.
  delete from public.notebook_corrections where owner_id = p_user_id;
  delete from public.quiz_missed_questions where owner_id = p_user_id;
  delete from public.quiz_attempts where owner_id = p_user_id;
  delete from public.inbox_events where owner_id = p_user_id;

  delete from public.captures where owner_id = p_user_id;
  delete from public.processing_jobs where owner_id = p_user_id;
  delete from public.lectures where owner_id = p_user_id;
  delete from public.capture_analyses where owner_id = p_user_id;

  delete from public.course_memberships where user_id = p_user_id;
  delete from public.device_push_tokens where owner_id = p_user_id;
  delete from public.friendships
  where requester_id = p_user_id or addressee_id = p_user_id;
  delete from public.profiles where id = p_user_id;
end;
$$;

revoke all on function public.delete_user_owned_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_user_owned_data(uuid) to service_role;

commit;
