import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyBookStructure, isBackTitle, isFrontTitle, readContentsPages } from './toc';
import type { RawPara } from './types';

/** A small book: cover, copyright, a printed contents page, two chapters, an index. */
function book(): RawPara[] {
  const p: RawPara[] = [
    { text: 'CALCULUS', page: 1, scale: 2.4 },
    { text: 'Early Concepts', page: 1, scale: 1.4 },
    { text: 'Copyright 2020 Example Press. All rights reserved. ISBN 978-0-00-000000-0', page: 2 },
    { text: 'Contents', page: 3, scale: 1.6 },
    { text: 'Preface ........ 4', page: 3 },
    { text: '1 Limits ........ 5', page: 3 },
    { text: '1.1 The idea of a limit ........ 5 1.2 Limit laws ........ 7', page: 3 },
    { text: '2 Derivatives ........ 9', page: 3 },
    { text: '2.1 The power rule ........ 9', page: 3 },
    { text: 'Index ........ 12', page: 3 },
    { text: 'Preface', page: 4, scale: 1.6 },
    { text: 'This book was written for a first course.', page: 4 },
    { text: '1 Limits', page: 5, scale: 1.8 },
    { text: '1.1 The idea of a limit', page: 5, scale: 1.3 },
    { text: 'A limit describes the value a function approaches.', page: 5 },
    { text: 'Worked example', page: 6, scale: 1.3 },
    { text: 'Find the limit of x^2 as x approaches 3.', page: 6 },
    { text: '1.2 Limit laws', page: 7, scale: 1.3 },
    { text: 'The limit of a sum is the sum of the limits.', page: 7 },
    { text: '2 Derivatives', page: 9, scale: 1.8 },
    { text: '2.1 The power rule', page: 9, scale: 1.3 },
    { text: 'Bring the power down and reduce it by one.', page: 9 },
    { text: 'Index', page: 12, scale: 1.6 },
    { text: 'chain rule, 44; derivative, 9; limit, 5', page: 12 },
  ];
  return p;
}

test('front and back matter titles are recognised', () => {
  for (const t of ['Contents', 'Preface', 'Copyright', 'Acknowledgements']) assert.ok(isFrontTitle(t), t);
  for (const t of ['Index', 'Bibliography', 'References']) assert.ok(isBackTitle(t), t);
  assert.equal(isFrontTitle('Limits'), false);
  assert.equal(isBackTitle('The power rule'), false);
});

test('a printed contents page is read, including two entries glued on one line', () => {
  const { entries, pages } = readContentsPages(book());
  assert.ok(pages.has(3));
  const titles = entries.map((e) => e.title);
  for (const t of ['Limits', 'The idea of a limit', 'Limit laws', 'Derivatives', 'The power rule']) assert.ok(titles.some((x) => x.includes(t)), `${t} in ${titles.join(' | ')}`);
  const chapter = entries.find((e) => e.title.includes('Derivatives'))!;
  const section = entries.find((e) => e.title.includes('power rule'))!;
  assert.ok(section.level > chapter.level);
});

test('chapters and sections come from the contents page; cover, preface and index are left out', () => {
  const out = applyBookStructure(book(), [], 12);
  assert.equal(out.via, 'contents');
  const text = out.paras.map((p) => p.text).join('\n');
  assert.ok(!/Copyright|ISBN/.test(text), 'copyright page dropped');
  assert.ok(!/first course/.test(text), 'preface dropped');
  assert.ok(!/chain rule, 44/.test(text), 'index dropped');
  assert.ok(!/\.\.\.\./.test(text), 'contents page dropped');
  const heads = out.paras.filter((p) => p.level === 1).map((p) => p.text);
  assert.equal(heads.length, 2, heads.join(' | '));
  const subs = out.paras.filter((p) => p.level === 2).map((p) => p.text);
  assert.equal(subs.length, 3, subs.join(' | '));
  // a heading the contents page does not list stays inside its lesson
  const worked = out.paras.find((p) => p.text === 'Worked example')!;
  assert.ok(worked && (worked.level ?? 3) >= 3);
  assert.ok(out.skipped >= 3);
});

test('a file outline wins over everything else', () => {
  const outline = [
    { title: 'Limits', level: 1, page: 5 },
    { title: 'The idea of a limit', level: 2, page: 5 },
    { title: 'Limit laws', level: 2, page: 7 },
    { title: 'Derivatives', level: 1, page: 9 },
    { title: 'The power rule', level: 2, page: 9 },
  ];
  const out = applyBookStructure(book(), outline, 12);
  assert.equal(out.via, 'outline');
  assert.equal(out.paras.filter((p) => p.level === 1).length, 2);
});

test('short notes with no contents are left alone', () => {
  const notes: RawPara[] = [
    { text: 'Like terms', page: 1, scale: 1.5 },
    { text: 'Only like terms can be added.', page: 1 },
    { text: 'Brackets', page: 2, scale: 1.5 },
    { text: 'Multiply everything inside.', page: 2 },
  ];
  const out = applyBookStructure(notes, [], 2);
  assert.ok(out.via === 'type' || out.via === 'numbering');
  assert.equal(out.paras.length, 4);
});

