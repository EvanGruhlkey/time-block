import { expect, it } from 'vitest';
import {
  chooseSubjectBox,
  clipMaskToSubject,
} from '../src/background-remover';

it('chooses the prominent person instead of a nearby crowd detection', () => {
  const crowd = { x: 0.45, y: 0.3, width: 0.04, height: 0.1, confidence: 0.9 };
  const subject = { x: 0.62, y: 0.5, width: 0.2, height: 0.35, confidence: 0.72 };

  expect(chooseSubjectBox([crowd, subject], { x: 0.5, y: 0.5 })).toBe(subject);
});

it('ignores a detection covering most of the scene', () => {
  const scene = { x: 0, y: 0, width: 0.9, height: 0.8, confidence: 0.95 };

  expect(chooseSubjectBox([scene], { x: 0.5, y: 0.5 })).toBeUndefined();
});

it('does not jump from the tracked subject to a distant detection', () => {
  const distant = { x: 0.05, y: 0.05, width: 0.1, height: 0.2, confidence: 0.98 };

  expect(
    chooseSubjectBox([distant], { x: 0.75, y: 0.6 }, 0.22),
  ).toBeUndefined();
});

it('returns transparency when no subject was detected', () => {
  expect([...clipMaskToSubject(new Uint8ClampedArray([255, 180]), 2, 1)]).toEqual([
    0, 0,
  ]);
});
