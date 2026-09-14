import type { Lecture } from './types';

export const mockLectures: Lecture[] = [
  {
    id: 'binary-search-trees', courseId: 'cs-3358', title: 'Binary Search Trees',
    summary: 'Binary search trees organize values so that smaller keys sit to the left and larger keys to the right. Their shape determines how efficiently we can search, insert, and delete.',
    keyConcepts: ['BST ordering property', 'In-order traversal', 'Tree height'],
    importantPoints: ['In-order traversal visits keys in sorted order.', 'Search is O(h): O(log n) for balanced trees, O(n) in the worst case.'],
    assignments: ['Practice inserting and deleting nodes in a binary search tree.'],
    examMentions: ['Review tree traversals for the next exam.'],
    createdAt: '2026-09-14T14:00:00.000Z',
  },
  {
    id: 'graph-traversal', courseId: 'cs-3358', title: 'Graph Traversal',
    summary: 'Breadth-first search explores neighbors level by level, while depth-first search follows one path before backtracking. Both track visited vertices to avoid cycles.',
    keyConcepts: ['Breadth-first search', 'Depth-first search', 'Adjacency lists'],
    importantPoints: ['BFS uses a queue; DFS uses a stack or recursion.', 'With adjacency lists, both run in O(V + E).'],
    assignments: ['Trace BFS and DFS on a graph with a cycle.'], examMentions: [],
    createdAt: '2026-09-12T14:00:00.000Z',
  },
  {
    id: 'mathematical-induction', courseId: 'math-3398', title: 'Mathematical Induction',
    summary: 'Induction proves a statement for all integers in a range by establishing a base case and showing that each case implies the next.',
    keyConcepts: ['Base case', 'Inductive hypothesis', 'Inductive step'],
    importantPoints: ['State the range of integers clearly.', 'Use the hypothesis explicitly in the inductive step.'],
    assignments: [], examMentions: [], createdAt: '2026-09-11T16:00:00.000Z',
  },
];