/** A book in the "Part / Chapter" style: an at-a-glance list, then the full contents; printed page 1 is the file's page 7. */
function partsBook(): RawPara[] {
  const p: RawPara[] = [
    { text: 'ALGEBRA II', page: 1, scale: 2.6 },
    { text: 'Copyright 2006 Example Publishing. All rights reserved. ISBN 978-0-00-000000-0', page: 2 },
    { text: 'Contents at a Glance', page: 3, scale: 1.8 },
    ...['Introduction ..... 1', 'Part I: Homing in on Basic Solutions ..... 3', 'Chapter 1: Going Beyond Beginning Algebra ..... 5', 'Chapter 2: Toeing the Straight Line: Linear Equations ..... 9', 'Part II: Facing Off with Functions ..... 13', 'Chapter 3: Graphing Your Way to the Good Life ..... 15', 'Index ..... 19'].map((text) => ({ text, page: 3, x: 72 })),
    { text: 'Table of Contents', page: 4, scale: 1.8 },
    { text: 'Introduction ..... 1', page: 4, x: 72 },
    { text: 'Part I: Homing in on Basic Solutions ..... 3', page: 4, x: 72 },
    { text: 'Chapter 1: Going Beyond Beginning Algebra ..... 5', page: 4, x: 72 },
    { text: 'Outlining Algebra Properties ..... 5', page: 4, x: 90 },
    { text: 'Ordering Your Operations ..... 7', page: 4, x: 90 },
    { text: 'Chapter 2: Toeing the Straight Line: Linear Equations ..... 9', page: 4, x: 72 },
    { text: 'Linear Equations: Handling the First Degree ..... 9', page: 4, x: 90 },
    { text: 'Part II: Facing Off with Functions ..... 13', page: 4, x: 72 },
    { text: 'Chapter 3: Graphing Your Way to the Good Life ..... 15', page: 4, x: 72 },
    { text: 'Graphing Lines ..... 16', page: 4, x: 90 },
    { text: 'Index ..... 19', page: 4, x: 72 },
    { text: 'Introduction', page: 7, scale: 2 },
    { text: 'This book assumes you have met algebra before.', page: 7 },
    { text: 'Part I: Homing in on Basic Solutions', page: 9, scale: 2.4 },
    { text: 'In this part you review the basics.', page: 9 },
    { text: 'Chapter 1', page: 11, scale: 1.3 },
    { text: 'Going Beyond Beginning Algebra', page: 11, scale: 2 },
    { text: 'Algebra has rules that keep it honest.', page: 11 },
    { text: 'Outlining Algebra Properties', page: 11, scale: 1.5 },
    { text: 'The commutative property lets you swap the order.', page: 11 },
    { text: 'Chapter 1: Going Beyond Beginning Algebra 6', page: 12, scale: 0.85 },
    { text: 'Ordering Your Operations', page: 13, scale: 1.5 },
    { text: 'Powers first, then multiplying, then adding.', page: 13 },
    { text: 'Chapter 2', page: 15, scale: 1.3 },
    { text: 'Toeing the Straight Line: Linear Equations', page: 15, scale: 2 },
    { text: 'Linear Equations: Handling the First Degree', page: 15, scale: 1.5 },
    { text: 'A linear equation has the variable to the first power.', page: 15 },
    { text: 'Part II: Facing Off with Functions', page: 19, scale: 2.4 },
    { text: 'In this part you meet functions.', page: 19 },
    // a blank page was left out of the file here: from now on the printed number is one further ahead
    { text: 'Chapter 3', page: 20, scale: 1.3 },
    { text: 'Graphing Your Way to the Good Life', page: 20, scale: 2 },
    { text: 'Chapter 3: Graphing Your Way to the Good Life 16', page: 21, scale: 0.85 },
    { text: 'Graphing Lines', page: 21, scale: 1.5 },
    { text: 'A line needs two points.', page: 21 },
    { text: 'Index', page: 24, scale: 2 },
    { text: 'absolute value, 31; binomial, 44', page: 24 },
  ];
  return p;
}

test('"Contents at a Glance" plus the full contents: each entry once, parts marked, sections nested', () => {
  const { entries, pages } = readContentsPages(partsBook());
  assert.deepEqual([...pages], [3, 4]);
  assert.equal(entries.filter((e) => /Chapter 1:/.test(e.title)).length, 1);
  assert.equal(entries.filter((e) => e.part).length, 2);
  assert.equal(entries.find((e) => e.title === 'Graphing Lines')!.level, 2);
  assert.equal(entries.find((e) => /Chapter 3/.test(e.title))!.printed, 15);
});

test('chapters are placed by page: every chapter found, running heads and part dividers gone', () => {
  const out = applyBookStructure(partsBook(), [], 24);
  assert.equal(out.via, 'contents');
  const chapters = out.paras.filter((p) => p.level === 1).map((p) => p.text);
  assert.deepEqual(chapters, ['Going Beyond Beginning Algebra', 'Toeing the Straight Line: Linear Equations', 'Graphing Your Way to the Good Life']);
  const sections = out.paras.filter((p) => p.level === 2).map((p) => p.text);
  assert.deepEqual(sections, ['Outlining Algebra Properties', 'Ordering Your Operations', 'Linear Equations: Handling the First Degree', 'Graphing Lines']);
  const text = out.paras.map((p) => p.text).join('\n');
  for (const gone of ['assumes you have met', 'In this part', 'Beginning Algebra 6', 'Good Life 16', 'binomial, 44', 'Copyright', '.....']) assert.ok(!text.includes(gone), gone);
  assert.ok(text.includes('A line needs two points.'));
});
