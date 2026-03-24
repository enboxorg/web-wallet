import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { StepIndicator } from '../StepIndicator';

describe('StepIndicator', () => {
  it('renders correct number of step dots', () => {
    const { container } = render(<StepIndicator current={0} total={4} />);
    const dots = container.querySelectorAll('.rounded-full');
    expect(dots).toHaveLength(4);
  });

  it('current step has bg-accent class', () => {
    const { container } = render(<StepIndicator current={1} total={3} />);
    const dots = container.querySelectorAll('.rounded-full');
    expect(dots[1]).toHaveClass('bg-accent');
  });

  it('previous steps have bg-accent/50 class', () => {
    const { container } = render(<StepIndicator current={2} total={4} />);
    const dots = container.querySelectorAll('.rounded-full');
    // Steps 0 and 1 are previous (before current=2)
    expect(dots[0].className).toContain('bg-accent/50');
    expect(dots[1].className).toContain('bg-accent/50');
  });

  it('future steps have bg-border-default class', () => {
    const { container } = render(<StepIndicator current={1} total={4} />);
    const dots = container.querySelectorAll('.rounded-full');
    // Steps 2 and 3 are future (after current=1)
    expect(dots[2]).toHaveClass('bg-border-default');
    expect(dots[3]).toHaveClass('bg-border-default');
  });

  it('renders connecting lines between dots', () => {
    const { container } = render(<StepIndicator current={0} total={3} />);
    // For 3 dots there should be 2 connecting lines (h-px w-6)
    const lines = container.querySelectorAll('.h-px.w-6');
    expect(lines).toHaveLength(2);
  });

  it('connecting lines before or at current step have bg-accent', () => {
    const { container } = render(<StepIndicator current={2} total={4} />);
    const lines = container.querySelectorAll('.h-px.w-6');
    // Lines at index 1 (i=1) and index 2 (i=2) should be bg-accent (i <= current)
    expect(lines[0]).toHaveClass('bg-accent'); // line before step 1 (i=1, 1<=2)
    expect(lines[1]).toHaveClass('bg-accent'); // line before step 2 (i=2, 2<=2)
  });

  it('connecting lines after current step have bg-border-default', () => {
    const { container } = render(<StepIndicator current={0} total={3} />);
    const lines = container.querySelectorAll('.h-px.w-6');
    // Line before step 1 (i=1, 1>0) and step 2 (i=2, 2>0) are future
    expect(lines[0]).toHaveClass('bg-border-default');
    expect(lines[1]).toHaveClass('bg-border-default');
  });

  it('renders no connecting lines for a single step', () => {
    const { container } = render(<StepIndicator current={0} total={1} />);
    const lines = container.querySelectorAll('.h-px.w-6');
    expect(lines).toHaveLength(0);
  });

  it('accepts className prop', () => {
    const { container } = render(<StepIndicator current={0} total={3} className="my-steps" />);
    expect(container.firstChild).toHaveClass('my-steps');
  });
});
