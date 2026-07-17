import { render, screen } from '@testing-library/react';

import { ThoughtStream } from './ThoughtStream';

describe('ThoughtStream (Module A)', () => {
  it('shows the reasoning trace and a model·move header', () => {
    render(<ThoughtStream thought="take the center" modelName="openrouter:foo" moveNumber={3} />);
    expect(screen.getByText('take the center')).toBeInTheDocument();
    expect(screen.getByText(/openrouter:foo · #3/)).toBeInTheDocument();
  });

  it('renders the empty state when there is no trace', () => {
    render(<ThoughtStream thought={null} />);
    expect(screen.getByText('Ten ruch nie ma zapisanego toku myślenia.')).toBeInTheDocument();
  });

  it('renders a live waiting state', () => {
    render(<ThoughtStream thought={null} live />);
    expect(screen.getByText('Model myśli…')).toBeInTheDocument();
  });
});
