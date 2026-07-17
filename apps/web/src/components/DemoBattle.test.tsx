import { render, screen } from '@testing-library/react';

import { pl } from '@/i18n/pl';
import { smallestWebLlmModel } from '@/providers/webllm';

import { DemoBattle } from './DemoBattle';

// Control WebGPU presence via navigator.gpu (what isWebGpuAvailable reads).
function setWebGpu(present: boolean) {
  Object.defineProperty(navigator, 'gpu', {
    value: present ? {} : undefined,
    configurable: true,
  });
}

afterEach(() => {
  Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
});

describe('DemoBattle (Module E) — WebGPU gate', () => {
  it('shows a clear message and NO start button when WebGPU is absent', () => {
    setWebGpu(false);
    render(<DemoBattle />);
    expect(screen.getByText(pl.demo.title)).toBeInTheDocument();
    expect(screen.getByText(pl.demo.noWebgpu)).toBeInTheDocument();
    // The download button must not be offered without WebGPU.
    expect(screen.queryByRole('button', { name: /Odpal demo/ })).not.toBeInTheDocument();
  });

  it('offers a start button naming the download size when WebGPU is present', () => {
    setWebGpu(true);
    render(<DemoBattle />);
    const sizeGb = (smallestWebLlmModel().downloadMb / 1024).toFixed(1);
    expect(
      screen.getByRole('button', { name: pl.demo.start(sizeGb) }),
    ).toBeInTheDocument();
    expect(screen.queryByText(pl.demo.noWebgpu)).not.toBeInTheDocument();
  });
});
