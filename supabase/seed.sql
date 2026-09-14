-- Existing ClassLens demo data. Reruns preserve rows with matching IDs.
begin;

insert into public.courses (id, code, name, professor)
values
  ('cs-3358', 'CS 3358', 'Data Structures', 'Professor Seaman'),
  ('math-3398', 'MATH 3398', 'Discrete Mathematics II', 'Professor Avery (sample)')
on conflict (id) do nothing;

insert into public.lectures (
  id, course_id, title, lecture_date, summary,
  key_concepts, important_points, assignments, exam_mentions, created_at
)
values
  (
    'binary-search-trees',
    'cs-3358',
    'Binary Search Trees',
    null,
    'Binary search trees organize values so that smaller keys sit to the left and larger keys to the right. Their shape determines how efficiently we can search, insert, and delete.',
    array['BST ordering property', 'In-order traversal', 'Tree height']::text[],
    array['In-order traversal visits keys in sorted order.', 'Search is O(h): O(log n) for balanced trees, O(n) in the worst case.']::text[],
    array['Practice inserting and deleting nodes in a binary search tree.']::text[],
    array['Review tree traversals for the next exam.']::text[],
    '2026-09-14T14:00:00.000Z'::timestamptz
  ),
  (
    'graph-traversal',
    'cs-3358',
    'Graph Traversal',
    null,
    'Breadth-first search explores neighbors level by level, while depth-first search follows one path before backtracking. Both track visited vertices to avoid cycles.',
    array['Breadth-first search', 'Depth-first search', 'Adjacency lists']::text[],
    array['BFS uses a queue; DFS uses a stack or recursion.', 'With adjacency lists, both run in O(V + E).']::text[],
    array['Trace BFS and DFS on a graph with a cycle.']::text[],
    array[]::text[],
    '2026-09-12T14:00:00.000Z'::timestamptz
  ),
  (
    'mathematical-induction',
    'math-3398',
    'Mathematical Induction',
    null,
    'Induction proves a statement for all integers in a range by establishing a base case and showing that each case implies the next.',
    array['Base case', 'Inductive hypothesis', 'Inductive step']::text[],
    array['State the range of integers clearly.', 'Use the hypothesis explicitly in the inductive step.']::text[],
    array[]::text[],
    array[]::text[],
    '2026-09-11T16:00:00.000Z'::timestamptz
  )
on conflict (id) do nothing;

commit;
