const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const vm = require('node:vm');

const file = path.join(__dirname, 'courseSchedules.ts');
const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function load(dataMode, supabase) {
  const serviceExports = {};
  vm.runInNewContext(code, {
    exports: serviceExports, Error, Date, Map, Array, Set, RegExp,
    require: (name) => {
      if (name === '@/lib/dataMode') return { getDataMode: () => dataMode };
      if (name === '@/lib/supabase') return { supabase };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return serviceExports;
}

(async () => {
  // Mock mode: saving the same course/day/start time twice updates one row.
  const mock = load('mock', null);
  const first = await mock.saveSchedule({ courseId: 'cs-3358', dayOfWeek: 2, startTime: '09:00', endTime: '10:15' });
  assert.equal(first.endTime, '10:15');
  const second = await mock.saveSchedule({ courseId: 'cs-3358', dayOfWeek: 2, startTime: '09:00', endTime: '10:30' });
  assert.equal(second.id, first.id, 'a repeat save for the same course/day/start updates the same row');
  assert.equal(second.endTime, '10:30');
  const list = await mock.getMySchedules();
  assert.equal(list.length, 1);
  console.log('PASS: mock mode upserts one row per course/day/start time.');

  await assert.rejects(() => mock.saveSchedule({ courseId: 'cs-3358', dayOfWeek: 2, startTime: '10:00', endTime: '09:00' }), /after start time/);
  await assert.rejects(() => mock.saveSchedule({ courseId: 'cs-3358', dayOfWeek: 9, startTime: '09:00', endTime: '10:00' }), /between 0 and 6/);
  await assert.rejects(() => mock.saveSchedule({ courseId: 'cs-3358', dayOfWeek: 2, startTime: '9am', endTime: '10:00' }), /HH:MM/);
  console.log('PASS: invalid day, time format, and ordering are all rejected.');

  await mock.deleteSchedule(first.id);
  assert.equal((await mock.getMySchedules()).length, 0);
  console.log('PASS: mock mode deletes by id.');

  // Supabase mode: upsert targets the composite key; delete is scoped to id and user_id.
  let upsertCalls = 0;
  let deleteEqCalls = [];
  const savedRow = { id: 'row-1', course_id: 'cs-3358', day_of_week: 2, start_time: '09:00', end_time: '10:15' };
  const supabase = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'owner-1' } } }, error: null }) },
    from: (table) => {
      assert.equal(table, 'course_schedules');
      return {
        upsert: (values, options) => {
          upsertCalls += 1;
          assert.equal(values.user_id, 'owner-1');
          assert.equal(options.onConflict, 'user_id,course_id,day_of_week,start_time');
          return { select: () => ({ returns: () => ({ single: async () => ({ data: savedRow, error: null }) }) }) };
        },
        delete: () => ({
          eq: (column, value) => {
            deleteEqCalls.push([column, value]);
            return { eq: (column2, value2) => { deleteEqCalls.push([column2, value2]); return Promise.resolve({ error: null }); } };
          },
        }),
      };
    },
  };
  const supabaseMode = load('supabase', supabase);
  const saved = await supabaseMode.saveSchedule({ courseId: 'cs-3358', dayOfWeek: 2, startTime: '09:00', endTime: '10:15' });
  assert.equal(saved.courseId, 'cs-3358');
  assert.equal(upsertCalls, 1);

  await supabaseMode.deleteSchedule('row-1');
  assert.deepEqual(deleteEqCalls, [['id', 'row-1'], ['user_id', 'owner-1']]);
  console.log('PASS: supabase mode upserts on the composite key and scopes deletes to id and user_id.');

  // Enrollment/schedule changes must never delete catalog rows: neither this
  // file nor enrollment.ts issues .delete() against the courses table.
  const source = fs.readFileSync(file, 'utf8') + fs.readFileSync(path.join(__dirname, 'enrollment.ts'), 'utf8');
  assert.doesNotMatch(source, /from\(['"]courses['"]\)[\s\S]{0,80}\.delete\(/, "no schedule/enrollment code path may delete from 'courses'");
  console.log("PASS: no code path in courseSchedules.ts or enrollment.ts deletes from the courses table.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
