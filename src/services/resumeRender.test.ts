import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderResumeHtml } from './resumeRender.js';
import { RESUME_CONTENT_SCHEMA } from '../constants/resume.js';
import { parseResumeContent, type ResumeContent } from './resumeContent.js';

const PAGE = { widthPt: 595.28, heightPt: 841.89 };

function fixture(overrides: Partial<ResumeContent> = {}): ResumeContent {
  return {
    header: { name: 'Elad Example', title: 'Senior Frontend Engineer', contacts: ['a@b.c', 'IL'] },
    layout: { columns: 1, sidebar: [] },
    sections: [
      {
        id: 'experience',
        heading: 'Experience',
        items: [
          {
            title: 'Senior Engineer',
            subtitle: 'Acme',
            meta: '2019–2024',
            text: null,
            bullets: ['Built React Native apps', 'Led a team of 4'],
          },
        ],
      },
      {
        id: 'skills',
        heading: 'Skills',
        items: [
          { title: null, subtitle: null, meta: null, text: 'React, TypeScript', bullets: [] },
        ],
      },
    ],
    ...overrides,
  };
}

test('escapes HTML in every text slot', () => {
  const html = renderResumeHtml(
    fixture({
      header: { name: '<script>alert(1)</script>', title: 'a & b', contacts: ['<img src=x>'] },
    }),
    '',
    [],
    PAGE,
  );
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('a &amp; b'));
  assert.ok(html.includes('&lt;img src=x&gt;'));
});

test('renders sections in order with section-{id} classes and skips null fields', () => {
  const html = renderResumeHtml(fixture(), '', [], PAGE);
  const exp = html.indexOf('section-experience');
  const skills = html.indexOf('section-skills');
  assert.ok(exp > -1 && skills > exp, 'sections in order');
  assert.ok(html.includes('<ul class="bullets">'));
  // skills item has no bullets and no title — those elements must not exist for it
  const skillsChunk = html.slice(skills);
  assert.ok(!skillsChunk.includes('<ul class="bullets">'), 'empty bullets renders no list');
  assert.ok(html.includes('<p class="item-text">React, TypeScript</p>'));
});

test('two-column layout splits sidebar sections; one-column emits no sidebar', () => {
  const two = renderResumeHtml(
    fixture({ layout: { columns: 2, sidebar: ['skills'] } }),
    '',
    [],
    PAGE,
  );
  assert.ok(two.includes('<div class="sidebar">'));
  const sidebarChunk = two.slice(
    two.indexOf('<div class="sidebar">'),
    two.indexOf('<div class="main">'),
  );
  assert.ok(sidebarChunk.includes('section-skills'), 'skills goes to sidebar');
  assert.ok(!sidebarChunk.includes('section-experience'), 'experience stays in main');

  const one = renderResumeHtml(fixture(), '', [], PAGE);
  assert.ok(!one.includes('class="sidebar"'));
});

test('page size flows into @page and captured css lands after base rules', () => {
  const html = renderResumeHtml(fixture(), '.name { color: red; }', [], PAGE);
  assert.ok(html.includes('@page { size: 595.28pt 841.89pt; margin: 0; }'));
  const base = html.indexOf('@page');
  const captured = html.indexOf('.name { color: red; }');
  assert.ok(captured > base, 'captured css after base (cascade wins)');
});

test('font links: Google Fonts kept, anything else dropped', () => {
  const html = renderResumeHtml(
    fixture(),
    '',
    ['https://fonts.googleapis.com/css2?family=Inter&display=swap', 'https://evil.example/x.css'],
    PAGE,
  );
  assert.ok(html.includes('https://fonts.googleapis.com/css2?family=Inter'));
  assert.ok(!html.includes('evil.example'));
});

test('deterministic: identical input renders identical output', () => {
  const a = renderResumeHtml(fixture(), '.x{}', [], PAGE);
  const b = renderResumeHtml(fixture(), '.x{}', [], PAGE);
  assert.equal(a, b);
});

test('schema-drift guard: the fixture satisfies the structured-output JSON schema requirements', () => {
  // parse via zod (mirror) — and walk the JSON schema's required lists against the fixture.
  const content = parseResumeContent(fixture());
  const schema = RESUME_CONTENT_SCHEMA as unknown as {
    required: readonly string[];
    properties: Record<string, { required?: readonly string[] }>;
  };
  for (const key of schema.required) {
    assert.ok(key in content, `top-level required "${key}" present`);
  }
  const headerRequired = schema.properties.header?.required ?? [];
  for (const key of headerRequired) {
    assert.ok(key in content.header, `header required "${key}" present`);
  }
});
